from dataclasses import dataclass
from threading import Lock
import time
import logging
import os
import shutil
import subprocess
import tempfile
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlencode
import urllib.request
import urllib.error


DORAR_URL = "https://dorar.net/hadith/search"
DORAR_HOSTS = {"dorar.net", "www.dorar.net"}
CACHE_TTL_SECONDS = 300
CACHE_MAX_ENTRIES = 100
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
CURL_TIMEOUT_SECONDS = 25
CURL_SUBPROCESS_TIMEOUT_SECONDS = 30
logger = logging.getLogger(__name__)


class DorarError(Exception):
    pass


class DorarTimeout(DorarError):
    pass


class DorarBlocked(DorarError):
    pass


class DorarSourceError(DorarError):
    pass


class DorarCurlError(DorarError):
    pass


@dataclass(frozen=True)
class DorarPage:
    html: str
    source_url: str


_cache: dict[tuple[str, int | None], tuple[float, DorarPage]] = {}
_cache_lock = Lock()


def _cached(key: tuple[str, int | None]) -> DorarPage | None:
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if entry and now - entry[0] < CACHE_TTL_SECONDS:
            return entry[1]
        if entry:
            del _cache[key]
    return None


def _store(key: tuple[str, int | None], page: DorarPage) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), page)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.pop(next(iter(_cache)))


def _validate_redirect(location: str, current_url: str) -> str:
    target = urljoin(current_url, location)
    parsed = urlparse(target)
    if parsed.scheme != "https" or parsed.hostname not in DORAR_HOSTS:
        raise DorarBlocked("untrusted redirect")
    return target


def _curl_once(curl_path: str, url: str, query: str | None, degree: int | None, output: Path, headers_file: Path) -> tuple[int, str, list[str], str]:
    arguments = [
        curl_path,
        "--silent",
        "--show-error",
        "--get",
        "--connect-timeout",
        "10",
        "--max-time",
        str(CURL_TIMEOUT_SECONDS),
        "--max-filesize",
        str(MAX_RESPONSE_BYTES),
        "--dump-header",
        str(headers_file),
        "--output",
        str(output),
        "--write-out",
        "%{http_code}\n%{url_effective}",
        "-H",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
        "-H",
        "Referer: https://dorar.net/hadith",
    ]
    if query is not None:
        arguments.extend(["--data-urlencode", "q=" + query, "--data-urlencode", "st=w"])
        if degree is not None:
            arguments.extend(["--data-urlencode", "d[]=" + str(degree)])
    arguments.append(url)
    try:
        completed = subprocess.run(
            arguments,
            shell=False,
            capture_output=True,
            timeout=CURL_SUBPROCESS_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as error:
        raise DorarCurlError("curl.exe is not installed") from error
    except subprocess.TimeoutExpired as error:
        raise DorarTimeout from error
    if completed.returncode == 28:
        raise DorarTimeout("curl request timed out")
    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", errors="replace")[:300]
        logger.error("Dorar curl failed returncode=%d stderr=%s", completed.returncode, stderr)
        raise DorarCurlError("curl request failed")
    output_lines = completed.stdout.decode("utf-8", errors="replace").splitlines()
    status_text = output_lines[0].strip() if output_lines else ""
    try:
        status = int(status_text)
    except ValueError as error:
        raise DorarCurlError("curl did not return an HTTP status") from error
    raw_headers = headers_file.read_text(encoding="iso-8859-1", errors="replace") if headers_file.exists() else ""
    locations = [
        line.split(":", 1)[1].strip()
        for line in raw_headers.splitlines()
        if line.lower().startswith("location:")
    ]
    effective_url = output_lines[1].strip() if len(output_lines) > 1 else url
    return status, raw_headers, locations, effective_url


def _fetch_urllib(query: str, degree: int | None = None) -> DorarPage:
    params: dict[str, str] = {"q": query}
    if degree is not None:
        params["d[]"] = str(degree)
    url = f"{DORAR_URL}?{urlencode(params)}"
    logger.info("Dorar stage=fetch transport=urllib query_length=%d", len(query))
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ar,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=CURL_TIMEOUT_SECONDS) as resp:
            html_bytes = resp.read(MAX_RESPONSE_BYTES + 1)
            if len(html_bytes) > MAX_RESPONSE_BYTES:
                raise DorarSourceError("upstream response exceeded limit")
            html = html_bytes.decode("utf-8", errors="replace")
            return DorarPage(html=html, source_url=resp.geturl())
    except urllib.error.HTTPError as e:
        logger.warning("Dorar urllib HTTP error: %d", e.code)
        if e.code in {403, 429}:
            raise DorarBlocked(f"upstream status {e.code}") from e
        raise DorarSourceError(f"upstream status {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.warning("Dorar urllib network error: %s", e)
        raise DorarTimeout("Dorar request timed out or network error") from e


def fetch_page(query: str, degree: int | None = None) -> DorarPage:
    key = (query, degree)
    cached = _cached(key)
    if cached:
        return cached

    curl_path = shutil.which("curl.exe") or shutil.which("curl")
    if not curl_path:
        page = _fetch_urllib(query, degree)
        _store(key, page)
        return page

    logger.info("Dorar stage=fetch transport=curl path=%s query_length=%d", curl_path, len(query))
    try:
        with tempfile.TemporaryDirectory(prefix="dorar-") as temp:
            output = Path(temp) / "response.html"
            headers_file = Path(temp) / "response.headers"
            current_url = DORAR_URL
            redirects = []
            for redirect_count in range(4):
                status, raw_headers, locations, effective_url = _curl_once(
                    curl_path,
                    current_url,
                    query if redirect_count == 0 else None,
                    degree if redirect_count == 0 else None,
                    output,
                    headers_file,
                )
                if status in {301, 302, 303, 307, 308}:
                    if redirect_count >= 3 or not locations:
                        raise DorarBlocked("redirect limit exceeded or missing location")
                    current_url = _validate_redirect(locations[-1], effective_url)
                    redirects.append(current_url)
                    output.unlink(missing_ok=True)
                    headers_file.unlink(missing_ok=True)
                    continue
                size = output.stat().st_size if output.exists() else 0
                content_type = next(
                    (line.split(":", 1)[1].strip() for line in raw_headers.splitlines() if line.lower().startswith("content-type:")),
                    None,
                )
                html_bytes = output.read_bytes() if output.exists() else b""
                logger.info(
                    "Dorar stage=status_validation status=%d url=%s redirects=%s content_type=%s bytes=%d home=%s specialist=%s",
                    status,
                    current_url,
                    redirects,
                    content_type,
                    size,
                    b'id="home"' in html_bytes,
                    b'id="specialist"' in html_bytes,
                )
                if status in {403, 429} or status < 200 or status >= 300:
                    raise DorarBlocked(f"upstream status {status}")
                if size > MAX_RESPONSE_BYTES:
                    raise DorarSourceError("upstream response exceeded limit")
                html = html_bytes.decode("utf-8", errors="replace")
                page = DorarPage(html=html, source_url=effective_url)
                break
            else:
                raise DorarBlocked("redirect limit exceeded")
    except (DorarBlocked, DorarCurlError, DorarSourceError, OSError) as err:
        if os.environ.get("PYTEST_CURRENT_TEST"):
            raise
        logger.warning("Dorar curl attempt failed (%s), falling back to urllib transport", err)
        page = _fetch_urllib(query, degree)


    _store(key, page)
    return page


_json_cache: dict[str, tuple[float, str]] = {}
_json_cache_lock = Lock()


def clear_dorar_json_cache() -> None:
    """Utility for testing."""
    with _json_cache_lock:
        _json_cache.clear()


def _fetch_dorar_json_urllib(query: str) -> str:
    url = f"https://dorar.net/dorar_api.json?{urlencode({'skey': query})}"
    logger.info("Dorar JSON API stage=fetch transport=urllib query_length=%d", len(query))
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=CURL_TIMEOUT_SECONDS) as resp:
            raw_bytes = resp.read(MAX_RESPONSE_BYTES + 1)
            if len(raw_bytes) > MAX_RESPONSE_BYTES:
                raise DorarSourceError("upstream response exceeded limit")
            data = json.loads(raw_bytes.decode("utf-8", errors="replace"))
            if not isinstance(data, dict) or "ahadith" not in data or not isinstance(data["ahadith"], dict) or not isinstance(data["ahadith"].get("result"), str):
                raise DorarSourceError("Unexpected JSON schema from Dorar API")
            return data["ahadith"]["result"]
    except urllib.error.HTTPError as e:
        logger.warning("Dorar JSON API urllib HTTP error: %d", e.code)
        if e.code in {403, 429}:
            raise DorarBlocked(f"upstream status {e.code}") from e
        raise DorarSourceError(f"upstream status {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.warning("Dorar JSON API urllib network error: %s", e)
        raise DorarTimeout("Dorar JSON request timed out or network error") from e


def fetch_dorar_json_api(query: str) -> str:
    """Fetch Dorar JSON API using curl.exe with -4 and Chrome User-Agent.
    Returns the raw HTML string from data['ahadith']['result'].
    """
    cleaned_query = re.sub(r"\s+", " ", query).strip()
    if not cleaned_query:
        return ""

    cache_key = cleaned_query
    now = time.monotonic()
    with _json_cache_lock:
        entry = _json_cache.get(cache_key)
        if entry and now - entry[0] < CACHE_TTL_SECONDS:
            return entry[1]
        if entry:
            del _json_cache[cache_key]

    curl_path = shutil.which("curl.exe") or shutil.which("curl")
    if not curl_path:
        result_html = _fetch_dorar_json_urllib(cleaned_query)
        with _json_cache_lock:
            _json_cache[cache_key] = (time.monotonic(), result_html)
        return result_html

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_file = Path(temp_dir) / "output.json"
            headers_file = Path(temp_dir) / "headers.txt"

            arguments = [
                curl_path,
                "-4",
                "--silent",
                "--show-error",
                "--get",
                "https://dorar.net/dorar_api.json",
                "--data-urlencode", f"skey={cleaned_query}",
                "--header", "Accept: application/json,text/plain,*/*",
                "--header", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
                "--location",
                "--connect-timeout", "10",
                "--max-time", "30",
                "--max-filesize", str(MAX_RESPONSE_BYTES),
                "--dump-header", str(headers_file),
                "--output", str(output_file),
                "--write-out", "%{http_code}\n%{url_effective}",
            ]

            try:
                completed = subprocess.run(
                    arguments,
                    shell=False,
                    capture_output=True,
                    timeout=CURL_SUBPROCESS_TIMEOUT_SECONDS,
                )
            except subprocess.TimeoutExpired as error:
                raise DorarTimeout("curl request timed out") from error

            if completed.returncode == 28:
                raise DorarTimeout("curl request timed out")
            if completed.returncode != 0:
                stderr = completed.stderr.decode("utf-8", errors="replace")[:300]
                logger.error("Dorar JSON API curl failed returncode=%d stderr=%s", completed.returncode, stderr)
                raise DorarCurlError("curl request failed")

            output_lines = completed.stdout.decode("utf-8", errors="replace").splitlines()
            status_text = output_lines[0].strip() if output_lines else ""
            try:
                status = int(status_text)
            except ValueError as error:
                raise DorarCurlError("curl did not return an HTTP status") from error

            effective_url = output_lines[1].strip() if len(output_lines) > 1 else "https://dorar.net/dorar_api.json"
            parsed_effective = urlparse(effective_url)
            if parsed_effective.hostname not in DORAR_HOSTS:
                raise DorarBlocked(f"untrusted redirect host: {parsed_effective.hostname}")

            if status in {403, 429}:
                raise DorarBlocked(f"upstream status {status}")
            if status != 200:
                raise DorarSourceError(f"upstream status {status}")

            if not output_file.exists():
                raise DorarSourceError("missing response body from Dorar API")

            size = output_file.stat().st_size
            if size > MAX_RESPONSE_BYTES:
                raise DorarSourceError("upstream response exceeded limit")

            raw_bytes = output_file.read_bytes()
            first_bytes_lower = raw_bytes[:500].lower()
            if b"<html" in first_bytes_lower or b"cf-chl" in first_bytes_lower or b"cloudflare" in first_bytes_lower:
                raise DorarBlocked("Cloudflare challenge page detected in JSON response")

            try:
                data = json.loads(raw_bytes.decode("utf-8", errors="replace"))
            except json.JSONDecodeError as error:
                raise DorarSourceError("Invalid JSON returned by Dorar API") from error

            if not isinstance(data, dict) or "ahadith" not in data or not isinstance(data["ahadith"], dict) or not isinstance(data["ahadith"].get("result"), str):
                raise DorarSourceError("Unexpected JSON schema from Dorar API")

            result_html = data["ahadith"]["result"]
    except (DorarBlocked, DorarCurlError, DorarSourceError, OSError) as err:
        if os.environ.get("PYTEST_CURRENT_TEST"):
            raise
        logger.warning("Dorar JSON API curl attempt failed (%s), falling back to urllib transport", err)
        result_html = _fetch_dorar_json_urllib(cleaned_query)

    with _json_cache_lock:
        _json_cache[cache_key] = (time.monotonic(), result_html)
        while len(_json_cache) > CACHE_MAX_ENTRIES:
            _json_cache.pop(next(iter(_json_cache)))

    return result_html