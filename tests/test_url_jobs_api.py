from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

import server
from services.remote_media_processor import job_registry


@pytest.fixture
def client():
    return TestClient(server.app)


# Test 1: Submit valid YouTube URL creates job
def test_1_submit_valid_youtube_job(client):
    res = client.post(
        "/api/media/url/jobs",
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
    )
    assert res.status_code == 202
    data = res.json()
    assert "jobId" in data
    assert data["status"] == "queued"

    # Query status
    status_res = client.get(f"/api/media/url/jobs/{data['jobId']}")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["jobId"] == data["jobId"]
    assert status_data["status"] in {"queued", "processing", "completed"}


# Test 2: Submit unsupported platform URL rejects with 400
def test_2_submit_unsupported_platform(client):
    res = client.post(
        "/api/media/url/jobs",
        json={"url": "https://vimeo.com/12345678"},
    )
    assert res.status_code == 400
    data = res.json()
    assert data["code"] == "unsupported_platform"
    assert "غير مدعوم" in data["message"]


# Test 3: Submit playlist URL rejects with 422
def test_3_submit_playlist_url_rejected(client):
    res = client.post(
        "/api/media/url/jobs",
        json={"url": "https://www.youtube.com/playlist?list=PL123456"},
    )
    assert res.status_code == 422
    data = res.json()
    assert data["code"] == "playlist_not_supported"
    assert "قوائم التشغيل" in data["message"]


# Test 4: Unknown job ID returns 404
def test_4_unknown_job_id_returns_404(client):
    res = client.get("/api/media/url/jobs/nonexistent_job_id_9999")
    assert res.status_code == 404
    data = res.json()
    assert data["code"] == "job_not_found"


# Test 5: Full asynchronous job lifecycle to completed status
def test_5_full_job_lifecycle_completed(client, monkeypatch):
    # Mock yt-dlp metadata
    monkeypatch.setattr(
        server,
        "inspect_remote_media_metadata",
        lambda url: {"id": "v1", "title": "مقطع سورة الفاتحة", "duration": 45.0, "extractor": "youtube"},
    )

    # Mock download and normalization
    fake_raw = MagicMock()
    fake_raw.exists.return_value = True
    fake_raw.stat.return_value = MagicMock(st_size=5000)
    monkeypatch.setattr(server, "download_raw_media", lambda url, tmp: fake_raw)
    monkeypatch.setattr(server, "normalize_audio_to_wav", lambda raw, wav: 45.0)

    # Mock candidate extraction
    cands = [{"type": "quran", "text": "الحمد لله رب العالمين", "confidence": "high"}]
    monkeypatch.setattr(server, "extract_candidates_from_chunks", lambda chunks, client_ip, on_chunk_progress: (cands, False))

    job = job_registry.create_job("https://www.youtube.com/watch?v=v1", "127.0.0.1")

    # Run the worker directly
    server.run_remote_media_job(job.job_id, "https://www.youtube.com/watch?v=v1", "127.0.0.1")

    status_res = client.get(f"/api/media/url/jobs/{job.job_id}")
    assert status_res.status_code == 200
    data = status_res.json()
    assert data["status"] == "completed"
    assert data["stage"] == "completed"
    assert data["progress"] == 100
    assert "result" in data
    assert data["result"]["status"] == "candidates"
    assert len(data["result"]["results"]) == 1
    assert data["result"]["results"][0]["type"] == "quran"
    assert data["result"]["sourceTitle"] == "مقطع سورة الفاتحة"


# Test 6: Job failure surfaces safe Arabic error
def test_6_job_failure_surfaces_safe_arabic_error(client, monkeypatch):
    monkeypatch.setattr(
        server,
        "inspect_remote_media_metadata",
        lambda url: {"id": "v2", "title": "مقطع خاص", "duration": 30.0, "extractor": "tiktok"},
    )

    # Mock download failure
    def mock_fail_download(url, tmp):
        from services.remote_media_processor import RemoteMediaInaccessibleError
        raise RemoteMediaInaccessibleError("تعذر الوصول إلى هذا المقطع. تأكد أن المقطع عام ومتاح.")

    monkeypatch.setattr(server, "download_raw_media", mock_fail_download)

    job = job_registry.create_job("https://www.tiktok.com/@user/video/v2", "127.0.0.1")
    server.run_remote_media_job(job.job_id, "https://www.tiktok.com/@user/video/v2", "127.0.0.1")

    status_res = client.get(f"/api/media/url/jobs/{job.job_id}")
    assert status_res.status_code == 200
    data = status_res.json()
    assert data["status"] == "failed"
    assert data["stage"] == "failed"
    assert "تعذر الوصول" in data["message"]
    assert data["error"]["code"] == "media_inaccessible"


# Test 7: Empty URL or malformed payload returns 422
def test_7_empty_url_returns_validation_error(client):
    res = client.post("/api/media/url/jobs", json={"url": "   "})
    assert res.status_code == 422

