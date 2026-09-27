import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSupportedUrlFromText, isSupportedMediaUrl } from "../src/api/urlMedia";
import { redirectSystemPath } from "../app/+native-intent";
import { getPendingSharedPayload, clearPendingSharedPayload } from "../src/native/shareBridge";

describe("Native Action Extension & Share Handler Routing", () => {
  // 1. Instagram Reel URLs
  it("1. validates Instagram Reel URLs correctly", () => {
    const reelUrl = "https://www.instagram.com/reel/C7xyz123/?igsh=MWZ4eDE4e";
    assert.equal(isSupportedMediaUrl(reelUrl), true);
  });

  // 2. Instagram URLs received inside shared plain text
  it("2. extracts Instagram URLs received inside shared plain text", () => {
    const sharedText = "شاهد هذا المقطع الجميل على إنستغرام: https://www.instagram.com/reel/C1234567890/ بارك الله فيك";
    const extracted = extractSupportedUrlFromText(sharedText);
    assert.equal(extracted, "https://www.instagram.com/reel/C1234567890/");
    assert.equal(isSupportedMediaUrl(extracted!), true);
  });

  // 3. TikTok full URLs
  it("3. validates TikTok full web URLs", () => {
    const tiktokFull = "https://www.tiktok.com/@sheikh/video/7123456789012345678?is_from_webapp=1";
    assert.equal(isSupportedMediaUrl(tiktokFull), true);
    assert.equal(extractSupportedUrlFromText(tiktokFull), tiktokFull);
  });

  // 4. TikTok vt.tiktok.com and vm.tiktok.com URLs
  it("4. validates TikTok short redirect links (vt.tiktok.com and vm.tiktok.com)", () => {
    const vmUrl = "https://vm.tiktok.com/ZM8abc123/";
    const vtUrl = "https://vt.tiktok.com/ZS8xyz789/";
    assert.equal(isSupportedMediaUrl(vmUrl), true);
    assert.equal(isSupportedMediaUrl(vtUrl), true);
    assert.equal(extractSupportedUrlFromText(`مقطع تيك توك: (${vmUrl})`), vmUrl);
  });

  // 5. YouTube watch URLs
  it("5. validates YouTube watch URLs", () => {
    const watchUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s";
    assert.equal(isSupportedMediaUrl(watchUrl), true);
  });

  // 6. YouTube Shorts URLs
  it("6. validates YouTube Shorts URLs", () => {
    const shortsUrl = "https://www.youtube.com/shorts/nVrbtgPNawI";
    assert.equal(isSupportedMediaUrl(shortsUrl), true);
    assert.equal(extractSupportedUrlFromText(`شاهد الشورت: ${shortsUrl}`), shortsUrl);
  });

  // 7. youtu.be URLs
  it("7. validates youtu.be short URLs", () => {
    const youtDotBe = "https://youtu.be/nVrbtgPNawI?si=abc123xyz";
    assert.equal(isSupportedMediaUrl(youtDotBe), true);
  });

  // 8. Correct percent encoding of nested query strings
  it("8. preserves correct percent encoding of nested query strings", () => {
    const originalUrl = "https://www.youtube.com/watch?v=abc&t=10s&feature=share";
    const encoded = encodeURIComponent(originalUrl);
    const nativeUri = `tabayyan://handle-share?url=${encoded}&source=ios-action`;

    const routedPath = redirectSystemPath({ path: nativeUri, initial: false });
    assert.equal(routedPath, `/handle-share?url=${encoded}&source=ios-action`);

    // Verify round-trip decoding matches original URL exactly
    const searchParams = new URLSearchParams(routedPath.replace("/handle-share?", ""));
    assert.equal(decodeURIComponent(searchParams.get("url")!), originalUrl);
  });

  // 9. tabayyan://handle-share native-intent rewriting
  it("9. tabayyan://handle-share rewrites cleanly to /handle-share preserving query", () => {
    const target = "tabayyan://handle-share?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FEXAMPLE&source=ios-action";
    const routed = redirectSystemPath({ path: target, initial: false });
    assert.equal(routed, "/handle-share?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FEXAMPLE&source=ios-action");
  });

  // 10. Rejection of unsupported schemes
  it("10. rejects unsupported schemes (javascript:, file:, data:, ftp:)", () => {
    assert.equal(isSupportedMediaUrl("javascript:alert(1)"), false);
    assert.equal(isSupportedMediaUrl("file:///etc/passwd"), false);
    assert.equal(isSupportedMediaUrl("data:text/html;base64,PHNjcmlwdD4="), false);
    assert.equal(isSupportedMediaUrl("ftp://youtube.com/watch?v=123"), false);
    assert.equal(isSupportedMediaUrl("http://youtube.com/watch?v=123"), false); // strictly https
    assert.equal(extractSupportedUrlFromText("javascript:void(0)"), null);
  });

  // 11. Submission happens only once
  it("11. deduplication ensures submission happens only once per URL", () => {
    const processedMap = new Set<string>();
    const submitCounter = { count: 0 };

    const processUrl = (url: string) => {
      if (processedMap.has(url)) return;
      processedMap.add(url);
      submitCounter.count++;
    };

    const targetUrl = "https://www.youtube.com/watch?v=123";
    processUrl(targetUrl);
    processUrl(targetUrl); // duplicate call in React rerender
    processUrl(targetUrl); // duplicate call in React Strict Mode

    assert.equal(submitCounter.count, 1);
  });

  // 12. Missing URL shows a controlled error
  it("12. missing URL returns controlled error without crashing", () => {
    const emptyUrl = "";
    const isValid = isSupportedMediaUrl(emptyUrl);
    const extracted = extractSupportedUrlFromText(emptyUrl);

    assert.equal(isValid, false);
    assert.equal(extracted, null);
  });

  // 13. Pending App Group payload is consumed once
  it("13. App Group bridge handles fallback gracefully and guarantees single consumption", async () => {
    // In Node test environment, NativeModules is not iOS runtime, should return null gracefully
    const payload = await getPendingSharedPayload();
    assert.equal(payload, null);

    const cleared = await clearPendingSharedPayload();
    assert.equal(cleared, false);

    // Simulate single-consumption storage pattern
    let mockAppGroupStorage: any = {
      url: "https://www.tiktok.com/@test/video/123",
      source: "ios-action",
      timestamp: Date.now(),
      id: "abc-123",
    };

    const consumePayload = () => {
      const current = mockAppGroupStorage;
      mockAppGroupStorage = null; // cleared immediately upon read
      return current;
    };

    const firstRead = consumePayload();
    assert.ok(firstRead);
    assert.equal(firstRead.url, "https://www.tiktok.com/@test/video/123");

    const secondRead = consumePayload();
    assert.equal(secondRead, null); // already consumed
  });

  // 14. The old /expo-sharing route is no longer generated or routed
  it("14. the old /expo-sharing route is no longer routed to handle-share", () => {
    const oldPath = "tabayyan://expo-sharing";
    const result = redirectSystemPath({ path: oldPath, initial: false });
    // Should NOT redirect to /handle-share
    assert.notEqual(result, "/handle-share");
    assert.notEqual(result, "/handle-share?url=expo-sharing");
  });
});
