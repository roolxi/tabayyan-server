import { ApiError } from "./types";
import { perfTracker } from "../utils/perfTracker";

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_MULTIPART_TIMEOUT_MS = 45000;

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!url || !url.trim()) {
    throw new Error(
      "لم يتم ضبط عنوان الخادم في المتغير EXPO_PUBLIC_API_BASE_URL. يرجى إنشاء ملف .env وتحديد عنوان IP المحلي للحاسوب."
    );
  }
  return url.replace(/\/+$/, "");
}

export function isConfigured(): boolean {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL;
  return Boolean(url && url.trim());
}

export interface JsonRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  perfId?: string;
}

export interface MultipartRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  perfId?: string;
}

/**
 * Dedicated JSON request handler.
 * Serializes body as JSON and sets Content-Type: application/json.
 */
export async function requestJson<T>(
  endpoint: string,
  options: JsonRequestOptions = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abort, { once: true });

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  let body: BodyInit | undefined = undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  try {
    if (options.signal?.aborted) throw { name: "AbortError" };
    if (options.perfId) perfTracker.recordDispatch(options.perfId);

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body,
      signal: controller.signal,
    });

    if (options.perfId) perfTracker.recordHeaders(options.perfId);

    const data = await response.json().catch(() => null);
    if (options.perfId) perfTracker.recordBodyParsed(options.perfId);

    if (controller.signal.aborted) throw { name: "AbortError" };

    if (!response.ok) {
      const error: ApiError = {
        code: data?.code || "api_error",
        message: data?.message || "حدث خطأ أثناء التواصل مع الخادم.",
        statusCode: response.status,
      };
      throw error;
    }

    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if ((err as { name?: string })?.name === "AbortError") {
      if (options.signal?.aborted) {
        throw { code: "cancelled", message: "تم إلغاء الطلب.", statusCode: 499 } satisfies ApiError;
      }
      const timeoutError: ApiError = {
        code: "timeout",
        message: "استغرق الطلب وقتًا طويلاً وتجاوز المهلة المحددة. يرجى المحاولة مرة أخرى.",
        statusCode: 504,
      };
      throw timeoutError;
    }

    if ((err as ApiError)?.message && (err as ApiError)?.code) {
      throw err;
    }

    const networkError: ApiError = {
      code: "network_error",
      message: "تعذّر الاتصال بالخادم. تأكد من اتصال هاتفك بالشبكة المحلية ومن تشغيل الخادم.",
      statusCode: 0,
    };
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abort);
  }
}

/**
 * Dedicated Multipart request handler for React Native / Expo.
 *
 * NOTE on Expo SDK 57 / React Native:
 * Expo SDK 57 replaced globalThis.fetch with WinterCG fetch (expo/src/winter/fetch),
 * which explicitly throws `Error: Unsupported FormDataPart implementation` when encountering
 * React Native's `{ uri, name, type }` FormData parts.
 *
 * In React Native on iOS and Android, XMLHttpRequest delegates directly to native RCTNetworking,
 * correctly reading native file URIs from disk and generating RFC 2388 multipart/form-data with
 * automatic boundaries.
 */
export async function requestMultipart<T>(
  endpoint: string,
  formData: FormData,
  options: MultipartRequestOptions = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const timeoutMs = options.timeoutMs || DEFAULT_MULTIPART_TIMEOUT_MS;

  // 1. Primary path: Use XMLHttpRequest in React Native (iOS / Android)
  if (typeof XMLHttpRequest !== "undefined") {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.timeout = timeoutMs;
      xhr.setRequestHeader("Accept", "application/json");

      // NEVER set Content-Type header; native networker generates multipart boundary
      if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          if (key.toLowerCase() !== "content-type") {
            xhr.setRequestHeader(key, value);
          }
        }
      }

      let isAborted = false;
      if (options.signal) {
        if (options.signal.aborted) {
          xhr.abort();
          const abortErr: ApiError = {
            code: "timeout",
            message: "تم إلغاء الطلب.",
            statusCode: 504,
          };
          return reject(abortErr);
        }
        options.signal.addEventListener("abort", () => {
          isAborted = true;
          xhr.abort();
          const abortErr: ApiError = {
            code: "timeout",
            message: "تم إلغاء الطلب.",
            statusCode: 504,
          };
          reject(abortErr);
        });
      }

      xhr.ontimeout = () => {
        const timeoutError: ApiError = {
          code: "timeout",
          message: "استغرق رفع وفحص الوسيط وقتًا طويلاً وتجاوز المهلة المحددة. يرجى المحاولة مرة أخرى.",
          statusCode: 504,
        };
        reject(timeoutError);
      };

      xhr.onerror = () => {
        if (isAborted) return;
        const networkError: ApiError = {
          code: "network_error",
          message: "تعذّر الاتصال بالخادم. تأكد من اتصال هاتفك بالشبكة المحلية ومن تشغيل الخادم.",
          statusCode: 0,
        };
        reject(networkError);
      };

      if (options.perfId) {
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 2 && options.perfId) {
            perfTracker.recordHeaders(options.perfId);
          }
        };
      }

      xhr.onload = () => {
        if (options.perfId) perfTracker.recordBodyParsed(options.perfId);
        let data: any = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as T);
        } else {
          const error: ApiError = {
            code: data?.code || "api_error",
            message: data?.message || "حدث خطأ أثناء التواصل مع الخادم.",
            statusCode: xhr.status,
          };
          reject(error);
        }
      };

      try {
        if (options.perfId) perfTracker.recordDispatch(options.perfId);
        xhr.send(formData as any);
      } catch (err: unknown) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.error("[Tabayyan requestMultipart XHR Error]:", err);
        }
        const clientError: ApiError = {
          code: "media_processing_failed",
          message: "تعذّر رفع الوسيط أو الاتصال بالخادم. يرجى التأكد من اتصال هاتفك بالشبكة وإعادة المحاولة.",
          statusCode: 0,
        };
        reject(clientError);
      }
    });
  }

  // 2. Fallback path: Use fetch when XMLHttpRequest is not available (e.g. Node.js unit tests)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      controller.abort();
    });
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData as unknown as BodyInit,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const error: ApiError = {
        code: data?.code || "api_error",
        message: data?.message || "حدث خطأ أثناء التواصل مع الخادم.",
        statusCode: response.status,
      };
      throw error;
    }

    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if ((err as { name?: string })?.name === "AbortError") {
      const timeoutError: ApiError = {
        code: "timeout",
        message: "استغرق رفع وفحص الوسيط وقتًا طويلاً وتجاوز المهلة المحددة. يرجى المحاولة مرة أخرى.",
        statusCode: 504,
      };
      throw timeoutError;
    }

    if ((err as ApiError)?.message && (err as ApiError)?.code) {
      throw err;
    }

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.error("[Tabayyan requestMultipart Fetch Error]:", err);
    }

    const clientOrNetworkError: ApiError = {
      code: "media_processing_failed",
      message: "تعذّر رفع الوسيط أو الاتصال بالخادم. يرجى التأكد من اتصال هاتفك بالشبكة وإعادة المحاولة.",
      statusCode: 0,
    };
    throw clientOrNetworkError;
  }
}

/**
 * Backward-compatible generic client.
 */
export async function apiClient<T>(
  endpoint: string,
  options: JsonRequestOptions = {}
): Promise<T> {
  return requestJson<T>(endpoint, options);
}
