import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appJsContent = fs.readFileSync(path.join(rootDir, "web", "app.js"), "utf-8");

class MockElement {
  constructor(tagName) {
    this.tagName = tagName ? tagName.toUpperCase() : "DIV";
    this.children = [];
    this.attributes = {};
    this.style = {};
    this._textContent = "";
    this._listeners = {};
    this.className = "";
    this.id = "";
    this.name = "";
    this.type = "";
    this.value = "";
    this.disabled = false;
    this.parentElement = null;
    this.files = [];
    this.href = "";
    this.classList = {
      _classes: new Set(),
      add: (...cls) => {
        cls.forEach(c => this.classList._classes.add(c));
        this.className = Array.from(this.classList._classes).join(" ");
      },
      remove: (...cls) => {
        cls.forEach(c => this.classList._classes.delete(c));
        this.className = Array.from(this.classList._classes).join(" ");
      },
      contains: (c) => this.classList._classes.has(c),
    };
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map(c => (typeof c === "string" ? c : c.textContent)).join("");
  }

  set textContent(val) {
    this.children = [];
    this._textContent = String(val);
  }

  append(...items) {
    for (const item of items) {
      if (typeof item === "string") {
        this.children.push(item);
      } else if (item instanceof MockElement) {
        item.parentElement = this;
        this.children.push(item);
      } else if (item && item.nodeType === 3) {
        this.children.push(item.textContent);
      }
    }
  }

  replaceChildren(...items) {
    this.children.forEach(c => {
      if (c instanceof MockElement) c.parentElement = null;
    });
    this.children = [];
    this._textContent = "";
    this.append(...items);
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === "href") this.href = String(val);
  }

  getAttribute(name) {
    if (name === "href") return this.href;
    return this.attributes[name] || null;
  }

  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  async dispatchEvent(event) {
    const listeners = this._listeners[event.type] || [];
    for (const fn of listeners) {
      await fn(event);
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matched = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (!(child instanceof MockElement)) continue;
        if (matches(child, selector)) matched.push(child);
        walk(child);
      }
    };
    walk(this);
    return matched;
  }

  focus() {}
}

function matches(el, selector) {
  const parts = selector.trim().split(/\s+/);
  const target = parts[parts.length - 1];
  let [tag, ...classes] = target.split(".");
  let id = null;
  if (tag.includes("#")) {
    const [t, i] = tag.split("#");
    tag = t;
    id = i;
  }
  if (tag && tag.toUpperCase() !== el.tagName) return false;
  if (id && el.id !== id) return false;
  for (const c of classes) {
    if (!el.classList.contains(c) && !el.className.split(/\s+/).includes(c)) return false;
  }
  return true;
}

class MockFormData {
  constructor() {
    this.entries = [];
  }
  append(key, val) {
    this.entries.push([key, val]);
  }
  get(key) {
    const found = this.entries.find(e => e[0] === key);
    return found ? found[1] : null;
  }
}

class MockAbortController {
  constructor() {
    this.signal = { aborted: false };
  }
  abort() {
    this.signal.aborted = true;
  }
}

function createMediaAppEnv(mockFetch) {
  const elements = {
    form: new MockElement("FORM"),
    fileInput: new MockElement("INPUT"),
    submitButton: new MockElement("BUTTON"),
    fileInfo: new MockElement("P"),
    statusEl: new MockElement("DIV"),
    resultsEl: new MockElement("SECTION"),
  };

  elements.form.id = "media-upload-form";
  elements.fileInput.id = "media-file-input";
  elements.fileInput.type = "file";
  elements.submitButton.id = "media-submit-button";
  elements.submitButton.type = "submit";
  elements.submitButton.disabled = true;
  elements.fileInfo.id = "selected-file-info";
  elements.statusEl.id = "media-status";
  elements.resultsEl.id = "media-results";

  const root = new MockElement("BODY");
  root.append(
    elements.form,
    elements.statusEl,
    elements.resultsEl
  );
  elements.form.append(
    elements.fileInput,
    elements.fileInfo,
    elements.submitButton
  );

  const documentMock = {
    querySelector: (sel) => {
      if (sel === "#media-upload-form") return elements.form;
      if (sel === "#media-file-input") return elements.fileInput;
      if (sel === "#media-submit-button") return elements.submitButton;
      if (sel === "#selected-file-info") return elements.fileInfo;
      if (sel === "#media-status") return elements.statusEl;
      if (sel === "#media-results") return elements.resultsEl;
      return root.querySelector(sel);
    },
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    createElement: (tag) => new MockElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  };

  const windowMock = {
    location: { search: "" },
  };

  const context = {
    document: documentMock,
    window: windowMock,
    fetch: mockFetch,
    FormData: MockFormData,
    AbortController: MockAbortController,
    console,
    URL,
    encodeURIComponent,
  };

  const fn = new Function(...Object.keys(context), appJsContent);
  fn(...Object.values(context));

  return { elements, root, documentMock };
}

// 1. File selection
async function test1_fileSelection() {
  const { elements } = createMediaAppEnv(async () => {});
  assert.strictEqual(elements.submitButton.disabled, true);

  // Select an image file
  elements.fileInput.files = [{ name: "verse.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });

  assert.strictEqual(elements.submitButton.disabled, false);
  assert.ok(elements.fileInfo.textContent.includes("verse.jpg"));
  assert.ok(elements.fileInfo.textContent.includes("صورة"));

  // Select a video file
  elements.fileInput.files = [{ name: "recitation.mp4", type: "video/mp4" }];
  await elements.fileInput.dispatchEvent({ type: "change" });

  assert.strictEqual(elements.submitButton.disabled, false);
  assert.ok(elements.fileInfo.textContent.includes("recitation.mp4"));
  assert.ok(elements.fileInfo.textContent.includes("فيديو"));

  console.log("PASS: 1. File selection");
}

// 2. Image and video loading messages
async function test2_loadingMessages() {
  let loadingMsgSeen = "";
  const mockFetch = async () => {
    // When fetch is called, status message must already be set
    loadingMsgSeen = currentStatus;
    return {
      ok: true,
      json: async () => ({ status: "not_found", results: [] }),
    };
  };

  let currentStatus = "";
  const { elements } = createMediaAppEnv(async () => {
    loadingMsgSeen = elements.statusEl.textContent;
    return {
      ok: true,
      json: async () => ({ status: "not_found", results: [] }),
    };
  });

  // Image submission
  elements.fileInput.files = [{ name: "photo.png", type: "image/png" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  assert.strictEqual(loadingMsgSeen, "جارٍ قراءة الصورة والتحقق من النص...");

  // Video submission
  elements.fileInput.files = [{ name: "clip.mp4", type: "video/mp4" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  assert.strictEqual(loadingMsgSeen, "جارٍ استخراج الصوت والتحقق من النص...");

  console.log("PASS: 2. Image and video loading messages");
}

// 3. Duplicate-submit prevention
async function test3_duplicateSubmitPrevention() {
  let fetchCallCount = 0;
  let resolveFetch;
  const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });

  const mockFetch = async () => {
    fetchCallCount++;
    await fetchPromise;
    return {
      ok: true,
      json: async () => ({ status: "not_found", results: [] }),
    };
  };

  const { elements } = createMediaAppEnv(mockFetch);
  elements.fileInput.files = [{ name: "photo.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });

  // First submit begins async fetch
  const submit1 = elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  assert.strictEqual(elements.submitButton.disabled, true);

  // Second submit while first is active must be ignored
  const submit2 = elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });

  assert.strictEqual(fetchCallCount, 1);
  resolveFetch();
  await submit1;
  await submit2;
  assert.strictEqual(fetchCallCount, 1);

  console.log("PASS: 3. Duplicate-submit prevention");
}

// 4. Rendering the static 'هل تقصد هذا النص؟' heading
async function test4_renderStaticHeading() {
  const candidatesPayload = {
    status: "candidates",
    mediaType: "image",
    results: [
      {
        type: "quran",
        verified: true,
        extractedText: "قل هو الله احد",
        displayText: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        source: { name: "Tanzil Project", verseKey: "112:1", surahName: "الإخلاص", ayah: 1 },
      }
    ],
  };

  const { elements, root } = createMediaAppEnv(async () => ({
    ok: true,
    json: async () => candidatesPayload,
  }));

  elements.fileInput.files = [{ name: "ayah.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });

  const heading = root.querySelector(".confirmation-heading");
  assert.ok(heading, "Heading .confirmation-heading must exist");
  assert.strictEqual(heading.textContent, "هل تقصد هذا النص؟");

  const disclaimer = root.querySelector(".media-disclaimer");
  assert.ok(disclaimer, "Disclaimer must exist");
  assert.ok(disclaimer.textContent.includes("يُستخدم الذكاء الاصطناعي لاستخراج عبارة البحث فقط"));

  console.log("PASS: 4. Rendering the static confirmation heading");
}

// 5. Safe Quran card rendering
async function test5_safeQuranCardRendering() {
  const candidatesPayload = {
    status: "candidates",
    mediaType: "image",
    results: [
      {
        type: "quran",
        verified: true,
        extractedText: "فان مع العسر يسرا",
        displayText: "فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا",
        source: { name: "Tanzil Project", verseKey: "94:5", surahName: "الشرح", ayah: 5 },
      }
    ],
  };

  const { elements, root } = createMediaAppEnv(async () => ({
    ok: true,
    json: async () => candidatesPayload,
  }));

  elements.fileInput.files = [{ name: "ayah.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });

  const card = root.querySelector(".confirmation-card");
  assert.ok(card);
  const kicker = card.querySelector(".result-kicker");
  assert.strictEqual(kicker.textContent, "القرآن الكريم");
  const text = card.querySelector(".verse-text");
  assert.strictEqual(text.textContent, "فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا");
  const meta = card.querySelector(".verse-meta");
  assert.ok(meta.textContent.includes("الشرح"));
  assert.ok(meta.textContent.includes("الآية 5"));
  assert.ok(meta.textContent.includes("Tanzil Project"));

  console.log("PASS: 5. Safe Quran card rendering");
}

// 6. Safe Hadith card rendering
async function test6_safeHadithCardRendering() {
  const candidatesPayload = {
    status: "candidates",
    mediaType: "video",
    results: [
      {
        type: "hadith",
        verified: true,
        extractedText: "الاعمال بالنيات",
        displayText: "إنما الأعمال بالنيات",
        mixedCategories: true,
        source: { name: "الدرر السنية", url: "https://dorar.net/hadith/search?q=test" },
        records: [
          {
            narrator: "عمر بن الخطاب",
            scholar: "البخاري",
            book: "صحيح البخاري",
            reference: "1",
            grade: "صحيح",
          }
        ],
      }
    ],
  };

  const { elements, root } = createMediaAppEnv(async () => ({
    ok: true,
    json: async () => candidatesPayload,
  }));

  elements.fileInput.files = [{ name: "hadith.mp4", type: "video/mp4" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });

  const card = root.querySelector(".confirmation-card");
  assert.ok(card);
  const kicker = card.querySelector(".result-kicker");
  assert.strictEqual(kicker.textContent, "الحديث الشريف");
  const text = card.querySelector(".hadith-text");
  assert.strictEqual(text.textContent, "إنما الأعمال بالنيات");

  // Verify mixed-category disclaimer within card
  const mixedNotice = card.querySelector(".mixed-disclaimer");
  assert.ok(mixedNotice, "Hadith card with mixedCategories must render mixed-disclaimer notice");

  // Verify source link
  const source = card.querySelector(".record-source");
  assert.ok(source);
  assert.strictEqual(source.getAttribute("href"), "https://dorar.net/hadith/search?q=test");

  console.log("PASS: 6. Safe Hadith card rendering");
}

// 7. Empty and error states
async function test7_emptyAndErrorStates() {
  // Empty state
  const { elements: elEmpty } = createMediaAppEnv(async () => ({
    ok: true,
    json: async () => ({ status: "not_found", results: [] }),
  }));
  elEmpty.fileInput.files = [{ name: "none.jpg", type: "image/jpeg" }];
  await elEmpty.fileInput.dispatchEvent({ type: "change" });
  await elEmpty.form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  assert.strictEqual(elEmpty.statusEl.textContent, "لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى.");
  assert.ok(elEmpty.statusEl.className.includes("empty"));

  // Error state (e.g. 422 Invalid Image)
  const { elements: elError } = createMediaAppEnv(async () => ({
    ok: false,
    json: async () => ({ code: "invalid_image", message: "الملف المرفوع ليس صورة صالحة أو تالف." }),
  }));
  elError.fileInput.files = [{ name: "corrupt.jpg", type: "image/jpeg" }];
  await elError.fileInput.dispatchEvent({ type: "change" });
  await elError.form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  assert.strictEqual(elError.statusEl.textContent, "الملف المرفوع ليس صورة صالحة أو تالف.");
  assert.ok(elError.statusEl.className.includes("error"));

  console.log("PASS: 7. Empty and error states");
}

// 8. Clearing stale results after file change
async function test8_clearingStaleResults() {
  const { elements, root } = createMediaAppEnv(async () => ({
    ok: true,
    json: async () => ({
      status: "candidates",
      results: [{ type: "quran", displayText: "آية", source: {} }],
    }),
  }));

  elements.fileInput.files = [{ name: "first.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });

  assert.ok(root.querySelector(".confirmation-card"), "Results card must exist");

  // User changes file to second file
  elements.fileInput.files = [{ name: "second.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });

  assert.strictEqual(elements.resultsEl.children.length, 0, "Stale results must be cleared on file change");
  assert.strictEqual(elements.statusEl.textContent, "", "Status must be cleared on file change");

  console.log("PASS: 8. Clearing stale results after file change");
}

// 9. No use of model-generated messages
async function test9_noModelGeneratedMessages() {
  // If model response erroneously sent custom greeting/grade
  const untrustedPayload = {
    status: "candidates",
    message: "Untrusted Model Prose",
    results: [
      {
        type: "quran",
        displayText: "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا",
        untrustedField: "Do Not Display",
        source: { name: "Tanzil Project", verseKey: "94:6", surahName: "الشرح", ayah: 6 },
      }
    ],
  };

  const { elements, root } = createMediaAppEnv(async () => ({
    ok: true,
    json: async () => untrustedPayload,
  }));

  elements.fileInput.files = [{ name: "photo.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });

  assert.ok(!root.textContent.includes("Untrusted Model Prose"), "Model message must never be rendered");
  assert.ok(!root.textContent.includes("Do Not Display"));
  assert.ok(root.textContent.includes("هل تقصد هذا النص؟"), "Frontend static heading must be rendered");

  console.log("PASS: 9. No use of model-generated messages");
}

// 10. Correct continuation links
async function test10_continuationLinks() {
  const candidatesPayload = {
    status: "candidates",
    results: [
      {
        type: "quran",
        extractedText: "قل هو الله احد",
        displayText: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        source: { name: "Tanzil Project", verseKey: "112:1", surahName: "الإخلاص", ayah: 1 },
      },
      {
        type: "hadith",
        extractedText: "الاعمال بالنيات",
        displayText: "إنما الأعمال بالنيات",
        source: { name: "الدرر السنية", url: "https://dorar.net" },
        records: [],
      }
    ],
  };

  const { elements, root } = createMediaAppEnv(async () => ({
    ok: true,
    json: async () => candidatesPayload,
  }));

  elements.fileInput.files = [{ name: "both.jpg", type: "image/jpeg" }];
  await elements.fileInput.dispatchEvent({ type: "change" });
  await elements.form.dispatchEvent({ type: "submit", preventDefault: () => {} });

  const links = root.querySelectorAll("a.continue-link");
  assert.strictEqual(links.length, 2);

  assert.strictEqual(
    links[0].getAttribute("href"),
    "/quran?q=" + encodeURIComponent("قل هو الله احد")
  );
  assert.strictEqual(links[0].textContent, "متابعة البحث في القرآن الكريم");

  assert.strictEqual(
    links[1].getAttribute("href"),
    "/hadith?q=" + encodeURIComponent("الاعمال بالنيات")
  );
  assert.strictEqual(links[1].textContent, "متابعة البحث في الحديث الشريف");

  console.log("PASS: 10. Correct continuation links");
}

async function runAll() {
  await test1_fileSelection();
  await test2_loadingMessages();
  await test3_duplicateSubmitPrevention();
  await test4_renderStaticHeading();
  await test5_safeQuranCardRendering();
  await test6_safeHadithCardRendering();
  await test7_emptyAndErrorStates();
  await test8_clearingStaleResults();
  await test9_noModelGeneratedMessages();
  await test10_continuationLinks();
  console.log("\nALL 10 FRONTEND MEDIA TESTS PASSED SUCCESSFULLY!");
}

runAll().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});

