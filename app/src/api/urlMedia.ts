import { requestJson } from "./client";
import { ApiError, UrlJobStatusResponse, UrlJobSubmitResponse } from "./types";

// Strict pattern for validating URLs submitted to the backend (must be https)
const STRICT_HTTPS_URL_REGEX =
  /^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|instagram\.com)\/[^\s]+$/i;

// Permissive extraction pattern for detecting URLs inside shared text or pastes
const EXTRACT_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|instagram\.com)(?:\/[^\s]*)?/i;

/**
 * Checks if a string is a valid, supported remote media URL (HTTPS required).
 */
export function isSupportedMediaUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return STRICT_HTTPS_URL_REGEX.test(trimmed);
}

/**
 * Safely extracts the first supported URL found inside shared plain text.
 * Returns normalized https URL or null if no supported URL is found.
 */
export function extractSupportedUrlFromText(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const match = text.match(EXTRACT_URL_REGEX);
  if (!match) return null;

  let candidate = match[0].trim();
  // Strip trailing punctuation like comma, dot, parenthesis if attached
  candidate = candidate.replace(/[.,;!?)]+$/, "");
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  } else if (/^http:\/\//i.test(candidate)) {
    candidate = candidate.replace(/^http:\/\//i, "https://");
  }
  return candidate;
}

/**
 * Submits a remote media URL to the background job queue.
 */
export async function submitUrlJob(
  url: string,
  signal?: AbortSignal
): Promise<UrlJobSubmitResponse> {
  const cleaned = url.trim();
  if (!cleaned) {
    const error: ApiError = {
      code: "invalid_url",
      message: "الرجاء إدخال رابط صالح.",
      statusCode: 400,
    };
    throw error;
  }

  return requestJson<UrlJobSubmitResponse>(
    "/api/media/url/jobs",
    {
      method: "POST",
      body: { url: cleaned },
      signal,
      timeoutMs: 15000,
    }
  );
}

/**
 * Queries current status of a background URL media extraction job.
 */
export async function getUrlJobStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<UrlJobStatusResponse> {
  return requestJson<UrlJobStatusResponse>(
    `/api/media/url/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      signal,
      timeoutMs: 12000,
    }
  );
}

export interface PollJobOptions {
  onProgress?: (status: UrlJobStatusResponse) => void;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxTimeoutMs?: number;
}

/**
 * Polls a background job until completion or failure with safe bounded timer and cancellation.
 * Accepts either an options object or a direct onProgress callback for convenience.
 */
export async function pollUrlJob(
  jobId: string,
  options?: PollJobOptions | ((status: UrlJobStatusResponse) => void),
  pollIntervalMs?: number,
  maxTimeoutMs?: number
): Promise<UrlJobStatusResponse> {
  const opts: PollJobOptions =
    typeof options === "function"
      ? { onProgress: options, pollIntervalMs, maxTimeoutMs }
      : (options ?? {});

  const interval = opts.pollIntervalMs ?? 1500;
  const maxTimeout = opts.maxTimeoutMs ?? 180000; // 3 minutes max polling
  const startTime = Date.now();

  while (true) {
    if (opts.signal?.aborted) {
      const error: ApiError = {
        code: "cancelled",
        message: "تم إلغاء عملية الفحص.",
        statusCode: 499,
      };
      throw error;
    }

    if (Date.now() - startTime > maxTimeout) {
      const error: ApiError = {
        code: "job_timeout",
        message: "استغرقت معالجة الرابط وقتًا أطول من المتوقع. يرجى إعادة المحاولة.",
        statusCode: 504,
      };
      throw error;
    }

    const job = await getUrlJobStatus(jobId, opts.signal);

    if (opts.onProgress) {
      opts.onProgress(job);
    }

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      const errorMsg = job.error?.message || job.message || "تعذر إكمال فحص الرابط.";
      const error: ApiError = {
        code: job.error?.code || "job_failed",
        message: errorMsg,
        statusCode: 422,
      };
      throw error;
    }

    // Wait interval before next poll
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

