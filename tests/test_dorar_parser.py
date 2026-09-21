from pathlib import Path

import pytest

from services.dorar_client import DorarSourceError
from services.dorar_parser import inspect_specialist, parse_section


FIXTURE = Path(__file__).parent / "fixtures" / "dorar" / "synthetic_sections.html"


def test_synthetic_fixture_keeps_simple_and_specialist_sections_isolated():
    html = FIXTURE.read_text(encoding="utf-8")
    simple = parse_section(html, "simple")
    specialist = parse_section(html, "specialist")
    assert [record["id"] for record in simple] == ["home-1"]
    assert [record["id"] for record in specialist] == ["specialist-1"]
    assert simple[0]["grade"] == "[صحيح]"
    assert specialist[0]["grade"] == "إسناده حسن"
    assert inspect_specialist(html) is True


def test_missing_section_is_source_error_without_page_wide_fallback():
    with pytest.raises(DorarSourceError):
        parse_section("<section id='other'><article>لا ينبغي استخراجه</article></section>", "simple")


def test_empty_section_requires_explicit_empty_marker():
    html = '<section id="home"><div class="empty-state">لا نتائج</div></section><section id="specialist"><div class="empty-state">لا نتائج</div></section>'
    assert parse_section(html, "simple") == []
    with pytest.raises(DorarSourceError):
        parse_section("<section id='home'></section>", "simple")


def test_generic_card_without_empty_message_is_not_empty():
    html = '<section id="home"><div class="card w-100">محتوى غير معروف</div></section><section id="specialist"><div class="empty-state">لا نتائج</div></section>'
    with pytest.raises(DorarSourceError):
        parse_section(html, "simple")


def test_record_without_supported_text_is_explicit_parser_error():
    html = '<section id="home"><div class="border-bottom py-4"><div>حقول بلا نص حديث</div></div></section><section id="specialist"><div class="empty-state">لا نتائج</div></section>'
    with pytest.raises(DorarSourceError):
        parse_section(html, "simple")


def test_captured_real_dorar_html_preserves_records_and_fields():
    html = (Path(__file__).parent / "fixtures" / "dorar" / "live_unfiltered_innama_alamal.html").read_text(encoding="utf-8")
    simple = parse_section(html, "simple")
    specialist = parse_section(html, "specialist")
    assert len(simple) == 23
    assert len(specialist) == 30
    assert simple[0]["id"] == "45wXAdej"
    assert simple[0]["grade"] == "[صحيح]"
    assert simple[0]["scholar"] == "البخاري"
    assert simple[0]["narrator"] == "عمر بن الخطاب"
    assert simple[0]["book"] == "صحيح البخاري"
    assert simple[0]["reference"] == "1"
    assert simple[0]["sourceUrl"] == "https://dorar.net/h/45wXAdej"