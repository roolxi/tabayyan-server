import { apiClient } from "./client";
import { HadithSearchResponse, MeaningSearchResponse, SuggestResponse } from "./types";

export async function searchHadith(
  text: string,
  mode: "simple" | "specialist" = "simple",
  signal?: AbortSignal,
  perfId?: string
): Promise<HadithSearchResponse> {
  return apiClient<HadithSearchResponse>("/api/hadith/search", {
    method: "POST",
    body: { text, mode },
    signal,
    perfId,
  });
}

export async function suggestHadithPhrases(
  text: string,
  signal?: AbortSignal,
  perfId?: string
): Promise<SuggestResponse> {
  return apiClient<SuggestResponse>("/api/search/suggest", {
    method: "POST",
    body: { text, type: "hadith" },
    signal,
    perfId,
  });
}

export async function searchHadithByMeaning(
  text: string,
  clarifications: string[] = [],
  signal?: AbortSignal,
  perfId?: string
): Promise<MeaningSearchResponse> {
  return apiClient<MeaningSearchResponse>("/api/hadith/meaning-search", {
    method: "POST",
    body: { text, clarifications },
    signal,
    perfId,
  });
}

