import io
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Literal

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 8 * 1024 * 1024  # 8 MiB
MAX_VIDEO_SIZE = 40 * 1024 * 1024  # 40 MiB
MAX_VIDEO_DURATION_SECONDS = 180.0
CHUNK_SIZE = 64 * 1024  # 64 KiB chunks for streaming

IMAGE_MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

VIDEO_MIME_MAP = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_MIMES = {"video/mp4", "video/webm", "video/quicktime"}


class MediaError(Exception):
    """Base exception for media processing errors."""
    code: str = "media_processing_failed"
    status_code: int = 400

    def __init__(self, message: str, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class UnsupportedMediaTypeError(MediaError):
    code = "unsupported_media_type"
    status_code = 415


class MediaTooLargeError(MediaError):
    code = "media_too_large"
    status_code = 413


class InvalidImageError(MediaError):
    code = "invalid_image"
    status_code = 422


class InvalidVideoError(MediaError):
    code = "invalid_video"
    status_code = 422


class VideoTooLongError(MediaError):
    code = "video_too_long"
    status_code = 422


class VideoHasNoAudioError(MediaError):
    code = "video_has_no_audio"
    status_code = 422


class FFmpegUnavailableError(MediaError):
    code = "ffmpeg_unavailable"
    status_code = 503


class MediaProcessingFailedError(MediaError):
    code = "media_processing_failed"
    status_code = 503


def get_ffmpeg_path() -> str:
    path = shutil.which("ffmpeg.exe") or shutil.which("ffmpeg")
    if not path:
        raise FFmpegUnavailableError("أداة معالجة الفيديو (FFmpeg) غير متوفرة على الخادم.")
    return path


def get_ffprobe_path() -> str:
    path = shutil.which("ffprobe.exe") or shutil.which("ffprobe")
    if not path:
        raise FFmpegUnavailableError("أداة فحص الفيديو (ffprobe) غير متوفرة على الخادم.")
    return path


ALLOWED_EXTENSIONS = set(IMAGE_MIME_MAP.keys()) | set(VIDEO_MIME_MAP.keys())
ALLOWED_ALL_MIMES = ALLOWED_IMAGE_MIMES | ALLOWED_VIDEO_MIMES | {"application/octet-stream"}


def detect_media_kind(filename: str | None, content_type: str | None) -> Literal["image", "video"]:
    """Validate declared extension and content-type against supported media formats."""
    ext = Path(filename or "").suffix.lower()
    ct = (content_type or "").lower().split(";")[0].strip()

    # If extension is provided and not in allowed extensions, reject immediately
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedMediaTypeError(
            "نوع الملف غير مدعوم. يُسمح فقط بالصور (JPEG, PNG, WebP) ومقاطع الفيديو (MP4, WebM, MOV)."
        )

    # If MIME type is provided and not in allowed MIMEs, reject immediately
    if ct and ct not in ALLOWED_ALL_MIMES:
        raise UnsupportedMediaTypeError(
            "نوع الملف غير مدعوم. يُسمح فقط بالصور (JPEG, PNG, WebP) ومقاطع الفيديو (MP4, WebM, MOV)."
        )

    if ext in IMAGE_MIME_MAP:
        return "image"
    if ext in VIDEO_MIME_MAP:
        return "video"

    if ct in ALLOWED_IMAGE_MIMES:
        return "image"
    if ct in ALLOWED_VIDEO_MIMES:
        return "video"

    raise UnsupportedMediaTypeError(
        "نوع الملف غير مدعوم. يُسمح فقط بالصور (JPEG, PNG, WebP) ومقاطع الفيديو (MP4, WebM, MOV)."
    )


def validate_image_bytes(data: bytes) -> tuple[str, bytes]:
    """Validate image bytes using Pillow and return canonical MIME type and data."""
    if not data:
        raise InvalidImageError("ملف الصورة فارغ.")

    try:
        # First verify image header and structure
        with Image.open(io.BytesIO(data)) as img:
            img.verify()

        # Re-open to read format and dimensions (verify closes file/resets state)
        with Image.open(io.BytesIO(data)) as img:
            img_format = (img.format or "").upper()
            width, height = img.size

        if img_format not in {"JPEG", "PNG", "WEBP"}:
            raise UnsupportedMediaTypeError(
                f"تنسيق الصورة {img_format} غير مدعوم. الصيغ المدعومة هي JPEG و PNG و WebP."
            )

        if width <= 0 or height <= 0:
            raise InvalidImageError("أبعاد الصورة غير صالحة.")

        format_mime = {
            "JPEG": "image/jpeg",
            "PNG": "image/png",
            "WEBP": "image/webp",
        }[img_format]

        return format_mime, data

    except (UnidentifiedImageError, OSError, SyntaxError) as err:
        logger.warning("Image validation failed: %s", err)
        raise InvalidImageError("الملف المرفوع ليس صورة صالحة أو تالف.") from err


def inspect_video_with_ffprobe(video_path: Path) -> tuple[float, bool]:
    """Use ffprobe to check video duration and presence of an audio stream."""
    ffprobe_path = get_ffprobe_path()

    cmd = [
        ffprobe_path,
        "-v", "error",
        "-show_entries", "format=duration:stream=codec_type,duration",
        "-of", "json",
        str(video_path),
    ]

    try:
        completed = subprocess.run(
            cmd,
            shell=False,
            capture_output=True,
            timeout=15,
        )
    except subprocess.TimeoutExpired as err:
        logger.error("ffprobe timed out on video inspection")
        raise MediaProcessingFailedError("استغرقت قراءة بيانات الفيديو وقتًا أطول من المتوقع.") from err
    except FileNotFoundError as err:
        raise FFmpegUnavailableError("أداة فحص الفيديو (ffprobe) غير مثبتة.") from err

    if completed.returncode != 0:
        logger.warning("ffprobe failed returncode=%d", completed.returncode)
        raise InvalidVideoError("الملف المرفوع ليس فيديو صالحًا أو تعذّرت قراءته.")

    try:
        info = json.loads(completed.stdout.decode("utf-8", errors="replace"))
    except Exception as err:
        logger.warning("Failed to parse ffprobe JSON output: %s", err)
        raise InvalidVideoError("تعذّر تحليل بيانات الفيديو.") from err

    format_info = info.get("format", {})
    streams = info.get("streams", [])

    duration_str = format_info.get("duration")
    duration = 0.0
    if duration_str:
        try:
            duration = float(duration_str)
        except ValueError:
            duration = 0.0

    has_audio = False
    for stream in streams:
        if stream.get("codec_type") == "audio":
            has_audio = True
            # Fallback duration from audio stream if container duration missing
            if duration <= 0.0 and stream.get("duration"):
                try:
                    duration = float(stream["duration"])
                except ValueError:
                    pass

    return duration, has_audio


def extract_audio_from_video(video_path: Path, output_wav_path: Path) -> None:
    """Extract mono 16kHz 16-bit PCM WAV audio from video using FFmpeg."""
    ffmpeg_path = get_ffmpeg_path()

    cmd = [
        ffmpeg_path,
        "-y",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        "-f", "wav",
        str(output_wav_path),
    ]

    try:
        completed = subprocess.run(
            cmd,
            shell=False,
            capture_output=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired as err:
        logger.error("FFmpeg audio extraction timed out")
        raise MediaProcessingFailedError("استغرق استخراج الصوت من الفيديو وقتًا أطول من المتوقع.") from err
    except FileNotFoundError as err:
        raise FFmpegUnavailableError("أداة معالجة الفيديو (FFmpeg) غير مثبتة.") from err

    if completed.returncode != 0:
        logger.warning("FFmpeg audio extraction failed returncode=%d", completed.returncode)
        raise MediaProcessingFailedError("تعذّر استخراج الصوت من الفيديو.")


def extract_keyframe_from_video(video_path: Path, output_jpg_path: Path, timestamp: float = 1.0) -> bool:
    """Extract a single representative keyframe JPEG image from video using FFmpeg."""
    try:
        ffmpeg_path = get_ffmpeg_path()
    except FFmpegUnavailableError:
        return False

    cmd = [
        ffmpeg_path,
        "-y",
        "-ss", str(max(0.2, timestamp)),
        "-i", str(video_path),
        "-vframes", "1",
        "-q:v", "2",
        str(output_jpg_path),
    ]

    try:
        completed = subprocess.run(
            cmd,
            shell=False,
            capture_output=True,
            timeout=15,
        )
        return completed.returncode == 0 and output_jpg_path.exists() and output_jpg_path.stat().st_size > 0
    except Exception as err:
        logger.warning("FFmpeg keyframe extraction failed: %s", err)
        return False


class ProcessedMedia:
    def __init__(
        self,
        kind: Literal["image", "video"],
        data: bytes,
        mime_type: str,
        duration: float | None = None,
        keyframe_data: bytes | None = None,
    ):
        self.kind = kind
        self.data = data
        self.mime_type = mime_type
        self.duration = duration
        self.keyframe_data = keyframe_data


async def process_media_upload(upload_file: UploadFile) -> ProcessedMedia:
    """Safely read upload in chunks, enforce size limits, and extract/validate media."""
    kind = detect_media_kind(upload_file.filename, upload_file.content_type)
    max_size = MAX_IMAGE_SIZE if kind == "image" else MAX_VIDEO_SIZE

    if kind == "image":
        # Read image chunks into memory up to MAX_IMAGE_SIZE
        chunks = []
        total_size = 0
        while True:
            chunk = await upload_file.read(CHUNK_SIZE)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > max_size:
                raise MediaTooLargeError("حجم الصورة يتجاوز الحد المسموح به (8 ميجابايت).")
            chunks.append(chunk)

        data = b"".join(chunks)
        mime_type, validated_data = validate_image_bytes(data)
        return ProcessedMedia(kind="image", data=validated_data, mime_type=mime_type)

    else:
        # Stream video chunks directly to disk in TemporaryDirectory
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            safe_name = Path(upload_file.filename or "video.mp4").name or "video.mp4"
            video_file = temp_path / f"input_{safe_name}"
            wav_file = temp_path / "extracted.wav"

            total_size = 0
            with open(video_file, "wb") as f_out:
                while True:
                    chunk = await upload_file.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    total_size += len(chunk)
                    if total_size > max_size:
                        raise MediaTooLargeError("حجم الفيديو يتجاوز الحد المسموح به (40 ميجابايت).")
                    f_out.write(chunk)

            if total_size == 0:
                raise InvalidVideoError("ملف الفيديو فارغ.")

            duration, has_audio = inspect_video_with_ffprobe(video_file)

            if duration > MAX_VIDEO_DURATION_SECONDS:
                raise VideoTooLongError(
                    f"مدة الفيديو ({int(duration)} ثانية) تتجاوز الحد الأقصى المسموح به (180 ثانية)."
                )

            if not has_audio:
                raise VideoHasNoAudioError("الفيديو لا يحتوي على مسار صوتي لمعالجته.")

            extract_audio_from_video(video_file, wav_file)

            if not wav_file.exists() or wav_file.stat().st_size <= 44:
                raise VideoHasNoAudioError("تعذّر استخراج مسار صوتي صالح من الفيديو.")

            audio_data = wav_file.read_bytes()

            # In addition to audio, extract a visual keyframe if possible as a fallback
            keyframe_file = temp_path / "keyframe.jpg"
            keyframe_ts = min(3.0, max(0.5, duration / 2.0)) if duration > 0 else 1.0
            has_keyframe = extract_keyframe_from_video(video_file, keyframe_file, timestamp=keyframe_ts)
            keyframe_data = keyframe_file.read_bytes() if has_keyframe and keyframe_file.exists() else None

            return ProcessedMedia(
                kind="video",
                data=audio_data,
                mime_type="audio/wav",
                duration=duration,
                keyframe_data=keyframe_data,
            )
