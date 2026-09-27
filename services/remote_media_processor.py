import asyncio
from concurrent.futures import ThreadPoolExecutor
import ipaddress
import json
import logging
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from typing import Any, Literal
import unicodedata
import urllib.parse

import yt_dlp

from services.media_processor import (
    extract_keyframe_from_video,
    get_ffmpeg_path,
    get_ffprobe_path,
    FFmpegUnavailableError,
)
from services.openrouter_client import (
    extract_media_candidates,
    OpenRouterError,
    OpenRouterNotConfigured,
    OpenRouterRateLimited,
    OpenRouterSourceError,
    OpenRouterTimeout,
)

logger = logging.getLogger(__name__)

# Centralized configurable limits with safe defaults
REMOTE_MEDIA_MAX_DURATION_SECONDS = int(os.getenv("REMOTE_MEDIA_MAX_DURATION_SECONDS", "3600"))
REMOTE_MEDIA_MAX_SOURCE_BYTES = int(os.getenv("REMOTE_MEDIA_MAX_SOURCE_BYTES", "104857600"))  # 100 MiB
REMOTE_MEDIA_DOWNLOAD_TIMEOUT_SECONDS = int(os.getenv("REMOTE_MEDIA_DOWNLOAD_TIMEOUT_SECONDS", "120"))
REMOTE_MEDIA_AUDIO_CHUNK_SECONDS = int(os.getenv("REMOTE_MEDIA_AUDIO_CHUNK_SECONDS", "300"))
REMOTE_MEDIA_MAX_CONCURRENT_CHUNKS = int(os.getenv("REMOTE_MEDIA_MAX_CONCURRENT_CHUNKS", "2"))
REMOTE_MEDIA_JOB_TTL_SECONDS = int(os.getenv("REMOTE_MEDIA_JOB_TTL_SECONDS", "1800"))
REMOTE_MEDIA_MAX_CONCURRENT_JOBS = int(os.getenv("REMOTE_MEDIA_MAX_CONCURRENT_JOBS", "3"))

SUPPORTED_HOSTS = {
    # YouTube
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    # TikTok
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
    # Instagram
    "instagram.com",
    "www.instagram.com",
}

TASHKEEL_REGEX = re.compile(r"[\u0617-\u061A\u064B-\u0652]")
PUNCTUATION_REGEX = re.compile(r"[،؛؟,\.!\?\"'()\[\]{}—–\-:]")


class RemoteMediaError(Exception):
    """Base exception for remote media processing."""
    code: str = "media_processing_failed"
    status_code: int = 400

    def __init__(self, message: str, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class UnsupportedPlatformError(RemoteMediaError):
    code = "unsupported_platform"
    status_code = 400


class RemoteMediaSecurityError(RemoteMediaError):
    code = "invalid_url"
    status_code = 400


class RemoteMediaPlaylistError(RemoteMediaError):
    code = "playlist_not_supported"
    status_code = 422


class RemoteMediaLiveStreamError(RemoteMediaError):
    code = "livestream_not_supported"
    status_code = 422


class RemoteMediaDurationError(RemoteMediaError):
    code = "media_too_long"
    status_code = 422


class RemoteMediaInaccessibleError(RemoteMediaError):
    code = "media_inaccessible"
    status_code = 422


class RemoteMediaSizeError(RemoteMediaError):
    code = "media_too_large"
    status_code = 422


class RemoteMediaProcessingError(RemoteMediaError):
    code = "media_processing_failed"
    status_code = 500


def validate_remote_url(raw_url: str) -> str:
    """Validate remote media URL strictly against security rules and supported host allowlist.
    Returns normalized URL string or raises RemoteMediaError.
    """
    cleaned = (raw_url or "").strip()
    if not cleaned:
        raise RemoteMediaSecurityError("الرجاء إدخال رابط صالح.")

    try:
        parsed = urllib.parse.urlsplit(cleaned)
    except Exception as err:
        raise RemoteMediaSecurityError("الرابط المدخل غير صالح.") from err

    # Scheme must be https
    if parsed.scheme.lower() != "https":
        raise RemoteMediaSecurityError("يُشترط استخدام بروتوكول آمن (https) للرابط.")

    # Reject embedded userinfo
    if parsed.username or parsed.password:
        raise RemoteMediaSecurityError("الرابط يحتوي على بيانات اعتماد غير مصرح بها.")

    hostname = (parsed.hostname or "").lower().rstrip(".")
    if not hostname:
        raise RemoteMediaSecurityError("الرابط المدخل غير صالح.")

    # Reject IP addresses (IPv4 / IPv6) and localhost
    try:
        ipaddress.ip_address(hostname)
        raise RemoteMediaSecurityError("استخدام عناوين IP المباشرة غير مسموح به.")
    except ValueError:
        pass  # Hostname is not a raw IP address, proceed

    if hostname == "localhost" or hostname.endswith(".local") or hostname.endswith(".internal"):
        raise RemoteMediaSecurityError("الوصول إلى الشبكات المحلية غير مسموح به.")

    # Match complete hostname against allowlist
    if hostname not in SUPPORTED_HOSTS:
        raise UnsupportedPlatformError(
            "الرابط غير مدعوم. استخدم رابطًا من يوتيوب أو تيك توك أو إنستغرام."
        )

    # Reject playlists
    path = parsed.path.lower()
    query_params = urllib.parse.parse_qs(parsed.query)

    if "/playlist" in path or "list" in query_params:
        raise RemoteMediaPlaylistError("المقاطع المباشرة وقوائم التشغيل غير مدعومة.")

    return cleaned


def normalize_arabic_for_comparison(text: str) -> str:
    """Internal normalization for candidate deduplication comparison."""
    norm = unicodedata.normalize("NFKC", text)
    norm = TASHKEEL_REGEX.sub("", norm)
    norm = norm.replace("\u0640", "")
    norm = re.sub(r"[إأآٱ]", "ا", norm)
    norm = PUNCTUATION_REGEX.sub(" ", norm)
    return re.sub(r"\s+", " ", norm).strip().lower()


def get_base_ydl_opts(socket_timeout: int = 30) -> dict[str, Any]:
    """Base options for yt-dlp to ensure robust extraction across YouTube (including Shorts), TikTok, and Instagram."""
    opts: dict[str, Any] = {
        "noplaylist": True,
        "socket_timeout": socket_timeout,
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios", "web"],
            }
        },
    }

    # Support optional cookies file for YouTube or platforms requiring cookies
    cookies_path = os.environ.get("YOUTUBE_COOKIES_PATH") or os.environ.get("COOKIES_FILE")
    if not cookies_path:
        project_root = Path(__file__).resolve().parent.parent
        for candidate_name in ["cookies.txt", "youtube_cookies.txt"]:
            cand = project_root / candidate_name
            if os.path.isfile(str(cand)):
                cookies_path = str(cand)
                break

    if cookies_path and os.path.isfile(str(cookies_path)):
        opts["cookiefile"] = str(cookies_path)
        logger.info("Configured yt-dlp cookiefile from: %s", cookies_path)

    return opts


def inspect_remote_media_metadata(url: str) -> dict[str, Any]:
    """Perform metadata-only inspection via yt-dlp without downloading media."""
    ydl_opts = {
        **get_base_ydl_opts(socket_timeout=20),
        "extract_flat": False,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as err:
        err_msg = str(err).lower()
        if "private" in err_msg or "login" in err_msg or "sign in" in err_msg:
            raise RemoteMediaInaccessibleError(
                "تعذر الوصول إلى هذا المقطع. تأكد أن المقطع عام ومتاح دون تسجيل دخول."
            ) from err
        if "not found" in err_msg or "deleted" in err_msg or "404" in err_msg:
            raise RemoteMediaInaccessibleError(
                "لم نتمكن من العثور على المقطع. قد يكون المقطع محذوفًا أو غير متاح."
            ) from err
        logger.warning("yt-dlp metadata extraction failed: %s", err)
        raise RemoteMediaInaccessibleError(
            "تعذر الوصول إلى هذا المقطع. تأكد أن المقطع عام ومتاح."
        ) from err
    except Exception as err:
        logger.error("Unexpected error in yt-dlp metadata extraction: %s", err)
        raise RemoteMediaProcessingError("حدث خطأ أثناء فحص بيانات الرابط.") from err

    if not info:
        raise RemoteMediaInaccessibleError("تعذر قراءة بيانات المقطع.")

    if info.get("_type") == "playlist":
        raise RemoteMediaPlaylistError("المقاطع المباشرة وقوائم التشغيل غير مدعومة.")

    # Check for live stream / upcoming stream
    if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
        raise RemoteMediaLiveStreamError("المقاطع المباشرة وقوائم التشغيل غير مدعومة.")

    duration = info.get("duration")
    if duration is not None:
        try:
            dur_float = float(duration)
            if dur_float > REMOTE_MEDIA_MAX_DURATION_SECONDS:
                raise RemoteMediaDurationError(
                    f"مدة المقطع ({int(dur_float // 60)} دقيقة) تتجاوز الحد المسموح به ({REMOTE_MEDIA_MAX_DURATION_SECONDS // 60} دقيقة كحد أقصى)."
                )
        except (ValueError, TypeError):
            pass

    return {
        "id": info.get("id"),
        "title": info.get("title", ""),
        "extractor": info.get("extractor", ""),
        "duration": duration,
        "filesize_approx": info.get("filesize_approx") or info.get("filesize"),
    }


def download_raw_media(url: str, output_dir: Path) -> Path:
    """Download audio track (or combined media fallback) using native yt-dlp downloader."""
    outtmpl = str(output_dir / "raw_media.%(ext)s")

    ydl_opts = {
        **get_base_ydl_opts(socket_timeout=30),
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": outtmpl,
        "retries": 3,
        "buffersize": 1024 * 1024,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except yt_dlp.utils.DownloadError as err:
        err_msg = str(err).lower()
        if "private" in err_msg or "login" in err_msg:
            raise RemoteMediaInaccessibleError(
                "تعذر تنزيل هذا المقطع. تأكد أن المقطع عام ومتاح."
            ) from err
        logger.warning("yt-dlp download failed: %s", err)
        raise RemoteMediaProcessingError("تعذر استخراج الصوت من الرابط.") from err
    except Exception as err:
        logger.error("Unexpected error in yt-dlp download: %s", err)
        raise RemoteMediaProcessingError("تعذر استخراج الصوت من الرابط.") from err

    # Find the downloaded file in output_dir
    files = [f for f in output_dir.glob("raw_media.*") if f.is_file() and not f.name.endswith(".part")]
    if not files:
        raise RemoteMediaProcessingError("تعذر العثور على الملف الصوتي بعد التنزيل.")

    downloaded = files[0]
    file_size = downloaded.stat().st_size

    if file_size > REMOTE_MEDIA_MAX_SOURCE_BYTES:
        raise RemoteMediaSizeError(
            f"حجم الملف ({file_size // (1024 * 1024)} ميجابايت) يتجاوز الحد المسموح به ({REMOTE_MEDIA_MAX_SOURCE_BYTES // (1024 * 1024)} ميجابايت)."
        )

    if file_size == 0:
        raise RemoteMediaProcessingError("الملف الصوتي المستخرج فارغ.")

    return downloaded


def normalize_audio_to_wav(input_path: Path, output_wav_path: Path) -> float:
    """Convert downloaded audio/video to mono 16000Hz 16-bit PCM WAV using FFmpeg.
    Returns the duration in seconds.
    """
    ffmpeg_path = get_ffmpeg_path()
    ffprobe_path = get_ffprobe_path()

    cmd = [
        ffmpeg_path,
        "-y",
        "-i", str(input_path),
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
            timeout=REMOTE_MEDIA_DOWNLOAD_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as err:
        logger.error("FFmpeg audio normalization timed out")
        raise RemoteMediaProcessingError("استغرقت معالجة الصوت وقتًا أطول من المتوقع.") from err
    except FileNotFoundError as err:
        raise FFmpegUnavailableError("أداة معالجة الفيديو (FFmpeg) غير متوفرة.") from err

    if completed.returncode != 0:
        logger.warning("FFmpeg audio normalization failed: %s", completed.stderr.decode("utf-8", errors="replace"))
        raise RemoteMediaProcessingError("تعذر تحويل المسار الصوتي للمقطع.")

    if not output_wav_path.exists() or output_wav_path.stat().st_size <= 44:
        raise RemoteMediaProcessingError("تعذر استخراج مسار صوتي صالح من المقطع.")

    # Determine duration using ffprobe
    probe_cmd = [
        ffprobe_path,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        str(output_wav_path),
    ]
    duration = 0.0
    try:
        probe_res = subprocess.run(probe_cmd, shell=False, capture_output=True, timeout=15)
        if probe_res.returncode == 0:
            data = json.loads(probe_res.stdout.decode("utf-8", errors="replace"))
            duration = float(data.get("format", {}).get("duration", 0.0))
    except Exception as err:
        logger.warning("Failed to probe normalized audio duration: %s", err)

    return duration


def split_audio_into_chunks(wav_path: Path, output_dir: Path, total_duration: float) -> list[tuple[Path, float]]:
    """Split complete normalized WAV audio into model-safe chunks of REMOTE_MEDIA_AUDIO_CHUNK_SECONDS.
    Returns list of (chunk_file_path, start_offset_seconds).
    """
    chunk_sec = REMOTE_MEDIA_AUDIO_CHUNK_SECONDS
    if total_duration <= chunk_sec:
        return [(wav_path, 0.0)]

    ffmpeg_path = get_ffmpeg_path()
    chunks = []
    start = 0.0
    chunk_index = 0

    while start < total_duration:
        chunk_file = output_dir / f"chunk_{chunk_index:03d}.wav"
        duration_to_extract = min(chunk_sec, total_duration - start)

        cmd = [
            ffmpeg_path,
            "-y",
            "-ss", str(start),
            "-t", str(duration_to_extract),
            "-i", str(wav_path),
            "-c", "copy",
            "-f", "wav",
            str(chunk_file),
        ]

        try:
            res = subprocess.run(cmd, shell=False, capture_output=True, timeout=30)
            if res.returncode == 0 and chunk_file.exists() and chunk_file.stat().st_size > 44:
                chunks.append((chunk_file, start))
        except Exception as err:
            logger.warning("Failed to create audio chunk at start=%f: %s", start, err)

        start += chunk_sec
        chunk_index += 1

    return chunks if chunks else [(wav_path, 0.0)]


def extract_candidates_from_chunks(
    chunks: list[tuple[Path, float]],
    client_ip: str = "127.0.0.1",
    on_chunk_progress: Any = None,
) -> tuple[list[dict], bool]:
    """Extract candidate Quran/Hadith phrases from audio chunks with bounded concurrency.
    Returns (raw_candidates, partial_processing_flag).
    """
    all_candidates: list[dict] = []
    chunk_failures = 0
    total_chunks = len(chunks)
    completed_chunks = 0

    def process_single_chunk(chunk_item: tuple[Path, float]) -> list[dict]:
        chunk_path, start_offset = chunk_item
        chunk_bytes = chunk_path.read_bytes()
        cands = extract_media_candidates(
            media_bytes=chunk_bytes,
            media_type="audio",
            mime_type="audio/wav",
            client_ip=client_ip,
        )
        for cand in cands:
            cand["approximateStartSeconds"] = start_offset
        return cands

    with ThreadPoolExecutor(max_workers=REMOTE_MEDIA_MAX_CONCURRENT_CHUNKS) as executor:
        futures = {executor.submit(process_single_chunk, chunk): chunk for chunk in chunks}
        for future in futures:
            chunk = futures[future]
            try:
                cands = future.result()
                all_candidates.extend(cands)
            except Exception as err:
                chunk_failures += 1
                logger.warning("Chunk extraction at offset %s failed: %s", chunk[1], err)
            finally:
                completed_chunks += 1
                if on_chunk_progress:
                    on_chunk_progress(completed_chunks, total_chunks)

    if chunk_failures == total_chunks and total_chunks > 0:
        raise RemoteMediaProcessingError("تعذر استخراج النص من الرابط بسبب خطأ في تحليل الصوت.")

    partial_processing = chunk_failures > 0
    return all_candidates, partial_processing


def deduplicate_extracted_candidates(candidates: list[dict]) -> list[dict]:
    """Deduplicate extracted candidates across chunks using Arabic normalization."""
    seen_groups: dict[str, dict] = {}

    confidence_score = {"high": 3, "medium": 2, "low": 1}

    for cand in candidates:
        text = cand.get("text", "").strip()
        if not text:
            continue

        norm = normalize_arabic_for_comparison(text)
        if not norm:
            continue

        existing = seen_groups.get(norm)
        if existing is None:
            seen_groups[norm] = cand
        else:
            # Pick candidate with higher confidence or longer text
            curr_score = confidence_score.get(cand.get("confidence", "medium"), 2)
            exist_score = confidence_score.get(existing.get("confidence", "medium"), 2)
            if curr_score > exist_score or (curr_score == exist_score and len(text) > len(existing.get("text", ""))):
                seen_groups[norm] = cand

    return list(seen_groups.values())


def try_visual_fallback_for_short_video(
    url: str,
    duration: float,
    client_ip: str = "127.0.0.1",
) -> list[dict]:
    """If complete audio returned 0 candidates and video is short (<= 180s),
    download a low-res video format to extract a keyframe image.
    """
    if duration <= 0 or duration > 180:
        return []

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        video_output = temp_path / "fallback_video.mp4"

        ydl_opts = {
            **get_base_ydl_opts(socket_timeout=30),
            "format": "worstvideo[height>=240]+worstaudio/worst/best[height<=480]",
            "outtmpl": str(video_output),
            "retries": 2,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except Exception as err:
            logger.warning("Visual fallback video download failed: %s", err)
            return []

        if not video_output.exists() or video_output.stat().st_size == 0:
            return []
        # Determine sampling timestamps across the video
        if duration <= 12.0:
            timestamps = [max(1.0, duration * 0.5)]
        elif duration <= 35.0:
            timestamps = [duration * 0.35, duration * 0.7]
        else:
            timestamps = [duration * 0.25, duration * 0.5, duration * 0.75]

        all_candidates: list[dict] = []
        for idx, ts in enumerate(timestamps):
            keyframe_output = temp_path / f"keyframe_{idx}.jpg"
            success = extract_keyframe_from_video(video_output, keyframe_output, timestamp=ts)
            if not success or not keyframe_output.exists() or keyframe_output.stat().st_size == 0:
                continue

            try:
                kf_bytes = keyframe_output.read_bytes()
                candidates = extract_media_candidates(
                    media_bytes=kf_bytes,
                    media_type="image",
                    mime_type="image/jpeg",
                    client_ip=client_ip,
                )
                if candidates:
                    all_candidates.extend(candidates)
            except Exception as err:
                logger.warning("Visual fallback keyframe candidate extraction failed at ts=%.1f: %s", ts, err)

        return deduplicate_extracted_candidates(all_candidates)


class JobState:
    def __init__(self, job_id: str, url: str, client_ip: str):
        self.job_id = job_id
        self.url = url
        self.client_ip = client_ip
        self.status: Literal["queued", "processing", "completed", "failed"] = "queued"
        self.stage: str = "validating_url"
        self.progress: int = 5
        self.message: str = "تم استلام الرابط، في انتظار المعالجة..."
        self.result: dict | None = None
        self.error: dict | None = None
        self.created_at: float = time.time()
        self.updated_at: float = time.time()

    def to_dict(self) -> dict:
        base = {
            "jobId": self.job_id,
            "status": self.status,
            "stage": self.stage,
            "progress": self.progress,
            "message": self.message,
        }
        if self.status == "completed" and self.result is not None:
            base["result"] = self.result
        if self.status == "failed" and self.error is not None:
            base["error"] = self.error
        return base


class RemoteMediaJobRegistry:
    """Thread-safe in-memory registry for asynchronous remote media extraction jobs."""

    def __init__(self):
        self._jobs: dict[str, JobState] = {}
        self._lock = threading.Lock()

    def create_job(self, url: str, client_ip: str) -> JobState:
        self.cleanup_expired_jobs()
        job_id = secrets.token_urlsafe(16)
        job = JobState(job_id=job_id, url=url, client_ip=client_ip)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> JobState | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                # Update TTL touch or return copy
                return job
        return None

    def update_job(
        self,
        job_id: str,
        status: Literal["queued", "processing", "completed", "failed"] | None = None,
        stage: str | None = None,
        progress: int | None = None,
        message: str | None = None,
        result: dict | None = None,
        error: dict | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if status is not None:
                job.status = status
            if stage is not None:
                job.stage = stage
            if progress is not None:
                job.progress = max(0, min(100, progress))
            if message is not None:
                job.message = message
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error
            job.updated_at = time.time()

    def cleanup_expired_jobs(self) -> None:
        now = time.time()
        with self._lock:
            expired = [
                jid for jid, j in self._jobs.items()
                if now - j.updated_at > REMOTE_MEDIA_JOB_TTL_SECONDS
            ]
            for jid in expired:
                del self._jobs[jid]


# Global singleton registry
job_registry = RemoteMediaJobRegistry()

