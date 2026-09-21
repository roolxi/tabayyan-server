import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isSupportedMediaUrl,
  extractSupportedUrlFromText,
  submitUrlJob,
  getUrlJobStatus,
  pollUrlJob,
} from "../src/api/urlMedia";

process.env.EXPO_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";

describe("URL Media Processing & Polling", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("isSupportedMediaUrl validation", () => {
    it("accepts valid YouTube URLs (watch, embed, youtu.be, shorts)", () => {
      assert.equal(isSupportedMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
      assert.equal(isSupportedMediaUrl("https://youtube.com/watch?v=dQw4w9WgXcQ"), true);
      assert.equal(isSupportedMediaUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), true);
      assert.equal(isSupportedMediaUrl("https://youtu.be/dQw4w9WgXcQ"), true);
      assert.equal(isSupportedMediaUrl("https://www.youtube.com/shorts/abc123XYZ"), true);
    });

    it("accepts valid TikTok URLs", () => {
      assert.equal(isSupportedMediaUrl("https://www.tiktok.com/@user/video/7123456789012345678"), true);
      assert.equal(isSupportedMediaUrl("https://tiktok.com/@user/video/7123456789012345678"), true);
      assert.equal(isSupportedMediaUrl("https://vm.tiktok.com/ZM8abc123/"), true);
      assert.equal(isSupportedMediaUrl("https://vt.tiktok.com/ZS8abc123/"), true);
    });

    it("accepts valid Instagram URLs (reels, p, tv)", () => {
      assert.equal(isSupportedMediaUrl("https://www.instagram.com/reel/C1234567890/"), true);
      assert.equal(isSupportedMediaUrl("https://instagram.com/reel/C1234567890/"), true);
      assert.equal(isSupportedMediaUrl("https://www.instagram.com/p/C1234567890/"), true);
      assert.equal(isSupportedMediaUrl("https://www.instagram.com/tv/C1234567890/"), true);
    });

    it("rejects non-HTTPS and unsupported domains/schemes", () => {
      assert.equal(isSupportedMediaUrl("http://youtube.com/watch?v=123"), false);
      assert.equal(isSupportedMediaUrl("ftp://youtube.com/watch?v=123"), false);
      assert.equal(isSupportedMediaUrl("https://facebook.com/video/123"), false);
      assert.equal(isSupportedMediaUrl("https://twitter.com/i/status/123"), false);
      assert.equal(isSupportedMediaUrl("not-a-url"), false);
      assert.equal(isSupportedMediaUrl("https://evil-youtube.com/watch?v=123"), false);
      assert.equal(isSupportedMediaUrl("https://127.0.0.1/video"), false);
      assert.equal(isSupportedMediaUrl("https://localhost/video"), false);
    });
  });

  describe("extractSupportedUrlFromText", () => {
    it("extracts clean URL surrounded by text and punctuation", () => {
      const text1 = "شاهد هذا المقطع https://youtu.be/dQw4w9WgXcQ مهم جداً";
      assert.equal(extractSupportedUrlFromText(text1), "https://youtu.be/dQw4w9WgXcQ");

      const text2 = "رابط التيك توك: (https://vm.tiktok.com/ZM8abc123/) تفضل";
      assert.equal(extractSupportedUrlFromText(text2), "https://vm.tiktok.com/ZM8abc123/");

      const text3 = "https://www.instagram.com/reel/C1234567890/?igsh=xyz.";
      assert.equal(extractSupportedUrlFromText(text3), "https://www.instagram.com/reel/C1234567890/?igsh=xyz");
    });

    it("normalizes scheme if absent or http", () => {
      const text1 = "فيديو بدون بروتوكول youtube.com/watch?v=123 شكرا";
      assert.equal(extractSupportedUrlFromText(text1), "https://youtube.com/watch?v=123");

      const text2 = "رابط عادي http://instagram.com/reel/abc";
      assert.equal(extractSupportedUrlFromText(text2), "https://instagram.com/reel/abc");
    });

    it("returns null if no supported URL is found in text", () => {
      assert.equal(extractSupportedUrlFromText("مجرد نص عربي عادي بدون روابط"), null);
      assert.equal(extractSupportedUrlFromText("تفضل الرابط https://example.com/test"), null);
    });
  });

  describe("submitUrlJob", () => {
    it("submits job and returns jobId", async () => {
      globalThis.fetch = (async (url: any, init: any) => {
        assert.equal(url.toString(), "http://127.0.0.1:8000/api/media/url/jobs");
        assert.equal(init?.method, "POST");
        const body = JSON.parse(init?.body as string);
        assert.equal(body.url, "https://youtu.be/dQw4w9WgXcQ");

        return {
          ok: true,
          status: 202,
          json: async () => ({
            jobId: "test-job-123",
            status: "queued",
          }),
        } as Response;
      }) as any;

      const res = await submitUrlJob("https://youtu.be/dQw4w9WgXcQ");
      assert.equal(res.jobId, "test-job-123");
      assert.equal(res.status, "queued");
    });

    it("throws ApiError on invalid URL submission", async () => {
      globalThis.fetch = (async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: "invalid_url",
            message: "عنوان الرابط غير مدعوم أو غير صالح.",
          }),
        } as Response;
      }) as any;

      await assert.rejects(
        () => submitUrlJob("https://unsupported.com/test"),
        (err: any) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.message, "عنوان الرابط غير مدعوم أو غير صالح.");
          return true;
        }
      );
    });
  });

  describe("pollUrlJob", () => {
    it("polls until completed and invokes onUpdate", async () => {
      let callCount = 0;
      const stageUpdates: string[] = [];

      globalThis.fetch = (async (url: any) => {
        callCount++;
        assert.equal(url.toString(), "http://127.0.0.1:8000/api/media/url/jobs/job-abc");

        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              jobId: "job-abc",
              status: "processing",
              stage: "downloading_audio",
              progress: 25,
              message: "جاري جلب المقطع وفحص الوسائط...",
            }),
          } as Response;
        }

        if (callCount === 2) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              jobId: "job-abc",
              status: "processing",
              stage: "analyzing_audio",
              progress: 60,
              message: "جاري استخراج الآيات والأحاديث...",
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            jobId: "job-abc",
            status: "completed",
            stage: "completed",
            progress: 100,
            message: "تم التحقق بنجاح",
            result: {
              status: "candidates",
              mediaType: "video",
              results: [],
            },
          }),
        } as Response;
      }) as any;

      const finalStatus = await pollUrlJob(
        "job-abc",
        (status) => {
          stageUpdates.push(status.stage);
        },
        10, // fast poll for test
        1000
      );

      assert.equal(finalStatus.status, "completed");
      assert.deepEqual(stageUpdates, ["downloading_audio", "analyzing_audio", "completed"]);
      assert.equal(callCount, 3);
    });

    it("throws ApiError when job status returns failed", async () => {
      globalThis.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jobId: "job-fail",
            status: "failed",
            stage: "failed",
            progress: 100,
            message: "المقطع طويل جداً (الحد الأقصى 10 دقائق).",
            error: {
              code: "media_too_long",
              message: "المقطع طويل جداً (الحد الأقصى 10 دقائق).",
            },
          }),
        } as Response;
      }) as any;

      await assert.rejects(
        () => pollUrlJob("job-fail", undefined, 10, 500),
        (err: any) => {
          assert.equal(err.code, "media_too_long");
          assert.equal(err.message, "المقطع طويل جداً (الحد الأقصى 10 دقائق).");
          return true;
        }
      );
    });
  });
});

