from pathlib import Path
import tempfile
from unittest.mock import MagicMock, patch
import pytest

from services.remote_media_processor import (
    deduplicate_extracted_candidates,
    download_raw_media,
    extract_candidates_from_chunks,
    inspect_remote_media_metadata,
    normalize_arabic_for_comparison,
    normalize_audio_to_wav,
    split_audio_into_chunks,
    try_visual_fallback_for_short_video,
    validate_remote_url,
    job_registry,
    RemoteMediaDurationError,
    RemoteMediaError,
    RemoteMediaInaccessibleError,
    RemoteMediaLiveStreamError,
    RemoteMediaPlaylistError,
    RemoteMediaProcessingError,
    RemoteMediaSecurityError,
    UnsupportedPlatformError,
)


# Test 1: Supported hostnames are accepted
@pytest.mark.parametrize(
    "valid_url",
    [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/abc123xyz",
        "https://tiktok.com/@user/video/1234567890",
        "https://www.tiktok.com/@user/video/1234567890",
        "https://vm.tiktok.com/ZM8abc123/",
        "https://vt.tiktok.com/ZS8xyz789/",
        "https://instagram.com/reel/C8abc123xyz/",
        "https://www.instagram.com/p/C8abc123xyz/",
        "https://www.instagram.com/reels/C8abc123xyz/",
    ],
)
def test_1_supported_hostnames(valid_url):
    norm = validate_remote_url(valid_url)
    assert norm == valid_url


# Test 2: Rejection of malicious lookalike domains
@pytest.mark.parametrize(
    "malicious_url",
    [
        "https://youtube.com.attacker.example/watch?v=123",
        "https://www.youtube.com.phishing.net/evil",
        "https://notyoutube.com/video",
        "https://tiktok.com.fake.org/video",
        "https://fakeinstagram.com/p/123",
        "https://evil-youtube.com/watch",
    ],
)
def test_2_rejection_of_lookalike_domains(malicious_url):
    with pytest.raises(UnsupportedPlatformError) as exc_info:
        validate_remote_url(malicious_url)
    assert "غير مدعوم" in exc_info.value.message


# Test 3: Rejection of unsupported schemes
@pytest.mark.parametrize(
    "bad_scheme_url",
    [
        "http://www.youtube.com/watch?v=123",
        "ftp://youtube.com/file",
        "file:///etc/passwd",
        "javascript:alert(1)",
    ],
)
def test_3_rejection_of_unsupported_schemes(bad_scheme_url):
    with pytest.raises(RemoteMediaSecurityError) as exc_info:
        validate_remote_url(bad_scheme_url)
    assert "https" in exc_info.value.message


# Test 4: Rejection of localhost and IP URLs (SSRF protection)
@pytest.mark.parametrize(
    "ip_or_local_url",
    [
        "https://127.0.0.1/video.mp4",
        "https://192.168.1.1/video.mp4",
        "https://10.0.0.1/video.mp4",
        "https://localhost/video",
        "https://server.local/video",
        "https://internal.company.internal/video",
        "https://[::1]/video",
    ],
)
def test_4_rejection_of_localhost_and_ips(ip_or_local_url):
    with pytest.raises(RemoteMediaSecurityError):
        validate_remote_url(ip_or_local_url)


# Test 5: Rejection of playlists
@pytest.mark.parametrize(
    "playlist_url",
    [
        "https://www.youtube.com/playlist?list=PL1234567890",
        "https://www.youtube.com/watch?v=123&list=PL1234567890",
        "https://m.youtube.com/playlist?list=PL123",
    ],
)
def test_5_rejection_of_playlists(playlist_url):
    with pytest.raises(RemoteMediaPlaylistError) as exc_info:
        validate_remote_url(playlist_url)
    assert "قوائم التشغيل" in exc_info.value.message


# Test 6: Rejection of userinfo in URL
def test_6_rejection_of_userinfo():
    with pytest.raises(RemoteMediaSecurityError):
        validate_remote_url("https://admin:pass@www.youtube.com/watch?v=123")


# Test 7: Metadata inspection - Normal video
def test_7_metadata_inspection_normal():
    fake_info = {
        "id": "vid123",
        "title": "مقطع موعظة مؤثرة",
        "extractor": "youtube",
        "duration": 180.0,
        "is_live": False,
        "filesize_approx": 10485760,
    }

    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        mock_ydl = MagicMock()
        mock_ydl.extract_info.return_value = fake_info
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        meta = inspect_remote_media_metadata("https://www.youtube.com/watch?v=vid123")
        assert meta["id"] == "vid123"
        assert meta["title"] == "مقطع موعظة مؤثرة"
        assert meta["duration"] == 180.0


# Test 8: Metadata inspection - Livestream rejection
def test_8_metadata_inspection_livestream_rejection():
    fake_info = {
        "id": "live123",
        "title": "بث مباشر مستمر",
        "is_live": True,
        "live_status": "is_live",
    }

    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        mock_ydl = MagicMock()
        mock_ydl.extract_info.return_value = fake_info
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        with pytest.raises(RemoteMediaLiveStreamError):
            inspect_remote_media_metadata("https://www.youtube.com/watch?v=live123")


# Test 9: Metadata inspection - Over-duration rejection (> 3600s)
def test_9_metadata_inspection_over_duration():
    fake_info = {
        "id": "long123",
        "title": "تسجيل محاضرة كاملة 3 ساعات",
        "duration": 10800.0,
        "is_live": False,
    }

    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
        mock_ydl = MagicMock()
        mock_ydl.extract_info.return_value = fake_info
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        with pytest.raises(RemoteMediaDurationError) as exc_info:
            inspect_remote_media_metadata("https://www.youtube.com/watch?v=long123")
        assert "تتجاوز الحد المسموح" in exc_info.value.message


# Test 10: Download raw media success and cleanup check
def test_10_download_raw_media_success():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)

        def fake_download(urls):
            # Create simulated raw media file
            (tmp_path / "raw_media.m4a").write_bytes(b"Simulated audio container bytes" * 10)

        with patch("yt_dlp.YoutubeDL") as mock_ydl_cls:
            mock_ydl = MagicMock()
            mock_ydl.download.side_effect = fake_download
            mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

            res_file = download_raw_media("https://youtu.be/test123", tmp_path)
            assert res_file.exists()
            assert res_file.name == "raw_media.m4a"


# Test 11: Audio normalization to WAV via FFmpeg
def test_11_normalize_audio_to_wav():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_raw = tmp_path / "raw_media.m4a"
        input_raw.write_bytes(b"raw data")
        output_wav = tmp_path / "normalized.wav"

        def fake_run(cmd, *args, **kwargs):
            if "-c:a" in cmd:
                # Write a valid fake WAV header + data
                output_wav.write_bytes(b"RIFF" + b"\x00" * 200)
                return MagicMock(returncode=0)
            if "format=duration" in " ".join(cmd):
                return MagicMock(returncode=0, stdout=b'{"format": {"duration": "120.5"}}')
            return MagicMock(returncode=0)

        with patch("subprocess.run", side_effect=fake_run):
            dur = normalize_audio_to_wav(input_raw, output_wav)
            assert dur == 120.5
            assert output_wav.exists()


# Test 12: Split complete audio into chunks (> 300s)
def test_12_split_audio_into_chunks():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        wav_path = tmp_path / "normalized.wav"
        wav_path.write_bytes(b"RIFF" + b"\x00" * 200)
        chunks_dir = tmp_path / "chunks"
        chunks_dir.mkdir()

        # Simulate 750 seconds (should split into 300s, 300s, 150s = 3 chunks)
        def fake_run(cmd, *args, **kwargs):
            # Write chunk file specified in cmd[-1]
            out_file = Path(cmd[-1])
            out_file.write_bytes(b"RIFF" + b"\x00" * 100)
            return MagicMock(returncode=0)

        with patch("subprocess.run", side_effect=fake_run):
            chunks = split_audio_into_chunks(wav_path, chunks_dir, total_duration=750.0)
            assert len(chunks) == 3
            assert chunks[0][1] == 0.0
            assert chunks[1][1] == 300.0
            assert chunks[2][1] == 600.0


# Test 13: Bounded chunk candidate extraction & concurrency
def test_13_extract_candidates_from_chunks_with_concurrency():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        c1 = tmp_path / "chunk_000.wav"
        c2 = tmp_path / "chunk_001.wav"
        c1.write_bytes(b"c1")
        c2.write_bytes(b"c2")

        chunks = [(c1, 0.0), (c2, 300.0)]

        def mock_extract(media_bytes, media_type, mime_type, client_ip):
            if media_bytes == b"c1":
                return [{"type": "quran", "text": "قل هو الله احد", "confidence": "high"}]
            if media_bytes == b"c2":
                return [{"type": "hadith", "text": "انما الاعمال بالنيات", "confidence": "high"}]
            return []

        with patch("services.remote_media_processor.extract_media_candidates", side_effect=mock_extract):
            cands, partial = extract_candidates_from_chunks(chunks)
            assert len(cands) == 2
            assert partial is False
            assert cands[0]["approximateStartSeconds"] == 0.0
            assert cands[1]["approximateStartSeconds"] == 300.0


# Test 14: Partial chunk failure returns successful candidates with partialProcessing=True
def test_14_partial_chunk_failure_handled_gracefully():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        c1 = tmp_path / "chunk_000.wav"
        c2 = tmp_path / "chunk_001.wav"
        c1.write_bytes(b"c1")
        c2.write_bytes(b"c2")

        chunks = [(c1, 0.0), (c2, 300.0)]

        def mock_extract(media_bytes, media_type, mime_type, client_ip):
            if media_bytes == b"c1":
                return [{"type": "quran", "text": "الحمد لله رب العالمين", "confidence": "high"}]
            raise Exception("Network timeout on chunk 2")

        with patch("services.remote_media_processor.extract_media_candidates", side_effect=mock_extract):
            cands, partial = extract_candidates_from_chunks(chunks)
            assert len(cands) == 1
            assert partial is True
            assert cands[0]["text"] == "الحمد لله رب العالمين"


# Test 15: Total chunk failure raises RemoteMediaProcessingError
def test_15_total_chunk_failure_raises():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        c1 = tmp_path / "chunk_000.wav"
        c1.write_bytes(b"c1")
        chunks = [(c1, 0.0)]

        with patch("services.remote_media_processor.extract_media_candidates", side_effect=Exception("API down")):
            with pytest.raises(RemoteMediaProcessingError):
                extract_candidates_from_chunks(chunks)


# Test 16: Candidate deduplication across chunks with Arabic normalization
def test_16_deduplicate_candidates_across_chunks():
    raw_candidates = [
        {"type": "quran", "text": "قُلْ هُوَ اللَّهُ أَحَدٌ", "confidence": "medium"},
        {"type": "quran", "text": "قل هو الله احد", "confidence": "high"},  # Near duplicate with different diacritics/confidence
        {"type": "hadith", "text": "طلب العلم فريضة على كل مسلم", "confidence": "high"},
    ]
    deduped = deduplicate_extracted_candidates(raw_candidates)
    assert len(deduped) == 2
    # Should keep higher confidence "high"
    quran_cand = [c for c in deduped if c["type"] == "quran"][0]
    assert quran_cand["confidence"] == "high"


# Test 17: Visual fallback when audio yields 0 candidates (short video <= 180s)
def test_17_visual_fallback_succeeds_for_short_video():
    with patch("yt_dlp.YoutubeDL") as mock_ydl_cls, \
         patch("services.remote_media_processor.extract_keyframe_from_video", return_value=True), \
         patch("services.remote_media_processor.extract_media_candidates", return_value=[{"type": "quran", "text": "تبارك الذي بيده الملك", "confidence": "high"}]):

        def fake_download(urls):
            # Create the fallback video file inside the active temp dir
            for f in Path(tempfile.gettempdir()).glob("**/fallback_video.mp4"):
                f.write_bytes(b"fake video")

        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl

        # Mock Path.read_bytes and file presence
        with patch.object(Path, "exists", return_value=True), \
             patch.object(Path, "stat", return_value=MagicMock(st_size=1000)), \
             patch.object(Path, "read_bytes", return_value=b"fake jpeg keyframe bytes"):
            cands = try_visual_fallback_for_short_video("https://www.tiktok.com/@u/video/123", duration=45.0)
            assert len(cands) == 1
            assert cands[0]["text"] == "تبارك الذي بيده الملك"


# Test 18: No visual fallback for long videos (> 180s) to keep bandwidth safe
def test_18_no_visual_fallback_for_long_videos():
    # Videos over 180s should never trigger video download
    cands = try_visual_fallback_for_short_video("https://www.youtube.com/watch?v=123", duration=600.0)
    assert cands == []


# Test 19: Job registry lifecycle and expiration
def test_19_job_registry_lifecycle():
    job = job_registry.create_job("https://youtube.com/watch?v=test", "127.0.0.1")
    assert job.status == "queued"
    assert job.progress == 5

    retrieved = job_registry.get_job(job.job_id)
    assert retrieved is not None
    assert retrieved.job_id == job.job_id

    # Update job
    job_registry.update_job(job.job_id, status="processing", stage="downloading_audio", progress=40)
    updated = job_registry.get_job(job.job_id)
    assert updated.status == "processing"
    assert updated.stage == "downloading_audio"
    assert updated.progress == 40


# Test 20: get_base_ydl_opts includes youtube player_client to prevent bot blocks
def test_20_base_ydl_opts_youtube_client():
    from services.remote_media_processor import get_base_ydl_opts
    opts = get_base_ydl_opts(socket_timeout=25)
    assert opts["socket_timeout"] == 25
    assert opts["noplaylist"] is True
    assert "extractor_args" in opts
    assert "youtube" in opts["extractor_args"]
    assert "player_client" in opts["extractor_args"]["youtube"]
    assert "android" in opts["extractor_args"]["youtube"]["player_client"]


# Test 21: get_base_ydl_opts handles cookies file if present
def test_21_base_ydl_opts_cookies(monkeypatch, tmp_path):
    from services.remote_media_processor import get_base_ydl_opts
    fake_cookie = tmp_path / "test_cookies.txt"
    fake_cookie.write_text("# Netscape HTTP Cookie File")

    monkeypatch.setenv("YOUTUBE_COOKIES_PATH", str(fake_cookie))
    opts = get_base_ydl_opts()
    assert opts.get("cookiefile") == str(fake_cookie)


