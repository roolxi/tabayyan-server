import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const hadithJsContent = fs.readFileSync(path.join(rootDir, "web", "hadith.js"), "utf-8");

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

function createTestEnvironment(fetchMock) {
  const document = {
    createElement(tag) {
      return new MockElement(tag);
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: text };
    },
    querySelector(sel) {
      if (sel === "#hadith-search-form") return form;
      if (sel === "#hadith-search-input") return input;
      if (sel === "#hadith-search-button") return button;
      if (sel === "#hadith-status") return status;
      if (sel === "#hadith-results") return results;
      return body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
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
  const modeSimple = new MockElement("INPUT");
  modeSimple.name = "mode";
  modeSimple.type = "radio";
  modeSimple.value = "simple";
  modeSimple.attributes["checked"] = "true";
  const modeSpecialist = new MockElement("INPUT");
  modeSpecialist.name = "mode";
  modeSpecialist.type = "radio";
  modeSpecialist.value = "specialist";

  let _modeValue = "simple";
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

  form.append(input, button, modeSimple, modeSpecialist);

  const status = new MockElement("P");
  status.id = "hadith-status";
  status.className = "status initial-state";
  status.textContent = "أدخل عبارة للبحث في المصدر.";

  const results = new MockElement("DIV");
  results.id = "hadith-results";
  results.className = "results-list";

  body.append(form, status, results);

  const context = {
    document,
    form,
    input,
    button,
    status,
    results,
    fetch: fetchMock,
    URL: globalThis.URL,
    AbortController: globalThis.AbortController,
    console: console,
  };

  const scriptFn = new Function("document", "fetch", "AbortController", "URL", "console", hadithJsContent);
  scriptFn(document, fetchMock, globalThis.AbortController, globalThis.URL, console);

  return context;
}

// Test 1: Selected category 3 + collapsed alternative category 1 => notice rendered above selected card
async function test1() {
  const responseData = {
    query: "حديث الاختبار",
    mode: "simple",
    found: true,
    mixedCategories: true,
    complete: true,
    sourceUrl: "https://dorar.net/hadith/search",
    simplePresentation: {
      selected: {
        text: "نص الحديث المختار",
        matchType: "exact",
        categoryLabels: ["أحاديث حكم المحدثون عليها بالضعف"],
        records: [{ degreeCategories: [3], text: "نص الحديث المختار" }]
      },
      alternates: [
        {
          text: "رواية أخرى بديلة",
          matchType: "phrase",
          categoryLabels: ["أحاديث حكم المحدثون عليها بالصحة"],
          records: [{ degreeCategories: [1], text: "رواية أخرى بديلة" }]
        }
      ]
    },
    results: [
      { text: "نص الحديث المختار", degreeCategories: [3] },
      { text: "رواية أخرى بديلة", degreeCategories: [1] }
    ]
  };

  let submittedQuery = null;
  let submittedMode = null;
  const fetchMock = async (url, opts) => {
    const body = JSON.parse(opts.body);
    submittedQuery = body.text;
    submittedMode = body.mode;
    return {
      ok: true,
      json: async () => responseData
    };
  };

  const env = createTestEnvironment(fetchMock);
  env.input.value = "حديث الاختبار";
  env.form.requestSubmit();
  await new Promise(r => setTimeout(r, 10));

  const resultsChildren = env.results.children.filter(c => c instanceof MockElement);
  assert.strictEqual(resultsChildren.length, 3, "Results should have disclaimer, selected card, and details");

  const disclaimer = resultsChildren[0];
  assert.ok(disclaimer.className.includes("mixed-disclaimer"), "First element should be mixed disclaimer");
  assert.ok(disclaimer.textContent.includes("ظهرت في نتائج البحث تصنيفات بالصحة وأخرى بالضعف"), "Disclaimer text mismatch");
  assert.ok(disclaimer.textContent.includes("هل ترغب بالاطلاع على التفاصيل في الوضع المتخصص؟"), "Disclaimer text mismatch");

  const button = disclaimer.querySelector("button");
  assert.ok(button, "Disclaimer must have button");
  assert.strictEqual(button.textContent, "البحث في الوضع المتخصص");

  const selectedCard = resultsChildren[1];
  assert.ok(selectedCard.className.includes("simple-selected"), "Second element should be selected card");
  // Check no duplicate disclaimer in selected card
  assert.strictEqual(selectedCard.querySelector(".mixed-disclaimer"), null, "No duplicate disclaimer in card");
  assert.ok(!selectedCard.textContent.includes("ظهرت في نتائج البحث تصنيفات"), "No duplicate text in card");

  const details = resultsChildren[2];
  assert.strictEqual(details.tagName, "DETAILS", "Third element should be details for alternates");
  assert.strictEqual(details.getAttribute("open"), null, "Alternatives should be collapsed");

  // Test button click switches to specialist mode and resubmits
  button.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(env.form.elements.mode.value, "specialist", "Mode should be set to specialist");
  assert.strictEqual(submittedMode, "specialist", "Submitted request should be specialist");
  assert.strictEqual(submittedQuery, "حديث الاختبار", "Submitted request should keep original query");

  console.log("PASS: Test 1 (Selected cat 3 + alt cat 1 => notice, button switches to specialist)");
}

// Test 2: Selected category 2 + alternative category 4 => notice
async function test2() {
  const responseData = {
    query: "حديث الاختبار 2",
    mode: "simple",
    found: true,
    mixedCategories: true,
    complete: true,
    sourceUrl: "https://dorar.net/hadith/search",
    simplePresentation: {
      selected: {
        text: "نص الحديث 2",
        matchType: "exact",
        categoryLabels: ["أحاديث حكم المحدثون على أسانيدها بالصحة"],
        records: [{ degreeCategories: [2], text: "نص الحديث 2" }]
      },
      alternates: [
        {
          text: "رواية أخرى 2",
          matchType: "phrase",
          categoryLabels: ["أحاديث حكم المحدثون على أسانيدها بالضعف"],
          records: [{ degreeCategories: [4], text: "رواية أخرى 2" }]
        }
      ]
    },
    results: [
      { text: "نص الحديث 2", degreeCategories: [2] },
      { text: "رواية أخرى 2", degreeCategories: [4] }
    ]
  };

  const fetchMock = async () => ({ ok: true, json: async () => responseData });
  const env = createTestEnvironment(fetchMock);
  env.input.value = "حديث الاختبار 2";
  env.form.requestSubmit();
  await new Promise(r => setTimeout(r, 10));

  const disclaimer = env.results.querySelector(".mixed-disclaimer");
  assert.ok(disclaimer, "Disclaimer must be rendered for categories 2 + 4");
  console.log("PASS: Test 2 (Selected cat 2 + alt cat 4 => notice)");
}

// Test 3: Categories 1+2 only => no mixed notice
async function test3() {
  const responseData = {
    query: "حديث صحيح",
    mode: "simple",
    found: true,
    mixedCategories: false,
    complete: true,
    sourceUrl: "https://dorar.net/hadith/search",
    simplePresentation: {
      selected: {
        text: "حديث صحيح",
        matchType: "exact",
        categoryLabels: ["صحيح 1"],
        records: [{ degreeCategories: [1], text: "حديث صحيح" }]
      },
      alternates: [
        {
          text: "رواية صحيحة أخرى",
          matchType: "phrase",
          categoryLabels: ["صحيح 2"],
          records: [{ degreeCategories: [2], text: "رواية صحيحة أخرى" }]
        }
      ]
    },
    results: [{ text: "حديث صحيح", degreeCategories: [1, 2] }]
  };

  const fetchMock = async () => ({ ok: true, json: async () => responseData });
  const env = createTestEnvironment(fetchMock);
  env.input.value = "حديث صحيح";
  env.form.requestSubmit();
  await new Promise(r => setTimeout(r, 10));

  const disclaimer = env.results.querySelector(".mixed-disclaimer");
  assert.strictEqual(disclaimer, null, "No mixed disclaimer for categories 1+2 only");
  console.log("PASS: Test 3 (Categories 1+2 only => no mixed notice)");
}

// Test 4: Categories 3+4 only => no mixed notice
async function test4() {
  const responseData = {
    query: "حديث ضعيف",
    mode: "simple",
    found: true,
    mixedCategories: false,
    complete: true,
    sourceUrl: "https://dorar.net/hadith/search",
    simplePresentation: {
      selected: {
        text: "حديث ضعيف",
        matchType: "exact",
        categoryLabels: ["ضعيف 3"],
        records: [{ degreeCategories: [3], text: "حديث ضعيف" }]
      },
      alternates: [
        {
          text: "رواية ضعيفة أخرى",
          matchType: "phrase",
          categoryLabels: ["ضعيف 4"],
          records: [{ degreeCategories: [4], text: "رواية ضعيفة أخرى" }]
        }
      ]
    },
    results: [{ text: "حديث ضعيف", degreeCategories: [3, 4] }]
  };

  const fetchMock = async () => ({ ok: true, json: async () => responseData });
  const env = createTestEnvironment(fetchMock);
  env.input.value = "حديث ضعيف";
  env.form.requestSubmit();
  await new Promise(r => setTimeout(r, 10));

  const disclaimer = env.results.querySelector(".mixed-disclaimer");
  assert.strictEqual(disclaimer, null, "No mixed disclaimer for categories 3+4 only");
  console.log("PASS: Test 4 (Categories 3+4 only => no mixed notice)");
}

// Test 5: Notice remains visible when alternatives are collapsed
async function test5() {
  const responseData = {
    query: "حديث",
    mode: "simple",
    found: true,
    mixedCategories: true,
    complete: true,
    sourceUrl: "https://dorar.net/hadith/search",
    simplePresentation: {
      selected: {
        text: "نص مختار",
        matchType: "exact",
        categoryLabels: ["صحيح"],
        records: [{ degreeCategories: [1] }]
      },
      alternates: [
        {
          text: "بديل",
          matchType: "words",
          categoryLabels: ["ضعيف"],
          records: [{ degreeCategories: [3] }]
        }
      ]
    },
    results: [{ text: "نص مختار", degreeCategories: [1] }, { text: "بديل", degreeCategories: [3] }]
  };

  const fetchMock = async () => ({ ok: true, json: async () => responseData });
  const env = createTestEnvironment(fetchMock);
  env.form.requestSubmit();
  await new Promise(r => setTimeout(r, 10));

  const disclaimer = env.results.querySelector(".mixed-disclaimer");
  const details = env.results.querySelector("details.other-versions");
  assert.ok(disclaimer, "Disclaimer exists");
  assert.ok(details, "Details element exists");
  assert.strictEqual(details.getAttribute("open"), null, "Details is collapsed");
  // Disclaimer is NOT a descendant of details
  assert.strictEqual(details.querySelector(".mixed-disclaimer"), null, "Disclaimer is outside details");
  console.log("PASS: Test 5 (Notice remains visible when alternatives are collapsed)");
}

// Test 6: Partial-results warning and mixed notice can both appear
async function test6() {
  const responseData = {
    query: "حديث غير مكتمل",
    mode: "simple",
    found: true,
    mixedCategories: true,
    complete: false,
    message: "تعذّر تحميل بعض النتائج من الدرر السنية. النتائج المعروضة غير مكتملة.",
    sourceUrl: "https://dorar.net/hadith/search",
    simplePresentation: {
      selected: {
        text: "نص مختار",
        matchType: "exact",
        categoryLabels: ["صحيح"],
        records: [{ degreeCategories: [1] }]
      },
      alternates: [
        {
          text: "بديل ضعيف",
          matchType: "words",
          categoryLabels: ["ضعيف"],
          records: [{ degreeCategories: [3] }]
        }
      ]
    },
    results: [{ text: "نص مختار", degreeCategories: [1] }, { text: "بديل ضعيف", degreeCategories: [3] }]
  };

  const fetchMock = async () => ({ ok: true, json: async () => responseData });
  const env = createTestEnvironment(fetchMock);
  env.form.requestSubmit();
  await new Promise(r => setTimeout(r, 10));

  // Check status contains error warning
  assert.ok(env.status.className.includes("error"), "Status has error class");
  assert.ok(env.status.textContent.includes("النتائج المعروضة غير مكتملة"), "Status contains incomplete warning");

  // Check retry button exists in results
  const retryBtn = env.results.querySelectorAll("button").find(b => b.textContent === "إعادة المحاولة");
  assert.ok(retryBtn, "Retry button should be rendered");

  // Check mixed disclaimer ALSO appears in results
  const disclaimer = env.results.querySelector(".mixed-disclaimer");
  assert.ok(disclaimer, "Mixed disclaimer appears alongside partial-results warning");

  console.log("PASS: Test 6 (Partial-results warning and mixed notice can both appear)");
}

async function runAll() {
  await test1();
  await test2();
  await test3();
  await test4();
  await test5();
  await test6();
  console.log("ALL 6 FRONTEND RENDERING TESTS PASSED SUCCESSFULLY!");
}

runAll();
