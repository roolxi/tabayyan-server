import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const hadithJsContent = fs.readFileSync(path.join(rootDir, "web", "hadith.js"), "utf-8");
const quranJsContent = fs.readFileSync(path.join(rootDir, "web", "quran.js"), "utf-8");

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
      toggle: (c) => {
        const has = this.classList._classes.has(c);
        if (has) this.classList._classes.delete(c);
        else this.classList._classes.add(c);
        this.className = Array.from(this.classList._classes).join(" ");
        return !has;
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

  prepend(...items) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (typeof item === "string") {
        this.children.unshift(item);
      } else if (item instanceof MockElement) {
        item.parentElement = this;
        this.children.unshift(item);
      } else if (item && item.nodeType === 3) {
        this.children.unshift(item.textContent);
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

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const listeners = this._listeners[event.type] || [];
    for (const fn of listeners) fn(event);
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
  if (target.includes("[name=")) {
    const m = target.match(/\[name="?([^"\]]+)"?\]/);
    if (m && el.name === m[1]) return true;
  }
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
    if (!el.className.split(/\s+/).includes(c)) return false;
  }
  return true;
}

function createHadithEnv(fetchMock, initialMode = "simple") {
  const document = {
    createElement(tag) { return new MockElement(tag); },
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    querySelector(sel) {
      if (sel === "#hadith-search-form") return form;
      if (sel === "#hadith-search-input") return input;
      if (sel === "#hadith-search-button") return button;
      if (sel === "#hadith-suggest-button") return suggestButton;
      if (sel === "#hadith-status") return status;
      if (sel === "#hadith-results") return results;
      return body.querySelector(sel);
    },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
  };

  const body = new MockElement("BODY");
  const form = new MockElement("FORM");
  form.id = "hadith-search-form";
  const input = new MockElement("INPUT");
  input.id = "hadith-search-input";
  input.name = "text";
  const button = new MockElement("BUTTON");
  button.id = "hadith-search-button";
  button.type = "submit";
  const suggestButton = new MockElement("BUTTON");
  suggestButton.id = "hadith-suggest-button";
  suggestButton.type = "button";
  const modeSimple = new MockElement("INPUT");
  modeSimple.name = "mode";
  modeSimple.type = "radio";
  modeSimple.value = "simple";
  const modeSpecialist = new MockElement("INPUT");
  modeSpecialist.name = "mode";
  modeSpecialist.type = "radio";
  modeSpecialist.value = "specialist";

  let _modeValue = initialMode;
  form.elements = {
    mode: {
      get value() { return _modeValue; },
      set value(v) { _modeValue = v; },
    },
    text: input,
  };
  form.requestSubmit = function() {
    form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  };
  form.append(input, button, suggestButton, modeSimple, modeSpecialist);

  const status = new MockElement("P");
  status.id = "hadith-status";
  const results = new MockElement("DIV");
  results.id = "hadith-results";

  body.append(form, status, results);

  const scriptFn = new Function("document", "fetch", "AbortController", "URL", "console", hadithJsContent);
  scriptFn(document, fetchMock, globalThis.AbortController, globalThis.URL, console);

  return { document, form, input, button, suggestButton, status, results };
}

function createQuranEnv(fetchMock) {
  const document = {
    createElement(tag) { return new MockElement(tag); },
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    querySelector(sel) {
      if (sel === "#quran-search-form") return form;
      if (sel === "#quran-search-input") return input;
      if (sel === "#quran-search-button") return button;
      if (sel === "#quran-suggest-button") return suggestButton;
      if (sel === "#quran-status") return status;
      if (sel === "#quran-results") return results;
      return body.querySelector(sel);
    },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
  };

  const body = new MockElement("BODY");
  const form = new MockElement("FORM");
  form.id = "quran-search-form";
  const input = new MockElement("INPUT");
  input.id = "quran-search-input";
  input.name = "text";
  const button = new MockElement("BUTTON");
  button.id = "quran-search-button";
  button.type = "submit";
  const suggestButton = new MockElement("BUTTON");
  suggestButton.id = "quran-suggest-button";
  suggestButton.type = "button";

  form.requestSubmit = function() {
    form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  };
  form.append(input, button, suggestButton);

  const status = new MockElement("P");
  status.id = "quran-status";
  const results = new MockElement("DIV");
  results.id = "quran-results";

  body.append(form, status, results);

  const scriptFn = new Function("document", "fetch", "AbortController", "URL", "console", quranJsContent);
  scriptFn(document, fetchMock, globalThis.AbortController, globalThis.URL, console);

  return { document, form, input, button, suggestButton, status, results };
}

// 1. Test Hadith suggest flow with paraphrase: “الحديث اللي يقول الأعمال تعتمد على النية”
async function testParaphraseHadithSuggestFlow() {
  const calls = [];
  const fetchMock = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    if (url === "/api/hadith/meaning-search") {
      return {
        ok: true,
        json: async () => ({
          status: "candidates",
          attempt: 1,
          source: "dorar",
          candidates: [{ id: "c_1", text: "إنما الأعمال بالنيات" }],
          message: "هل تقصد أحد هذه الأحاديث؟"
        })
      };
    }
    if (url === "/api/hadith/search") {
      return {
        ok: true,
        json: async () => ({
          query: body.text,
          mode: body.mode,
          found: true,
          mixedCategories: false,
          complete: true,
          resultsCount: 1,
          simplePresentation: {
            selected: {
              text: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى",
              categoryLabels: ["صحيح"],
              records: [{ degreeCategories: [1], text: "إنما الأعمال بالنيات" }]
            }
          },
          results: [{ text: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى" }]
        })
      };
    }
  };

  const env = createHadithEnv(fetchMock, "simple");
  env.input.value = "الحديث اللي يقول الأعمال تعتمد على النية";

  // Click suggest button
  env.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  // Verify meaning-search API called with user text
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "/api/hadith/meaning-search");
  assert.strictEqual(calls[0].body.text, "الحديث اللي يقول الأعمال تعتمد على النية");

  // Verify candidate section displayed
  const panel = env.results.querySelector(".suggest-panel");
  assert.ok(panel, "Candidate panel should be rendered");
  assert.ok(panel.textContent.includes("هل تقصد أحد هذه الأحاديث؟"));
  assert.ok(panel.textContent.includes("هذه اقتراحات من نصوص عثرت عليها الدرر السنية، وليست حكمًا على الحديث."));

  const candidateItems = panel.querySelectorAll(".candidate-item");
  assert.strictEqual(candidateItems.length, 1);

  // Click candidate
  const pickBtn = candidateItems[0].querySelector("button");
  assert.ok(pickBtn);
  assert.strictEqual(pickBtn.textContent, "التحقق من هذا الحديث");

  pickBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  // Verify search called with candidate text and mode
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].url, "/api/hadith/search");
  assert.strictEqual(calls[1].body.text, "إنما الأعمال بالنيات");
  assert.strictEqual(calls[1].body.mode, "simple");

  // Verify candidate text copied to search input
  assert.strictEqual(env.input.value, "إنما الأعمال بالنيات");

  // Authoritative text is rendered
  const selectedResult = env.results.querySelector(".simple-selected");
  assert.ok(selectedResult, "Selected authoritative result should be rendered");
  assert.ok(selectedResult.textContent.includes("إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى"));

  console.log("PASS: testParaphraseHadithSuggestFlow");
}

// 2. Test Hadith suggest flow in specialist mode
async function testHadithSuggestSpecialistMode() {
  const calls = [];
  const fetchMock = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    if (url === "/api/hadith/meaning-search") {
      return {
        ok: true,
        json: async () => ({
          status: "candidates",
          attempt: 1,
          source: "dorar",
          candidates: [{ id: "c_1", text: "طلب العلم فريضة" }],
          message: "هل تقصد أحد هذه الأحاديث؟"
        })
      };
    }
    if (url === "/api/hadith/search") {
      return {
        ok: true,
        json: async () => ({
          query: body.text,
          mode: body.mode,
          found: true,
          resultsCount: 1,
          results: [{
            text: "طلب العلم فريضة على كل مسلم",
            scholar: "الألباني",
            grade: "صحيح"
          }]
        })
      };
    }
  };

  const env = createHadithEnv(fetchMock, "specialist");
  env.input.value = "حديث طلب العلم";

  env.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  const pickBtn = env.results.querySelector(".candidate-item button");
  pickBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  assert.strictEqual(calls[1].body.mode, "specialist", "Mode must be specialist");
  assert.ok(env.results.textContent.includes("أحكام المحدثين وطرق الحديث"));

  console.log("PASS: testHadithSuggestSpecialistMode");
}

// 3. Test Hadith suggest with mixed-category notice
async function testHadithSuggestWithMixedCategories() {
  const fetchMock = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url === "/api/hadith/meaning-search") {
      return {
        ok: true,
        json: async () => ({
          status: "candidates",
          attempt: 1,
          source: "dorar",
          candidates: [{ id: "c_1", text: "حديث مشترك" }],
          message: "هل تقصد أحد هذه الأحاديث؟"
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        query: body.text,
        mode: "simple",
        found: true,
        mixedCategories: true,
        complete: true,
        resultsCount: 2,
        simplePresentation: {
          selected: { text: "حديث مشترك صحيح", categoryLabels: ["صحيح"], records: [{ degreeCategories: [1] }] },
          alternates: [{ text: "حديث مشترك ضعيف", categoryLabels: ["ضعيف"], records: [{ degreeCategories: [3] }] }]
        },
        results: [{ text: "حديث مشترك صحيح" }, { text: "حديث مشترك ضعيف" }]
      })
    };
  };

  const env = createHadithEnv(fetchMock, "simple");
  env.input.value = "حديث مشترك";
  env.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  const pickBtn = env.results.querySelector(".candidate-item button");
  pickBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  const mixedNotice = env.results.querySelector(".mixed-disclaimer");
  assert.ok(mixedNotice, "Mixed disclaimer should be present");

  console.log("PASS: testHadithSuggestWithMixedCategories");
}

// 4. Test suggestion with no simple results shows specialist button and empty state
async function testHadithSuggestNoResultsInSimpleMode() {
  const fetchMock = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url === "/api/hadith/meaning-search") {
      return {
        ok: true,
        json: async () => ({
          status: "candidates",
          attempt: 1,
          source: "dorar",
          candidates: [{ id: "c_1", text: "عبارة غير موجودة في الميسر" }],
          message: "هل تقصد أحد هذه الأحاديث؟"
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        query: body.text,
        mode: "simple",
        found: false,
        canSearchSpecialist: true,
        message: "لم نجد نتيجة في العرض الميسّر لغير المتخصصين.",
        hint: "قد يكون الحديث موجودًا في الموسوعة الحديثية المتخصصة.",
        resultsCount: 0,
        results: []
      })
    };
  };

  const env = createHadithEnv(fetchMock, "simple");
  env.input.value = "حديث غير موجود";
  env.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  const pickBtn = env.results.querySelector(".candidate-item button");
  pickBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  // Verify empty status message and specialist button
  assert.ok(env.status.textContent.includes("لم نجد نتيجة في العرض الميسّر لغير المتخصصين."));
  const specialistBtn = env.results.querySelector(".secondary-button");
  assert.ok(specialistBtn);
  assert.strictEqual(specialistBtn.textContent, "البحث في الوضع المتخصص");

  console.log("PASS: testHadithSuggestNoResultsInSimpleMode");
}

// 5. Test Quran suggest flow: candidates displayed, selection searches authoritative endpoint and retains original query
async function testQuranSuggestFlow() {
  const calls = [];
  const fetchMock = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    if (url === "/api/search/suggest") {
      return {
        ok: true,
        json: async () => ({
          query: body.text,
          type: "quran",
          candidates: ["إن مع العسر يسرا"]
        })
      };
    }
    if (url === "/api/quran/search") {
      return {
        ok: true,
        json: async () => ({
          query: body.text,
          found: true,
          total: 1,
          results: [{
            text_uthmani: "إِنَّ مَعَ الْعُسْرِ يُسْرًا",
            surah_name: "الشرح",
            ayah: 6,
            verse_key: "94:6"
          }]
        })
      };
    }
  };

  const env = createQuranEnv(fetchMock);
  env.input.value = "بعد الصعوبة سهولة";

  // Click suggest
  env.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  assert.strictEqual(calls[0].url, "/api/search/suggest");
  assert.strictEqual(calls[0].body.type, "quran");

  const panel = env.results.querySelector(".suggest-panel");
  assert.ok(panel);
  assert.ok(panel.textContent.includes("عبارات بحث مقترحة"));

  const pickBtn = panel.querySelector("button");
  pickBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));

  assert.strictEqual(calls[1].url, "/api/quran/search");
  assert.strictEqual(calls[1].body.text, "إن مع العسر يسرا");

  // Verify original input visibly retained
  assert.strictEqual(env.input.value, "بعد الصعوبة سهولة");

  // Notice above source result
  const confirmNotice = env.results.querySelector(".candidate-source-notice");
  assert.ok(confirmNotice);
  assert.strictEqual(confirmNotice.textContent, "هل هذا النص الذي تقصده؟");

  // Verse rendered
  assert.ok(env.results.textContent.includes("إِنَّ مَعَ الْعُسْرِ يُسْرًا"));

  console.log("PASS: testQuranSuggestFlow");
}

// 6. Normal search makes ZERO suggest calls
async function testNormalSearchZeroSuggestCalls() {
  const calls = [];
  const fetchMock = async (url, opts) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ found: true, total: 1, results: [] })
    };
  };

  const env = createQuranEnv(fetchMock);
  env.input.value = "الحمد لله";
  env.form.requestSubmit();
  await new Promise(r => setTimeout(r, 10));

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], "/api/quran/search");
  assert.ok(!calls.includes("/api/search/suggest"));

  console.log("PASS: testNormalSearchZeroSuggestCalls");
}

// 7. Empty and error states (provider failure, no suggestions, Dorar failure)
async function testEmptyAndErrorStates() {
  // Case A: No candidates returned (attempt 1 needs clarification)
  const fetchNoCandidates = async () => ({
    ok: true,
    json: async () => ({ status: "needs_clarification", attempt: 1, attemptsRemaining: 2, message: "وضّح المعنى أكثر، واذكر الموقف أو أي كلمة تتذكرها." })
  });
  const envA = createHadithEnv(fetchNoCandidates);
  envA.input.value = "شيء غير مفهوم";
  envA.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(envA.status.textContent.includes("وضّح المعنى أكثر، واذكر الموقف أو أي كلمة تتذكرها."));

  // Case B: Temporarily unavailable (503 / technical error)
  const fetchUnavailable = async () => ({
    ok: true,
    json: async () => ({ status: "temporarily_unavailable", message: "تعذّر إكمال البحث حاليًا. حاول مرة أخرى." })
  });
  const envB = createHadithEnv(fetchUnavailable);
  envB.input.value = "حديث";
  envB.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(envB.status.textContent.includes("تعذّر إكمال البحث حاليًا. حاول مرة أخرى."));
  const retryBtn = envB.results.querySelector("button.retry-meaning-button");
  assert.ok(retryBtn, "Retry button should be rendered on temporarily_unavailable");

  // Case C: Provider timeout / network failure throws error
  const fetchTimeout = async () => {
    throw new Error("Network error");
  };
  const envC = createHadithEnv(fetchTimeout);
  envC.input.value = "حديث";
  envC.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(envC.status.textContent.includes("تعذّر إكمال البحث حاليًا. حاول مرة أخرى."));

  // Case D: Dorar failure after candidate selection
  const fetchDorarFail = async (url, opts) => {
    if (url === "/api/hadith/meaning-search") {
      return { ok: true, json: async () => ({ status: "candidates", attempt: 1, source: "dorar", candidates: [{ id: "c_1", text: "حديث سيفشل في الدرر" }] }) };
    }
    return { ok: false, json: async () => ({ code: "dorar_unavailable", message: "تعذّر الاتصال بالدرر السنية حاليًا. حاول مرة أخرى." }) };
  };
  const envD = createHadithEnv(fetchDorarFail);
  envD.input.value = "حديث سيفشل";
  envD.suggestButton.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));
  const pickBtn = envD.results.querySelector(".candidate-item button");
  pickBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(envD.status.textContent.includes("تعذّر الاتصال بالدرر السنية حاليًا. حاول مرة أخرى."));

  console.log("PASS: testEmptyAndErrorStates");
}

async function runAll() {
  await testParaphraseHadithSuggestFlow();
  await testHadithSuggestSpecialistMode();
  await testHadithSuggestWithMixedCategories();
  await testHadithSuggestNoResultsInSimpleMode();
  await testQuranSuggestFlow();
  await testNormalSearchZeroSuggestCalls();
  await testEmptyAndErrorStates();
  console.log("ALL FRONTEND SUGGEST INTERACTION TESTS PASSED!");
}

runAll();
