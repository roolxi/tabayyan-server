from pathlib import Path
import subprocess

from services import dorar_client


def test_curl_transport_uses_safe_arguments_and_cache(monkeypatch):
    dorar_client._cache.clear()
    calls = []

    def fake_run(arguments, shell, capture_output, timeout):
        calls.append((arguments, shell, timeout))
        output = Path(arguments[arguments.index("--output") + 1])
        headers = Path(arguments[arguments.index("--dump-header") + 1])
        output.write_bytes(b'<div id="home"><div class="empty-state">x</div></div><div id="specialist"><div class="empty-state">x</div></div>')
        headers.write_text("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n", encoding="ascii")
        return subprocess.CompletedProcess(arguments, 0, stdout=b"200\nhttps://dorar.net/hadith/search?q=x&st=w", stderr=b"")

    monkeypatch.setattr(dorar_client.shutil, "which", lambda name: "C:\\Windows\\system32\\curl.exe")
    monkeypatch.setattr(dorar_client.subprocess, "run", fake_run)
    first = dorar_client.fetch_page("نص عربي")
    second = dorar_client.fetch_page("نص عربي")
    assert first.html == second.html
    assert len(calls) == 1
    arguments, shell, timeout = calls[0]
    assert shell is False
    assert timeout > dorar_client.CURL_TIMEOUT_SECONDS
    assert "--data-urlencode" in arguments
    assert "q=نص عربي" in arguments
    assert "d[]=1" not in arguments
    assert "--max-filesize" in arguments
    assert first.source_url.endswith("q=x&st=w")


def test_curl_nonzero_exit_is_not_empty_result(monkeypatch):
    def fail(*args, **kwargs):
        return subprocess.CompletedProcess(args[0], 7, stdout=b"", stderr=b"network error")

    monkeypatch.setattr(dorar_client.shutil, "which", lambda name: "curl.exe")
    monkeypatch.setattr(dorar_client.subprocess, "run", fail)
    try:
        dorar_client.fetch_page("failure")
    except dorar_client.DorarCurlError:
        pass
    else:
        raise AssertionError("curl failure was not raised")


def test_curl_http_403_is_blocked(monkeypatch):
    def blocked(arguments, **kwargs):
        output = Path(arguments[arguments.index("--output") + 1])
        headers = Path(arguments[arguments.index("--dump-header") + 1])
        output.write_bytes(b"blocked")
        headers.write_text("HTTP/1.1 403 Forbidden\r\nContent-Type: text/html\r\n\r\n", encoding="ascii")
        return subprocess.CompletedProcess(arguments, 0, stdout=b"403\nhttps://dorar.net/hadith/search?q=x&st=w", stderr=b"")

    monkeypatch.setattr(dorar_client.shutil, "which", lambda name: "curl.exe")
    monkeypatch.setattr(dorar_client.subprocess, "run", blocked)
    try:
        dorar_client.fetch_page("blocked")
    except dorar_client.DorarBlocked:
        pass
    else:
        raise AssertionError("HTTP 403 was not classified as blocked")


def test_cache_isolated_by_query_and_degree(monkeypatch):
    dorar_client._cache.clear()
    calls = []

    def fake_run(arguments, shell, capture_output, timeout):
        calls.append(arguments)
        output = Path(arguments[arguments.index("--output") + 1])
        headers = Path(arguments[arguments.index("--dump-header") + 1])
        output.write_bytes(b'<div id="home"><div class="empty-state">x</div></div><div id="specialist"><div class="empty-state">x</div></div>')
        headers.write_text("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n", encoding="ascii")
        return subprocess.CompletedProcess(arguments, 0, stdout=b"200\nhttps://dorar.net/hadith/search", stderr=b"")

    monkeypatch.setattr(dorar_client.shutil, "which", lambda name: "curl.exe")
    monkeypatch.setattr(dorar_client.subprocess, "run", fake_run)
    dorar_client.fetch_page("query-a", degree=1)
    dorar_client.fetch_page("query-a", degree=2)
    dorar_client.fetch_page("query-b", degree=1)
    dorar_client.fetch_page("query-a", degree=1)
    assert len(calls) == 3
    assert sum("d[]=1" in argument for argument in calls[0]) == 1
    assert sum("d[]=2" in argument for argument in calls[1]) == 1
    assert any("q=query-b" == argument for argument in calls[2])