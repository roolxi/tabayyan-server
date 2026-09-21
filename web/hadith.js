const form = document.querySelector("#hadith-search-form");
const input = document.querySelector("#hadith-search-input");
const button = document.querySelector("#hadith-search-button");
const suggestButton = document.querySelector("#hadith-suggest-button");
const status = document.querySelector("#hadith-status");
const results = document.querySelector("#hadith-results");
let requestController = null;
let requestSequence = 0;

function setStatus(message, state) {
  status.textContent = message;
  status.className = `status ${state}`;
}

function currentMode() {
  return form.elements.mode.value;
}

function appendField(card, label, value) {
  if (!value) return;
  const line = document.createElement("p");
  line.className = "hadith-field";
  const name = document.createElement("strong");
  name.textContent = `${label}: `;
  line.append(name, document.createTextNode(value));
  card.append(line);
}

function addTextToggle(card, text) {
  if (!text || text.textContent.length <= 420) return;
  text.classList.add("long-text");
  text.style.maxHeight = "9em";
  text.style.overflow = "hidden";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "text-toggle";
  toggle.textContent = "عرض النص كاملًا";
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    const expanded = text.classList.toggle("expanded");
    text.style.maxHeight = expanded ? "none" : "9em";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "إخفاء التفاصيل" : "عرض النص كاملًا";
  });
  card.append(toggle);
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["dorar.net", "www.dorar.net"].includes(url.hostname)) return url.href;
  } catch (_) {}
  return "https://dorar.net/hadith/search";
}

function sourceLink(card, record, sourceUrl) {
  const source = document.createElement("a");
  source.className = "record-source";
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.href = safeSourceUrl(record.sourceUrl || sourceUrl);
  source.textContent = "المصدر: الدرر السنية";
  card.append(source);
}

function groupLabels(group) {
  if (Array.isArray(group.categoryLabels) && group.categoryLabels.length) return group.categoryLabels.filter(label => typeof label === "string");
  if (!Array.isArray(group.records)) return null;
  const labels = [];
  group.records.forEach((record) => {
    if (!Array.isArray(record.categoryLabels)) return;
    record.categoryLabels.forEach((label) => {
      if (!labels.includes(label)) labels.push(label);
    });
  });
  return labels.length ? labels : null;
}

function renderCategoryLabels(card, group) {
  const labels = groupLabels(group);
  const label = document.createElement("p");
  label.className = "hadith-field";
  const labelName = document.createElement("strong");
  labelName.textContent = "تصنيف الدرر السنية: ";
  label.append(labelName);
  if (labels) {
    label.append(document.createTextNode(labels.join("، ")));
  } else {
    console.error("Missing categoryLabels for simple Hadith presentation", group);
    label.append(document.createTextNode("تعذّر عرض تصنيف هذه النتيجة."));
  }
  card.append(label);
}

function renderMixedCategoriesNotice(data) {
  const notice = document.createElement("section");
  notice.className = "search-note mixed-disclaimer";
  const text = document.createElement("p");
  text.textContent = "ظهرت في نتائج البحث تصنيفات بالصحة وأخرى بالضعف؛ وقد تختلف ألفاظ الحديث أو أسانيده. هل ترغب بالاطلاع على التفاصيل في الوضع المتخصص؟";
  notice.append(text);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = "البحث في الوضع المتخصص";
  button.addEventListener("click", () => {
    form.elements.mode.value = "specialist";
    input.value = data.query;
    form.requestSubmit();
  });
  notice.append(button);
  results.append(notice);
}

function renderSimpleResults(data) {
  const presentation = data.simplePresentation;
  if (!presentation || !presentation.selected) return;
  if (data.mixedCategories === true) {
    renderMixedCategoriesNotice(data);
  }
  renderSimpleGroup(data, presentation.selected);
  if (presentation.alternates && presentation.alternates.length) {
    const details = document.createElement("details");
    details.className = "other-versions";
    const summary = document.createElement("summary");
    summary.textContent = "روايات أخرى مطابقة";
    details.append(summary);
    presentation.alternates.forEach((group) => {
      const item = document.createElement("article");
      item.className = "alternate-hadith";
      const itemText = document.createElement("p");
      itemText.className = "hadith-text";
      itemText.textContent = group.text;
      item.append(itemText);
      renderCategoryLabels(item, group);
      sourceLink(item, group.records?.[0] || {}, data.sourceUrl);
      details.append(item);
    });
    results.append(details);
  }
}

function renderSimpleGroup(data, group) {
  const existing = results.querySelector(".simple-selected");
  if (existing) existing.remove();
  const card = document.createElement("article");
  card.className = "result-card hadith-card simple-selected";
  const text = document.createElement("p");
  text.className = "hadith-text";
  text.textContent = group.text;
  if (["words", "source_candidate"].includes(group.matchType)) {
    const note = document.createElement("p");
    note.className = "search-note";
    note.textContent = group.matchType === "words" ? "نتيجة قريبة من عبارتك" : "نتيجة مقترحة من بحث الدرر؛ تأكد أنها الحديث المقصود.";
    card.append(note);
  }
  card.append(text);
  addTextToggle(card, text);
  renderCategoryLabels(card, group);
  sourceLink(card, Array.isArray(group.records) && group.records[0] ? group.records[0] : {}, data.sourceUrl);
  results.append(card);
}

function renderResults(data) {
  results.replaceChildren();
  if (data.mode === "simple") {
    renderSimpleResults(data);
    return;
  }
  if (data.mode === "specialist") {
    const heading = document.createElement("h2");
    heading.textContent = "أحكام المحدثين وطرق الحديث";
    results.append(heading);
  }
  data.results.forEach((record) => {
    const card = document.createElement("article");
    card.className = "result-card hadith-card";
    const text = document.createElement("p");
    text.className = "hadith-text";
    text.textContent = record.text;
    card.append(text);
    addTextToggle(card, text);
    appendField(card, "خلاصة حكم المحدث", record.grade || "لم يُعرض حكم في هذه النتيجة");
    appendField(card, "المحدث", record.scholar);
    appendField(card, "الراوي", record.narrator);
    appendField(card, "المصدر", record.book);
    appendField(card, "الصفحة أو الرقم", record.reference);
    if (Array.isArray(record.degreeCategories) && record.degreeCategories.length) {
      appendField(card, "تصنيفات نتائج البحث", record.degreeCategories.join("، "));
    }
    if (record.gradeExplanation || record.takhrij) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "تفاصيل إضافية";
      details.append(summary);
      appendField(details, "توضيح حكم المحدث", record.gradeExplanation);
      appendField(details, "التخريج", record.takhrij);
      card.append(details);
    }
    const source = document.createElement("a");
    source.className = "record-source";
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.href = safeSourceUrl(record.sourceUrl || data.sourceUrl);
    source.textContent = record.sourceUrl ? "فتح سجل الحديث في الدرر السنية" : "فتح البحث في الدرر السنية";
    card.append(source);
    const attribution = document.createElement("p");
    attribution.className = "source-attribution";
    attribution.textContent = "المصدر الإلكتروني: الدرر السنية";
    card.append(attribution);
    results.append(card);
  });
}

function showSpecialistButton(query) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = "البحث في الوضع المتخصص";
  button.addEventListener("click", () => {
    form.elements.mode.value = "specialist";
    input.value = query;
    form.requestSubmit();
  });
  results.append(button);
}

async function executeHadithSearch(searchTerm, originalQuery = null) {
  if (requestController) requestController.abort();
  requestController = new AbortController();
  const sequence = ++requestSequence;
  const mode = currentMode();
  button.disabled = true;
  if (suggestButton) suggestButton.disabled = true;
  setStatus("جارٍ البحث...", "loading");
  results.replaceChildren();

  if (originalQuery) {
    input.value = originalQuery;
  }

  try {
    const response = await fetch("/api/hadith/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: searchTerm, mode }),
      signal: requestController.signal,
    });
    const data = await response.json();
    if (sequence !== requestSequence) return;
    if (!response.ok) {
      results.replaceChildren();
      setStatus(data.message || "تعذّر البحث حاليًا. حاول مرة أخرى.", "error");
      return;
    }
    renderResults(data);

    if (originalQuery && data.found) {
      const confirmNotice = document.createElement("p");
      confirmNotice.className = "candidate-source-notice";
      confirmNotice.textContent = "هل هذا النص الذي تقصده؟";
      results.prepend(confirmNotice);
    }

    const selected = data.simplePresentation?.selected;
    if (data.mode === "simple") {
      if (data.complete === false) {
        setStatus(data.message || "النتائج غير مكتملة. حاول مرة أخرى.", "error");
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "secondary-button";
        retry.textContent = "إعادة المحاولة";
        retry.addEventListener("click", () => executeHadithSearch(searchTerm, originalQuery));
        results.append(retry);
      } else if (selected) {
        setStatus(data.mode === "simple" ? "تم العثور على نصوص من المصدر." : "", "success");
      } else {
        setStatus(data.message || "لم نجد نتيجة في العرض الميسّر لغير المتخصصين.", "empty");
      }
      if (!selected) {
        if (data.hint) {
          const hint = document.createElement("p");
          hint.textContent = data.hint;
          results.append(hint);
        }
        showSpecialistButton(data.query);
      }
    } else {
      setStatus(data.found ? `عُثر على ${data.resultsCount} نتيجة من الصفحة الأولى في المصدر.` : data.message, data.found ? "success" : "empty");
    }
  } catch (error) {
    if (error.name === "AbortError" || sequence !== requestSequence) return;
    console.error("Hadith search/render failed", error);
    results.replaceChildren();
    setStatus("تعذّر عرض النتائج حاليًا. حاول مرة أخرى.", "error");
  } finally {
    if (sequence === requestSequence) {
      button.disabled = false;
      if (suggestButton) suggestButton.disabled = false;
    }
  }
}

let meaningSearchState = {
  initialText: "",
  clarifications: [],
};

function renderMeaningCandidates(candidates) {
  results.replaceChildren();
  const panel = document.createElement("section");
  panel.className = "suggest-panel";

  const heading = document.createElement("h2");
  heading.textContent = "هل تقصد أحد هذه الأحاديث؟";
  panel.append(heading);

  const note = document.createElement("p");
  note.className = "suggest-note";
  note.textContent = "هذه اقتراحات من نصوص عثرت عليها الدرر السنية، وليست حكمًا على الحديث.";
  panel.append(note);

  candidates.forEach((cand) => {
    const card = document.createElement("article");
    card.className = "candidate-item result-card";

    const candText = typeof cand === "object" && cand !== null ? cand.text : String(cand);

    const textElem = document.createElement("p");
    textElem.className = "hadith-text";
    textElem.textContent = candText;
    card.append(textElem);

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "secondary-button check-hadith-button";
    checkBtn.textContent = "التحقق من هذا الحديث";
    checkBtn.addEventListener("click", () => {
      input.value = candText;
      panel.remove();
      executeHadithSearch(candText);
    });
    card.append(checkBtn);

    panel.append(card);
  });

  results.append(panel);
}

function renderClarificationInput(data) {
  results.replaceChildren();
  const panel = document.createElement("section");
  panel.className = "clarification-panel";

  const formRow = document.createElement("div");
  formRow.className = "search-row";

  const clarInput = document.createElement("input");
  clarInput.type = "text";
  clarInput.className = "clarification-input";
  clarInput.placeholder = "أضف توضيحًا للمعنى";
  clarInput.maxLength = 500;
  formRow.append(clarInput);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "secondary-button clarification-button";
  submitBtn.textContent = "البحث مجددًا";
  submitBtn.addEventListener("click", () => {
    const val = clarInput.value.trim();
    if (!val) {
      clarInput.focus();
      return;
    }
    meaningSearchState.clarifications.push(val);
    startMeaningSearch(true);
  });
  formRow.append(submitBtn);

  clarInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitBtn.click();
    }
  });

  panel.append(formRow);
  results.append(panel);
  clarInput.focus();
}

function renderRetryButton() {
  results.replaceChildren();
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "secondary-button retry-meaning-button";
  retryBtn.textContent = "إعادة المحاولة";
  retryBtn.addEventListener("click", () => {
    startMeaningSearch(true);
  });
  results.append(retryBtn);
}

async function startMeaningSearch(isRetry = false) {
  const currentInput = input.value.trim();
  if (!currentInput && !isRetry && !meaningSearchState.initialText) {
    input.focus();
    setStatus("الرجاء إدخال نص للبحث بالمعنى.", "empty");
    return;
  }

  if (!isRetry && (!meaningSearchState.initialText || currentInput !== meaningSearchState.initialText)) {
    meaningSearchState.initialText = currentInput;
    meaningSearchState.clarifications = [];
  }

  if (requestController) requestController.abort();
  requestController = new AbortController();
  const sequence = ++requestSequence;

  button.disabled = true;
  if (suggestButton) suggestButton.disabled = true;
  setStatus("جارٍ البحث عن أحاديث محتملة في الدرر السنية...", "loading");
  results.replaceChildren();

  try {
    const response = await fetch("/api/hadith/meaning-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: meaningSearchState.initialText,
        clarifications: meaningSearchState.clarifications,
      }),
      signal: requestController.signal,
    });

    const data = await response.json();
    if (sequence !== requestSequence) return;

    if (data.status === "candidates") {
      setStatus("", "success");
      renderMeaningCandidates(data.candidates || []);
    } else if (data.status === "needs_clarification") {
      setStatus(data.message, "empty");
      renderClarificationInput(data);
    } else if (data.status === "not_found") {
      setStatus(data.message, "empty");
      meaningSearchState = { initialText: "", clarifications: [] };
    } else if (data.status === "temporarily_unavailable" || !response.ok) {
      setStatus(data.message || "تعذّر إكمال البحث حاليًا. حاول مرة أخرى.", "error");
      renderRetryButton();
    } else {
      setStatus(data.message || "تعذّر إكمال البحث حاليًا. حاول مرة أخرى.", "error");
    }
  } catch (error) {
    if (error.name === "AbortError" || sequence !== requestSequence) return;
    setStatus("تعذّر إكمال البحث حاليًا. حاول مرة أخرى.", "error");
    renderRetryButton();
  } finally {
    if (sequence === requestSequence) {
      button.disabled = false;
      if (suggestButton) suggestButton.disabled = false;
    }
  }
}

// Normal search: calls existing /api/hadith/search (zero OpenRouter calls)
form.addEventListener("submit", (event) => {
  event.preventDefault();
  executeHadithSearch(input.value);
});

// Semantic search
if (suggestButton) {
  suggestButton.addEventListener("click", () => {
    startMeaningSearch(false);
  });
}

// Invalidate in-flight responses when the user changes the search or mode.
function invalidateSearch() {
  requestSequence += 1;
  requestController?.abort();
  button.disabled = false;
  if (suggestButton) suggestButton.disabled = false;
  results.replaceChildren();
  setStatus("", "");
  meaningSearchState = { initialText: "", clarifications: [] };
}
input.addEventListener("input", invalidateSearch);
form.querySelectorAll('input[name="mode"]').forEach(control => control.addEventListener("change", invalidateSearch));

if (typeof window !== "undefined" && window.location && window.location.search) {
  const urlParams = new URLSearchParams(window.location.search);
  const queryParam = urlParams.get("q");
  if (queryParam && queryParam.trim()) {
    input.value = queryParam.trim();
    executeHadithSearch(input.value);
  }
}
