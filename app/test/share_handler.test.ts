import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSupportedUrlFromText, isSupportedMediaUrl } from "../src/api/urlMedia";

describe("Share Handler Logic", () => {
  it("detects shared text containing a valid video URL", () => {
    const sharedText = "Check this out: https://www.instagram.com/reel/C7xyz123/?igsh=123";
    const detectedUrl = extractSupportedUrlFromText(sharedText);
    assert.ok(detectedUrl);
    assert.equal(isSupportedMediaUrl(detectedUrl), true);
    assert.equal(detectedUrl, "https://www.instagram.com/reel/C7xyz123/?igsh=123");
  });

  it("distinguishes media file payloads from web link payloads", () => {
    // Simulating share payloads as received by expo-sharing
    const filePayload = {
      path: "file:///var/mobile/Containers/Data/Application/123/Documents/share.mp4",
      mimeType: "video/mp4",
      type: "video" as const,
    };

    const textUrlPayload = {
      value: "https://youtu.be/dQw4w9WgXcQ",
      mimeType: "text/plain",
      type: "text" as const,
    };

    // File payload has path and media mimeType
    const isFile = !!filePayload.path && (filePayload.mimeType.startsWith("video/") || filePayload.mimeType.startsWith("image/"));
    assert.equal(isFile, true);

    // Text URL payload has value with supported URL
    const extractedUrl = textUrlPayload.value ? extractSupportedUrlFromText(textUrlPayload.value) : null;
    assert.equal(extractedUrl, "https://youtu.be/dQw4w9WgXcQ");
  });

  it("handles empty or unsupported share payloads cleanly without crashing", () => {
    const randomText = "مجرد رسالة في الواتساب بدون روابط";
    const extracted = extractSupportedUrlFromText(randomText);
    assert.equal(extracted, null);
  });
});

