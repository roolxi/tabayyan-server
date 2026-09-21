"""Build a lossless SQLite/JSON corpus from the supplied Tanzil XML files."""
from pathlib import Path
import hashlib, json, re, sqlite3, unicodedata, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent

def normalize(text):
    # Search only. Never apply this function to display/source fields.
    text = unicodedata.normalize('NFC', text)
    text = ''.join(c for c in text if not unicodedata.category(c).startswith('M') and c != '\u0640')
    text = text.translate(str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا'}))
    return ' '.join(text.split())

def read(name):
    data = (ROOT/'source'/name).read_bytes()
    root = ET.fromstring(data)
    assert root.tag == 'quran'
    assert [int(s.attrib['index']) for s in root] == list(range(1,115))
    rows = {}
    for s in root:
        assert s.tag == 'sura'
        assert [int(a.attrib['index']) for a in s] == list(range(1,len(s)+1))
        for a in s:
            assert a.tag == 'aya' and a.attrib['text'].strip()
            key = f"{s.attrib['index']}:{a.attrib['index']}"
            assert key not in rows
            rows[key] = (dict(s.attrib), dict(a.attrib))
    assert len(rows) == 6236
    notice = re.search(r'<!--(.*?)-->', data.decode('utf-8'), re.S).group(1)
    return rows, hashlib.sha256(data).hexdigest(), notice

def main():
    simple, sh, sn = read('quran-simple-clean.xml')
    uthmani, uh, un = read('quran-uthmani.xml')
    assert simple.keys() == uthmani.keys()
    records = []
    for key, (s, a) in simple.items():
        us, ua = uthmani[key]
        assert s == us
        assert set(a) == set(ua)
        records.append(dict(verse_key=key, surah=int(s['index']), ayah=int(a['index']),
            surah_name=s['name'], text_simple=a['text'], text_uthmani=ua['text'],
            bismillah_simple=a.get('bismillah'), bismillah_uthmani=ua.get('bismillah'),
            search_normalized=normalize(a['text'])))
    meta = dict(source='Tanzil Project', source_url='https://tanzil.net',
        version='1.1', copyright_notices=[sn,un],
        input_sha256={'quran-simple-clean.xml':sh,'quran-uthmani.xml':uh})
    payload = dict(metadata=meta, verses=records)
    (ROOT/'quran.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    dbpath=ROOT/'quran.sqlite'
    if dbpath.exists(): dbpath.unlink()
    db=sqlite3.connect(dbpath)
    db.execute('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    db.executemany('INSERT INTO metadata VALUES (?,?)', [(k,json.dumps(v,ensure_ascii=False)) for k,v in meta.items()])
    db.execute('CREATE TABLE verses (verse_key TEXT PRIMARY KEY, surah INTEGER, ayah INTEGER, surah_name TEXT, text_simple TEXT, text_uthmani TEXT, bismillah_simple TEXT, bismillah_uthmani TEXT, search_normalized TEXT, UNIQUE(surah,ayah))')
    db.executemany('INSERT INTO verses VALUES (?,?,?,?,?,?,?,?,?)', [tuple(r.values()) for r in records])
    db.commit()
    db.row_factory=sqlite3.Row
    saved=[dict(r) for r in db.execute('SELECT * FROM verses ORDER BY surah,ayah')]
    assert saved == records == json.loads((ROOT/'quran.json').read_text())['verses']
    for r in saved:
        k=r['verse_key']
        assert r['text_simple'] == simple[k][1]['text']
        assert r['text_uthmani'] == uthmani[k][1]['text']
        assert r['bismillah_simple'] == simple[k][1].get('bismillah')
        assert r['bismillah_uthmani'] == uthmani[k][1].get('bismillah')
    checks=[]
    for query, expected in [('ان مع العسر يسرا',{'94:6'}),('إِنَّ مَعَ الْعُسْرِ يُسْرًا',{'94:6'}),('الحمد لله رب العالمين',{'1:2'}),('عبارة اختبار غير موجودة ززز',set())]:
        q=normalize(query)
        found={r['verse_key'] for r in saved if (' '+q+' ') in (' '+r['search_normalized']+' ')}
        assert expected <= found if expected else not found
        checks.append(dict(query=query, verse_keys=sorted(found)))
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    db.close()
    report=dict(surahs=114,verses=6236,exact_source_text_comparisons=12472,
        bismillah_attributes_preserved=True,json_sqlite_roundtrip='passed',
        sqlite_integrity='ok',search_checks=checks,input_sha256=meta['input_sha256'],
        scope='Structural and lossless-import verification against supplied files; not independent certification against an external edition.')
    (ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'TANZIL-NOTICES.txt').write_text(sn+'\n'+un,encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__ == '__main__': main()
