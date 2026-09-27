import {
  HadithSearchResponse,
  MediaExtractResponse,
  QuranSearchResponse,
  HadithRecord,
} from "../../api/types";
export type Target = "hadith" | "quran";
export type Mode = "normal" | "meaning" | "specialist";
export interface SourceEntry {
  id: string;
  kind: Target;
  text: string;
  source: string;
  sourceUrl?: string | null;
  verse?: string;
  records: HadithRecord[];
  mixed?: boolean;
  candidate?: boolean;
  mode?: Mode;
}
export interface Presentation {
  entries: SourceEntry[];
  suggestions: string[];
  message: string;
  specialistAvailable: boolean;
}
const empty = (): Presentation => ({
  entries: [],
  suggestions: [],
  message: "",
  specialistAvailable: false,
});
export function presentHadith(
  res: HadithSearchResponse,
  mode: Mode,
): Presentation {
  const selected = res.simplePresentation?.selected;
  const records =
    mode === "normal" && selected ? selected.records : res.results || [];
  const grouped = new Map<string, HadithRecord[]>();
  for (const r of records) {
    const text = r.text || selected?.text || "";
    if (text) grouped.set(text, [...(grouped.get(text) || []), r]);
  }
  return {
    ...empty(),
    entries: [...grouped].map(([text, rs], i) => {
      const entryCats = new Set(rs.flatMap((r) => r.degreeCategories || []));
      const entryMixed =
        (entryCats.has(1) || entryCats.has(2)) &&
        (entryCats.has(3) || entryCats.has(4));
      const mixed =
        mode === "normal" && selected
          ? Boolean(res.selectedMixedCategories)
          : entryCats.size > 0
            ? entryMixed
            : Boolean(res.mixedCategories);

      return {
        id: `h${i}`,
        kind: "hadith",
        text,
        records: rs,
        source: res.source || "الدرر السنية",
        sourceUrl: rs[0]?.sourceUrl || res.sourceUrl,
        mixed,
        mode,
      };
    }),
    specialistAvailable: Boolean(
      res.specialistAvailable ||
      res.canSearchSpecialist ||
      res.simplePresentation?.alternates?.length,
    ),
    message: [
      res.message,
      res.hint,
      res.complete === false
        ? "بعض المصادر لم تستجب؛ النتائج المتاحة قد لا تكون مكتملة."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
export function presentQuran(res: QuranSearchResponse): Presentation {
  return {
    ...empty(),
    message: res.message || "",
    entries: (res.results || []).map((v, i) => ({
      id: `q${i}`,
      kind: "quran",
      text: v.text_uthmani,
      source: `${v.surah_name} · الآية ${v.ayah}`,
      sourceUrl: res.source?.url || `https://quran.com/${v.surah}/${v.ayah}`,
      verse: v.verse_key,
      records: [],
      mode: "normal",
    })),
  };
}
export function presentMedia(res: MediaExtractResponse): Presentation {
  if (res.status === "temporarily_unavailable")
    throw Error(res.message || "خدمة الاستخراج غير متاحة مؤقتًا.");
  return {
    ...empty(),
    message: [
      res.message,
      res.partialProcessing
        ? "عولج جزء من المقطع فقط؛ النتائج تخص الجزء الذي تمت معالجته."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    entries: (res.results || [])
      .filter((item) => item.verified === true && Boolean(item.displayText))
      .map((item, i) =>
        item.type === "quran"
          ? {
              id: `m${i}`,
              kind: "quran" as const,
              text: item.displayText,
              source: `${item.source.surahName || item.source.name} · الآية ${item.source.ayah || ""}`,
              sourceUrl: undefined,
              verse: item.source.ayah ? `${item.source.ayah}` : undefined,
              records: [],
              candidate: true,
              mode: "normal" as const,
            }
          : {
              id: `m${i}`,
              kind: "hadith" as const,
              text: item.displayText,
              source: item.source.name,
              sourceUrl: item.source.url ?? undefined,
              records: item.records || [],
              mixed: item.mixedCategories,
              candidate: true,
              mode: "normal" as const,
            },
      ),
  };
}
export interface VerificationState extends Presentation {
  query: string;
  target: Target;
  mode: Mode;
  resultMode: Mode | null;
  busy: boolean;
  error: string;
  searched: boolean;
  cancelled: boolean;
  steps: string[];
  startedAt: number;
  endedAt: number | null;
  requestLabel: string;
  resultLabel: string;
  perfId: string | null;
}
export const initialState: VerificationState = {
  ...empty(),
  query: "",
  target: "hadith",
  mode: "normal",
  resultMode: null,
  busy: false,
  error: "",
  searched: false,
  cancelled: false,
  steps: [],
  startedAt: 0,
  endedAt: null,
  requestLabel: "",
  resultLabel: "",
  perfId: null,
};
export type Action =
  | { type: "context"; target: Target }
  | { type: "mode"; mode: Mode }
  | { type: "query"; query: string }
  | {
      type: "begin";
      label: string;
      time: number;
      perfId?: string;
      mode?: Mode;
      requestLabel?: string;
    }
  | { type: "stage"; label: string }
  | { type: "done"; result: Presentation; time: number; resultMode?: Mode }
  | { type: "error"; error: string; time: number }
  | { type: "cancel"; time: number }
  | { type: "reset" }
  | { type: "dismissError" };
export function reducer(s: VerificationState, a: Action): VerificationState {
  switch (a.type) {
    case "context":
      return {
        ...initialState,
        target: a.target,
        mode:
          s.mode === "specialist" && a.target === "quran" ? "normal" : s.mode,
      };
    case "mode":
      return {
        ...initialState,
        target: s.target,
        query: s.query,
        mode:
          a.mode === "specialist" && s.target === "quran" ? "normal" : a.mode,
      };
    case "query":
      return { ...s, query: a.query, error: "" };
    case "begin":
      return {
        ...s,
        busy: true,
        error: "",
        cancelled: false,
        searched: true,
        message: a.label,
        steps: [a.label],
        startedAt: a.time,
        endedAt: null,
        requestLabel: a.requestLabel !== undefined ? a.requestLabel : s.query,
        mode: a.mode !== undefined ? a.mode : s.mode,
        perfId: a.perfId !== undefined ? a.perfId : s.perfId,
      };
    case "stage":
      return {
        ...s,
        message: a.label,
        steps:
          s.steps[s.steps.length - 1] === a.label
            ? s.steps
            : [...s.steps, a.label],
      };
    case "done":
      return {
        ...s,
        ...a.result,
        busy: false,
        endedAt: a.time,
        resultLabel: s.requestLabel,
        resultMode: a.resultMode !== undefined ? a.resultMode : s.mode,
      };
    case "error":
      return {
        ...s,
        busy: false,
        error: a.error,
        message: "",
        endedAt: a.time,
      };
    case "cancel":
      return {
        ...s,
        busy: false,
        cancelled: true,
        message: "",
        endedAt: a.time,
      };
    case "reset":
      return { ...initialState, target: s.target, mode: s.mode };
    case "dismissError":
      return { ...s, error: "" };
  }
}
