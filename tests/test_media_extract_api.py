import io
import json
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import server
from services import openrouter_client
from services.media_processor import MediaProcessingFailedError


@pytest.fixture(autouse=True)
def clean_state():
    openrouter_client.clear_cache()
    yield
    openrouter_client.clear_cache()


@pytest.fixture
def client():
    return TestClient(server.app)


def make_valid_image_bytes(fmt="JPEG"):
    buf = io.BytesIO()
    img = Image.new("RGB", (32, 32), color="red")
    img.save(buf, format=fmt)
    return buf.getvalue()


def mock_openrouter_candidates(candidates):
    payload = {"candidates": candidates}
    return {
        "id": "gen-media-test",
        "model": "google/gemini-3.5-flash-lite",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": json.dumps(payload),
                },
                "finish_reason": "stop",
            }
        ],
    }


# Test 1: Valid image upload with a mocked OpenRouter response
def test_1_valid_image_upload(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    cands = [{"type": "quran", "text": "قل هو الله احد", "confidence": "high"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands))

    img_data = make_valid_image_bytes("JPEG")
    res = client.post(
        "/api/media/extract",
        files={"file": ("ayah.jpg", img_data, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "candidates"
    assert data["mediaType"] == "image"
    assert len(data["results"]) == 1
    assert data["results"][0]["type"] == "quran"
    assert data["results"][0]["verified"] is True
    assert "قُلْ هُوَ ٱللَّهُ أَحَدٌ" in data["results"][0]["displayText"]


# Test 2: Valid video upload with mocked ffprobe, FFmpeg, and OpenRouter
def test_2_valid_video_upload(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    cands = [{"type": "quran", "text": "الحمد لله رب العالمين", "confidence": "high"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands))

    fake_wav = b"RIFF" + b"\x00" * 200
    def fake_extract(video_path, wav_path):
        wav_path.write_bytes(fake_wav)

    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(30.0, True)), \
         patch("services.media_processor.extract_audio_from_video", side_effect=fake_extract):
        res = client.post(
            "/api/media/extract",
            files={"file": ("clip.mp4", b"dummy video bytes", "video/mp4")},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "candidates"
    assert data["mediaType"] == "video"
    assert len(data["results"]) == 1


# Test 3: Correct strict JSON parsing
def test_3_strict_json_parsing(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    cands = [
        {"type": "quran", "text": "إنا أعطيناك الكوثر", "confidence": "high"},
        {"type": "hadith", "text": "إنما الأعمال بالنيات", "confidence": "medium"},
    ]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands))
    extracted = openrouter_client.extract_media_candidates(b"dummy", "image", "image/jpeg")
    assert len(extracted) == 2
    assert extracted[0]["type"] == "quran"
    assert extracted[0]["text"] == "إنا أعطيناك الكوثر"
    assert extracted[1]["type"] == "hadith"


# Test 4: Empty candidates
def test_4_empty_candidates(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates([]))

    img_data = make_valid_image_bytes("PNG")
    res = client.post(
        "/api/media/extract",
        files={"file": ("empty.png", img_data, "image/png")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "not_found"
    assert data["results"] == []
    assert data["message"] == "لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى."


# Test 5: Malformed model JSON
def test_5_malformed_model_json(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    bad_payload = {
        "choices": [{"message": {"content": "not valid json { broken"}}]
    }
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: bad_payload)

    img_data = make_valid_image_bytes("JPEG")
    res = client.post(
        "/api/media/extract",
        files={"file": ("ayah.jpg", img_data, "image/jpeg")},
    )
    assert res.status_code == 502
    data = res.json()
    assert data["code"] == "ai_unavailable"


# Test 6: Additional unexpected model fields
def test_6_additional_unexpected_model_fields(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    # Top-level unexpected key
    bad_payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps({"candidates": [], "surah": "البقرة"})
                }
            }
        ]
    }
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: bad_payload)

    img_data = make_valid_image_bytes("JPEG")
    res = client.post(
        "/api/media/extract",
        files={"file": ("ayah.jpg", img_data, "image/jpeg")},
    )
    assert res.status_code == 502
    assert res.json()["code"] == "ai_unavailable"

    # Item unexpected key
    bad_item_payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps({
                        "candidates": [
                            {"type": "quran", "text": "نص", "confidence": "high", "authenticity": "sahih"}
                        ]
                    })
                }
            }
        ]
    }
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: bad_item_payload)
    res2 = client.post(
        "/api/media/extract",
        files={"file": ("ayah.jpg", img_data, "image/jpeg")},
    )
    assert res2.status_code == 502
    assert res2.json()["code"] == "ai_unavailable"


# Test 7: Unsupported extension/MIME
def test_7_unsupported_extension_mime(client):
    res = client.post(
        "/api/media/extract",
        files={"file": ("document.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert res.status_code == 415
    data = res.json()
    assert data["code"] == "unsupported_media_type"


# Test 8: Spoofed image MIME with invalid bytes
def test_8_spoofed_image_mime_invalid_bytes(client):
    res = client.post(
        "/api/media/extract",
        files={"file": ("spoof.jpg", b"not actual image binary data", "image/jpeg")},
    )
    assert res.status_code == 422
    data = res.json()
    assert data["code"] == "invalid_image"


# Test 9: Oversized image
def test_9_oversized_image(client):
    big_data = b"0" * (8 * 1024 * 1024 + 1024)
    res = client.post(
        "/api/media/extract",
        files={"file": ("oversized.jpg", big_data, "image/jpeg")},
    )
    assert res.status_code == 413
    data = res.json()
    assert data["code"] == "media_too_large"


# Test 10: Oversized video
def test_10_oversized_video(client):
    big_video = b"0" * (40 * 1024 * 1024 + 1024)
    res = client.post(
        "/api/media/extract",
        files={"file": ("oversized.mp4", big_video, "video/mp4")},
    )
    assert res.status_code == 413
    data = res.json()
    assert data["code"] == "media_too_large"


# Test 11: Video exceeding 180 seconds
def test_11_video_exceeding_180_seconds(client):
    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(181.0, True)):
        res = client.post(
            "/api/media/extract",
            files={"file": ("long.mp4", b"video data", "video/mp4")},
        )
    assert res.status_code == 422
    data = res.json()
    assert data["code"] == "video_too_long"


# Test 12: Video without audio
def test_12_video_without_audio(client):
    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(10.0, False)):
        res = client.post(
            "/api/media/extract",
            files={"file": ("silent.mp4", b"video data", "video/mp4")},
        )
    assert res.status_code == 422
    data = res.json()
    assert data["code"] == "video_has_no_audio"


# Test 13: Missing FFmpeg/ffprobe
def test_13_missing_ffmpeg_ffprobe(client):
    with patch("shutil.which", return_value=None):
        res = client.post(
            "/api/media/extract",
            files={"file": ("clip.mp4", b"video data", "video/mp4")},
        )
    assert res.status_code == 503
    data = res.json()
    assert data["code"] == "ffmpeg_unavailable"


# Test 14: FFmpeg timeout/failure
def test_14_ffmpeg_timeout_failure(client):
    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(20.0, True)), \
         patch("services.media_processor.extract_audio_from_video", side_effect=MediaProcessingFailedError("تعذّر استخراج الصوت")):
        res = client.post(
            "/api/media/extract",
            files={"file": ("clip.mp4", b"video data", "video/mp4")},
        )
    assert res.status_code == 503
    data = res.json()
    assert data["code"] == "media_processing_failed"


# Test 15: Temporary-file cleanup after success and failure
def test_15_temporary_file_cleanup(client, monkeypatch, tmp_path):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    cands = [{"type": "quran", "text": "قل هو الله احد", "confidence": "high"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands))

    created_dirs = []
    original_mkdtemp = __import__("tempfile").mkdtemp

    def tracking_mkdtemp(*args, **kwargs):
        d = original_mkdtemp(*args, **kwargs)
        created_dirs.append(d)
        return d

    fake_wav = b"RIFF" + b"\x00" * 200
    def fake_extract(video_path, wav_path):
        wav_path.write_bytes(fake_wav)

    with patch("tempfile.mkdtemp", side_effect=tracking_mkdtemp), \
         patch("services.media_processor.inspect_video_with_ffprobe", return_value=(15.0, True)), \
         patch("services.media_processor.extract_audio_from_video", side_effect=fake_extract):
        res = client.post(
            "/api/media/extract",
            files={"file": ("clip.mp4", b"video data", "video/mp4")},
        )
        assert res.status_code == 200

    # Ensure all tracked temporary directories were cleaned up
    assert len(created_dirs) >= 1
    for d in created_dirs:
        assert not Path(d).exists(), f"Temp directory {d} was not deleted!"


# Test 16: Rate limiting
def test_16_rate_limiting(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    cands = [{"type": "quran", "text": "قل هو الله احد", "confidence": "high"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands))

    img_data = make_valid_image_bytes("JPEG")
    # MAX_REQUESTS_PER_WINDOW is 15
    for _ in range(15):
        res = client.post("/api/media/extract", files={"file": ("ayah.jpg", img_data, "image/jpeg")})
        assert res.status_code == 200

    # 16th request must be rate-limited
    res_limited = client.post("/api/media/extract", files={"file": ("ayah.jpg", img_data, "image/jpeg")})
    assert res_limited.status_code == 429
    assert res_limited.json()["code"] == "ai_rate_limited"


# Test 17: Quran result displayed from database text rather than model text
def test_17_quran_result_displayed_from_db(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    # Model returns non-uthmani / approximate wording
    cands = [{"type": "quran", "text": "ان مع العسر يسرا", "confidence": "high"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands))

    img_data = make_valid_image_bytes("JPEG")
    res = client.post(
        "/api/media/extract",
        files={"file": ("ayah.jpg", img_data, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    result = data["results"][0]
    assert result["extractedText"] == "ان مع العسر يسرا"
    # Display text MUST be canonical Tanzil text_uthmani from database
    assert result["displayText"] == "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا"
    assert result["source"]["name"] == "Tanzil Project"
    assert result["source"]["verseKey"] == "94:6"
    assert result["source"]["surahName"] == "الشرح"


# Test 18: Hadith result displayed from mocked Dorar data rather than model text
def test_18_hadith_result_displayed_from_dorar(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    cands = [{"type": "hadith", "text": "الاعمال بالنيات", "confidence": "high"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands))

    fake_dorar_return = {
        "results": [
            {
                "text": "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى دنيا يصيبها",
                "narrator": "عمر بن الخطاب",
                "scholar": "البخاري",
                "book": "صحيح البخاري",
                "reference": "1",
                "grade": "صحيح",
                "categoryLabels": ["أحاديث حكم المحدثون عليها بالصحة"],
                "degreeCategories": [1],
            }
        ],
        "sourceUrl": "https://dorar.net/hadith/search?q=test",
        "categoriesWithResults": [1],
        "mixedCategories": False,
        "complete": True,
        "statuses": [],
    }
    monkeypatch.setattr(server, "simple_hadith_search", lambda query: fake_dorar_return)

    img_data = make_valid_image_bytes("JPEG")
    res = client.post(
        "/api/media/extract",
        files={"file": ("hadith.jpg", img_data, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    result = data["results"][0]
    assert result["type"] == "hadith"
    assert result["extractedText"] == "الاعمال بالنيات"
    # Display text MUST come strictly from Dorar result, not model text
    assert result["displayText"] == fake_dorar_return["results"][0]["text"]
    assert result["source"]["name"] == "الدرر السنية"
    assert result["source"]["url"] == "https://dorar.net/hadith/search?q=test"


# Test 19: unknown candidate fallback behavior
def test_19_unknown_candidate_fallback(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    # Case A: unknown text matching Quran
    cands_quran = [{"type": "unknown", "text": "قل اعوذ برب الناس", "confidence": "medium"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands_quran))

    img_data = make_valid_image_bytes("JPEG")
    res1 = client.post("/api/media/extract", files={"file": ("unknown.jpg", img_data, "image/jpeg")})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["results"][0]["type"] == "quran"
    assert "قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ" in data1["results"][0]["displayText"]

    # Case B: unknown text NOT matching Quran, but matching Dorar Hadith
    cands_hadith = [{"type": "unknown", "text": "طلب العلم فريضة على كل مسلم", "confidence": "medium"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands_hadith))

    fake_dorar = {
        "results": [
            {
                "text": "طلب العلم فريضة على كل مسلم",
                "narrator": "أنس بن مالك",
                "scholar": "ابن ماجه",
                "categoryLabels": ["أحاديث حكم المحدثون على أسانيدها بالضعف"],
                "degreeCategories": [3],
            }
        ],
        "sourceUrl": "https://dorar.net/hadith/search?q=test",
        "categoriesWithResults": [3],
        "mixedCategories": False,
        "complete": True,
        "statuses": [],
    }
    monkeypatch.setattr(server, "simple_hadith_search", lambda query: fake_dorar)

    res2 = client.post("/api/media/extract", files={"file": ("unknown2.jpg", img_data, "image/jpeg")})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["results"][0]["type"] == "hadith"
    assert data2["results"][0]["displayText"] == "طلب العلم فريضة على كل مسلم"

    # Case C: unknown text matching neither
    cands_neither = [{"type": "unknown", "text": "عبارة غير موجودة بالقرآن ولا الحديث مطلقا", "confidence": "low"}]
    monkeypatch.setattr(openrouter_client, "send_chat_completion", lambda *args, **kwargs: mock_openrouter_candidates(cands_neither))
    monkeypatch.setattr(server, "simple_hadith_search", lambda query: {"results": [], "sourceUrl": "", "mixedCategories": False, "complete": True, "statuses": []})

    res3 = client.post("/api/media/extract", files={"file": ("unknown3.jpg", img_data, "image/jpeg")})
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["status"] == "not_found"
    assert data3["results"] == []


# Test 20: No raw provider response or internal path in errors
def test_20_no_raw_provider_or_path_leak(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    # Simulate provider error with sensitive internal details
    class SecretException(Exception):
        pass

    def mock_leak(*args, **kwargs):
        raise openrouter_client.OpenRouterSourceError("C:\\internal\\secret\\path\\openrouter_failure.py: API key sk-or-secret leaked")

    monkeypatch.setattr(openrouter_client, "send_chat_completion", mock_leak)

    img_data = make_valid_image_bytes("JPEG")
    res = client.post("/api/media/extract", files={"file": ("ayah.jpg", img_data, "image/jpeg")})
    body_text = res.text
    assert "C:\\internal" not in body_text
    assert "secret" not in body_text
    assert "sk-or" not in body_text
    data = res.json()
    assert data["code"] == "ai_unavailable"
    assert "تعذّر" in data["message"]


# Test 21: One-time model fallback on timeout/50x in send_chat_completion
def test_21_openrouter_fallback_on_primary_failure(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    call_history = []

    def mock_single_attempt(payload, headers, timeout):
        call_history.append(payload.get("model"))
        if len(call_history) == 1:
            # First attempt times out
            raise openrouter_client.OpenRouterTimeout("Primary model timed out")
        # Second attempt (fallback) succeeds
        return mock_openrouter_candidates([{"type": "quran", "text": "قل هو الله احد", "confidence": "high"}])

    monkeypatch.setattr(openrouter_client, "_single_http_attempt", mock_single_attempt)

    payload = {"model": "google/gemini-3.5-flash-lite"}
    result = openrouter_client.send_chat_completion(payload, headers={})

    assert len(call_history) == 2
    assert call_history[0] == "google/gemini-3.5-flash-lite"
    assert call_history[1] == "google/gemini-2.5-flash"
    assert "choices" in result


# Test 22: Fallback failure stops immediately without infinite loop
def test_22_openrouter_fallback_fails_no_infinite_loop(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    call_count = 0

    def mock_single_attempt(payload, headers, timeout):
        nonlocal call_count
        call_count += 1
        raise openrouter_client.OpenRouterTimeout("Timeout")

    monkeypatch.setattr(openrouter_client, "_single_http_attempt", mock_single_attempt)

    payload = {"model": "google/gemini-3.5-flash-lite"}
    with pytest.raises(openrouter_client.OpenRouterTimeout):
        openrouter_client.send_chat_completion(payload, headers={})

    # Exactly 2 attempts (primary + 1 fallback), no loop!
    assert call_count == 2


# Test 23: Video audio returns 0 candidates, falls back to keyframe visual extraction
def test_23_video_audio_zero_fallback_to_keyframe(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    extraction_calls = []

    def mock_extract(media_bytes, media_type, mime_type="image/jpeg", client_ip="127.0.0.1"):
        extraction_calls.append((media_type, mime_type))
        if media_type == "audio":
            # Audio yields 0 candidates
            return []
        if media_type == "image":
            # Keyframe visual extraction yields candidates
            return [{"type": "quran", "text": "قل هو الله احد", "confidence": "high"}]
        return []

    monkeypatch.setattr(server, "extract_media_candidates", mock_extract)

    fake_wav = b"RIFF" + b"\x00" * 200
    fake_jpg = make_valid_image_bytes("JPEG")

    def fake_extract_audio(video_path, wav_path):
        wav_path.write_bytes(fake_wav)

    def fake_extract_kf(video_path, jpg_path, timestamp=1.0):
        jpg_path.write_bytes(fake_jpg)
        return True

    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(30.0, True)), \
         patch("services.media_processor.extract_audio_from_video", side_effect=fake_extract_audio), \
         patch("services.media_processor.extract_keyframe_from_video", side_effect=fake_extract_kf):
        res = client.post(
            "/api/media/extract",
            files={"file": ("reel.mp4", b"dummy video bytes", "video/mp4")},
        )

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "candidates"
    assert len(data["results"]) == 1
    assert data["results"][0]["type"] == "quran"
    # Verify both extractions were invoked: audio first, then keyframe image
    assert extraction_calls == [("audio", "audio/wav"), ("image", "image/jpeg")]

