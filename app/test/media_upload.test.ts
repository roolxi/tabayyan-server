import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaAsset, uploadMedia } from "../src/api/media";
import { requestJson, requestMultipart } from "../src/api/client";
import { ApiError } from "../src/api/types";

// Setup environment for testing
process.env.EXPO_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";

describe("Media Asset Normalization and Multipart Upload", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Camera asset produces a valid multipart upload descriptor
  it("1. Camera asset produces a valid multipart upload descriptor", () => {
    const cameraAsset = {
      uri: "file:///var/mobile/Containers/Data/Application/123-ABC/tmp/capture.jpg",
      fileName: null,
      mimeType: null,
    };

    const descriptor = normalizeMediaAsset(cameraAsset, "camera");
    assert.equal(descriptor.uri, cameraAsset.uri);
    assert.match(descriptor.name, /^camera-\d+\.jpg$/);
    assert.equal(descriptor.type, "image/jpeg");
  });

  // 2. Photo-library asset produces a valid descriptor
  it("2. Photo-library asset produces a valid descriptor", () => {
    const photoAsset = {
      uri: "file:///var/mobile/Media/DCIM/100APPLE/IMG_9876.PNG",
      fileName: "IMG_9876.PNG",
      mimeType: "image/png",
    };

    const descriptor = normalizeMediaAsset(photoAsset, "image");
    assert.equal(descriptor.uri, photoAsset.uri);
    assert.equal(descriptor.name, "IMG_9876.PNG");
    assert.equal(descriptor.type, "image/png");
  });

  // 3. MOV video produces video/quicktime
  it("3. MOV video produces video/quicktime", () => {
    const movAsset = {
      uri: "file:///var/mobile/Media/DCIM/100APPLE/trim.MOV",
      fileName: "trim.MOV",
      mimeType: null,
      type: "video" as const,
    };

    const descriptor = normalizeMediaAsset(movAsset, "video");
    assert.equal(descriptor.uri, movAsset.uri);
    assert.equal(descriptor.type, "video/quicktime");
    assert.equal(descriptor.name, "trim.MOV");
  });

  // 4. Null iOS filename gets a safe generated name
  it("4. Null iOS filename gets a safe generated name", () => {
    const nullNameVideo = {
      uri: "file:///var/mobile/tmp/ED7490A0-38C5-4EE0.mov",
      fileName: null,
      mimeType: "video/quicktime",
    };

    const descriptor = normalizeMediaAsset(nullNameVideo, "video");
    assert.equal(descriptor.uri, nullNameVideo.uri);
    assert.match(descriptor.name, /^video-\d+\.mov$/);
    assert.equal(descriptor.type, "video/quicktime");

    const nullNameImage = {
      uri: "file:///var/mobile/tmp/48424B70-13D9.jpg",
      fileName: null,
      mimeType: "image/jpeg",
    };

    const imgDescriptor = normalizeMediaAsset(nullNameImage, "image");
    assert.match(imgDescriptor.name, /^image-\d+\.jpg$/);
    assert.equal(imgDescriptor.type, "image/jpeg");
  });

  // Extra: HEIC assets are rejected with clear unsupported_media_type error
  it("Rejects HEIC/HEIF assets with unsupported_media_type without mislabeling", () => {
    const heicAsset = {
      uri: "file:///var/mobile/tmp/photo.HEIC",
      fileName: "photo.heic",
      mimeType: "image/heic",
    };

    assert.throws(
      () => normalizeMediaAsset(heicAsset, "image"),
      (err: unknown) => {
        const apiErr = err as ApiError;
        return apiErr.code === "unsupported_media_type" && apiErr.statusCode === 415;
      }
    );
  });

  // 5. FormData is passed directly to fetch
  it("5. FormData is passed directly to fetch instance", async () => {
    let capturedBody: unknown = null;
    let capturedMethod: string | undefined;

    const testForm = new FormData();
    testForm.append("testKey", "testValue");

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body;
      capturedMethod = init?.method;
      return new Response(JSON.stringify({ status: "candidates", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await requestMultipart("/api/media/extract", testForm);

    assert.equal(capturedMethod, "POST");
    assert.strictEqual(capturedBody, testForm);
  });

  // 6. Content-Type is not manually set on multipart requests
  it("6. Content-Type is not manually set on multipart requests", async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ status: "candidates", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const testForm = new FormData();
    await requestMultipart("/api/media/extract", testForm);

    assert.equal(capturedHeaders["Content-Type"], undefined);
    assert.equal(capturedHeaders["Accept"], "application/json");
  });

  // 7. The field name matches the FastAPI endpoint ('file')
  it("7. The field name matches the FastAPI endpoint ('file')", async () => {
    let capturedBody: any = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body;
      return new Response(JSON.stringify({ status: "candidates", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await uploadMedia({
      uri: "file:///test/image.jpg",
      name: "image.jpg",
      type: "image/jpeg",
    });

    assert.ok(capturedBody instanceof FormData);
    // In standard FormData or Node environment, check appended field
    if (typeof capturedBody.has === "function") {
      assert.ok(capturedBody.has("file"));
    }
  });

  // 8. JSON requests still use application/json
  it("8. JSON requests still use application/json", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = init?.body;
      return new Response(JSON.stringify({ found: true, results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await requestJson("/api/quran/search", {
      method: "POST",
      body: { text: "قل هو الله أحد" },
    });

    assert.equal(capturedHeaders["Content-Type"], "application/json");
    assert.equal(capturedHeaders["Accept"], "application/json");
    assert.equal(capturedBody, JSON.stringify({ text: "قل هو الله أحد" }));
  });

  // 9. Timeout and cancellation still work
  it("9. Timeout and cancellation still work", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    }) as typeof fetch;

    const controller = new AbortController();
    const promise = requestMultipart("/api/media/extract", new FormData(), {
      signal: controller.signal,
      timeoutMs: 1000,
    });

    controller.abort();

    await assert.rejects(
      promise,
      (err: unknown) => {
        const apiErr = err as ApiError;
        return apiErr.code === "timeout" && apiErr.statusCode === 504;
      }
    );
  });

  // 10. Backend JSON errors still map correctly
  it("10. Backend JSON errors still map correctly", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          code: "unsupported_media_type",
          message: "نوع الوسيط غير مدعوم.",
        }),
        {
          status: 415,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as typeof fetch;

    await assert.rejects(
      requestMultipart("/api/media/extract", new FormData()),
      (err: unknown) => {
        const apiErr = err as ApiError;
        return (
          apiErr.code === "unsupported_media_type" &&
          apiErr.statusCode === 415 &&
          apiErr.message === "نوع الوسيط غير مدعوم."
        );
      }
    );

    // Also test 413 media_too_large
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          code: "media_too_large",
          message: "حجم الملف كبير جدًا.",
        }),
        {
          status: 413,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as typeof fetch;

    await assert.rejects(
      requestMultipart("/api/media/extract", new FormData()),
      (err: unknown) => {
        const apiErr = err as ApiError;
        return (
          apiErr.code === "media_too_large" &&
          apiErr.statusCode === 413 &&
          apiErr.message === "حجم الملف كبير جدًا."
        );
      }
    );
  });
});
