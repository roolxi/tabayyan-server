const form = document.querySelector("#quran-search-form");
const input = document.querySelector("#quran-search-input");
const button = document.querySelector("#quran-search-button");
const suggestButton = document.querySelector("#quran-suggest-button");
const status = document.querySelector("#quran-status");
const results = document.querySelector("#quran-results");

let requestController = null;
let requestSequence = 0;

function setStatus(message, state) {
  status.textContent = message;
  status.className = `status ${state}`;
}

function renderResultsCards(rows) {
  rows.forEach((result) => {
    const card = document.createElement("article");
    card.className = "result-card";
    const text = document.createElement("p");
    text.className = "verse-text";
    text.textContent = result.text_uthmani;
    const meta = document.createElement("p");
    meta.className = "verse-meta";
    meta.textContent = `${result.surah_name}، الآية ${result.ayah} (${result.verse_key})`;
    card.append(text, meta);
    results.append(card);
  });
}

function renderResults(data) {
  results.replaceChildren();
  renderResultsCards(data.results || []);
}

function renderCandidates(candidates, originalInput) {
  results.replaceChildren();
  const panel = document.createElement("section");
  panel.className = "suggest-panel";

  const heading = document.createElement("h2");
  heading.textContent = "عبارات بحث مقترحة";
  panel.append(heading);

  const note = document.createElement("p");
  note.className = "suggest-note";
  note.textContent = "هذه اقتراحات للبحث، وليست نصوصًا موثّقة.";
  panel.append(note);

  candidates.forEach((candidate) => {
    const item = document.createElement("div");
    item.className = "candidate-item";

    const phrase = document.createElement("p");
    phrase.className = "candidate-phrase";
    phrase.textContent = candidate;
    item.append(phrase);

    const pickButton = document.createElement("button");
    pickButton.type = "button";
    pickButton.className = "secondary-button";
    pickButton.textContent = "البحث بهذه العبارة";
    pickButton.addEventListener("click", () => {
      searchCandidate(candidate, originalInput);
    });
    item.append(pickButton);

    panel.append(item);
  });

  results.append(panel);
}

async function searchCandidate(candidate, originalInput) {
  if (requestController) requestController.abort();
  requestController = new AbortController();
  const sequence = ++requestSequence;

  button.disabled = true;
  if (suggestButton) suggestButton.disabled = true;
  setStatus("جارٍ البحث في المصدر...", "loading");
  results.replaceChildren();

  // Retain original input visibly so the user can revise it
  input.value = originalInput;

  try {
    const response = await fetch("/api/quran/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: candidate }),
      signal: requestController.signal,
    });
    const data = await response.json();
    if (sequence !== requestSequence) return;
    if (!response.ok) {
      setStatus(data.message || "تعذّر البحث حاليًا. حاول مرة أخرى.", "error");
      return;
    }
    if (data.found && data.results && data.results.length > 0) {
      const confirmNotice = document.createElement("p");
      confirmNotice.className = "candidate-source-notice";
      confirmNotice.textContent = "هل هذا النص الذي تقصده؟";
      results.append(confirmNotice);
      renderResultsCards(data.results);
      setStatus(`عُثر على ${data.total} نتيجة.`, "success");
    } else {
      setStatus(data.message || "لم نجد آية تطابق عبارة البحث.", "empty");
    }
  } catch (error) {
    if (error.name === "AbortError" || sequence !== requestSequence) return;
    setStatus("تعذّر الاتصال بالخادم. حاول مرة أخرى.", "error");
  } finally {
    if (sequence === requestSequence) {
      button.disabled = false;
      if (suggestButton) suggestButton.disabled = false;
    }
  }
}

// Normal search: calls existing /api/quran/search (zero OpenRouter calls)
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (requestController) requestController.abort();
  requestController = new AbortController();
  const sequence = ++requestSequence;

  const query = input.value.trim();
  if (!query) return;

  button.disabled = true;
  if (suggestButton) suggestButton.disabled = true;
  setStatus("جارٍ البحث...", "loading");
  results.replaceChildren();

  try {
    const response = await fetch("/api/quran/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: query }),
      signal: requestController.signal,
    });
    const data = await response.json();
    if (sequence !== requestSequence) return;
    if (!response.ok) {
      setStatus(data.message || "تعذّر البحث حاليًا. حاول مرة أخرى.", "error");
      return;
    }
    renderResults(data);
    setStatus(data.found ? `عُثر على ${data.total} نتيجة.` : (data.message || "لم نجد آية تطابق عبارة البحث."), data.found ? "success" : "empty");
  } catch (error) {
    if (error.name === "AbortError" || sequence !== requestSequence) return;
    results.replaceChildren();
    setStatus("تعذّر الاتصال بالخادم. حاول مرة أخرى.", "error");
  } finally {
    if (sequence === requestSequence) {
      button.disabled = false;
      if (suggestButton) suggestButton.disabled = false;
    }
  }
});

// Semantic search suggestions
if (suggestButton) {
  suggestButton.addEventListener("click", async () => {
    const originalInput = input.value.trim();
    if (!originalInput) {
      input.focus();
      setStatus("الرجاء إدخال نص للبحث بالمعنى.", "empty");
      return;
    }

    if (requestController) requestController.abort();
    requestController = new AbortController();
    const sequence = ++requestSequence;

    button.disabled = true;
    suggestButton.disabled = true;
    setStatus("جارٍ البحث بالمعنى واقتراح عبارات للبحث...", "loading");
    results.replaceChildren();

    try {
      const response = await fetch("/api/search/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: originalInput, type: "quran" }),
        signal: requestController.signal,
      });
      const data = await response.json();
      if (sequence !== requestSequence) return;

      if (!response.ok) {
        setStatus(data.message || "تعذّر البحث بالمعنى حاليًا. يمكنك استخدام البحث العادي.", "error");
        return;
      }

      if (!data.candidates || data.candidates.length === 0) {
        setStatus(data.message || "لم نتمكن من اقتراح عبارة مناسبة. جرّب إضافة كلمات تتذكرها.", "empty");
        return;
      }

      setStatus("", "success");
      renderCandidates(data.candidates, originalInput);
    } catch (error) {
      if (error.name === "AbortError" || sequence !== requestSequence) return;
      setStatus("تعذّر البحث بالمعنى حاليًا. يمكنك استخدام البحث العادي.", "error");
    } finally {
      if (sequence === requestSequence) {
        button.disabled = false;
        suggestButton.disabled = false;
      }
    }
  });
}

function invalidateSearch() {
  requestSequence += 1;
  requestController?.abort();
  button.disabled = false;
  if (suggestButton) suggestButton.disabled = false;
  results.replaceChildren();
  setStatus("", "");
}

input.addEventListener("input", invalidateSearch);

if (typeof window !== "undefined" && window.location && window.location.search) {
  const urlParams = new URLSearchParams(window.location.search);
  const queryParam = urlParams.get("q");
  if (queryParam && queryParam.trim()) {
    input.value = queryParam.trim();
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }
}