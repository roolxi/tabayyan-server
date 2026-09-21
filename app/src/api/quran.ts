import { apiClient } from "./client";
import { QuranSearchResponse, SuggestResponse } from "./types";

export async function searchQuran(text: string, signal?: AbortSignal): Promise<QuranSearchResponse> {
  return apiClient<QuranSearchResponse>("/api/quran/search", {
    method: "POST",
    body: { text },
    signal,
  });
}

export async function suggestQuranPhrases(text: string, signal?: AbortSignal): Promise<SuggestResponse> {
  return apiClient<SuggestResponse>("/api/search/suggest", {
    method: "POST",
    body: { text, type: "quran" },
    signal,
  });
}

