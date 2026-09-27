// ISOLATED VISUAL QA ENTRY. Never imported by expo-router/entry or the native app.
import React from "react";
import { registerRootComponent } from "expo";
import { ExpoRoot } from "expo-router";
const context = require.context("../app", true, /\.[jt]sx?$/);
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes("/api/")) return realFetch(input, init);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 2200);
    init?.signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if (body.text?.includes("خطأ"))
    return response(
      { message: "هذه رسالة خطأ تجريبية لاختبار إعادة المحاولة." },
      503,
    );
  if (url.includes("/quran/search"))
    return response({
      query: body.text,
      found: true,
      matchType: "normalized_phrase",
      source: { name: "بيانات اختبار", url: "https://quran.com/94/5" },
      results: [
        {
          verse_key: "94:5",
          surah: 94,
          ayah: 5,
          surah_name: "الشرح",
          text_uthmani: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
        },
      ],
    });
  if (url.includes("meaning-search") || url.includes("/suggest"))
    return response({
      status: "candidates",
      candidates: url.includes("meaning-search")
        ? [{ id: "1", text: "إنما الأعمال بالنيات" }]
        : ["فإن مع العسر يسرا"],
      message: "نتيجة اختبار للواجهة فقط.",
    });
  const record = {
    text: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى.",
    narrator: "عمر بن الخطاب",
    scholar: "البخاري",
    book: "صحيح البخاري",
    reference: "1",
    grade: "صحيح",
    gradeExplanation: "بيانات عرض تجريبية — ليست استجابة من الخادم.",
    takhrij: "مثال لتفاصيل التخريج في الواجهة.",
    sourceUrl: "https://dorar.net",
  };
  return response({
    query: body.text,
    found: !body.text?.includes("فارغ"),
    mode: body.mode,
    source: "بيانات اختبار الواجهة",
    sourceUrl: "https://dorar.net",
    results: body.text?.includes("فارغ") ? [] : [record],
    specialistAvailable: true,
    complete: true,
  });
};
function Preview() {
  return (
    <ExpoRoot context={context} location="/" linking={{ enabled: false }} />
  );
}
registerRootComponent(Preview);
