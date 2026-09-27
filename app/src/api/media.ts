import { requestMultipart } from "./client";
import { ApiError, MediaExtractResponse } from "./types";

export type ReactNativeUploadFile = {
  uri: string;
  name: string;
  type: string;
};

export type UploadDescriptor = ReactNativeUploadFile;
export type MediaUploadPayload = ReactNativeUploadFile;

export interface RawMediaAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  type?: "image" | "video" | "livePhoto" | "pairedVideo" | string | null;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/**
 * Normalizes assets from camera, photo-library, and video picker into a single UploadDescriptor.
 * - Preserves the raw file:// URI from iOS.
 * - Resolves MIME type or infers correct fallback from URI/filename.
 * - Detects HEIC/HEIF and throws clear unsupported-format ApiError without mislabeling.
 * - Generates safe timestamped filenames for camera or null-name iOS assets.
 */
export function normalizeMediaAsset(
  asset: RawMediaAsset,
  sourceKind?: "camera" | "image" | "video"
): UploadDescriptor {
  const rawUri = asset.uri;
  if (!rawUri || typeof rawUri !== "string") {
    const error: ApiError = {
      code: "invalid_asset",
      message: "تعذّر قراءة مسار الملف المحدد.",
      statusCode: 400,
    };
    throw error;
  }

  // Extract clean extension from URI or fileName without query string
  const cleanPath = (asset.fileName || rawUri).split("?")[0].split("#")[0];
  const extMatch = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";

  const rawMime = asset.mimeType?.toLowerCase().trim() || "";

  // Reject HEIC/HEIF explicitly
  if (
    ext === "heic" ||
    ext === "heif" ||
    rawMime === "image/heic" ||
    rawMime === "image/heif"
  ) {
    const error: ApiError = {
      code: "unsupported_media_type",
      message: "صيغة الصورة (HEIC) غير مدعومة حالياً. يرجى اختيار أو التقاط صورة بصيغة JPG أو PNG أو WebP.",
      statusCode: 415,
    };
    throw error;
  }

  const isVideo =
    sourceKind === "video" ||
    asset.type === "video" ||
    rawMime.startsWith("video/") ||
    ext === "mp4" ||
    ext === "mov" ||
    ext === "webm";

  // Determine actual MIME type
  let resolvedMime = "";
  if (rawMime && rawMime !== "application/octet-stream" && rawMime.includes("/")) {
    resolvedMime = rawMime;
  } else if (ext && MIME_BY_EXT[ext]) {
    resolvedMime = MIME_BY_EXT[ext];
  } else if (isVideo) {
    resolvedMime = ext === "mov" ? "video/quicktime" : "video/mp4";
  } else {
    resolvedMime = "image/jpeg";
  }

  // Determine safe filename
  const timestamp = Date.now();
  let resolvedName = asset.fileName ? asset.fileName.trim() : "";

  if (!resolvedName) {
    if (sourceKind === "camera") {
      resolvedName = `camera-${timestamp}.jpg`;
    } else if (isVideo) {
      const videoExt = resolvedMime === "video/quicktime" || ext === "mov" ? "mov" : "mp4";
      resolvedName = `video-${timestamp}.${videoExt}`;
    } else {
      const imgExt = ext && MIME_BY_EXT[ext] ? ext : "jpg";
      resolvedName = `image-${timestamp}.${imgExt}`;
    }
  } else {
    // If filename has no extension, append appropriate extension
    if (!resolvedName.includes(".")) {
      if (resolvedMime === "video/quicktime") {
        resolvedName = `${resolvedName}.mov`;
      } else if (resolvedMime === "video/mp4") {
        resolvedName = `${resolvedName}.mp4`;
      } else if (resolvedMime === "image/png") {
        resolvedName = `${resolvedName}.png`;
      } else if (resolvedMime === "image/webp") {
        resolvedName = `${resolvedName}.webp`;
      } else {
        resolvedName = `${resolvedName}.jpg`;
      }
    }
  }

  return {
    uri: rawUri,
    name: resolvedName,
    type: resolvedMime,
  };
}

/**
 * Uploads media using dedicated React Native multipart fetch.
 * Uses exact field name 'file' expected by FastAPI server.py.
 */
export async function uploadMedia(
  file: ReactNativeUploadFile,
  signal?: AbortSignal,
  options?: { timeoutMs?: number; perfId?: string } | string
): Promise<MediaExtractResponse> {
  const form = new FormData();

  form.append(
    "file",
    {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob
  );

  const timeoutMs = typeof options === "object" ? options.timeoutMs : 45000;
  const perfId = typeof options === "string" ? options : options?.perfId;

  return requestMultipart<MediaExtractResponse>(
    "/api/media/extract",
    form,
    {
      signal,
      timeoutMs: timeoutMs ?? 45000,
      perfId,
    }
  );
}

/**
 * Backward compatibility alias for uploadMedia.
 */
export const extractMedia = uploadMedia;
