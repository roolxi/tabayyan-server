import { requestJson } from "./client";
import { ApiError, UrlJobStatusResponse, UrlJobSubmitResponse } from "./types";
import { perfTracker } from "../utils/perfTracker";

const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "instagram.com", "www.instagram.com", "instagr.am"]);

/**
 * Checks if a string is a valid, supported remote media URL (HTTPS required).
 */
export function isSupportedMediaUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (/\s/.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && HOSTS.has(parsed.hostname.toLowerCase()) &&
      !parsed.username && !parsed.password && (!parsed.port || parsed.port === "443") &&
      parsed.pathname.length > 1;
  } catch { return false; }
}

/**
 * Safely extracts the first supported URL found inside shared plain text.
 * Returns normalized https URL or null if no supported URL is found.
 */
export function extractSupportedUrlFromText(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  for (const token of text.split(/[\s<>"'()\[\]{}]+/)) {
    let candidate = token.replace(/[.,;!?،؛]+$/, "");
    if (!candidate) continue;
    if (!/^[a-z][a-z\d+.-]*:/i.test(candidate)) candidate = "https://" + candidate;
    candidate = candidate.replace(/^http:\/\//i, "https://");
    if (isSupportedMediaUrl(candidate)) return candidate;
  }
  return null;
}

/**
 * Submits a remote media URL to the background job queue.
 */
export async function submitUrlJob(
  url: string,
  signal?: AbortSignal,
  perfId?: string
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

  if (perfId) perfTracker.recordJobSubmitStart(perfId);
  const res = await requestJson<UrlJobSubmitResponse>(
    "/api/media/url/jobs",
    {
      method: "POST",
      body: { url: cleaned },
      signal,
      timeoutMs: 15000,
      perfId,
    }
  );
  if (perfId) perfTracker.recordJobSubmitDone(perfId);
  return res;
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
  perfId?: string;
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

  if (opts.perfId) perfTracker.recordPollStart(opts.perfId);

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

    if (opts.perfId) perfTracker.recordPollCycle(opts.perfId);
    const job = await getUrlJobStatus(jobId, opts.signal);

    if (opts.onProgress) {
      opts.onProgress(job);
    }

    if (job.status === "completed") {
      if (opts.perfId) perfTracker.recordPollDone(opts.perfId);
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
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        reject({ code: "cancelled", message: "تم إلغاء عملية الفحص.", statusCode: 499 });
      };
      const timer = setTimeout(() => {
        opts.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, interval);
      if (opts.signal?.aborted) onAbort();
      else opts.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
