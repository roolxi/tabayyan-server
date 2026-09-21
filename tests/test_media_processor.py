import io
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import UploadFile
from PIL import Image

from services.media_processor import (
    CHUNK_SIZE,
    MAX_IMAGE_SIZE,
    MAX_VIDEO_SIZE,
    MAX_VIDEO_DURATION_SECONDS,
    FFmpegUnavailableError,
    InvalidImageError,
    InvalidVideoError,
    MediaProcessingFailedError,
    MediaTooLargeError,
    UnsupportedMediaTypeError,
    VideoHasNoAudioError,
    VideoTooLongError,
    detect_media_kind,
    extract_audio_from_video,
    inspect_video_with_ffprobe,
    process_media_upload,
    validate_image_bytes,
)


def make_valid_image_bytes(fmt: str = "JPEG") -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (32, 32), color="blue")
    img.save(buf, format=fmt)
    return buf.getvalue()


class SyncChunkedStream:
    """Mock sync stream reader for testing chunked reading."""
    def __init__(self, data: bytes):
        self._bio = io.BytesIO(data)

    def read(self, size: int = -1) -> bytes:
        return self._bio.read(size)


def test_detect_media_kind_valid():
    assert detect_media_kind("photo.jpg", "image/jpeg") == "image"
    assert detect_media_kind("photo.png", "image/png") == "image"
    assert detect_media_kind("photo.webp", "image/webp") == "image"
    assert detect_media_kind("clip.mp4", "video/mp4") == "video"
    assert detect_media_kind("clip.webm", "video/webm") == "video"
    assert detect_media_kind("clip.mov", "video/quicktime") == "video"


def test_detect_media_kind_unsupported():
    with pytest.raises(UnsupportedMediaTypeError):
        detect_media_kind("document.pdf", "application/pdf")

    with pytest.raises(UnsupportedMediaTypeError):
        detect_media_kind("script.exe", "application/octet-stream")

    with pytest.raises(UnsupportedMediaTypeError):
        detect_media_kind("image.gif", "image/gif")

    with pytest.raises(UnsupportedMediaTypeError):
        detect_media_kind("audio.mp3", "audio/mpeg")


def test_validate_image_bytes_valid():
    for fmt in ("JPEG", "PNG", "WEBP"):
        data = make_valid_image_bytes(fmt)
        mime, out_bytes = validate_image_bytes(data)
        assert mime in ("image/jpeg", "image/png", "image/webp")
        assert out_bytes == data


def test_validate_image_bytes_invalid():
    with pytest.raises(InvalidImageError):
        validate_image_bytes(b"not an image at all")

    with pytest.raises(InvalidImageError):
        validate_image_bytes(b"")


def test_validate_image_bytes_unsupported_format():
    buf = io.BytesIO()
    img = Image.new("RGB", (10, 10), color="green")
    img.save(buf, format="GIF")
    with pytest.raises(UnsupportedMediaTypeError):
        validate_image_bytes(buf.getvalue())


@pytest.mark.anyio
async def test_process_media_upload_valid_image():
    data = make_valid_image_bytes("JPEG")
    stream = SyncChunkedStream(data)
    upload = UploadFile(filename="ayah.jpg", file=stream, headers={"content-type": "image/jpeg"})
    processed = await process_media_upload(upload)
    assert processed.kind == "image"
    assert processed.mime_type == "image/jpeg"
    assert processed.data == data


@pytest.mark.anyio
async def test_process_media_upload_oversized_image():
    # Simulate oversized chunked stream
    class FakeOversizedStream:
        def __init__(self, limit):
            self.limit = limit
            self.read_so_far = 0

        def read(self, size=-1):
            if self.read_so_far >= self.limit:
                return b""
            chunk = b"X" * min(size, self.limit - self.read_so_far)
            self.read_so_far += len(chunk)
            return chunk

    oversized_stream = FakeOversizedStream(MAX_IMAGE_SIZE + 1024)
    upload = UploadFile(filename="big.png", file=oversized_stream, headers={"content-type": "image/png"})
    with pytest.raises(MediaTooLargeError) as exc_info:
        await process_media_upload(upload)
    assert "يتجاوز الحد المسموح" in exc_info.value.message


@pytest.mark.anyio
async def test_process_media_upload_oversized_video():
    class FakeOversizedVideoStream:
        def __init__(self, limit):
            self.limit = limit
            self.read_so_far = 0

        def read(self, size=-1):
            if self.read_so_far >= self.limit:
                return b""
            chunk = b"V" * min(size, self.limit - self.read_so_far)
            self.read_so_far += len(chunk)
            return chunk

    oversized_stream = FakeOversizedVideoStream(MAX_VIDEO_SIZE + 1024)
    upload = UploadFile(filename="big.mp4", file=oversized_stream, headers={"content-type": "video/mp4"})
    with pytest.raises(MediaTooLargeError):
        await process_media_upload(upload)


def test_inspect_video_with_ffprobe_success():
    fake_json = '{"format": {"duration": "45.5"}, "streams": [{"codec_type": "audio", "duration": "45.5"}]}'
    mock_res = subprocess.CompletedProcess(args=[], returncode=0, stdout=fake_json.encode(), stderr=b"")

    with patch("shutil.which", return_value="C:\\dummy\\ffprobe.exe"), \
         patch("subprocess.run", return_value=mock_res):
        duration, has_audio = inspect_video_with_ffprobe(Path("test.mp4"))
        assert duration == 45.5
        assert has_audio is True


def test_inspect_video_with_ffprobe_no_audio():
    fake_json = '{"format": {"duration": "10.0"}, "streams": [{"codec_type": "video"}]}'
    mock_res = subprocess.CompletedProcess(args=[], returncode=0, stdout=fake_json.encode(), stderr=b"")

    with patch("shutil.which", return_value="C:\\dummy\\ffprobe.exe"), \
         patch("subprocess.run", return_value=mock_res):
        duration, has_audio = inspect_video_with_ffprobe(Path("test.mp4"))
        assert duration == 10.0
        assert has_audio is False


def test_inspect_video_with_ffprobe_failure():
    mock_res = subprocess.CompletedProcess(args=[], returncode=1, stdout=b"", stderr=b"corrupt file")

    with patch("shutil.which", return_value="C:\\dummy\\ffprobe.exe"), \
         patch("subprocess.run", return_value=mock_res):
        with pytest.raises(InvalidVideoError):
            inspect_video_with_ffprobe(Path("corrupt.mp4"))


def test_inspect_video_with_ffprobe_timeout():
    with patch("shutil.which", return_value="C:\\dummy\\ffprobe.exe"), \
         patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=[], timeout=15)):
        with pytest.raises(MediaProcessingFailedError):
            inspect_video_with_ffprobe(Path("hang.mp4"))


def test_extract_audio_from_video_success(tmp_path):
    out_wav = tmp_path / "out.wav"
    def fake_run(cmd, *args, **kwargs):
        # Simulate creating a non-empty wav file
        out_wav.write_bytes(b"RIFF" + b"\x00" * 100)
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=b"", stderr=b"")

    with patch("shutil.which", return_value="C:\\dummy\\ffmpeg.exe"), \
         patch("subprocess.run", side_effect=fake_run):
        extract_audio_from_video(Path("test.mp4"), out_wav)
        assert out_wav.exists()


def test_extract_audio_from_video_failure(tmp_path):
    out_wav = tmp_path / "out.wav"
    mock_res = subprocess.CompletedProcess(args=[], returncode=1, stdout=b"", stderr=b"error")

    with patch("shutil.which", return_value="C:\\dummy\\ffmpeg.exe"), \
         patch("subprocess.run", return_value=mock_res):
        with pytest.raises(MediaProcessingFailedError):
            extract_audio_from_video(Path("test.mp4"), out_wav)


def test_missing_ffmpeg(tmp_path):
    with patch("shutil.which", return_value=None):
        with pytest.raises(FFmpegUnavailableError):
            extract_audio_from_video(Path("test.mp4"), tmp_path / "out.wav")

        with pytest.raises(FFmpegUnavailableError):
            inspect_video_with_ffprobe(Path("test.mp4"))


@pytest.mark.anyio
async def test_process_media_upload_video_too_long():
    stream = io.BytesIO(b"video data bytes")
    upload = UploadFile(filename="clip.mp4", file=stream, headers={"content-type": "video/mp4"})

    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(200.0, True)):
        with pytest.raises(VideoTooLongError):
            await process_media_upload(upload)


@pytest.mark.anyio
async def test_process_media_upload_video_no_audio():
    stream = io.BytesIO(b"video data bytes")
    upload = UploadFile(filename="clip.mp4", file=stream, headers={"content-type": "video/mp4"})

    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(30.0, False)):
        with pytest.raises(VideoHasNoAudioError):
            await process_media_upload(upload)


@pytest.mark.anyio
async def test_process_media_upload_video_valid(tmp_path):
    fake_wav = b"RIFF" + b"\x00" * 1000

    def fake_extract(video_path, wav_path):
        wav_path.write_bytes(fake_wav)

    stream = io.BytesIO(b"video data bytes")
    upload = UploadFile(filename="clip.mp4", file=stream, headers={"content-type": "video/mp4"})

    with patch("services.media_processor.inspect_video_with_ffprobe", return_value=(45.0, True)), \
         patch("services.media_processor.extract_audio_from_video", side_effect=fake_extract):
        processed = await process_media_upload(upload)
        assert processed.kind == "video"
        assert processed.mime_type == "audio/wav"
        assert processed.duration == 45.0
        assert processed.data == fake_wav
