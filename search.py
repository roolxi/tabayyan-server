"""Search only; returns source text, never generates Quran text."""
import json, sqlite3, sys
from build import ROOT, normalize

def search(query):
    q=normalize(query)
    if not q:
        return []
    with sqlite3.connect(f'file:{ROOT / "quran.sqlite"}?mode=ro',uri=True) as db:
        db.row_factory=sqlite3.Row
        rows=db.execute('SELECT * FROM verses ORDER BY surah,ayah')
        return [dict(r,match_type='normalized_phrase') for r in rows
                if (' '+q+' ') in (' '+r['search_normalized']+' ')]

if __name__=='__main__':
    print(json.dumps(search(' '.join(sys.argv[1:])),ensure_ascii=False,indent=2))
