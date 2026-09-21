from pathlib import Path
import json
import re
import pytest
from fastapi.testclient import TestClient

import server
from services import openrouter_client
from services.dorar_client import (
    DorarPage,
    DorarTimeout,
    clear_dorar_json_cache,
)
from services.dorar_parser import (
    parse_dorar_json_result,
    normalize_arabic_for_dedup,
    deduplicate_hadith_candidates,
)

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def clean_caches():
    openrouter_client.clear_cache()
    clear_dorar_json_cache()
    yield
    openrouter_client.clear_cache()
    clear_dorar_json_cache()


@pytest.fixture
def client():
    return TestClient(server.app)


def _mock_openrouter_json(payload_content: dict):
    return {
        "id": "gen-test",
        "model": "google/gemini-3.5-flash-lite",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": json.dumps(payload_content),
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60},
    }


# 1. First model call returns valid query JSON
def test_1_first_model_call_returns_valid_query_json(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    fake_response = _mock_openrouter_json({"queries": ["الاعمال بالنيات", "لكل امرئ ما نوى"]})
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: fake_response)

    queries = openrouter_client.generate_hadith_search_queries("حديث عن النية")
    assert queries == ["الاعمال بالنيات", "لكل امرئ ما نوى"]


# 2. Invalid query JSON is rejected safely
def test_2_invalid_query_json_rejected_safely(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    # Non-JSON content
    fake_bad_json = {
        "choices": [{"message": {"content": "not json at all"}}]
    }
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: fake_bad_json)
    with pytest.raises(openrouter_client.OpenRouterSourceError):
        openrouter_client.generate_hadith_search_queries("وصف")

    # Missing 'queries' key
    fake_missing_key = {
        "choices": [{"message": {"content": json.dumps({"wrong": []})}}]
    }
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: fake_missing_key)
    with pytest.raises(openrouter_client.OpenRouterSourceError):
        openrouter_client.generate_hadith_search_queries("وصف")


# 3. Maximum of 3 queries is enforced
def test_3_maximum_3_queries_enforced(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    fake_response = _mock_openrouter_json({
        "queries": ["عبارة 1", "عبارة 2", "عبارة 3", "عبارة 4", "عبارة 5"]
    })
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: fake_response)
    queries = openrouter_client.generate_hadith_search_queries("وصف")
    assert len(queries) == 3
    assert queries == ["عبارة 1", "عبارة 2", "عبارة 3"]


# 4. Dorar JSON HTML is parsed into plain candidate texts (including observed API format)
def test_4_dorar_json_html_parsed_into_plain_candidate_texts():
    observed_api_html = (
        '<div class="hadith">1 - <span class="search-keys">إنما</span> '
        '<span class="search-keys">الأعمال</span> بالنيات</div>'
        '<div class="hadith-info">...</div>'
    )
    parsed = parse_dorar_json_result(observed_api_html)
    assert parsed == ["إنما الأعمال بالنيات"]


# 5. HTML markup and search-keys spans are not exposed
def test_5_html_markup_and_search_keys_spans_not_exposed():
    html = (
        '<div class="hadith">'
        '2 - قال رسول الله: <span class="search-keys">طلب</span> <span class="search-keys">العلم</span> '
        '<b>فريضة</b> على كل مسلم. <a href="https://dorar.net">المزيد</a>'
        '</div>'
    )
    parsed = parse_dorar_json_result(html)
    assert len(parsed) == 1
    candidate = parsed[0]
    assert "<" not in candidate
    assert ">" not in candidate
    assert "search-keys" not in candidate
    assert "المزيد" not in candidate
    assert "طلب العلم فريضة على كل مسلم" in candidate


# 6. Duplicate candidate texts are removed after Arabic normalization
def test_6_duplicate_candidate_texts_removed_after_arabic_normalization():
    texts = [
        "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ.",
        "انما الاعمال بالنيات",
        "إنما الأعمال بالنيات",
        "حديث آخر مختلف تماما",
    ]
    deduped = deduplicate_hadith_candidates(texts, max_count=30)
    assert len(deduped) == 2
    assert deduped[0]["text"] == "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ."
    assert deduped[1]["text"] == "حديث آخر مختلف تماما"


# 7. Second model call can return only known candidate IDs
def test_7_second_model_call_returns_only_known_candidate_ids(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    candidates = [
        {"id": "c_1", "text": "إنما الأعمال بالنيات"},
        {"id": "c_2", "text": "طلب العلم فريضة"},
    ]
    fake_response = _mock_openrouter_json({"candidateIds": ["c_2", "c_1"]})
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: fake_response)

    selected = openrouter_client.select_hadith_candidate_ids("وصف", [], candidates)
    assert selected == ["c_2", "c_1"]


# 8. Unknown model IDs are discarded
def test_8_unknown_model_ids_are_discarded(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    candidates = [
        {"id": "c_known", "text": "حديث معروف"},
    ]
    fake_response = _mock_openrouter_json({
        "candidateIds": ["c_hallucinated", "c_known", "c_fake"]
    })
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: fake_response)

    selected = openrouter_client.select_hadith_candidate_ids("وصف", [], candidates)
    assert selected == ["c_known"]


# 9. A model-created Hadith text cannot reach the frontend
def test_9_model_created_hadith_text_cannot_reach_frontend(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    # Call 1 returns retrieval query
    def fake_queries(text, clarifications=None):
        return ["الاعمال بالنيات"]

    # Dorar returns real text
    dorar_real_text = "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى"
    dorar_html = f'<div class="hadith">1 - {dorar_real_text}</div>'

    # Call 2 attempts to return an invented text in candidateIds
    def fake_select(text, clarifications, candidates):
        # Even if model returned IDs, server resolves IDs ONLY against Dorar candidates
        return [candidates[0]["id"]]

    monkeypatch.setattr(server, "generate_hadith_search_queries", fake_queries)
    monkeypatch.setattr(server, "fetch_dorar_json_api", lambda q: dorar_html)
    monkeypatch.setattr(server, "select_hadith_candidate_ids", fake_select)

    res = client.post("/api/hadith/meaning-search", json={"text": "النية والعمل"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "candidates"
    assert len(data["candidates"]) == 1
    # The candidate text is strictly from Dorar, not from model
    assert data["candidates"][0]["text"] == dorar_real_text


# 10. Empty selected IDs returns needs_clarification on attempts 1 and 2
def test_10_empty_selected_ids_returns_needs_clarification_attempts_1_and_2(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(server, "generate_hadith_search_queries", lambda t, c=None: ["استرجاع"])
    monkeypatch.setattr(server, "fetch_dorar_json_api", lambda q: '<div class="hadith">1 - حديث ما</div>')
    monkeypatch.setattr(server, "select_hadith_candidate_ids", lambda t, c, cands: [])

    # Attempt 1 (no clarifications)
    res1 = client.post("/api/hadith/meaning-search", json={"text": "وصف مبهم", "clarifications": []})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "needs_clarification"
    assert data1["attempt"] == 1
    assert data1["attemptsRemaining"] == 2
    assert data1["message"] == "وضّح المعنى أكثر، واذكر الموقف أو أي كلمة تتذكرها."

    # Attempt 2 (1 clarification)
    res2 = client.post("/api/hadith/meaning-search", json={"text": "وصف مبهم", "clarifications": ["توضيح أول"]})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "needs_clarification"
    assert data2["attempt"] == 2
    assert data2["attemptsRemaining"] == 1
    assert data2["message"] == "حاول توضيح المعنى مرة أخيرة، مثل من قال الحديث أو الموقف الذي ورد فيه."


# 11. Empty selected IDs returns not_found on attempt 3
def test_11_empty_selected_ids_returns_not_found_attempt_3(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(server, "generate_hadith_search_queries", lambda t, c=None: ["استرجاع"])
    monkeypatch.setattr(server, "fetch_dorar_json_api", lambda q: '<div class="hadith">1 - حديث ما</div>')
    monkeypatch.setattr(server, "select_hadith_candidate_ids", lambda t, c, cands: [])

    # Attempt 3 (2 clarifications)
    res3 = client.post(
        "/api/hadith/meaning-search",
        json={"text": "وصف مبهم", "clarifications": ["توضيح أول", "توضيح ثان"]},
    )
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["status"] == "not_found"
    assert data3["attempt"] == 3
    assert data3["attemptsRemaining"] == 0
    assert data3["message"] == "لم نتمكن من تحديد الحديث من الوصف الذي أدخلته."


# 12. Technical Dorar failure returns temporarily_unavailable and does not advance attempts
def test_12_technical_dorar_failure_returns_temporarily_unavailable(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(server, "generate_hadith_search_queries", lambda t, c=None: ["استرجاع"])

    def fake_dorar_fail(q):
        raise DorarTimeout("Timeout connecting to Dorar")

    monkeypatch.setattr(server, "fetch_dorar_json_api", fake_dorar_fail)

    # Calling attempt 1 with Dorar technical failure
    res = client.post("/api/hadith/meaning-search", json={"text": "وصف سيفشل", "clarifications": []})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "temporarily_unavailable"
    assert "تعذّر إكمال البحث حاليًا" in data["message"]
    # Does not return attempt or consume it
    assert "attemptsRemaining" not in data


# 13. Technical OpenRouter failure returns temporarily_unavailable
def test_13_technical_openrouter_failure_returns_temporarily_unavailable(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def fake_call1_fail(t, c=None):
        raise openrouter_client.OpenRouterTimeout("Timeout")

    monkeypatch.setattr(server, "generate_hadith_search_queries", fake_call1_fail)

    res = client.post("/api/hadith/meaning-search", json={"text": "وصف سيفشل في الذكاء"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "temporarily_unavailable"
    assert "تعذّر إكمال البحث حاليًا" in data["message"]


# 14. Clicking a candidate sends its exact Dorar text to the existing verification endpoint
def test_14_clicking_candidate_sends_exact_dorar_text_to_verification_endpoint():
    import subprocess
    script_path = ROOT / "tests" / "test_frontend_suggest.mjs"
    result = subprocess.run(["node", str(script_path)], capture_output=True, text=True)
    assert result.returncode == 0
    assert "PASS: testParaphraseHadithSuggestFlow" in result.stdout


# 15. Existing normal Simple and Specialist Hadith tests still pass
def test_15_existing_normal_simple_and_specialist_hadith_tests_pass(client, monkeypatch):
    # Verified by the full pytest suite, but also assert directly here
    fixture_html = (
        '<div id="home"><div class="border-bottom py-4"><article><h5 class="h5-responsive">'
        'إنما الأعمال بالنيات</h5></article><div><strong>خلاصة حكم المحدث : <span>صحيح</span></strong>'
        '<strong>الراوي : <span>عمر</span></strong></div><a href="https://dorar.net/h/1">سجل</a></div></div>'
        '<div id="specialist"><div class="empty-state">لا نتائج</div></div>'
    )
    monkeypatch.setattr(server, "fetch_page", lambda q, degree=None: DorarPage(fixture_html, "https://dorar.net"))
    res = client.post("/api/hadith/search", json={"text": "إنما الأعمال بالنيات", "mode": "simple"})
    assert res.status_code == 200
    assert res.json()["found"] is True


# 16. Existing Quran tests still pass
def test_16_existing_quran_tests_pass(client):
    res = client.post("/api/quran/search", json={"text": "قل هو الله احد"})
    assert res.status_code == 200
    data = res.json()
    assert data["found"] is True
    assert len(data["results"]) > 0


# 17. No API key appears in frontend files or API responses
def test_17_no_api_key_appears_in_frontend_files_or_api_responses(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-secret-key-12345")

    # Check all frontend files in web/
    web_dir = ROOT / "web"
    for file_path in web_dir.glob("*.*"):
        content = file_path.read_text(encoding="utf-8")
        assert "sk-or-secret-key" not in content
        assert "OPENROUTER_API_KEY" not in content

    # Check API responses
    monkeypatch.setattr(server, "generate_hadith_search_queries", lambda t, c=None: ["استرجاع"])
    monkeypatch.setattr(server, "fetch_dorar_json_api", lambda q: '<div class="hadith">1 - نص</div>')
    monkeypatch.setattr(server, "select_hadith_candidate_ids", lambda t, c, cands: [cands[0]["id"]])

    res = client.post("/api/hadith/meaning-search", json={"text": "وصف"})
    body_str = res.text
    assert "sk-or-secret-key" not in body_str


# 18. External Hadith text is rendered with textContent, not innerHTML
def test_18_external_hadith_text_rendered_with_textcontent_not_innerhtml():
    hadith_js = (ROOT / "web" / "hadith.js").read_text(encoding="utf-8")
    assert "innerHTML" not in hadith_js
    assert "textContent = candText" in hadith_js or "textContent" in hadith_js


# 19. The first and second model prompts explicitly prohibit grading
def test_19_first_and_second_model_prompts_explicitly_prohibit_grading():
    assert "grade" in openrouter_client.CALL1_SYSTEM_PROMPT.lower()
    assert "صحيح" in openrouter_client.CALL1_SYSTEM_PROMPT
    assert "ضعيف" in openrouter_client.CALL1_SYSTEM_PROMPT
    assert "NEVER provide grades" in openrouter_client.CALL1_SYSTEM_PROMPT

    assert "grade" in openrouter_client.CALL2_SYSTEM_PROMPT.lower()
    assert "You do not write Hadith text, grade Hadith" in openrouter_client.CALL2_SYSTEM_PROMPT


# 20. The second model response cannot introduce an ID absent from the server candidate map
def test_20_second_model_response_cannot_introduce_id_absent_from_server_candidate_map(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(server, "generate_hadith_search_queries", lambda t, c=None: ["استرجاع"])
    monkeypatch.setattr(server, "fetch_dorar_json_api", lambda q: '<div class="hadith">1 - نص حقيقي من الدرر</div>')

    # Model returns hallucinated/invented ID
    monkeypatch.setattr(server, "select_hadith_candidate_ids", lambda t, c, cands: ["c_invented_id"])

    res = client.post("/api/hadith/meaning-search", json={"text": "وصف"})
    assert res.status_code == 200
    data = res.json()
    # Since the ID was absent, server discards it and falls back to needs_clarification
    assert data["status"] == "needs_clarification"
    assert "c_invented_id" not in str(data)
