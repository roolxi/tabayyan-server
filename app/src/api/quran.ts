import { apiClient } from "./client";
import { QuranSearchResponse, SuggestResponse } from "./types";

export async function searchQuran(
  text: string,
  signal?: AbortSignal,
  perfId?: string
): Promise<QuranSearchResponse> {
  return apiClient<QuranSearchResponse>("/api/quran/search", {
    method: "POST",
    body: { text },
    signal,
    perfId,
  });
}

export async function suggestQuranPhrases(
  text: string,
  signal?: AbortSignal,
  perfId?: string
): Promise<SuggestResponse> {
  return apiClient<SuggestResponse>("/api/search/suggest", {
    method: "POST",
    body: { text, type: "quran" },
    signal,
    perfId,
  });
}

