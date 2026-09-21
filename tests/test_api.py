import hashlib
import sqlite3
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import server
from services.dorar_client import DorarBlocked, DorarCurlError, DorarPage, DorarSourceError, DorarTimeout

ROOT = Path(__file__).resolve().parents[1]
PROTECTED = [
    ROOT / "source" / "quran-simple-clean.xml",
    ROOT / "source" / "quran-uthmani.xml",
    ROOT / "quran.sqlite",
    ROOT / "quran.json",
    ROOT / "build.py",
    ROOT / "search.py",
    ROOT / "verification.json",
    ROOT / "TANZIL-NOTICES.txt",
]


def hashes():
    return {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in PROTECTED}


@pytest.fixture
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def test_search_returns_expected_verse_and_exact_text(client):
    response = client.post("/api/quran/search", json={"text": "ان مع العسر يسرا"})
    assert response.status_code == 200
    data = response.json()
    assert "94:6" in {item["verse_key"] for item in data["results"]}
    with sqlite3.connect(server.DATABASE_URI, uri=True) as database:
        expected = dict(database.execute("SELECT verse_key, text_uthmani FROM verses").fetchall())
    assert {item["verse_key"]: item["text_uthmani"] for item in data["results"]} == {
        key: expected[key] for key in (item["verse_key"] for item in data["results"])
    }


def test_diacritics_have_same_verse_keys(client):
    plain = client.post("/api/quran/search", json={"text": "ان مع العسر يسرا"}).json()
    marked = client.post("/api/quran/search", json={"text": "إِنَّ مَعَ الْعُسْرِ يُسْرًا"}).json()
    assert {item["verse_key"] for item in plain["results"]} == {item["verse_key"] for item in marked["results"]}


def test_approximate_search_suggests_both_matching_verses_and_exact_text(client):
    data = client.post("/api/quran/search", json={"text": "الم ترى كيف فعل ربك"}).json()
    assert data["matchType"] == "approximate"
    assert data["total"] == 2
    assert {item["verse_key"] for item in data["results"]} == {"89:6", "105:1"}
    with sqlite3.connect(server.DATABASE_URI, uri=True) as database:
        expected = dict(database.execute(
            "SELECT verse_key, text_uthmani FROM verses WHERE verse_key IN ('89:6', '105:1')"
        ).fetchall())
    assert {item["verse_key"]: item["text_uthmani"] for item in data["results"]} == expected


def test_correct_phrase_remains_exact_and_preserves_both_occurrences(client):
    data = client.post("/api/quran/search", json={"text": "الم تر كيف فعل ربك"}).json()
    assert data["matchType"] == "normalized_phrase"
    assert {item["verse_key"] for item in data["results"]} == {"89:6", "105:1"}


def test_long_unrelated_query_stays_empty(client):
    data = client.post("/api/quran/search", json={"text": "عبارة اختبار غير موجودة ززز لا توجد في القرآن"}).json()
    assert data["found"] is False
    assert data["matchType"] == "normalized_phrase"
    assert data["results"] == []


def test_short_misspelled_query_does_not_trigger_approximate(client):
    data = client.post("/api/quran/search", json={"text": "الم ترى كيف"}).json()
    assert data["found"] is False
    assert data["matchType"] == "normalized_phrase"


def test_approximate_results_are_limited(client):
    data = client.post("/api/quran/search", json={"text": "الم ترى كيف فعل ربك"}).json()
    assert len(data["results"]) <= 5


def test_repeated_phrase_results_are_preserved(client):
    data = client.post("/api/quran/search", json={"text": "الحمد لله رب العالمين"}).json()
    assert "1:2" in {item["verse_key"] for item in data["results"]}
    assert data["total"] == len(data["results"])


def test_unrelated_query_is_empty(client):
    data = client.post("/api/quran/search", json={"text": "عبارة اختبار غير موجودة ززز"}).json()
    assert data["found"] is False
    assert data["total"] == 0
    assert data["results"] == []


@pytest.mark.parametrize("payload", [{"text": ""}, {"text": "   "}, {"text": "ً ْ ّ"}, {"text": 123}, {"text": None}, {}, {"text": "a", "extra": 1}])
def test_invalid_input_returns_422(client, payload):
    assert client.post("/api/quran/search", json=payload).status_code == 422


def test_too_long_input_returns_422(client):
    assert client.post("/api/quran/search", json={"text": "ا" * 501}).status_code == 422


def test_search_failure_is_not_empty_result(client, monkeypatch):
    def fail(_query):
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(server, "search", fail)
    response = client.post("/api/quran/search", json={"text": "الحمد"})
    assert response.status_code == 503
    assert response.json() == {"message": "تعذّر البحث حاليًا. حاول مرة أخرى."}


def test_approximate_search_failure_is_not_empty_result(client, monkeypatch):
    monkeypatch.setattr(server, "search", lambda _query: [])

    def fail(_query):
        raise RuntimeError("simulated approximate failure")

    monkeypatch.setattr(server, "approximate_search", fail)
    response = client.post("/api/quran/search", json={"text": "الم ترى كيف فعل ربك"})
    assert response.status_code == 503
    assert response.json() == {"message": "تعذّر البحث حاليًا. حاول مرة أخرى."}


def test_health_and_static_routes(client):
    assert client.get("/").status_code == 200
    assert "البحث في القرآن والحديث" in client.get("/").text
    assert client.get("/quran").status_code == 200
    assert client.get("/hadith").status_code == 200
    assert "البحث في القرآن الكريم" in client.get("/quran").text
    assert "البحث في الحديث الشريف" in client.get("/hadith").text
    assert client.get("/static/styles.css").status_code == 200
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/quran.js").status_code == 200
    assert client.get("/static/hadith.js").status_code == 200
    assert client.get("/api/health").json() == {"status": "ok"}


def test_hadith_invalid_requests_return_422(client):
    assert client.post("/api/hadith/search", json={"text": "  "}).status_code == 422
    assert client.post("/api/hadith/search", json={"text": 12}).status_code == 422
    assert client.post("/api/hadith/search", json={"text": "حديث", "mode": "other"}).status_code == 422
    assert client.post("/api/hadith/search", json={"text": "حديث", "extra": True}).status_code == 422


def test_simple_hadith_ui_has_minimal_text_and_category_presentation():
    script = (ROOT / "web" / "hadith.js").read_text(encoding="utf-8")
    assert "تصنيف الدرر السنية" in script
    assert "روايات أخرى مطابقة" in script
    assert "المصدر: الدرر السنية" in script
    assert "data.mode === \"simple\" ? \"تم العثور على نصوص من المصدر.\"" in script
    assert "appendField(card, \"المحدث\"" in script


def test_hadith_modes_are_parsed_from_their_own_sections(client, monkeypatch):
    html = (ROOT / "tests" / "fixtures" / "dorar" / "synthetic_sections.html").read_text(encoding="utf-8")
    monkeypatch.setattr(server, "fetch_page", lambda _query, degree=None: DorarPage(html, "https://dorar.net/hadith/search?q=%D8%AD%D8%AF%D9%8A%D8%AB&st=w"))
    simple = client.post("/api/hadith/search", json={"text": "حديث", "mode": "simple"}).json()
    specialist = client.post("/api/hadith/search", json={"text": "حديث", "mode": "specialist"}).json()
    assert [record["id"] for record in simple["results"]] == ["home-1"]
    assert [record["id"] for record in specialist["results"]] == ["specialist-1"]
    assert simple["canSearchSpecialist"] is True
    assert simple["results"][0]["grade"] == "[صحيح]"


def test_hadith_empty_simple_reports_specialist_availability(client, monkeypatch):
    html = '<section id="home"><div class="empty-state">لا نتائج</div></section><section id="specialist"><article data-hadith-id="s"><p class="hadith-text">نص</p></article></section>'
    monkeypatch.setattr(server, "fetch_page", lambda _query, degree=None: DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w"))
    data = client.post("/api/hadith/search", json={"text": "حديث", "mode": "simple"}).json()
    assert data["found"] is False
    assert data["canSearchSpecialist"] is True
    assert data["hint"] == "قد يكون الحديث موجودًا في الموسوعة الحديثية المتخصصة."


def _simple_fixture(record_id="h1", scholar="عالم", grade="ما مثله صحح"):
    return f'''<div id="home"><div class="border-bottom py-4"><article><h5 class="h5-responsive">نص الحديث الأصلي</h5></article><div><strong>خلاصة حكم المحدث : <span>{grade}</span></strong><strong>الراوي : <span>راو</span></strong><strong>| المحدث : <span>{scholar}</span></strong><strong>| المصدر : <span>كتاب</span></strong><strong>الصفحة أو الرقم : <span>1</span></strong></div><a href="https://dorar.net/h/{record_id}">سجل</a></div></div><div id="specialist"><div class="empty-state">لا نتائج</div></div>'''


def test_simple_forwards_four_distinct_degree_filters_and_merges_categories(client, monkeypatch):
    degrees = []

    def fake_fetch(query, degree=None):
        degrees.append((query, degree))
        return DorarPage(_simple_fixture(), f"https://dorar.net/hadith/search?q={query}&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "نص الحديث"}).json()
    assert [degree for _, degree in degrees] == [1, 2, 3, 4]
    assert data["resultsCount"] == 1
    assert data["results"][0]["degreeCategories"] == [1, 2, 3, 4]
    assert data["results"][0]["categoryLabels"] == [server.DEGREE_FILTERS[index]["label"] for index in [1, 2, 3, 4]]
    assert data["complete"] is True
    assert data["mixedCategories"] is True


def test_simple_degree_requests_run_concurrently(monkeypatch):
    started = []
    barrier = threading.Barrier(4, timeout=1)

    def fake_fetch(query, degree=None):
        started.append(degree)
        barrier.wait()
        return DorarPage(_simple_fixture(), "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    server.simple_hadith_search("نص الحديث")
    assert started == [1, 2, 3, 4]


@pytest.mark.parametrize("degrees, expected_mixed", [([1, 2], False), ([3, 4], False), ([1, 3], True)])
def test_simple_mixed_category_notice_only_spans_groups(client, monkeypatch, degrees, expected_mixed):
    def fake_fetch(query, degree=None):
        if degree not in degrees:
            html = '<div id="home"><div class="empty-state">لا نتائج</div></div><div id="specialist"><div class="empty-state">لا نتائج</div></div>'
        else:
            html = _simple_fixture()
        return DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "نص الحديث"}).json()
    assert data["mixedCategories"] is expected_mixed


def test_simple_partial_failure_is_incomplete_not_empty(client, monkeypatch):
    def fake_fetch(query, degree=None):
        if degree == 3:
            raise DorarBlocked("simulated")
        return DorarPage(_simple_fixture(), "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "نص الحديث"}).json()
    assert data["found"] is True
    assert data["complete"] is False
    assert any(item["status"] == "error" and item["degree"] == 3 for item in data["categoryStatuses"])
    assert "غير مكتملة" in data["message"]


def test_all_four_confirmed_empty_returns_specialist_action(client, monkeypatch):
    empty = '<div id="home"><div class="empty-state">لا نتائج</div></div><div id="specialist"><div class="empty-state">لا نتائج</div></div>'
    monkeypatch.setattr(server, "fetch_page", lambda query, degree=None: DorarPage(empty, "https://dorar.net/hadith/search?q=x&st=w"))
    data = client.post("/api/hadith/search", json={"text": "عبارة"}).json()
    assert data["found"] is False
    assert data["complete"] is True
    assert data["canSearchSpecialist"] is True
    assert data["message"] == "لم نجد نتيجة في العرض الميسّر لغير المتخصصين."


def test_simple_category_labels_stay_with_their_record(client, monkeypatch):
    def fake_fetch(query, degree=None):
        record_id = "same" if degree in {1, 2} else "other"
        html = _simple_fixture(record_id=record_id, scholar="عالم أ" if record_id == "same" else "عالم ب")
        return DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "عبارة"}).json()
    records = {record["id"]: record for record in data["results"]}
    assert records["same"]["degreeCategories"] == [1, 2]
    assert records["same"]["categoryLabels"] == [server.DEGREE_FILTERS[1]["label"], server.DEGREE_FILTERS[2]["label"]]
    assert records["other"]["degreeCategories"] == [3, 4]


def test_simple_presentation_selects_shortest_matching_text_only(client, monkeypatch):
    short = _simple_fixture(record_id="short")
    long = _simple_fixture(record_id="long").replace("نص الحديث الأصلي", "مقدمة لا تطابق ثم نص الحديث الأصلي في سياق أطول")
    monkeypatch.setattr(server, "fetch_page", lambda query, degree=None: DorarPage(short if degree == 1 else long, "https://dorar.net/hadith/search?q=x&st=w"))
    data = client.post("/api/hadith/search", json={"text": "نص الحديث"}).json()
    selected = data["simplePresentation"]["selected"]
    assert selected["text"] == "نص الحديث الأصلي"
    assert selected["categoryLabels"] == [server.DEGREE_FILTERS[1]["label"]]
    assert selected["records"][0]["degreeCategories"] == [1]
    assert all("مقدمة لا تطابق" not in record["text"] for record in selected["records"])


def test_simple_presentation_reports_retrieved_but_unmatched(client, monkeypatch):
    html = _simple_fixture().replace("نص الحديث الأصلي", "نص مختلف")
    monkeypatch.setattr(server, "fetch_page", lambda query, degree=None: DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w"))
    data = client.post("/api/hadith/search", json={"text": "عبارة غير موجودة"}).json()
    assert data["found"] is True
    assert data["simplePresentation"]["matched"] is False
    assert data["message"] == "لم نجد نصًا مطابقًا لعبارتك في النتائج المسترجعة."


def test_simple_presentation_alternates_have_their_own_labels(client, monkeypatch):
    def fake_fetch(query, degree=None):
        record_id = "short" if degree == 1 else "long"
        text = "نص الحديث الأصلي" if degree == 1 else "نص الحديث الأصلي في رواية أخرى"
        return DorarPage(_simple_fixture(record_id=record_id).replace("نص الحديث الأصلي", text), "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "نص الحديث"}).json()
    presentation = data["simplePresentation"]
    assert presentation["selected"]["categoryLabels"] == [server.DEGREE_FILTERS[1]["label"]]
    assert presentation["alternates"][0]["categoryLabels"] == [server.DEGREE_FILTERS[index]["label"] for index in [2, 3, 4]]


@pytest.mark.parametrize("error, status", [(DorarTimeout(), 504), (DorarSourceError(), 502), (DorarCurlError(), 503)])
def test_hadith_failures_are_not_empty_results(client, monkeypatch, error, status):
    monkeypatch.setattr(server, "fetch_page", lambda _query, degree=None: (_ for _ in ()).throw(error))
    response = client.post("/api/hadith/search", json={"text": "حديث"})
    assert response.status_code == status
    assert response.json()["code"] in {"dorar_timeout", "dorar_parse_error", "dorar_transport_unavailable"}


def test_unexpected_hadith_processing_error_is_internal_error(client, monkeypatch):
    html = (ROOT / "tests" / "fixtures" / "dorar" / "synthetic_sections.html").read_text(encoding="utf-8")
    monkeypatch.setattr(server, "fetch_page", lambda _query: DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w"))
    monkeypatch.setattr(server, "inspect_specialist", lambda _html: (_ for _ in ()).throw(RuntimeError("programming error")))
    response = client.post("/api/hadith/search", json={"text": "حديث"})
    assert response.status_code == 500
    assert response.json()["code"] == "dorar_internal_error"


def test_protected_urls_are_not_exposed(client):
    protected_urls = [
        "/quran.sqlite",
        "/quran.json",
        "/build.py",
        "/search.py",
        "/verification.json",
        "/TANZIL-NOTICES.txt",
        "/source/quran-uthmani.xml",
    ]
    assert all(client.get(url).status_code == 404 for url in protected_urls)


def test_protected_hashes_are_unchanged():
    expected = {
        "source/quran-simple-clean.xml": "6FDF7BFD14474D7ACFF92ECC71E7B86BB4C81685A67D1646A2E9AFBA95B9F4E2",
        "source/quran-uthmani.xml": "E0F461A8F794629B80E99F7BC9314E8B61C734B4EF0E53B8231FFC291C8EA108",
        "quran.sqlite": "2AA1D4CD24D3EF1420A07C0D54287EEDE2440549C280B135FA470AD2AC9B8796",
        "quran.json": "819171178BA21732D4A24BA62BA1966D17EB98A8E37969790F2F816D32F720D1",
        "build.py": "67EFA323A1FF8F74F7F5AEADE1453F9EAB5C544ED847B6332B4423F11A8092C6",
        "search.py": "22DF77DEA4778CAFAC2558DFE7FC1E204C77AB87F5760B8B0F15E6F900B71F1A",
        "verification.json": "9E1B9A44DC6E3F4E2CF5A5E77B17E02A55EF58BA09C02A328D763E307540B47C",
        "TANZIL-NOTICES.txt": "7FFE6C0F6BB6159FB710FDA834166DCD9354DEEB6B811F27E5C448259D6BD9A6",
    }
    current = {path.relative_to(ROOT).as_posix(): digest.upper() for path, digest in hashes().items()}
    assert current == expected