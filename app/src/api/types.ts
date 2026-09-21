// Backend API Types for Tabayyan (تبيّن)

export interface HealthResponse {
  status: string;
}

// Quran Search
export interface QuranVerseItem {
  verse_key: string;
  surah: number;
  ayah: number;
  surah_name: string;
  text_uthmani: string;
}

export interface QuranSearchResponse {
  query: string;
  found: boolean;
  matchType: "normalized_phrase" | "approximate";
  source: {
    name: string;
    url: string;
  };
  total: number;
  results: QuranVerseItem[];
  message?: string;
}

// Hadith Search
export interface HadithRecord {
  text: string;
  narrator: string | null;
  scholar: string | null;
  book: string | null;
  reference: string | null;
  grade: string | null;
  gradeExplanation: string | null;
  takhrij?: string | null;
  sourceUrl?: string | null;
  degreeCategories?: number[];
  categoryLabels?: string[];
}

export interface SimplePresentationGroup {
  text: string;
  records: HadithRecord[];
  categoryLabels: string[];
  matchType: "exact" | "phrase" | "words" | "source_candidate";
}

export interface SimplePresentation {
  selected: SimplePresentationGroup | null;
  alternates: SimplePresentationGroup[];
  matched: boolean;
}

export interface HadithCategoryStatus {
  degree: number;
  status: "ok" | "error";
  count: number | null;
  label: string;
}

export interface HadithSearchResponse {
  query: string;
  found: boolean;
  mode: "simple" | "specialist";
  source: string;
  sourceUrl: string | null;
  resultsCount: number;
  specialistAvailable: boolean | null;
  results: HadithRecord[];
  categoriesWithResults?: number[];
  mixedCategories?: boolean;
  selectedMixedCategories?: boolean;
  complete?: boolean;
  canSearchSpecialist?: boolean;
  categoryStatuses?: HadithCategoryStatus[];
  simplePresentation?: SimplePresentation;
  message?: string;
  hint?: string;
}

// Search suggestions
export interface SuggestResponse {
  query: string;
  type: "quran" | "hadith";
  candidates: string[];
  message?: string;
}

// Hadith meaning search
export interface MeaningCandidate {
  id: string;
  text: string;
}

export interface MeaningSearchResponse {
  status: "candidates" | "needs_clarification" | "not_found" | "temporarily_unavailable";
  attempt?: number;
  attemptsRemaining?: number;
  source?: string;
  candidates?: MeaningCandidate[];
  message?: string;
}

// Media extract
export interface MediaQuranSource {
  name: string;
  verseKey: string;
  surahName: string;
  ayah: number;
}

export interface MediaHadithSource {
  name: string;
  url?: string | null;
}

export interface MediaQuranResult {
  type: "quran";
  verified: true;
  extractedText: string;
  confidence: "high" | "medium" | "low";
  displayText: string;
  source: MediaQuranSource;
}

export interface MediaHadithResult {
  type: "hadith";
  verified: true;
  extractedText: string;
  confidence: "high" | "medium" | "low";
  displayText: string;
  source: MediaHadithSource;
  mixedCategories?: boolean;
  categoryLabels?: string[];
  records?: HadithRecord[];
  alternatesCount?: number;
}

export type MediaResultItem = MediaQuranResult | MediaHadithResult;

export interface MediaExtractResponse {
  status: "candidates" | "not_found" | "temporarily_unavailable";
  mediaType?: "image" | "video";
  results: MediaResultItem[];
  message?: string;
}

export interface ApiError {
  code?: string;
  message: string;
  statusCode?: number;
}

