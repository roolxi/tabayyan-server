from pathlib import Path
import logging
import os
import sqlite3
import re
import tempfile
import unicodedata
from copy import deepcopy
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from fastapi import BackgroundTasks, FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, StrictStr, field_validator
from rapidfuzz import fuzz

from build import normalize
from search import search
from services.dorar_client import (
    DorarBlocked,
    DorarCurlError,
    DorarError,
    DorarSourceError,
    DorarTimeout,
    fetch_page,
    fetch_dorar_json_api,
)
from services.dorar_parser import (
    inspect_specialist,
    parse_section,
    parse_dorar_json_result,
    deduplicate_hadith_candidates,
    normalize_arabic_for_dedup,
)
from services.media_processor import (
    MediaError,
    process_media_upload,
)
from services.openrouter_client import (
    OpenRouterError,
    OpenRouterNotConfigured,
    OpenRouterRateLimited,
    OpenRouterSourceError,
    OpenRouterTimeout,
    check_rate_limit,
    suggest_search_phrases,
    generate_hadith_search_queries,
    select_hadith_candidate_ids,
    extract_media_candidates,
)
from services.remote_media_processor import (
    RemoteMediaError,
    job_registry,
    validate_remote_url,
    inspect_remote_media_metadata,
    download_raw_media,
    normalize_audio_to_wav,
    split_audio_into_chunks,
    extract_candidates_from_chunks,
    deduplicate_extracted_candidates,
    try_visual_fallback_for_short_video,
)

ROOT = Path(__file__).resolve().parent
DATABASE_PATH = ROOT / "quran.sqlite"
WEB_PATH = ROOT / "web"
DATABASE_URI = f"file:{DATABASE_PATH.as_posix()}?mode=ro"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="البحث في القرآن الكريم")
app.mount("/static", StaticFiles(directory=WEB_PATH), name="static")

APPROXIMATE_THRESHOLD = 88
APPROXIMATE_LIMIT = 5
APPROXIMATE_MINIMUM_CANDIDATE_WORDS = 4
APPROXIMATE_MESSAGE = "وجدنا آيات قريبة من العبارة التي كتبتها. اختر الآية التي تقصدها."
DEGREE_FILTERS = {
    1: {"label": "أحاديث حكم المحدثون عليها بالصحة، ونحو ذلك", "subject": "hadith", "group": "accepted_type"},
    2: {"label": "أحاديث حكم المحدثون على أسانيدها بالصحة، ونحو ذلك", "subject": "isnad", "group": "accepted_type"},
    3: {"label": "أحاديث حكم المحدثون عليها بالضعف، ونحو ذلك", "subject": "hadith", "group": "weak_type"},
    4: {"label": "أحاديث حكم المحدثون على أسانيدها بالضعف، ونحو ذلك", "subject": "isnad", "group": "weak_type"},
}


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: StrictStr

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 500:
            raise ValueError("الرجاء إدخال عبارة بحث من 1 إلى 500 حرفًا.")
        if not normalize(value):
            raise ValueError("عبارة البحث لا تحتوي على نص قابل للبحث.")
        return value


class HadithSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: StrictStr
    mode: str = "simple"

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 1000:
            raise ValueError("الرجاء إدخال نص حديث من 1 إلى 1000 حرف.")
        return value

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        if value not in {"simple", "specialist"}:
            raise ValueError("وضع البحث يجب أن يكون simple أو specialist.")
        return value


class SuggestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: StrictStr
    type: StrictStr

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 500:
            raise ValueError("الرجاء إدخال نص بحث من 1 إلى 500 حرف.")
        return value

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"quran", "hadith"}:
            raise ValueError("نوع البحث يجب أن يكون quran أو hadith.")
        return value


class MeaningSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: StrictStr
    clarifications: list[StrictStr] = []

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 500:
            raise ValueError("الرجاء إدخال نص بحث من 1 إلى 500 حرف.")
        return value

    @field_validator("clarifications")
    @classmethod
    def validate_clarifications(cls, items: list[str]) -> list[str]:
        if len(items) > 2:
            raise ValueError("الحد الأقصى للتوضيحات هو 2.")
        cleaned = []
        for item in items:
            val = item.strip()
            if not 1 <= len(val) <= 500:
                raise ValueError("التوضيح يجب أن يكون من 1 إلى 500 حرف.")
            cleaned.append(val)
        return cleaned


def get_client_ip(request: Request) -> str:
    trusted_proxies = os.getenv("TRUSTED_PROXIES")
    direct_host = request.client.host if request.client else "127.0.0.1"
    if trusted_proxies:
        trusted_set = {ip.strip() for ip in trusted_proxies.split(",") if ip.strip()}
        if direct_host in trusted_set:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()
    return direct_host


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else None
    msg = first_error.get("msg") if first_error else "الرجاء إدخال نص بحث صالح من 1 إلى 500 حرفًا، دون حقول إضافية."
    if isinstance(msg, str) and msg.startswith("Value error, "):
        msg = msg[len("Value error, "):]
    return JSONResponse(
        status_code=422,
        content={"message": msg},
    )


@app.post("/api/search/suggest")
def search_suggest(payload: SuggestRequest, request: Request) -> JSONResponse:
    client_ip = get_client_ip(request)
    try:
        candidates = suggest_search_phrases(
            text=payload.text,
            corpus_type=payload.type,
            client_ip=client_ip,
        )
        response = {
            "query": payload.text,
            "type": payload.type,
            "candidates": candidates,
        }
        if not candidates:
            response["message"] = "لم نتمكن من اقتراح عبارة مناسبة. جرّب إضافة كلمات تتذكرها."
        return JSONResponse(content=response)
    except OpenRouterNotConfigured:
        return JSONResponse(
            status_code=503,
            content={"code": "ai_not_configured", "message": "البحث بالمعنى غير مفعّل حاليًا."},
        )
    except OpenRouterTimeout:
        return JSONResponse(
            status_code=504,
            content={"code": "ai_timeout", "message": "تعذّر البحث بالمعنى حاليًا. يمكنك استخدام البحث العادي."},
        )
    except OpenRouterRateLimited:
        return JSONResponse(
            status_code=429,
            content={"code": "ai_rate_limited", "message": "تجاوزت الحد المسموح من طلبات البحث بالمعنى. يُرجى الانتظار قليلًا."},
        )
    except OpenRouterSourceError:
        return JSONResponse(
            status_code=502,
            content={"code": "ai_unavailable", "message": "تعذّر البحث بالمعنى حاليًا. يمكنك استخدام البحث العادي."},
        )
    except Exception:
        logger.exception("Unexpected error in /api/search/suggest")
        return JSONResponse(
            status_code=500,
            content={"code": "ai_internal_error", "message": "تعذّر البحث بالمعنى حاليًا. يمكنك استخدام البحث العادي."},
        )


def _make_no_candidate_response(attempt: int) -> dict:
    if attempt == 1:
        return {
            "status": "needs_clarification",
            "attempt": 1,
            "attemptsRemaining": 2,
            "message": "وضّح المعنى أكثر، واذكر الموقف أو أي كلمة تتذكرها.",
        }
    elif attempt == 2:
        return {
            "status": "needs_clarification",
            "attempt": 2,
            "attemptsRemaining": 1,
            "message": "حاول توضيح المعنى مرة أخيرة، مثل من قال الحديث أو الموقف الذي ورد فيه.",
        }
    else:
        return {
            "status": "not_found",
            "attempt": 3,
            "attemptsRemaining": 0,
            "message": "لم نتمكن من تحديد الحديث من الوصف الذي أدخلته.",
        }


@app.post("/api/hadith/meaning-search")
def hadith_meaning_search(payload: MeaningSearchRequest, request: Request) -> JSONResponse:
    client_ip = get_client_ip(request)
    attempt = len(payload.clarifications) + 1

    try:
        check_rate_limit(client_ip)
    except OpenRouterRateLimited:
        return JSONResponse(
            status_code=429,
            content={
                "status": "temporarily_unavailable",
                "message": "تجاوزت الحد المسموح من طلبات البحث بالمعنى. يُرجى الانتظار قليلًا.",
            },
        )

    # 1. Call 1: Query generation
    try:
        queries = generate_hadith_search_queries(payload.text, payload.clarifications)
    except (OpenRouterError, Exception) as err:
        logger.warning("Call 1 failed: %s", err)
        return JSONResponse(
            status_code=200,
            content={
                "status": "temporarily_unavailable",
                "message": "تعذّر إكمال البحث حاليًا. حاول مرة أخرى.",
            },
        )

    if not queries:
        return JSONResponse(content=_make_no_candidate_response(attempt))

    # 2. Dorar JSON API Retrieval
    raw_candidates = []
    success_count = 0
    error_count = 0
    for query in queries[:3]:
        try:
            html = fetch_dorar_json_api(query)
            success_count += 1
            texts = parse_dorar_json_result(html)
            raw_candidates.extend(texts)
        except (DorarError, Exception) as err:
            error_count += 1
            logger.warning("Dorar JSON API error for query '%s': %s", query, err)

    if success_count == 0 and error_count > 0:
        return JSONResponse(
            status_code=200,
            content={
                "status": "temporarily_unavailable",
                "message": "تعذّر إكمال البحث حاليًا. حاول مرة أخرى.",
            },
        )

    # 3. Deduplicate
    deduped = deduplicate_hadith_candidates(raw_candidates, max_count=30)
    if not deduped:
        return JSONResponse(content=_make_no_candidate_response(attempt))

    candidate_map = {c["id"]: c["text"] for c in deduped}

    # 4. Call 2: Candidate selection
    try:
        selected_ids = select_hadith_candidate_ids(payload.text, payload.clarifications, deduped)
    except (OpenRouterError, Exception) as err:
        logger.warning("Call 2 failed: %s", err)
        return JSONResponse(
            status_code=200,
            content={
                "status": "temporarily_unavailable",
                "message": "تعذّر إكمال البحث حاليًا. حاول مرة أخرى.",
            },
        )

    # Server validation: only known candidate IDs from candidate_map
    valid_selected = [cid for cid in selected_ids if cid in candidate_map]
    if not valid_selected:
        return JSONResponse(content=_make_no_candidate_response(attempt))

    return JSONResponse(
        content={
            "status": "candidates",
            "attempt": attempt,
            "source": "dorar",
            "candidates": [
                {"id": cid, "text": candidate_map[cid]}
                for cid in valid_selected[:3]
            ],
            "message": "هل تقصد أحد هذه الأحاديث؟",
        }
    )


@app.post("/api/media/extract")
async def extract_media_endpoint(request: Request, file: UploadFile = File(...)) -> JSONResponse:
    client_ip = get_client_ip(request)

    # 1. Validate & process upload
    try:
        processed = await process_media_upload(file)
    except MediaError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )
    except Exception:
        logger.exception("Unexpected error while processing media upload")
        return JSONResponse(
            status_code=500,
            content={"code": "media_processing_failed", "message": "حدث خطأ أثناء معالجة الوسائط."},
        )

    # 2. Extract candidates via OpenRouter
    media_type = "image" if processed.kind == "image" else "audio"
    try:
        candidates = extract_media_candidates(
            media_bytes=processed.data,
            media_type=media_type,
            mime_type=processed.mime_type,
            client_ip=client_ip,
        )

        # If video audio yielded 0 candidates and we have an extracted keyframe, try visual extraction fallback
        if not candidates and processed.kind == "video" and getattr(processed, "keyframe_data", None):
            logger.info("Video audio returned 0 candidates; attempting visual keyframe candidate extraction...")
            try:
                candidates = extract_media_candidates(
                    media_bytes=processed.keyframe_data,
                    media_type="image",
                    mime_type="image/jpeg",
                    client_ip=client_ip,
                )
            except Exception as kf_err:
                logger.warning("Video keyframe visual fallback failed: %s", kf_err)
    except OpenRouterNotConfigured:
        return JSONResponse(
            status_code=503,
            content={"code": "ai_not_configured", "message": "البحث بالوسائط غير مفعّل حاليًا."},
        )
    except OpenRouterRateLimited:
        return JSONResponse(
            status_code=429,
            content={"code": "ai_rate_limited", "message": "تجاوزت الحد المسموح من طلبات البحث بالوسائط. يُرجى الانتظار قليلًا."},
        )
    except OpenRouterTimeout:
        return JSONResponse(
            status_code=504,
            content={"code": "ai_timeout", "message": "تعذّر استخراج النص من الوسائط حاليًا بسبب انتهاء المهلة. حاول مرة أخرى."},
        )
    except (OpenRouterSourceError, OpenRouterError):
        return JSONResponse(
            status_code=502,
            content={"code": "ai_unavailable", "message": "تعذّر استخراج النص من الوسائط حاليًا. حاول مرة أخرى."},
        )
    except Exception:
        logger.exception("Unexpected error during candidate extraction")
        return JSONResponse(
            status_code=500,
            content={"code": "media_processing_failed", "message": "حدث خطأ غير متوقع أثناء استخراج النص."},
        )

    if not candidates:
        return JSONResponse(
            content={
                "status": "not_found",
                "mediaType": processed.kind,
                "results": [],
                "message": "لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى.",
            }
        )

    # 3. Ground candidates against authoritative sources
    verified_results, dorar_error_occurred, unique_candidates = ground_candidates_to_results(candidates)

    if verified_results:
        return JSONResponse(
            content={
                "status": "candidates",
                "mediaType": processed.kind,
                "results": verified_results,
            }
        )
    elif dorar_error_occurred and not any(c.get("type") == "quran" for c in unique_candidates):
        return JSONResponse(
            content={
                "status": "temporarily_unavailable",
                "mediaType": processed.kind,
                "results": [],
                "message": "تعذّر الاتصال بمصدر الحديث حاليًا للتحقق من النص. حاول مرة أخرى لاحقًا.",
            }
        )
    else:
        return JSONResponse(
            content={
                "status": "not_found",
                "mediaType": processed.kind,
                "results": [],
                "message": "لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى.",
            }
        )


def extract_hadith_fallback_queries(h_text: str) -> list[str]:
    """Generate clean fallback query phrases for Dorar search when full text yields 0 results."""
    cleaned = h_text.strip()
    sub_queries: list[str] = []

    # 1. Check for reporting verbs: يقول, قال, قالت, سمعت, عنه
    m_verb = re.search(r"(?:يقول|قال|قالت|سمعت|عنه)\s*[:،,-]?\s*(.+)", cleaned)
    if m_verb:
        after_verb = m_verb.group(1).strip()
        if after_verb and after_verb not in sub_queries:
            sub_queries.append(after_verb)

    # 2. Extract contiguous dhikr phrases if present
    m_dhikr = re.search(
        r"((?:لا إله إلا الله|سبحان الله|الحمد لله|الله أكبر|ولا حول ولا قوة إلا بالله|لا حول ولا قوة إلا بالله|والله أكبر)(?:\s*(?:و\s*)?(?:لا إله إلا الله|سبحان الله|الحمد لله|الله أكبر|ولا حول ولا قوة إلا بالله|لا حول ولا قوة إلا بالله|والله أكبر))*)",
        cleaned,
    )
    if m_dhikr and len(m_dhikr.group(0).split()) >= 3:
        dhikr_str = m_dhikr.group(0).strip()
        if dhikr_str not in sub_queries:
            sub_queries.append(dhikr_str)

    # 3. Strip common sermon oratorical prefixes
    no_prefix = re.sub(
        r"^(?:يا\s+)?(?:أيها|ايها|يا)\s+(?:الناس|المؤمنين|المؤمنون|عباد\s+الله|إخواني|قوم)\s*(?:و(?:الله|بالله)\s*)?[،,!\s]*",
        "",
        cleaned,
    ).strip()
    if no_prefix and no_prefix != cleaned and no_prefix not in sub_queries:
        sub_queries.append(no_prefix)

    # 4. Split on punctuation
    for base in [cleaned, no_prefix]:
        if not base:
            continue
        clauses = [c.strip() for c in re.split(r"[،,.\n;:؟!]", base) if len(c.strip().split()) >= 3]
        for c in clauses:
            if c and c not in sub_queries:
                sub_queries.append(c)

    # 5. Ending distinctive clause if long
    words = cleaned.split()
    if len(words) > 8:
        end_win = " ".join(words[-7:])
        if end_win not in sub_queries:
            sub_queries.append(end_win)

    return [q for q in sub_queries if q != cleaned]


def ground_candidates_to_results(candidates: list[dict]) -> tuple[list[dict], bool, list[dict]]:
    """Ground deduplicated candidates against authoritative Quran and Dorar Hadith sources.
    Returns: (verified_results, dorar_error_occurred, unique_candidates)
    """
    seen_normalized = set()
    unique_candidates = []
    for cand in candidates:
        text = cand.get("text", "")
        norm = normalize_arabic_for_dedup(text)
        if norm and norm not in seen_normalized:
            seen_normalized.add(norm)
            unique_candidates.append(cand)

    verified_results = []
    dorar_queries_count = 0
    dorar_error_occurred = False

    for cand in unique_candidates:
        c_type = cand.get("type")
        c_text = cand.get("text", "").strip()
        c_conf = cand.get("confidence", "medium")

        if not c_text:
            continue

        if c_type == "quran":
            q_text = c_text[:500]
            try:
                norm_q = normalize(q_text)
                rows = search(q_text) if norm_q else []
                if not rows and norm_q:
                    rows = approximate_search(q_text)
                if rows:
                    best = rows[0]
                    verified_results.append({
                        "type": "quran",
                        "verified": True,
                        "extractedText": c_text,
                        "confidence": c_conf,
                        "displayText": best["text_uthmani"],
                        "source": {
                            "name": "Tanzil Project",
                            "verseKey": best["verse_key"],
                            "surahName": best["surah_name"],
                            "ayah": best["ayah"],
                        },
                    })
            except Exception:
                logger.exception("Quran search failed for candidate '%s'", c_text)

        elif c_type == "hadith":
            if dorar_queries_count < 2:
                dorar_queries_count += 1
                try:
                    h_text = c_text[:1000]
                    aggregate = simple_hadith_search(h_text)
                    if not aggregate.get("results"):
                        for alt_q in extract_hadith_fallback_queries(h_text):
                            fallback_agg = simple_hadith_search(alt_q)
                            if fallback_agg.get("results"):
                                aggregate = fallback_agg
                                break

                    results = aggregate.get("results", [])
                    presentation = simple_text_presentation(results, h_text)
                    matched = presentation.get("matched", False)
                    best_match_group = None

                    if matched:
                        best_match_group = presentation.get("selected")
                    elif results:
                        norm_h = normalize_hadith_text(h_text)
                        scored_groups = []
                        for grp in [presentation.get("selected")] + presentation.get("alternates", []):
                            if not grp:
                                continue
                            norm_grp_text = normalize_hadith_text(grp.get("text", ""))
                            score = fuzz.token_set_ratio(norm_h, norm_grp_text)
                            scored_groups.append((score, grp))
                        scored_groups.sort(key=lambda item: item[0], reverse=True)
                        if scored_groups and scored_groups[0][0] >= 55.0:
                            best_match_group = scored_groups[0][1]

                    if best_match_group:
                        selected_records = best_match_group.get("records", [])
                        verified_results.append({
                            "type": "hadith",
                            "verified": True,
                            "extractedText": c_text,
                            "confidence": c_conf,
                            "displayText": best_match_group["text"],
                            "source": {
                                "name": "الدرر السنية",
                                "url": aggregate.get("sourceUrl"),
                            },
                            "mixedCategories": aggregate.get("mixedCategories", False),
                            "categoryLabels": best_match_group.get("categoryLabels", []),
                            "records": selected_records,
                            "alternatesCount": len(presentation.get("alternates", [])),
                        })
                except (DorarTimeout, DorarBlocked, DorarCurlError, DorarSourceError, Exception) as err:
                    dorar_error_occurred = True
                    logger.warning("Dorar search failed for candidate '%s': %s", c_text, err)

        elif c_type == "unknown":
            matched_quran = False
            q_text = c_text[:500]
            try:
                norm_q = normalize(q_text)
                rows = search(q_text) if norm_q else []
                if not rows and norm_q:
                    rows = approximate_search(q_text)
                if rows:
                    best = rows[0]
                    matched_quran = True
                    verified_results.append({
                        "type": "quran",
                        "verified": True,
                        "extractedText": c_text,
                        "confidence": c_conf,
                        "displayText": best["text_uthmani"],
                        "source": {
                            "name": "Tanzil Project",
                            "verseKey": best["verse_key"],
                            "surahName": best["surah_name"],
                            "ayah": best["ayah"],
                        },
                    })
            except Exception:
                logger.exception("Quran search failed for unknown candidate '%s'", c_text)

            if not matched_quran and dorar_queries_count < 2:
                dorar_queries_count += 1
                try:
                    h_text = c_text[:1000]
                    aggregate = simple_hadith_search(h_text)
                    if not aggregate.get("results"):
                        for alt_q in extract_hadith_fallback_queries(h_text):
                            fallback_agg = simple_hadith_search(alt_q)
                            if fallback_agg.get("results"):
                                aggregate = fallback_agg
                                break

                    results = aggregate.get("results", [])
                    presentation = simple_text_presentation(results, h_text)
                    matched = presentation.get("matched", False)
                    best_match_group = None

                    if matched:
                        best_match_group = presentation.get("selected")
                    elif results:
                        norm_h = normalize_hadith_text(h_text)
                        scored_groups = []
                        for grp in [presentation.get("selected")] + presentation.get("alternates", []):
                            if not grp:
                                continue
                            norm_grp_text = normalize_hadith_text(grp.get("text", ""))
                            score = fuzz.token_set_ratio(norm_h, norm_grp_text)
                            scored_groups.append((score, grp))
                        scored_groups.sort(key=lambda item: item[0], reverse=True)
                        if scored_groups and scored_groups[0][0] >= 55.0:
                            best_match_group = scored_groups[0][1]

                    if best_match_group:
                        selected_records = best_match_group.get("records", [])
                        verified_results.append({
                            "type": "hadith",
                            "verified": True,
                            "extractedText": c_text,
                            "confidence": c_conf,
                            "displayText": best_match_group["text"],
                            "source": {
                                "name": "الدرر السنية",
                                "url": aggregate.get("sourceUrl"),
                            },
                            "mixedCategories": aggregate.get("mixedCategories", False),
                            "categoryLabels": best_match_group.get("categoryLabels", []),
                            "records": selected_records,
                            "alternatesCount": len(presentation.get("alternates", [])),
                        })
                except (DorarTimeout, DorarBlocked, DorarCurlError, DorarSourceError, Exception) as err:
                    dorar_error_occurred = True
                    logger.warning("Dorar search failed for unknown candidate '%s': %s", c_text, err)

    return verified_results, dorar_error_occurred, unique_candidates


class RemoteMediaJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: StrictStr

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        val = value.strip()
        if not val or len(val) > 1000:
            raise ValueError("الرجاء إدخال رابط صالح.")
        return val


def run_remote_media_job(job_id: str, url: str, client_ip: str):
    job = job_registry.get_job(job_id)
    if not job:
        return

    job_registry.update_job(job_id, status="processing", stage="validating_url", progress=10, message="جارٍ قراءة الرابط...")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        try:
            # Stage 1: Validate URL
            validated_url = validate_remote_url(url)

            # Stage 2: Metadata inspection
            job_registry.update_job(job_id, stage="reading_metadata", progress=20, message="جارٍ قراءة بيانات المقطع...")
            meta = inspect_remote_media_metadata(validated_url)
            duration = meta.get("duration") or 0.0

            # Stage 3: Download complete audio
            job_registry.update_job(job_id, stage="downloading_audio", progress=35, message="جارٍ تنزيل الصوت...")
            raw_media = download_raw_media(validated_url, temp_path)

            # Stage 4: Normalize audio to mono 16kHz WAV
            job_registry.update_job(job_id, stage="normalizing_audio", progress=50, message="جارٍ معالجة الصوت...")
            normalized_wav = temp_path / "normalized.wav"
            actual_duration = normalize_audio_to_wav(raw_media, normalized_wav)
            if actual_duration > 0:
                duration = actual_duration

            # Clean raw media file immediately
            if raw_media.exists():
                try:
                    raw_media.unlink()
                except Exception:
                    pass

            # Stage 5: Chunk audio and extract candidates
            job_registry.update_job(job_id, stage="analyzing_audio", progress=65, message="جارٍ تحليل المقطع...")
            chunks_dir = temp_path / "chunks"
            chunks_dir.mkdir(exist_ok=True)
            chunks = split_audio_into_chunks(normalized_wav, chunks_dir, duration)

            def on_chunk_progress(completed: int, total: int):
                pct = 65 + int(20 * (completed / max(1, total)))
                job_registry.update_job(
                    job_id,
                    progress=pct,
                    message=f"جارٍ تحليل المقطع ({completed}/{total})...",
                )

            candidates, partial_processing = extract_candidates_from_chunks(
                chunks,
                client_ip=client_ip,
                on_chunk_progress=on_chunk_progress,
            )

            # Stage 6: Visual keyframe fallback if 0 audio candidates and short video
            if not candidates and duration <= 180:
                job_registry.update_job(
                    job_id,
                    stage="visual_fallback",
                    progress=88,
                    message="لم يُكتشف نص صوتي؛ جارٍ فحص الإطارات البصرية للمقطع...",
                )
                try:
                    candidates = try_visual_fallback_for_short_video(validated_url, duration, client_ip=client_ip)
                    logger.info("Visual fallback for job %s returned %d candidates", job_id, len(candidates))
                except Exception as kf_err:
                    logger.warning("Visual fallback for job %s failed: %s", job_id, kf_err)

            # Stage 7: Deduplicate candidates
            deduped_candidates = deduplicate_extracted_candidates(candidates)

            # Stage 8: Ground candidates against authoritative sources
            job_registry.update_job(
                job_id,
                stage="matching_sources",
                progress=92,
                message="جارٍ مطابقة النص مع المصادر...",
            )
            verified_results, dorar_error_occurred, unique_cands = ground_candidates_to_results(deduped_candidates)

            # Build final compatible result shape
            if verified_results:
                final_result = {
                    "status": "candidates",
                    "mediaType": "video",
                    "results": verified_results,
                    "sourcePlatform": meta.get("extractor"),
                    "sourceTitle": meta.get("title"),
                    "sourceUrl": validated_url,
                    "partialProcessing": partial_processing,
                }
            elif dorar_error_occurred and not any(c.get("type") == "quran" for c in unique_cands):
                final_result = {
                    "status": "temporarily_unavailable",
                    "mediaType": "video",
                    "results": [],
                    "message": "تعذّر الاتصال بمصدر الحديث حاليًا للتحقق من النص. حاول مرة أخرى لاحقًا.",
                    "sourcePlatform": meta.get("extractor"),
                    "sourceTitle": meta.get("title"),
                    "sourceUrl": validated_url,
                }
            else:
                final_result = {
                    "status": "not_found",
                    "mediaType": "video",
                    "results": [],
                    "message": "لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى.",
                    "sourcePlatform": meta.get("extractor"),
                    "sourceTitle": meta.get("title"),
                    "sourceUrl": validated_url,
                }

            job_registry.update_job(
                job_id,
                status="completed",
                stage="completed",
                progress=100,
                message="اكتمل الفحص والمطابقة بنجاح.",
                result=final_result,
            )

        except RemoteMediaError as exc:
            logger.warning("Remote media job %s failed with %s: %s", job_id, exc.code, exc.message)
            job_registry.update_job(
                job_id,
                status="failed",
                stage="failed",
                progress=100,
                message=exc.message,
                error={"code": exc.code, "message": exc.message},
            )
        except OpenRouterRateLimited:
            msg = "تجاوزت الحد المسموح من طلبات البحث بالوسائط. يُرجى الانتظار قليلًا."
            job_registry.update_job(
                job_id,
                status="failed",
                stage="failed",
                progress=100,
                message=msg,
                error={"code": "ai_rate_limited", "message": msg},
            )
        except OpenRouterTimeout:
            msg = "استغرقت معالجة الذكاء الاصطناعي وقتًا أطول من المعتاد. يرجى إعادة المحاولة."
            job_registry.update_job(
                job_id,
                status="failed",
                stage="failed",
                progress=100,
                message=msg,
                error={"code": "ai_timeout", "message": msg},
            )
        except (OpenRouterSourceError, OpenRouterError):
            msg = "تعذّر استخراج النص من الوسائط حاليًا. حاول مرة أخرى."
            job_registry.update_job(
                job_id,
                status="failed",
                stage="failed",
                progress=100,
                message=msg,
                error={"code": "ai_unavailable", "message": msg},
            )
        except Exception as exc:
            logger.exception("Unexpected error in remote media job %s", job_id)
            msg = "حدث خطأ غير متوقع أثناء معالجة المقطع."
            job_registry.update_job(
                job_id,
                status="failed",
                stage="failed",
                progress=100,
                message=msg,
                error={"code": "media_processing_failed", "message": msg},
            )


@app.post("/api/media/url/jobs")
async def create_url_job(
    payload: RemoteMediaJobRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    client_ip = get_client_ip(request)
    try:
        validated_url = validate_remote_url(payload.url)
    except RemoteMediaError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )

    job = job_registry.create_job(validated_url, client_ip)
    background_tasks.add_task(run_remote_media_job, job.job_id, validated_url, client_ip)

    return JSONResponse(status_code=202, content={"jobId": job.job_id, "status": "queued"})


@app.get("/api/media/url/jobs/{job_id}")
def get_url_job_status(job_id: str) -> JSONResponse:
    job = job_registry.get_job(job_id)
    if not job:
        return JSONResponse(
            status_code=404,
            content={"code": "job_not_found", "message": "لم يتم العثور على مهمة الفحص المطلوبة."},
        )

    return JSONResponse(content=job.to_dict())


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_PATH / "index.html")


@app.get("/quran")
def quran_page() -> FileResponse:
    return FileResponse(WEB_PATH / "quran.html")


@app.get("/hadith")
def hadith_page() -> FileResponse:
    return FileResponse(WEB_PATH / "hadith.html")


@app.get("/api/health", response_model=None)
def health() -> dict[str, str] | JSONResponse:
    try:
        with sqlite3.connect(DATABASE_URI, uri=True) as database:
            database.execute("SELECT 1")
        return {"status": "ok"}
    except Exception:
        return JSONResponse(status_code=503, content={"message": "الخدمة غير متاحة حاليًا."})


def approximate_search(query: str) -> list[dict]:
    normalized_query = normalize(query)
    if len(normalized_query.split()) < 4:
        return []
    if sum(character.isalpha() and "\u0600" <= character <= "\u06ff" for character in normalized_query) < 12:
        return []

    with sqlite3.connect(DATABASE_URI, uri=True) as database:
        database.row_factory = sqlite3.Row
        rows = database.execute(
            "SELECT verse_key, surah, ayah, surah_name, text_uthmani, search_normalized "
            "FROM verses ORDER BY surah, ayah"
        )
        candidates = []
        for row in rows:
            score = fuzz.partial_ratio(normalized_query, row["search_normalized"])
            if score >= APPROXIMATE_THRESHOLD and len(row["search_normalized"].split()) >= APPROXIMATE_MINIMUM_CANDIDATE_WORDS:
                candidates.append((score, row["surah"], row["ayah"], dict(row)))

    candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [candidate[3] for candidate in candidates[:APPROXIMATE_LIMIT]]


def normalize_hadith_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = "".join(character for character in value if not unicodedata.category(character).startswith("M") and character != "\u0640")
    value = value.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا"}))
    return " ".join(value.split())


def simple_text_presentation(records: list[dict], query: str) -> dict:
    # Ranking is textual relevance, never a ranking of religious judgments.
    def tokens(text):
        return re.findall(r"[^\W_]+", normalize_hadith_text(text), re.UNICODE)

    wanted = tokens(query)
    phrase = " ".join(wanted)
    required = Counter(wanted)
    grouped = {}
    for record in records:
        text = record.get("text", "")
        words = tokens(text)
        joined = " ".join(words)
        if wanted and joined == phrase:
            tier = 0
        elif wanted and (" " + phrase + " ") in (" " + joined + " "):
            tier = 1
        elif wanted and not (required - Counter(words)):
            tier = 2
        else:
            # Do not turn Dorar's retrieved results into a false empty search.
            tier = 3
        group = grouped.setdefault(text, {
            "text": text, "records": [], "categoryLabels": [],
            "matchType": ("exact", "phrase", "words", "source_candidate")[tier],
            "rank": (tier, len(words) if tier < 3 else 0),
        })
        group["records"].append(record)
        for label in record.get("categoryLabels", []):
            if label not in group["categoryLabels"]:
                group["categoryLabels"].append(label)
    groups = sorted(grouped.values(), key=lambda group: group["rank"])
    for group in groups:
        group.pop("rank")
    matched = any(group["matchType"] != "source_candidate" for group in groups)
    return {"selected": groups[0] if groups else None,
            "alternates": groups[1:], "matched": matched}


@app.post("/api/quran/search")
def quran_search(payload: SearchRequest) -> JSONResponse:
    try:
        rows = search(payload.text)
        match_type = "normalized_phrase"
        message = None
        if not rows:
            rows = approximate_search(payload.text)
            if rows:
                match_type = "approximate"
                message = APPROXIMATE_MESSAGE
    except Exception:
        logger.exception("Quran search failed")
        return JSONResponse(status_code=503, content={"message": "تعذّر البحث حاليًا. حاول مرة أخرى."})

    results = [
        {
            "verse_key": row["verse_key"],
            "surah": row["surah"],
            "ayah": row["ayah"],
            "surah_name": row["surah_name"],
            "text_uthmani": row["text_uthmani"],
        }
        for row in rows
    ]
    response = {
        "query": payload.text,
        "found": bool(results),
        "matchType": match_type,
        "source": {"name": "Tanzil Project", "url": "https://tanzil.net"},
        "total": len(results),
        "results": results,
    }
    if message:
        response["message"] = message
    elif not results:
        response["message"] = "لم نجد آية تطابق عبارة البحث. جرّب جزءًا أقصر من النص."
    return JSONResponse(content=response)


@app.post("/api/hadith/search")
def hadith_search(payload: HadithSearchRequest) -> JSONResponse:
    stage = "fetch"
    try:
        if payload.mode == "simple":
            aggregate = simple_hadith_search(payload.text)
            results = aggregate["results"]
            source_url = aggregate["sourceUrl"]
            specialist_available = None
            presentation = simple_text_presentation(results, payload.text)
        else:
            page = fetch_page(payload.text)
            source_url = page.source_url
            stage = "section_isolation"
            results = parse_section(page.html, payload.mode)
            stage = "parsing"
            specialist_available = inspect_specialist(page.html)
    except DorarTimeout:
        return JSONResponse(
            status_code=504,
            content={"code": "dorar_timeout", "message": "تعذّر الاتصال بالدرر السنية حاليًا. حاول مرة أخرى."},
        )
    except DorarBlocked:
        return JSONResponse(
            status_code=503,
            content={"code": "dorar_unavailable", "message": "تعذّر الاتصال بالدرر السنية حاليًا. حاول مرة أخرى."},
        )
    except DorarCurlError:
        logger.exception("Dorar stage=%s curl_transport_error", stage)
        return JSONResponse(
            status_code=503,
            content={"code": "dorar_transport_unavailable", "message": "تعذّر تشغيل وسيلة الاتصال بالدرر السنية حاليًا."},
        )
    except DorarSourceError:
        logger.exception("Dorar stage=%s source_format_error", stage)
        return JSONResponse(
            status_code=502,
            content={"code": "dorar_parse_error", "message": "تعذّر قراءة نتائج المصدر حاليًا. يمكنك فتح البحث في الدرر السنية."},
        )
    except Exception:
        logger.exception("Dorar stage=%s unexpected_internal_error", stage)
        return JSONResponse(
            status_code=500,
            content={"code": "dorar_internal_error", "message": "حدث خطأ داخلي أثناء معالجة نتائج الحديث."},
        )

    response = {
        "query": payload.text,
        "found": bool(results),
        "mode": payload.mode,
        "source": "dorar",
        "sourceUrl": source_url,
        "resultsCount": len(results),
        "specialistAvailable": specialist_available,
        "results": results,
    }
    if payload.mode == "simple":
        selected_records = (presentation["selected"] or {}).get("records", [])
        selected_categories = {category for record in selected_records for category in record.get("degreeCategories", [])}
        selected_mixed = bool({1, 2} & selected_categories) and bool({3, 4} & selected_categories)
        response.update({
            "categoriesWithResults": aggregate["categoriesWithResults"],
            "mixedCategories": aggregate["mixedCategories"],
            "selectedMixedCategories": selected_mixed,
            "complete": aggregate["complete"],
            "canSearchSpecialist": True,
            "categoryStatuses": aggregate["statuses"],
            "simplePresentation": presentation,
        })
        if not aggregate["complete"]:
            response["message"] = "تعذّر تحميل بعض النتائج من الدرر السنية. النتائج المعروضة غير مكتملة."
            if not presentation["matched"] and results:
                response["message"] += " لم نجد نصًا مطابقًا لعبارتك في النتائج المسترجعة. جرّب عبارة أقصر أو ابحث في الوضع المتخصص."
            if aggregate["mixedCategories"]:
                response["message"] += " ظهرت أيضًا نتائج بتصنيفات مختلفة؛ قد تختلف ألفاظ الحديث أو طرقه. يمكنك الاطلاع على التفاصيل في الوضع المتخصص."
        elif not presentation["matched"] and results:
            response["message"] = "لم نجد نصًا مطابقًا لعبارتك في النتائج المسترجعة."
            response["hint"] = "جرّب عبارة أقصر أو ابحث في الوضع المتخصص."
        elif aggregate["mixedCategories"]:
            response["message"] = "ظهرت نتائج بتصنيفات مختلفة؛ قد تختلف ألفاظ الحديث أو طرقه. يمكنك الاطلاع على التفاصيل في الوضع المتخصص."
        elif results:
            response["message"] = "النتائج المعروضة من الصفحة الأولى في المصدر."
        else:
            response["message"] = "لم نجد نتيجة في العرض الميسّر لغير المتخصصين."
            response["hint"] = "قد يكون الحديث موجودًا في الموسوعة الحديثية المتخصصة."
        return JSONResponse(content=response)
    if results:
        response["message"] = "النتائج المعروضة من الصفحة الأولى في المصدر."
    elif payload.mode == "simple":
        response["message"] = "لم نجد نتيجة في العرض الميسّر لغير المتخصصين."
        response["hint"] = "قد يكون الحديث موجودًا في الموسوعة الحديثية المتخصصة."
    else:
        response["message"] = "لم نجد نتائج لهذا البحث في العرض المتخصص. جرّب كلمات أخرى من الحديث."
    return JSONResponse(content=response)


def _record_key(record: dict) -> tuple:
    if record.get("id") and not str(record["id"]).startswith("local-"):
        return ("id", record["id"])
    return ("signature", *(record.get(field) for field in ("text", "narrator", "scholar", "book", "reference", "grade", "gradeExplanation")))


def simple_hadith_search(query: str) -> dict:
    merged = {}
    statuses = []
    successful = 0
    errors = []
    source_url = None
    results_by_degree = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        future_to_degree = {executor.submit(fetch_page, query, degree=degree): degree for degree in DEGREE_FILTERS}
        for future in future_to_degree:
            degree = future_to_degree[future]
            try:
                page = future.result()
                results_by_degree[degree] = (page, None)
            except (DorarTimeout, DorarBlocked, DorarCurlError, DorarSourceError) as error:
                results_by_degree[degree] = (None, error)

    for degree, metadata in DEGREE_FILTERS.items():
        page, error = results_by_degree.get(degree, (None, None))
        if error is not None:
            logger.exception("Dorar simple degree=%d failed", degree)
            statuses.append({"degree": degree, "status": "error", "count": None, "label": metadata["label"]})
            errors.append(error)
        elif page is not None:
            try:
                source_url = source_url or page.source_url
                records = parse_section(page.html, "simple")
                successful += 1
                statuses.append({"degree": degree, "status": "ok", "count": len(records), "label": metadata["label"]})
                for record in records:
                    key = _record_key(record)
                    if key not in merged:
                        merged[key] = deepcopy(record)
                        merged[key]["degreeCategories"] = []
                        merged[key]["categoryLabels"] = []
                    if degree not in merged[key]["degreeCategories"]:
                        merged[key]["degreeCategories"].append(degree)
                        merged[key]["categoryLabels"].append(metadata["label"])
            except (DorarTimeout, DorarBlocked, DorarCurlError, DorarSourceError) as error:
                logger.exception("Dorar simple degree=%d parse failed", degree)
                statuses.append({"degree": degree, "status": "error", "count": None, "label": metadata["label"]})
                errors.append(error)
    if successful == 0:
        raise errors[0]
    categories = sorted({degree for record in merged.values() for degree in record["degreeCategories"]})
    has_accepted = any(category in {1, 2} for category in categories)
    has_weak = any(category in {3, 4} for category in categories)
    mixed_categories = has_accepted and has_weak
    return {
        "results": list(merged.values()),
        "sourceUrl": source_url,
        "categoriesWithResults": categories,
        "mixedCategories": mixed_categories,
        "complete": not errors,
        "statuses": statuses,
    }