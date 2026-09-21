import { apiClient } from "./client";
import { HadithSearchResponse, MeaningSearchResponse, SuggestResponse } from "./types";

export async function searchHadith(
  text: string,
  mode: "simple" | "specialist" = "simple",
  signal?: AbortSignal
): Promise<HadithSearchResponse> {
  return apiClient<HadithSearchResponse>("/api/hadith/search", {
    method: "POST",
    body: { text, mode },
    signal,
  });
}

export async function suggestHadithPhrases(text: string, signal?: AbortSignal): Promise<SuggestResponse> {
  return apiClient<SuggestResponse>("/api/search/suggest", {
    method: "POST",
    body: { text, type: "hadith" },
    signal,
  });
}

export async function searchHadithByMeaning(
  text: string,
  clarifications: string[] = [],
  signal?: AbortSignal
): Promise<MeaningSearchResponse> {
  return apiClient<MeaningSearchResponse>("/api/hadith/meaning-search", {
    method: "POST",
    body: { text, clarifications },
    signal,
  });
}

