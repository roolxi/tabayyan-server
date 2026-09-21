from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.openrouter_client import get_api_key, get_model, suggest_search_phrases


def main():
    key = get_api_key()
    if not key:
        print("ERROR: No OPENROUTER_API_KEY found in environment or .env")
        sys.exit(1)

    model = get_model()
    print(f"Executing single live OpenRouter smoke test with model: {model}")
    test_query = "الاعمال بالنية"
    try:
        candidates = suggest_search_phrases(text=test_query, corpus_type="hadith")
        print(f"SUCCESS: Candidates returned: {candidates}")
    except Exception as err:
        print(f"FAILED: {type(err).__name__}: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()

