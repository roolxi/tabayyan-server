const form = document.querySelector("#media-upload-form");
const fileInput = document.querySelector("#media-file-input");
const submitButton = document.querySelector("#media-submit-button");
const fileInfo = document.querySelector("#selected-file-info");
const statusEl = document.querySelector("#media-status");
const resultsEl = document.querySelector("#media-results");

let requestController = null;
let isSubmitting = false;

function setStatus(message, state) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${state || ""}`.trim();
}

function detectFileKind(file) {
  if (!file) return null;
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(name)) {
    return "image";
  }
  if (type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(name)) {
    return "video";
  }
  return "unknown";
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["dorar.net", "www.dorar.net"].includes(url.hostname)) {
      return url.href;
    }
  } catch (_) {}
  return "https://dorar.net/hadith/search";
}

function renderConfirmationResults(resultsList) {
  if (!resultsEl) return;
  resultsEl.replaceChildren();

  // Static confirmation heading owned by frontend
  const heading = document.createElement("h2");
  heading.className = "confirmation-heading";
  heading.textContent = "هل تقصد هذا النص؟";
  resultsEl.append(heading);

  // Model-extraction disclaimer owned by frontend
  const disclaimer = document.createElement("p");
  disclaimer.className = "media-disclaimer";
  disclaimer.textContent = "يُستخدم الذكاء الاصطناعي لاستخراج عبارة البحث فقط، أما النص المعروض ومصدره فمن قاعدة القرآن أو الدرر السنية.";
  resultsEl.append(disclaimer);

  const container = document.createElement("div");
  container.className = "confirmation-list";

  resultsList.forEach((item) => {
    const card = document.createElement("article");
    card.className = "result-card confirmation-card";

    // Kicker distinguishing Quran and Hadith
    const kicker = document.createElement("span");
    kicker.className = "result-kicker";
    kicker.textContent = item.type === "quran" ? "القرآن الكريم" : "الحديث الشريف";
    card.append(kicker);

    // Authoritative text from DB or Dorar
    const text = document.createElement("p");
    text.className = item.type === "quran" ? "verse-text" : "hadith-text";
    text.textContent = item.displayText || "";
    card.append(text);

    if (item.type === "quran" && item.source) {
      const meta = document.createElement("p");
      meta.className = "verse-meta";
      const parts = [];
      if (item.source.surahName) parts.push(item.source.surahName);
      if (item.source.ayah) parts.push(`الآية ${item.source.ayah}`);
      if (item.source.verseKey) parts.push(`(${item.source.verseKey})`);
      parts.push(`المصدر: ${item.source.name || "Tanzil Project"}`);
      meta.textContent = parts.join("، ");
      card.append(meta);

      const action = document.createElement("a");
      action.className = "primary-button continue-link";
      action.href = `/quran?q=${encodeURIComponent(item.extractedText || item.displayText || "")}`;
      action.textContent = "متابعة البحث في القرآن الكريم";
      card.append(action);
    } else if (item.type === "hadith") {
      if (item.mixedCategories) {
        const mixedNotice = document.createElement("div");
        mixedNotice.className = "search-note mixed-disclaimer";
        const mixedText = document.createElement("p");
        mixedText.textContent = "ظهرت في نتائج البحث تصنيفات بالصحة وأخرى بالضعف؛ وقد تختلف ألفاظ الحديث أو أسانيده. يمكنك الاطلاع على التفاصيل في الوضع المتخصص.";
        mixedNotice.append(mixedText);
        card.append(mixedNotice);
      }

      if (Array.isArray(item.records) && item.records.length > 0) {
        const record = item.records[0];
        const fields = [
          { label: "الراوي", val: record.narrator },
          { label: "المحدث", val: record.scholar },
          { label: "المصدر", val: record.book },
          { label: "الصفحة أو الرقم", val: record.reference },
          { label: "خلاصة حكم المحدث", val: record.grade },
        ];
        fields.forEach(({ label, val }) => {
          if (val) {
            const row = document.createElement("p");
            row.className = "hadith-field";
            const strong = document.createElement("strong");
            strong.textContent = `${label}: `;
            row.append(strong, document.createTextNode(val));
            card.append(row);
          }
        });
      }

      if (item.source && item.source.url) {
        const sourceLink = document.createElement("a");
        sourceLink.className = "record-source";
        sourceLink.target = "_blank";
        sourceLink.rel = "noopener noreferrer";
        sourceLink.href = safeSourceUrl(item.source.url);
        sourceLink.textContent = "المصدر: الدرر السنية";
        card.append(sourceLink);
      }

      const action = document.createElement("a");
      action.className = "primary-button continue-link";
      action.href = `/hadith?q=${encodeURIComponent(item.extractedText || item.displayText || "")}`;
      action.textContent = "متابعة البحث في الحديث الشريف";
      card.append(action);
    }

    container.append(card);
  });

  resultsEl.append(container);
}

function handleFileSelection() {
  if (requestController) {
    requestController.abort();
    requestController = null;
  }
  isSubmitting = false;

  // Clear stale results and status
  if (resultsEl) resultsEl.replaceChildren();
  setStatus("", "");

  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    if (fileInfo) fileInfo.textContent = "";
    if (submitButton) submitButton.disabled = true;
    return;
  }

  const kind = detectFileKind(file);
  const kindLabel = kind === "image" ? "صورة" : kind === "video" ? "فيديو" : "ملف غير معروف";
  if (fileInfo) {
    fileInfo.textContent = `الملف المختار: ${file.name} (${kindLabel})`;
  }
  if (submitButton) {
    submitButton.disabled = false;
  }
}

if (fileInput) {
  fileInput.addEventListener("change", handleFileSelection);
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (!file) {
      setStatus("الرجاء اختيار صورة أو فيديو أولاً.", "error");
      return;
    }

    const kind = detectFileKind(file);
    if (kind === "unknown") {
      setStatus("نوع الملف غير مدعوم. يُسمح فقط بالصور (JPEG, PNG, WebP) ومقاطع الفيديو (MP4, WebM, MOV).", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) submitButton.disabled = true;

    const loadingMsg = kind === "image"
      ? "جارٍ قراءة الصورة والتحقق من النص..."
      : "جارٍ استخراج الصوت والتحقق من النص...";
    setStatus(loadingMsg, "loading");
    if (resultsEl) resultsEl.replaceChildren();

    requestController = new AbortController();

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/media/extract", {
        method: "POST",
        body: formData,
        signal: requestController.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "تعذّر التحقق من الوسائط حاليًا. حاول مرة أخرى.", "error");
        return;
      }

      if (data.status === "candidates" && Array.isArray(data.results) && data.results.length > 0) {
        setStatus("", "success");
        renderConfirmationResults(data.results);
      } else if (data.status === "temporarily_unavailable") {
        setStatus(data.message || "تعذّر إكمال التحقق حاليًا. حاول مرة أخرى.", "error");
      } else {
        setStatus("لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى.", "empty");
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
      setStatus("تعذّر الاتصال بالخادم. حاول مرة أخرى.", "error");
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = !(fileInput && fileInput.files && fileInput.files.length > 0);
      }
    }
  });
}