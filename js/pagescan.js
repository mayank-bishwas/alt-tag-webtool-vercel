// pagescan.js — VERSION aligned with new fetch + generate routes

document.addEventListener("DOMContentLoaded", () => {

  /* ------------------------------------------------------
     DOM ELEMENTS
  ------------------------------------------------------ */
  const urlInput = document.getElementById("urlInput");
  const scanError = document.getElementById("scanError");
  const scanWarnings = document.getElementById("scanWarnings");
  const resultsSection = document.getElementById("resultsSection");
  const resultsContainer = document.getElementById("resultsContainer");
  const actionBtnTop = document.getElementById("actionBtnTop");
  const actionBtnBottom = document.getElementById("actionBtnBottom");
  const exportBtn = document.getElementById("exportBtn");
  const templateCard = document.getElementById("templateCard");

  /* ------------------------------------------------------
     STATE
  ------------------------------------------------------ */
  let mode = "scan"; // scan → generate → reset
  let scannedImages = [];
  let pageMeta = {};

  /* ------------------------------------------------------
     TIMESTAMP UTILITIES
  ------------------------------------------------------ */

  function getISTTimestamp() {
    const now = new Date();
    return now.toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).replace(",", "");
  }

  function istFilenameTimestamp() {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

    const pad = (n) => n.toString().padStart(2, "0");
    const yyyy = ist.getFullYear();
    const mm = pad(ist.getMonth() + 1);
    const dd = pad(ist.getDate());
    const hh = pad(ist.getHours());
    const min = pad(ist.getMinutes());
    const ss = pad(ist.getSeconds());

    return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
  }

  /* ------------------------------------------------------
     BUTTON CLICK HANDLERS
  ------------------------------------------------------ */
  actionBtnTop.addEventListener("click", handleAction);
  actionBtnBottom.addEventListener("click", handleAction);

  function handleAction() {
    if (mode === "scan") return handleScan();
    if (mode === "generate") return handleGenerate();
    if (mode === "reset") return handleReset();
  }

  function updateButtons(label, disabled = false) {
    actionBtnTop.textContent = label;
    actionBtnBottom.textContent = label;
    actionBtnTop.disabled = disabled;
    actionBtnBottom.disabled = disabled;
  }

  /* ------------------------------------------------------
     ENTER KEY SHORTCUT
  ------------------------------------------------------ */
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (mode === "scan" || mode === "generate")) {
      e.preventDefault();
      handleAction();
    }
  });

  /* ------------------------------------------------------
     TOGGLE LINK BOX INACTIVE
  ------------------------------------------------------ */
  function setLinkBoxInactive(state) {
    const box = document.querySelector(".link-box");
    state ? box.classList.add("inactive") : box.classList.remove("inactive");
  }

  /* ------------------------------------------------------
     STEP 1 — SCAN PAGE
  ------------------------------------------------------ */
  async function handleScan() {
    let url = urlInput.value.trim();
    if (!url) {
      scanError.textContent = "Please enter a webpage URL.";
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    scanError.textContent = "";
    resultsContainer.innerHTML = "";
    resultsSection.style.display = "none";
    scanWarnings.innerHTML = "";

    updateButtons("Scanning...", true);
    setLinkBoxInactive(true);
    exportBtn.disabled = true;

    try {
      const resp = await fetch("/api/pagescan-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await resp.json();
      if (!resp.ok || data.error) {
        scanError.textContent = data.error || "Could not scan this page.";
        updateButtons("Reset");
        mode = "reset";
        setLinkBoxInactive(false);
        return;
      }

      /* SAVE METADATA */
      pageMeta = {
        url,
        title: data.title || "",
        totalImages: data.totalImages || 0,
        usedImages: data.usedImages || 0
      };

      /* MAP IMAGES */
      scannedImages = (data.images || []).map((img) => ({
        src: img.src || "",
        alt: img.alt || "",
        caption: img.caption || "",
        filename: img.filename || "",
        contextRaw: img.contextRaw || "",
        previewOk: img.previewOk !== false,
        error: img.error || null
      }));

      /* HANDLE ZERO IMAGES */
      if (scannedImages.length === 0) {
        scanError.innerHTML = `No valid images detected on this page.<br> <a href="/" target="_blank" style="color:#3b66ff; text-decoration:underline;"> Try uploading manually↗</a>.`;

        updateButtons("Reset");
        mode = "reset";
        setLinkBoxInactive(false);
        return;
      }

      /* RENDER UI */
      renderHeader();
      
      renderPreviewCards();

      resultsSection.style.display = "block";

      updateButtons("Generate ALT Text");
      mode = "generate";
    } catch (e) {
      scanError.textContent = "Unexpected error while scanning.";
      updateButtons("Reset");
      mode = "reset";
    } finally {
      setLinkBoxInactive(false);
    }
  }

  /* ------------------------------------------------------
     STEP 2 — GENERATE AI META
  ------------------------------------------------------ */
  async function handleGenerate() {
    updateButtons("Generating...", true);
    setLinkBoxInactive(true);
    exportBtn.disabled = true;

    const payload = scannedImages.map((img, i) => {
      const card = resultsContainer.querySelector(`.scan-card[data-index='${i}']`);
      const ctx = card?.querySelector(".context-input")?.value.trim() || "";
      return {
        src: img.src,
        alt: img.alt,
        caption: img.caption,
        filename: img.filename,
        finalContext: ctx,
        error: img.error
      };
    });

    try {
      const resp = await fetch("/api/pagescan-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: payload })
      });

      const data = await resp.json();
      if (!resp.ok || data.error) {
        scanWarnings.textContent = data.error || "AI generation failed.";
        updateButtons("Reset");
        mode = "reset";
        return;
      }

      renderFinalCards(data.results || []);

      exportBtn.disabled = false;
      document.querySelector(".export-meta-icon").src = "images/export-active.svg";

      updateButtons("Reset");
      mode = "reset";
    } catch {
      scanWarnings.textContent = "Unexpected error during generation.";
      updateButtons("Reset");
      mode = "reset";
    } finally {
      setLinkBoxInactive(false);
    }
  }

  // ------------------------------------------------------
// COPY BUTTON HANDLER (same as index page)
// ------------------------------------------------------
function wireCopy(button, targetEl) {
  if (!button || !targetEl) return;

  button.addEventListener("click", async () => {
    const text = targetEl.textContent || targetEl.innerText;

    try {
      await navigator.clipboard.writeText(text);
      button.classList.add("copied");
      setTimeout(() => button.classList.remove("copied"), 200);
    } catch (e) {
      alert("Copy failed. Select and copy manually.");
    }
  });
}


  /* ------------------------------------------------------
     RESET
  ------------------------------------------------------ */
  function handleReset() {
    scannedImages = [];
    pageMeta = {};
    resultsContainer.innerHTML = "";
    resultsSection.style.display = "none";
    scanError.textContent = "";
    scanWarnings.innerHTML = "";
    urlInput.value = "";
    exportBtn.disabled = true;
    document.querySelector(".export-meta-icon").src = "images/export-inactive.svg";
    updateButtons("Scan Page for Images");
    mode = "scan";
  }

  /* ------------------------------------------------------
     RENDER UI FUNCTIONS
  ------------------------------------------------------ */

  function renderHeader() {
    const total = pageMeta.totalImages || pageMeta.usedImages || 0;
    const used = pageMeta.usedImages || 0;

    document.getElementById("pageTitle").textContent =
      pageMeta.title || pageMeta.url;

    document.getElementById("imageCount").innerHTML =
      `${used} / ${total}<br>images`;
  }

  function renderWarnings() {
  scanWarnings.innerHTML = ""; // do nothing
  }


  function renderPreviewCards() {
    resultsContainer.innerHTML = "";

    scannedImages.forEach((img, index) => {
      const card = templateCard.cloneNode(true);
      card.style.display = "block";
      card.dataset.index = index;

      /* IMAGE */
      const imgTag = card.querySelector(".scan-image");
      const imgErr = card.querySelector(".img-error");
      const imgLink = card.querySelector(".img-view-link");

      if (img.previewOk && img.src) {
        imgTag.src = img.src;
        imgTag.style.display = "block";
        imgErr.style.display = "none";
      } else {
        imgTag.style.display = "none";
        imgErr.style.display = "block";
        imgLink.href = img.src || "#";
      }

      /* EXISTING META */
      setMetaValue(card.querySelector(".existing-alt"), img.alt || "<<missing>>");
      setMetaValue(card.querySelector(".existing-caption"), img.caption || "<<missing>>");
      setMetaValue(card.querySelector(".existing-filename"), img.filename || "<<missing>>");

      /* PLACEHOLDERS FOR AI */
      setMetaPlaceholder(card.querySelector(".ai-alt"), "Your AI ALT will appear here.");
      setMetaPlaceholder(card.querySelector(".ai-caption"), "Your AI Caption will appear here.");
      setMetaPlaceholder(card.querySelector(".ai-filename"), "Your AI Filename will appear here.");


      /* CONTEXT */
      const ctx = img.contextRaw || "";
      const ctxInput = card.querySelector(".context-input");
      const ctxLabel = card.querySelector(".context-label");
      const ctxCount = card.querySelector(".context-charcount");

      ctxInput.value = ctx;
      ctxCount.textContent = `${ctx.length} / 200`;
      ctxLabel.textContent = ctx ? "Context" : "Context (optional)";

      ctxInput.addEventListener("input", () => {
        const len = ctxInput.value.length;
        ctxCount.textContent = `${len} / 200`;
        ctxLabel.textContent = len ? "Context (edited)" : "Context (optional)";
      });

      // COPY BUTTONS (wire them for preview cards)
        wireCopy(card.querySelector(".ai-copy[data-copy='ai-alt']"), card.querySelector(".ai-alt"));
        wireCopy(card.querySelector(".ai-copy[data-copy='ai-caption']"), card.querySelector(".ai-caption"));
        wireCopy(card.querySelector(".ai-copy[data-copy='ai-filename']"), card.querySelector(".ai-filename"));

      resultsContainer.appendChild(card);
    });
  }

  /* Helpers for meta value formatting */
  function setMetaValue(el, text) {
    if (!el) return;
    el.textContent = text;
    if (text === "<<missing>>") el.classList.add("placeholder");
    else el.classList.remove("placeholder");
  }

  function setMetaPlaceholder(el, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.add("placeholder");
  }

  /* ------------------------------------------------------
     RENDER FINAL AI OUTPUTS
  ------------------------------------------------------ */
  function renderFinalCards(results) {
    results.forEach((res, i) => {
      const card = resultsContainer.querySelector(`.scan-card[data-index='${i}']`);
      if (!card) return;

      setMetaValue(card.querySelector(".ai-alt"), res.aiAlt || "<<missing>>");
      setMetaValue(card.querySelector(".ai-caption"), res.aiCaption || "<<missing>>");
      setMetaValue(card.querySelector(".ai-filename"), res.aiFilename || "<<missing>>");
    });
  }

  /* ------------------------------------------------------
     CSV EXPORT
  ------------------------------------------------------ */
  exportBtn.addEventListener("click", () => {
    const csv = createCSV();
    autoDownloadCSV(csv);
});

function createCSV() {
    // Helper function to quote and escape values for CSV compatibility.
    const Q = (val) => `"${(val || "").replace(/"/g, '""')}"`;
    
    let csv = "";
    
    // 1. Column Headers (Starts on Row 1)
    // The table starts immediately for easy importing/reading.
    csv += "#,image_url,final_context,existing_alt,ai_alt,existing_caption,ai_caption,existing_filename,ai_filename,error\n";

    // 2. Image Data Rows
    scannedImages.forEach((img, i) => {
      const card = resultsContainer.querySelector(`.scan-card[data-index='${i}']`);

      const ctx = card.querySelector(".context-input").value;
      const aiAlt = card.querySelector(".ai-alt").textContent;
      const aiCaption = card.querySelector(".ai-caption").textContent;
      const aiFilename = card.querySelector(".ai-filename").textContent;

      // Note: Sticking to your original column sequence, assuming your "final_context"
      // is the user-editable text from the context box.
      csv += [
        i + 1,
        Q(img.src),
        Q(ctx),
        Q(img.alt || "<<missing>>"),
        Q(aiAlt),
        Q(img.caption || "<<missing>>"),
        Q(aiCaption),
        Q(img.filename || "<<missing>>"),
        Q(aiFilename),
        "N/A"
      ].join(",") + "\n";
    });
    
    // 3. Footer Block (Metadata and Stamp)
    
    // Add two blank lines for visual separation after the table data
    csv += "\n\n"; 
    
    // Page URL (single cell in column B)
        csv += `,"page_url: ${pageMeta.url}"\n`;

    // Page Title (single cell in column B)
        csv += `,"page_title: ${pageMeta.title}"\n`;

    
    // Brand Stamp (Starts in Column B, Row below Title)
    csv += `,Generated by Image ALT AI with ♥ on ${getISTHumanTimestamp()} IST\n`;
    return csv;
}


// Timestamp helpers
function getISTHumanTimestamp() {
  const now = new Date();
  return now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getISTFilenameTimestamp() {
  const now = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return now.replace(/[^0-9]/g, "")
            .replace(/^(\d{2})(\d{2})(\d{4})(\d{6})$/, "$3$2$1_$4");
}


// the brandstamp and filename

  function autoDownloadCSV(csv) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `pagescan_imagealtai_output_${getISTFilenameTimestamp()}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

});
