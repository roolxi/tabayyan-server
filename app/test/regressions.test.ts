import { it } from "node:test";
import assert from "node:assert/strict";
import { LatestRequest } from "../src/utils/latestRequest";
import { extractSupportedUrlFromText, isSupportedMediaUrl } from "../src/api/urlMedia";
import { redirectSystemPath } from "../app/+native-intent";
import { requestJson } from "../src/api/client";

it("a superseded search cannot publish a late result", () => {
  const requests = new LatestRequest();
  const old = requests.begin();
  const current = requests.begin();
  assert.equal(old.signal.aborted, true);
  assert.equal(requests.isCurrent(old), false);
  assert.equal(requests.isCurrent(current), true);
  requests.cancel();
  assert.equal(requests.isCurrent(current), false);
});

it("URL extraction does not turn lookalike domains into allowed links", () => {
  for (const input of ["https://evil-youtube.com/watch?v=x", "https://youtube.com.evil.test/x",
    "https://evil.test/youtube.com/watch?v=x", "ftp://youtube.com/watch?v=x"]) {
    assert.equal(extractSupportedUrlFromText(input), null);
  }
  assert.equal(isSupportedMediaUrl("https://user:password@youtube.com/watch?v=x"), false);
  assert.equal(extractSupportedUrlFromText("شاهد https://instagr.am/reel/abc/"), "https://instagr.am/reel/abc/");
});

it("nested percent escapes and ampersands survive exactly one decode", () => {
  const url = "https://www.youtube.com/watch?v=abc&list=a%26b&label=x%2520y";
  const result = redirectSystemPath({ path: "tabayyan://handle-share?url=" + encodeURIComponent(url), initial: true });
  assert.equal(new URLSearchParams(result.split("?")[1]).get("url"), url);
  assert.equal(redirectSystemPath({ path: "/about?q=handle-share", initial: false }), "/about?q=handle-share");
});

it("an already cancelled JSON request never contacts the server", async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = "https://example.test";
  const controller = new AbortController();
  controller.abort();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not run"); };
  try {
    await assert.rejects(requestJson("/api/test", { signal: controller.signal }), (err: any) => err.code === "cancelled");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

it("searchHadith correctly dispatches mode specialist", async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = "https://example.test";
  const { searchHadith } = await import("../src/api/hadith");
  const original = globalThis.fetch;
  let capturedBody: any = null;
  globalThis.fetch = async (_url: any, init: any) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      query: "test",
      found: true,
      mode: "specialist",
      source: "Dorar",
      sourceUrl: null,
      resultsCount: 1,
      specialistAvailable: false,
      results: [
        {
          text: "حديث تجريبي",
          narrator: "راوٍ",
          scholar: "محدث",
          book: "كتاب",
          reference: "1/1",
          grade: "صحيح",
          gradeExplanation: "إسناده صحيح على شرط مسلم",
          takhrij: "أخرجه البخاري ومسلم",
        }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const res = await searchHadith("حديث تجريبي", "specialist");
    assert.equal(capturedBody.mode, "specialist");
    assert.equal(res.mode, "specialist");
    assert.equal(res.results[0].takhrij, "أخرجه البخاري ومسلم");
  } finally {
    globalThis.fetch = original;
  }
});

