import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { searchQuran, suggestQuranPhrases } from '../../api/quran';
import { searchHadith, searchHadithByMeaning } from '../../api/hadith';
import { extractSupportedUrlFromText, pollUrlJob, submitUrlJob } from '../../api/urlMedia';
import { normalizeMediaAsset, uploadMedia, UploadDescriptor } from '../../api/media';
import { MediaExtractResponse, HadithRecord } from '../../api/types';
import { SourceEntry } from '../../components/studio/SourceCard';
export type Target = 'quran' | 'hadith';
export type Mode = 'normal' | 'meaning' | 'specialist';
export function useVerification() {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Target>('hadith');
  const [mode, setMode] = useState<Mode>('normal');
  const [entries, setEntries] = useState<SourceEntry[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [candidate, setCandidate] = useState(false);
  const [specialistAvailable, setSpecialistAvailable] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const last = useRef<null | (() => void)>(null);
  const picking = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const cancel = () => { controller.current?.abort(); controller.current = null; setBusy(false); setMessage('تم إلغاء المتابعة.'); };
  const reset = () => { cancel(); last.current = null; setError(''); setMessage(''); setEntries([]); setSuggestions([]); setSearched(false); setCandidate(false); setSpecialistAvailable(false); };
  const run = async (label: string, work: (signal: AbortSignal, current: () => boolean) => Promise<void>) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const current = () => alive.current && controller.current === request && !request.signal.aborted;
    Keyboard.dismiss(); setBusy(true); setError(''); setEntries([]); setSuggestions([]); setMessage(label); setSearched(true); setCandidate(false); setSpecialistAvailable(false);
    try { await work(request.signal, current); }
    catch (e) { if (current()) { const msg = (e as { message?: string })?.message; setError(msg || 'تعذّر إكمال الطلب. حاول مرة أخرى.'); setMessage(''); } }
    finally { if (current()) setBusy(false); }
  };
  const applyMedia = (res: MediaExtractResponse) => {
    if (res.status === 'temporarily_unavailable') throw new Error(res.message || 'خدمة الاستخراج غير متاحة مؤقتًا.');
    const list = (res.results || []).filter(i => i.verified === true && Boolean(i.displayText)).map((item, i): SourceEntry => item.type === 'quran' ? {
      id: `m${i}`, kind: 'quran', text: item.displayText, source: `${item.source?.name || 'قاعدة القرآن'} · ${item.source?.surahName || ''} ${item.source?.ayah || ''}`, verse: item.source?.verseKey,
      sourceUrl: item.source?.verseKey ? `https://quran.com/${item.source.verseKey.replace(':', '/')}` : undefined, candidate: true, searchText: item.displayText,
    } : { id: `m${i}`, kind: 'hadith', text: item.displayText, source: item.source?.name || 'الدرر السنية', sourceUrl: item.source?.url, record: item.records?.[0], mixed: item.mixedCategories, candidate: true, searchText: item.displayText });
    setEntries(list); setCandidate(list.length > 0); setMessage(res.message || (list.length ? '' : 'لم نجد نصًا مطابقًا. جرّب وسيطًا أو عبارة أخرى.'));
    if (res.partialProcessing) setMessage('عولج جزء من المقطع فقط. النتائج تخص الجزء الذي تمت معالجته.');
  };
  const verifyUrl = (text: string) => {
    const url = extractSupportedUrlFromText(text);
    if (!url) { reset(); setError('ألصق رابط مقطع من إنستغرام أو تيك توك أو يوتيوب.'); return; }
    last.current = () => verifyUrl(url);
    void run('نقرأ رابط المقطع…', async (signal, current) => {
      const job = await submitUrlJob(url, signal);
      const res = await pollUrlJob(job.jobId, { signal, onProgress: state => { if (current()) setMessage(state.message || 'نبحث في المصادر…'); } });
      if (current()) { if (!res.result) throw Error('اكتمل الطلب دون نتيجة قابلة للعرض.'); applyMedia(res.result); }
    });
  };
  const search = (text = query, nextMode = mode, nextTarget = target) => {
    if (!text.trim()) return;
    if (extractSupportedUrlFromText(text)) { verifyUrl(text); return; }
    last.current = () => search(text, nextMode, nextTarget);
    setQuery(text); setTarget(nextTarget); setMode(nextMode);
    void run(nextMode === 'meaning' ? 'نبحث عن العبارة الأقرب للمعنى…' : 'نطابق الكلمات مع المصدر…', async (signal, current) => {
      if (nextMode === 'meaning') {
        if (nextTarget === 'quran') { const res = await suggestQuranPhrases(text, signal); if (current()) { setSuggestions(res.candidates || []); setMessage(res.message || 'اختر عبارة للبحث عنها في المصدر.'); } }
        else { const res = await searchHadithByMeaning(text, [], signal); if (current()) { setSuggestions(res.candidates?.map(x => x.text) || []); setMessage(res.message || 'اختر عبارة للبحث عنها في المصدر.'); } }
      } else if (nextTarget === 'quran') {
        const res = await searchQuran(text, signal);
        if (current()) { setEntries((res.results || []).map((v, i) => ({ id: `q${i}`, kind: 'quran', text: v.text_uthmani, source: `${res.source?.name || 'قاعدة القرآن'} · ${v.surah_name}، الآية ${v.ayah}`, verse: v.verse_key, sourceUrl: res.source?.url || `https://quran.com/${v.surah}/${v.ayah}` }))); setMessage(res.message || ''); }
      } else {
        const res = await searchHadith(text, nextMode === 'specialist' ? 'specialist' : 'simple', signal);
        if (current()) {
          const selected = res.simplePresentation?.selected;
          const records: HadithRecord[] = nextMode === 'normal' && selected ? selected.records : res.results || [];
          setEntries(records.map((r, i) => ({ id: `h${i}`, kind: 'hadith', text: r.text || selected?.text || '', source: 'الدرر السنية', sourceUrl: r.sourceUrl || res.sourceUrl, record: r, mixed: selected ? res.selectedMixedCategories : res.mixedCategories })));
          setSpecialistAvailable(Boolean(res.specialistAvailable || res.canSearchSpecialist || res.simplePresentation?.alternates?.length));
          setMessage([res.message, res.hint, res.complete === false ? 'بعض المصادر لم تستجب؛ النتائج المتاحة قد لا تكون مكتملة.' : ''].filter(Boolean).join('\n'));
        }
      }
    });
  };
  const verifyFile = (file: UploadDescriptor) => { last.current = () => verifyFile(file); void run(file.type.startsWith('video/') ? 'نستخرج عبارة البحث من المقطع…' : 'نقرأ النص داخل الصورة…', async (signal, current) => { const res = await uploadMedia(file, signal); if (current()) applyMedia(res); }); };
  const pick = async (camera = false) => {
    if (picking.current || busy) return;
    picking.current = true;
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw Error('اسمح للتطبيق باستخدام الكاميرا من الإعدادات.');
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: .85 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: .85 });
      if (!alive.current || result.canceled || !result.assets?.length) return;
      const asset = result.assets[0]; const video = asset.type === 'video';
      if (asset.fileSize && asset.fileSize > (video ? 40 : 8) * 1024 * 1024) throw Error(video ? 'الحد الأقصى للفيديو 40 ميجابايت.' : 'الحد الأقصى للصورة 8 ميجابايت.');
      if (video && asset.duration && asset.duration > 180000) throw Error('الحد الأقصى للفيديو المرفوع 3 دقائق. روابط المقاطع تدعم حتى 10 دقائق.');
      verifyFile(normalizeMediaAsset(asset, camera ? 'camera' : video ? 'video' : 'image'));
    } catch (e) { if (alive.current) setError((e as Error).message || 'تعذّر اختيار الوسيط.'); }
    finally { picking.current = false; }
  };
  return { query, setQuery, target, setTarget, mode, setMode, entries, suggestions, busy, message, error, searched, candidate, specialistAvailable, search, verifyUrl, verifyFile, pick, reset, cancel, canRetry: Boolean(last.current), retry: () => last.current?.() };
}
