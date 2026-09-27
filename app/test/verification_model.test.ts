import { it } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reducer,
  presentHadith,
  presentMedia,
} from "../src/features/verification/model";
import { HadithSearchResponse, MediaExtractResponse } from "../src/api/types";
it("changing Quran/Hadith atomically clears the old text, results and specialized mode", () => {
  const next = reducer(
    {
      ...initialState,
      query: "old hadith",
      mode: "specialist",
      busy: true,
      target: "hadith",
      error: "old",
    },
    { type: "context", target: "quran" },
  );
  assert.equal(next.query, "");
  assert.equal(next.busy, false);
  assert.equal(next.mode, "normal");
  assert.equal(next.error, "");
  assert.equal(next.target, "quran");
});
it("method changes keep the draft while invalidating old results", () => {
  const next = reducer(
    { ...initialState, query: "words", searched: true },
    { type: "mode", mode: "meaning" },
  );
  assert.equal(next.query, "words");
  assert.equal(next.searched, false);
});
it("a new request preserves previous entries until its actual response arrives", () => {
  const entries = [
    {
      id: "x",
      kind: "hadith" as const,
      text: "previous",
      source: "source",
      records: [],
    },
  ];
  const working = reducer(
    { ...initialState, query: "next", entries },
    { type: "begin", label: "searching", time: 100 },
  );
  assert.equal(working.entries, entries);
  assert.equal(working.query, "next");
  assert.equal(working.busy, true);
  const cancelled = reducer(working, { type: "cancel", time: 101 });
  assert.equal(cancelled.entries, entries);
  assert.equal(cancelled.cancelled, true);
});
it("simple presentation honors the server-selected text and preserves every scholarly record", () => {
  const a = {
    text: "chosen",
    narrator: null,
    scholar: "A",
    book: null,
    reference: null,
    grade: "حسن",
    gradeExplanation: null,
  };
  const b = { ...a, scholar: "B", grade: "ضعيف" };
  const res = {
    results: [{ ...a, text: "unselected" }],
    simplePresentation: {
      selected: { text: "chosen", records: [a, b] },
      alternates: [{}],
    },
    selectedMixedCategories: true,
    complete: false,
  } as HadithSearchResponse;
  const p = presentHadith(res, "normal");
  assert.equal(p.entries.length, 1);
  assert.equal(p.entries[0].text, "chosen");
  assert.equal(p.entries[0].records.length, 2);
  assert.equal(p.entries[0].mixed, true);
  assert.match(p.message, /غير مكتملة|لا تكون مكتملة/);
  assert.equal(p.specialistAvailable, true);
});
it("media presentation keeps verified full source text and all records, and flags partial processing", () => {
  const res = {
    status: "candidates",
    partialProcessing: true,
    results: [
      {
        type: "hadith",
        verified: true,
        displayText: "source text",
        extractedText: "OCR typo",
        source: { name: "dorar" },
        records: [{ grade: "صحيح" }, { grade: "حسن" }],
      },
      { type: "hadith", verified: false, displayText: "unverified" },
    ],
  } as unknown as MediaExtractResponse;
  const p = presentMedia(res);
  assert.equal(p.entries.length, 1);
  assert.equal(p.entries[0].text, "source text");
  assert.equal(p.entries[0].records.length, 2);
  assert.equal(p.entries[0].candidate, true);
  assert.match(p.message, /جزء/);
});
it("unavailable extraction is an error, not an empty successful verdict", () => {
  assert.throws(
    () =>
      presentMedia({
        status: "temporarily_unavailable",
        results: [],
        message: "offline",
      }),
    /offline/,
  );
});

it("attaches mode to SourceEntry and preserves mode in specialist search", () => {
  const res = {
    results: [
      {
        text: "متن الحديث",
        narrator: "راو",
        scholar: "عالم",
        book: "كتاب",
        reference: "1/1",
        grade: "صحيح",
        degreeCategories: [1],
      },
    ],
  } as HadithSearchResponse;
  const p = presentHadith(res, "specialist");
  assert.equal(p.entries[0].mode, "specialist");
  assert.equal(p.entries[0].mixed, false);
});

it("flags mixed conflicting judgments in specialist mode when grades span accepted and weak", () => {
  const res = {
    results: [
      {
        text: "متن الحديث",
        narrator: "راو 1",
        scholar: "عالم 1",
        book: "كتاب 1",
        reference: "1/1",
        grade: "صحيح",
        degreeCategories: [1], // accepted
      },
      {
        text: "متن الحديث",
        narrator: "راو 2",
        scholar: "عالم 2",
        book: "كتاب 2",
        reference: "1/2",
        grade: "ضعيف",
        degreeCategories: [3], // weak
      },
    ],
  } as HadithSearchResponse;
  const p = presentHadith(res, "specialist");
  assert.equal(p.entries[0].mixed, true);
});

it("reducer tracks requestMode and commits resultMode on done", () => {
  const start = reducer(
    { ...initialState, mode: "specialist" },
    { type: "begin", label: "جاري البحث", time: 100, mode: "specialist" },
  );
  assert.equal(start.busy, true);
  assert.equal(start.resultMode, null);

  const finished = reducer(start, {
    type: "done",
    result: {
      entries: [
        {
          id: "1",
          kind: "hadith",
          text: "حديث",
          source: "درر",
          records: [],
          mode: "specialist",
        },
      ],
      message: "",
      suggestions: [],
      specialistAvailable: false,
    },
    time: 200,
    resultMode: "specialist",
  });
  assert.equal(finished.busy, false);
  assert.equal(finished.resultMode, "specialist");
  assert.equal(finished.entries[0].mode, "specialist");
});

