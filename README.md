# Quran & Hadith Search Engine (محرّك البحث والتحقق للقرآن الكريم والحديث الشريف)

An authoritative Arabic Quran and prophetic Hadith verification and search engine built with FastAPI and modern responsive web technologies. It combines local, byte-verified Quran text from the Tanzil Project with real-time Hadith retrieval from Dorar, optional AI-assisted search phrasing via OpenRouter, and multimodal media extraction (images and videos).

> **Core Religious and Data Principle**: The AI model is strictly an internal extraction/assistance tool and is **never** an authority. It never grades Hadith, never determines authenticity, never invents missing wording, and never generates canonical Quran or Hadith display text. All confirmed text displayed to users comes directly from `quran.sqlite` or Dorar (`dorar.net`).

---

## Features

### 1. Quran Search (البحث في القرآن الكريم)
- **Authoritative Corpus**: Tanzil Project version 1.1 with 6,236 verses across 114 surahs.
- **Whole-Word Normalized Phrase Search**: Queries are matched against normalized Arabic text (`search_normalized`), folding alef variants, removing diacritics/tashkeel and tatweel.
- **Approximate Search Fallback**: If exact normalized search yields no results, fuzzy matching (`rapidfuzz`) suggests closest verses above threshold.
- **Uthmani Display**: Displayed text always uses `text_uthmani` from `quran.sqlite`, retaining original pause marks, surah names, and ayah numbers.

### 2. Hadith Search via Dorar (البحث الحديثي عبر الدرر السنية)
- **Live Source Retrieval**: Sends search requests server-side to Dorar using local `curl` transport with strict headers.
- **Simple Mode (`simple`)**: Searches non-specialist records across four degree filters (hadith accepted, isnad accepted, hadith weak, isnad weak), deduplicates records, and highlights the best textual match.
- **Search-Level Mixed-Category Warning**: Detects if results include both accepted and weak classifications across retrieved records and displays a prominent notice advising users to inspect details in specialist mode.
- **Specialist Mode (`specialist`)**: Directly inspects the detailed scholarly takhrij and chains from Dorar's `#specialist` section.
- **Direct Source Links**: Every Hadith card links to its authoritative entry on Dorar.

### 3. Meaning Search & AI Assistance (البحث بالمعنى والاقتراحات)
- **Search Query Suggestions (`/api/search/suggest`)**: Assists users with incomplete, paraphrased, or misspelled Arabic input by suggesting up to 3 candidate search phrases for Quran or Hadith.
- **Interactive Hadith Meaning Search (`/api/hadith/meaning-search`)**: Multi-step flow: generates queries $\rightarrow$ queries Dorar $\rightarrow$ deduplicates $\rightarrow$ selects candidate IDs strictly from retrieved Dorar text.
- **Strict Guardrails**: Model output is constrained via JSON Schema and validated on the server. Zero scholar grading, zero inventiveness, zero claims of authenticity.

### 4. Media Search (البحث عبر الصور والفيديو)
- **Multimodal Upload (`/api/media/extract`)**: Upload an image or short video from the homepage to identify verses or hadiths.
- **Format & Size Limits**:
  - Images: JPEG, PNG, WebP (up to 8 MiB). Validated with Pillow.
  - Videos: MP4, WebM, MOV (up to 40 MiB, duration $\le$ 180 seconds, must contain audio). Validated with `ffprobe`.
- **Audio Extraction**: FFmpeg extracts 16 kHz mono 16-bit PCM WAV audio from videos before sending to Gemini (`google/gemini-3.5-flash-lite`).
- **Grounding**: Candidates are strictly grounded on the server against `quran.sqlite` (Quran) or Dorar (Hadith). If verified, displayed with the static heading `هل تقصد هذا النص؟` and direct continuation links to `/quran?q=...` or `/hadith?q=...`.

---

## External Prerequisites

- **Python**: Version 3.10 or higher.
- **FFmpeg & ffprobe**: Required for video duration checking and audio extraction. Must be installed and accessible in system `PATH`.
  - Windows (via WinGet): `winget install Gyan.FFmpeg`
  - Linux: `sudo apt install ffmpeg`
  - macOS: `brew install ffmpeg`
- **Node.js**: Version 18+ (required only for running frontend unit tests).

---

## Installation

In Windows PowerShell:

```powershell
# Create virtual environment
python -m venv .venv

# Activate virtual environment
.venv\Scripts\Activate.ps1

# Install Python dependencies
pip install -r requirements.txt
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

| Variable | Required | Description | Default |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Optional | OpenRouter API key for semantic and media search | `None` (AI features gracefully disabled) |
| `OPENROUTER_MODEL` | Optional | OpenRouter model ID | `google/gemini-3.5-flash-lite` |
| `TRUSTED_PROXIES` | Optional | Comma-separated list of trusted proxy IPs for rate limiting | `""` |

> Note: Normal Quran search and normal Hadith search work 100% locally and independently without an OpenRouter API key. `.env` is strictly ignored by Git and must never be committed.

---

## Starting the Server

From the project root directory in Windows PowerShell:

```powershell
.venv\Scripts\python.exe -m uvicorn server:app --reload --port 8000
```

Open in your browser: `http://127.0.0.1:8000/`

---

## API Routes Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web UI Homepage with media upload section |
| `GET` | `/quran` | Web UI Quran search page |
| `GET` | `/hadith` | Web UI Hadith search page |
| `GET` | `/api/health` | Service health check (verifies SQLite database connectivity) |
| `POST` | `/api/quran/search` | Search Quran (`{"text": "..."}`) |
| `POST` | `/api/hadith/search` | Search Hadith (`{"text": "...", "mode": "simple" \| "specialist"}`) |
| `POST` | `/api/search/suggest` | Semantic query suggestions (`{"text": "...", "type": "quran" \| "hadith"}`) |
| `POST` | `/api/hadith/meaning-search` | Interactive Hadith search by meaning with clarification support |
| `POST` | `/api/media/extract` | Multipart file upload (`file`) for image/video extraction and grounding |

---

## Testing

### Python Backend Tests (Pytest)
```powershell
# Run all backend tests
python -m pytest

# Run with verbose output
python -m pytest -v
```

### Node.js Frontend Tests
```powershell
# Test homepage media upload interactions and rendering
node tests/test_frontend_media.mjs

# Test semantic search suggestions interaction
node tests/test_frontend_suggest.mjs

# Test simple-mode mixed category disclaimer rendering
node tests/test_frontend_mixed_disclaimer.mjs
```

---

## Data and Corpus Integrity

- `quran.sqlite` and `quran.json` are byte-verified derivatives of the original Tanzil XML files stored in `source/`.
- `verification.json` maintains structural checksums and expected query results.
- **Do not run `build.py`** during standard usage. Automated tests strictly enforce hash matches for the database and exported files.
- The SQLite database is opened in read-only mode (`mode=ro`) by the application.

---

## Repository Structure

```text
quran-data/
├── app/                  # Reserved for future Expo client (do not use for backend)
├── scripts/              # Smoke tests and utility scripts
├── services/             # Backend integrations
│   ├── dorar_client.py   # Dorar network transport and error handling
│   ├── dorar_parser.py   # HTML/JSON parsing for Hadith cards and degrees
│   ├── media_processor.py# Image/video validation, chunking, FFmpeg extraction
│   └── openrouter_client.py# OpenRouter multimodal client, caching, rate limiting
├── source/               # Authoritative Tanzil XML source files (read-only)
├── tests/                # Comprehensive test suites (pytest + node DOM harnesses)
├── web/                  # Browser frontend assets
│   ├── app.js            # Homepage media upload logic
│   ├── hadith.html / .js # Hadith search page and renderer
│   ├── index.html        # Homepage markup
│   ├── quran.html / .js  # Quran search page and renderer
│   └── styles.css        # Shared responsive stylesheet
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore rules for Python, Node, and Expo
├── build.py              # Reproducible Quran corpus build & verification tool
├── quran.json            # Tanzil Quran JSON export (protected)
├── quran.sqlite          # Tanzil Quran SQLite database (protected)
├── README.md             # Project documentation
├── requirements.txt      # Python dependencies
├── search.py             # Read-only local Quran search module
├── server.py             # FastAPI application and route orchestration
├── TANZIL-NOTICES.txt    # Tanzil Project license and notices
└── verification.json     # Corpus structural hashes and test cases
```

---

## Future Expo Client Note

The root directory `/app` is reserved for an independent mobile client built with Expo / React Native.
- Do not create a Python backend module named `app`.
- Keep all backend endpoints routed under `/api/*` so both the current web UI and the future Expo app consume the exact same API.
- The future Expo app will configure its backend connection via:
  ```text
  EXPO_PUBLIC_API_BASE_URL=http://<development-machine-lan-ip>:8000
  ```
