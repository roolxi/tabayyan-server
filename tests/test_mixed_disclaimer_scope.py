from pathlib import Path
import subprocess
import pytest
from fastapi.testclient import TestClient

import server
from services.dorar_client import DorarPage, DorarTimeout

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def client():
    return TestClient(server.app)


def _fixture(record_id="h1", text="نص الحديث الأصلي", scholar="عالم", grade="صحيح"):
    return (
        f'<div id="home"><div class="border-bottom py-4">'
        f'<article><h5 class="h5-responsive">{text}</h5></article>'
        f'<div><strong>خلاصة حكم المحدث : <span>{grade}</span></strong>'
        f'<strong>الراوي : <span>راو</span></strong>'
        f'<strong>| المحدث : <span>{scholar}</span></strong>'
        f'<strong>| المصدر : <span>كتاب</span></strong>'
        f'<strong>الصفحة أو الرقم : <span>1</span></strong></div>'
        f'<a href="https://dorar.net/h/{record_id}">سجل</a></div></div>'
        f'<div id="specialist"><div class="empty-state">لا نتائج</div></div>'
    )


def test_selected_cat3_and_collapsed_alt_cat1_triggers_mixed_notice(client, monkeypatch):
    """Selected category 3 + collapsed alternative category 1 => mixed notice triggered."""
    def fake_fetch(query, degree=None):
        if degree == 3:
            # Query candidate text
            html = _fixture(record_id="rec3", text="إنما الأعمال بالنيات", grade="ضعيف")
        elif degree == 1:
            # Alternative text
            html = _fixture(record_id="rec1", text="إنما الأعمال بالنيات وإنما لكل امرئ ما نوى", grade="صحيح")
        else:
            html = '<div id="home"><div class="empty-state">لا نتائج</div></div><div id="specialist"><div class="empty-state">لا نتائج</div></div>'
        return DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "إنما الأعمال بالنيات", "mode": "simple"}).json()

    assert data["found"] is True
    assert data["mixedCategories"] is True
    # Verify selected metadata is separate and preserved
    assert data["selectedMixedCategories"] is False
    assert data["simplePresentation"]["selected"]["text"] == "إنما الأعمال بالنيات"
    assert data["simplePresentation"]["selected"]["categoryLabels"] == [server.DEGREE_FILTERS[3]["label"]]
    assert len(data["simplePresentation"]["alternates"]) == 1
    assert data["simplePresentation"]["alternates"][0]["categoryLabels"] == [server.DEGREE_FILTERS[1]["label"]]


def test_selected_cat2_and_alt_cat4_triggers_mixed_notice(client, monkeypatch):
    """Selected category 2 + alternative category 4 => mixed notice triggered."""
    def fake_fetch(query, degree=None):
        if degree == 2:
            html = _fixture(record_id="rec2", text="طلب العلم فريضة", grade="إسناده صحيح")
        elif degree == 4:
            html = _fixture(record_id="rec4", text="طلب العلم فريضة على كل مسلم ومسلمة", grade="إسناده ضعيف")
        else:
            html = '<div id="home"><div class="empty-state">لا نتائج</div></div><div id="specialist"><div class="empty-state">لا نتائج</div></div>'
        return DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "طلب العلم فريضة", "mode": "simple"}).json()

    assert data["found"] is True
    assert data["mixedCategories"] is True
    assert data["selectedMixedCategories"] is False
    assert data["simplePresentation"]["selected"]["categoryLabels"] == [server.DEGREE_FILTERS[2]["label"]]
    assert data["simplePresentation"]["alternates"][0]["categoryLabels"] == [server.DEGREE_FILTERS[4]["label"]]


def test_categories_1_and_2_only_no_mixed_notice(client, monkeypatch):
    """Categories 1+2 only => no mixed notice."""
    def fake_fetch(query, degree=None):
        if degree in (1, 2):
            html = _fixture(record_id=f"rec{degree}", text=f"حديث صحيح {degree}", grade="صحيح")
        else:
            html = '<div id="home"><div class="empty-state">لا نتائج</div></div><div id="specialist"><div class="empty-state">لا نتائج</div></div>'
        return DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "حديث صحيح 1", "mode": "simple"}).json()

    assert data["found"] is True
    assert data["mixedCategories"] is False


def test_categories_3_and_4_only_no_mixed_notice(client, monkeypatch):
    """Categories 3+4 only => no mixed notice."""
    def fake_fetch(query, degree=None):
        if degree in (3, 4):
            html = _fixture(record_id=f"rec{degree}", text=f"حديث ضعيف {degree}", grade="ضعيف")
        else:
            html = '<div id="home"><div class="empty-state">لا نتائج</div></div><div id="specialist"><div class="empty-state">لا نتائج</div></div>'
        return DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "حديث ضعيف 3", "mode": "simple"}).json()

    assert data["found"] is True
    assert data["mixedCategories"] is False


def test_specialist_only_categories_never_affect_simple_notice(client, monkeypatch):
    """Specialist-only categories never affect the simple notice."""
    def fake_fetch(query, degree=None):
        if degree == 1:
            # Home section has accepted record
            html = (
                '<div id="home"><div class="border-bottom py-4">'
                '<article><h5 class="h5-responsive">حديث صحيح فقط</h5></article>'
                '<div><strong>خلاصة حكم المحدث : <span>صحيح</span></strong></div>'
                '<a href="https://dorar.net/h/1">سجل</a></div></div>'
                '<div id="specialist"><div class="border-bottom py-4">'
                '<article><p class="hadith-text">حديث ضعيف في المتخصص</p></article>'
                '<div><strong>خلاصة حكم المحدث : <span>ضعيف جدا</span></strong></div>'
                '<a href="https://dorar.net/h/s1">سجل</a></div></div>'
            )
        else:
            html = (
                '<div id="home"><div class="empty-state">لا نتائج</div></div>'
                '<div id="specialist"><div class="border-bottom py-4">'
                '<article><p class="hadith-text">حديث ضعيف آخر في المتخصص</p></article>'
                '<div><strong>خلاصة حكم المحدث : <span>منكر</span></strong></div>'
                '<a href="https://dorar.net/h/s2">سجل</a></div></div>'
            )
        return DorarPage(html, "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "حديث صحيح فقط", "mode": "simple"}).json()

    assert data["found"] is True
    # Specialist section weak records must never leak into simple mode's categories
    assert data["categoriesWithResults"] == [1]
    assert data["mixedCategories"] is False


def test_partial_results_warning_and_mixed_notice_can_both_appear(client, monkeypatch):
    """Partial-results warning and mixed notice can both appear."""
    def fake_fetch(query, degree=None):
        if degree == 1:
            return DorarPage(_fixture(record_id="r1", text="حديث مشترك", grade="صحيح"), "https://dorar.net/hadith/search?q=x&st=w")
        elif degree == 2:
            raise DorarTimeout("Timeout on degree 2")
        elif degree == 3:
            return DorarPage(_fixture(record_id="r3", text="حديث مشترك برواية أخرى", grade="ضعيف"), "https://dorar.net/hadith/search?q=x&st=w")
        else:
            return DorarPage('<div id="home"><div class="empty-state">لا نتائج</div></div>', "https://dorar.net/hadith/search?q=x&st=w")

    monkeypatch.setattr(server, "fetch_page", fake_fetch)
    data = client.post("/api/hadith/search", json={"text": "حديث مشترك", "mode": "simple"}).json()

    assert data["found"] is True
    assert data["complete"] is False
    assert data["mixedCategories"] is True
    assert "النتائج المعروضة غير مكتملة" in data["message"]


def test_frontend_rendering_actual_dom_suite():
    """Verify actual frontend rendering using Node.js DOM test suite."""
    test_file = ROOT / "tests" / "test_frontend_mixed_disclaimer.mjs"
    result = subprocess.run(["node", str(test_file)], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
    assert result.returncode == 0
    assert "ALL 6 FRONTEND RENDERING TESTS PASSED SUCCESSFULLY!" in result.stdout

