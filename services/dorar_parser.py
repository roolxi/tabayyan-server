from urllib.parse import urljoin, urlparse
import hashlib
import re
import unicodedata

from bs4 import BeautifulSoup, Tag

from .dorar_client import DorarSourceError, DORAR_HOSTS


SECTION_IDS = {"simple": "home", "specialist": "specialist"}
CARD_SELECTORS = "div.border-bottom.py-4, [data-hadith-id], [data-record-id], article.result-card, .hadith-card"
EMPTY_SELECTORS = ".empty-state, [data-empty='true'], .no-results"
LABELS = {
    "grade": "خلاصة حكم المحدث",
    "gradeExplanation": "توضيح حكم المحدث",
    "narrator": "الراوي",
    "scholar": "المحدث",
    "book": "المصدر",
    "reference": "الصفحة أو الرقم",
    "takhrij": "التخريج",
}
FIELD_PATTERNS = {
    "خلاصة حكم المحدث": r"خلاصة حكم المحدث\s*:\s*(.*)",
    "توضيح حكم المحدث": r"توضيح حكم المحدث\s*:\s*(.*)",
    "الراوي": r"(?:^|\|)\s*الراوي\s*:\s*(.*)",
    "المحدث": r"\|\s*المحدث\s*:\s*(.*)",
    "المصدر": r"\|\s*المصدر\s*:\s*(.*)",
    "الصفحة أو الرقم": r"الصفحة أو الرقم\s*:\s*(.*)",
    "التخريج": r"التخريج\s*:\s*(.*)",
}


class DorarParseError(DorarSourceError):
    pass


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def _field(card: Tag, label: str) -> str | None:
    pattern = FIELD_PATTERNS[label]
    for node in card.find_all("strong"):
        match = re.search(pattern, node.get_text(" ", strip=True))
        if match:
            return _clean(match.group(1))
    label_node = next((node for node in card.find_all(string=True) if label in node.strip()), None)
    if label_node is None:
        return None
    parent = label_node.parent
    if parent.name in {"dt", "th", "label"}:
        sibling = parent.find_next_sibling()
        if sibling:
            return _clean(sibling.get_text(" ", strip=True))
    text = parent.get_text(" ", strip=True)
    value = text.replace(label, "", 1).strip(" :：")
    return _clean(value)


def _source_url(card: Tag) -> str | None:
    links = card.find_all("a", href=True)
    links.sort(key=lambda link: (0 if link.get("title") == "عرض الحديث" else 1, 0 if "shareLink" in link.get("class", []) else 1))
    for link in links:
        candidate = urljoin("https://dorar.net", link["href"])
        parsed = urlparse(candidate)
        if parsed.scheme == "https" and parsed.hostname in DORAR_HOSTS and parsed.path.startswith("/h/"):
            return candidate
    return None


def _record(card: Tag, index: int) -> dict:
    text_node = card.select_one("h5.h5-responsive, [data-hadith-text], .hadith-text, .text")
    text = _clean(text_node.get_text(" ", strip=True) if text_node else None)
    if text:
        text = re.sub(r"^\s*\d+\s*-\s*", "", text)
    if not text:
        raise DorarParseError("hadith record has no supported text element")
    source_url = _source_url(card)
    record_id = card.get("data-hadith-id") or card.get("data-record-id") or card.get("id")
    if not record_id and source_url:
        record_id = urlparse(source_url).path.rsplit("/", 1)[-1]
    if not record_id:
        record_id = "local-" + hashlib.sha256(f"{index}:{text}".encode()).hexdigest()[:16]
    return {
        "id": record_id,
        "text": text,
        "grade": _field(card, LABELS["grade"]),
        "gradeExplanation": _field(card, LABELS["gradeExplanation"]),
        "narrator": _field(card, LABELS["narrator"]),
        "scholar": _field(card, LABELS["scholar"]),
        "book": _field(card, LABELS["book"]),
        "reference": _field(card, LABELS["reference"]),
        "takhrij": _field(card, LABELS["takhrij"]),
        "sourceUrl": source_url,
    }


def parse_section(html: str, mode: str) -> list[dict]:
    section_id = SECTION_IDS[mode]
    if mode == "simple":
        home_start = html.find('id="home"')
        specialist_start = html.find('id="specialist"')
        if home_start < 0 or specialist_start < 0 or specialist_start <= home_start:
            raise DorarParseError("Expected Dorar section boundaries were not found")
        home_html = html[home_start:specialist_start]
        soup = BeautifulSoup("<div " + home_html, "html.parser")
        section = soup.select_one("#home")
    else:
        soup = BeautifulSoup(html, "html.parser")
        section = soup.select_one("#specialist")
    if section is None:
        raise DorarParseError(f"missing Dorar section: {section_id}")
    cards = section.select(CARD_SELECTORS)
    if not cards:
        empty_node = section.select_one(EMPTY_SELECTORS)
        layout_empty = section.select_one(".card.w-100")
        empty_text = _clean(empty_node.get_text(" ", strip=True) if empty_node else None)
        layout_text = _clean(layout_empty.get_text(" ", strip=True) if layout_empty else None)
        if empty_text or layout_text == "لا توجد نتائج":
            return []
        raise DorarParseError(f"unrecognized Dorar section: {section_id}")
    try:
        return [_record(card, index) for index, card in enumerate(cards)]
    except DorarSourceError:
        raise
    except Exception as error:
        raise DorarParseError(f"failed to parse {section_id} records") from error


def inspect_specialist(html: str) -> bool | None:
    soup = BeautifulSoup(html, "html.parser")
    section = soup.select_one("#specialist")
    if section is None:
        return None
    cards = section.select(CARD_SELECTORS)
    if cards:
        return True
    if section.select_one(EMPTY_SELECTORS):
        return False
    return None


TASHKEEL_REGEX = re.compile(r"[\u064B-\u065F\u0670]")
PUNCTUATION_REGEX = re.compile(r"[.,،؛:!؟?()\[\]{}\"\'«»\-–—]")


def parse_dorar_json_result(html: str) -> list[str]:
    """Parse actual Hadith records returned in data['ahadith']['result'].
    Extracts only plain Hadith text, removing leading numbers, HTML tags,
    search-keys spans, trailing separators, and 'المزيد' links.
    """
    if not html or not isinstance(html, str):
        return []
    soup = BeautifulSoup(html, "html.parser")
    hadith_divs = soup.select("div.hadith, .hadith")
    candidates = []
    for div in hadith_divs:
        # Strip any links such as 'المزيد'
        for a in div.find_all("a"):
            a.decompose()
        # Extract text preserving words
        text = div.get_text(" ", strip=True)
        # Remove result numbering at beginning (e.g. '1 - ', '12 - ', '1. ')
        text = re.sub(r"^\s*\d+\s*[-–—.:]\s*", "", text)
        # Remove trailing 'المزيد' or separators
        text = re.sub(r"[\s\.\-–—]*المزيد\s*$", "", text)
        # Normalize whitespace
        text = re.sub(r"\s+", " ", text).strip()
        if text and len(text) >= 3:
            candidates.append(text)
    return candidates


def normalize_arabic_for_dedup(text: str) -> str:
    """Internal normalized form for deduplication comparison only.
    Never display this text to users.
    """
    norm = unicodedata.normalize("NFKC", text)
    norm = TASHKEEL_REGEX.sub("", norm)
    norm = norm.replace("\u0640", "")
    norm = re.sub(r"[إأآٱ]", "ا", norm)
    norm = PUNCTUATION_REGEX.sub(" ", norm)
    norm = re.sub(r"\s+", " ", norm).strip().lower()
    return norm


def deduplicate_hadith_candidates(raw_candidates: list[str], max_count: int = 30) -> list[dict[str, str]]:
    """Deduplicate candidate texts across queries using normalized comparison.
    Assigns opaque server-generated IDs (e.g. c_7f04c92b).
    Returns list of dicts: [{'id': cid, 'text': original_dorar_text}].
    """
    seen_normalized = set()
    result = []
    for text in raw_candidates:
        cleaned = re.sub(r"\s+", " ", text).strip()
        if not cleaned:
            continue
        norm = normalize_arabic_for_dedup(cleaned)
        if not norm or norm in seen_normalized:
            continue
        seen_normalized.add(norm)
        cid = f"c_{hashlib.sha256(norm.encode('utf-8')).hexdigest()[:8]}"
        result.append({"id": cid, "text": cleaned})
        if len(result) >= max_count:
            break
    return result
