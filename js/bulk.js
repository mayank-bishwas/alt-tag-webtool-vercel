// js/bulk.js
document.addEventListener("DOMContentLoaded", () => {

  // ------------------------------------------------------
  // ELEMENTS
  // ------------------------------------------------------
  const input = document.getElementById("bulkImageInput");
  const uploadArea = document.getElementById("bulkUploadArea");
  const descInput = document.getElementById("bulkDescription");
  const descError = document.getElementById("bulkDescError");
  const generateBtn = document.getElementById("bulkGenerateBtn");

  // Master states inside the upload box
  const bulkDefaultUI        = document.getElementById("bulkDefaultUI");
  const bulkUploadingBox     = document.getElementById("bulkUploadingBox");
  const bulkUploadingDoneBox = document.getElementById("bulkUploadingDoneBox");
  const bulkProcessingBox    = document.getElementById("bulkProcessingBox");
  const bulkDoneBox          = document.getElementById("bulkDoneBox");
  const bulkErrorBox         = document.getElementById("bulkErrorBox");

  // Uploading counters
  const uploadingCount       = document.getElementById("uploadingCount");
  const uploadingDoneCount   = document.getElementById("uploadingDoneCount");

  // Processing UI
  const progressFill         = document.getElementById("bulkProgressFill");
  const progressText         = document.getElementById("bulkProgressText");
  const progressRemark       = document.getElementById("bulkProgressRemark");

  // Error + Done containers
  const errorList            = document.getElementById("bulkErrorList");
  const downloadLink         = document.getElementById("bulkDownloadLink");

  // Data
  let filesData = [];
  let progressTimer = null;


  // ENABLE ENTER KEY TO TRIGGER GENERATE / RESET
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();  // avoid accidental form submits
    
    if (generateBtn.disabled) return;  // safety guard

    generateBtn.click();  // enter behaves like a button click
  }
});


  // ------------------------------------------------------
// ACTIVE / INACTIVE BORDER STATES
// ------------------------------------------------------
function setInactive() {
  uploadArea.classList.remove("active");
  uploadArea.classList.add("inactive");
}

function setActive() {
  uploadArea.classList.remove("inactive");
  uploadArea.classList.add("active");
}

// ------------------------------------------------------
// SHOW ONLY ONE OF THE INNER STATES
// ------------------------------------------------------
function showState(stateElement) {
  const states = [
    bulkDefaultUI,
    bulkUploadingBox,
    bulkUploadingDoneBox,
    bulkProcessingBox,
    bulkDoneBox,
    bulkErrorBox
  ];

  // hide everything
  states.forEach(s => s.style.display = "none");

  // show only requested one
  if (stateElement) {
    stateElement.style.display = "flex";
  }
}



  // ------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------
  function resetUI() {
    if (progressTimer) clearInterval(progressTimer);

    progressFill.style.width = "0%";
    progressRemark.textContent = "";
    generateBtn.disabled = false;
  }

  function toDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject("Bad file");
      r.readAsDataURL(file);
    });
  }

  function b64ToBlob(base64, mime) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      arr[i] = bytes.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
  }



  // ------------------------------------------------------
  // UPLOAD HANDLER
  // ------------------------------------------------------
  input.addEventListener("change", async (e) => {
    resetUI();
    filesData = [];

    const files = Array.from(e.target.files || []);

    if (files.length === 0) {
      setActive();
      showState(bulkDefaultUI);
      return;
    }

    // Show uploading screen
    setInactive();
    showState(bulkUploadingBox);
    uploadingCount.textContent = `0/${files.length}`;

    // Validate limits
    if (files.length > 15) {
      errorList.innerHTML = `<li>${files.length} images uploaded. Max 15 allowed.</li>`;
      setInactive();
      showState(bulkErrorBox);

      generateBtn.textContent = "Reset";
      generateBtn.disabled = false;

      return;
    }

    let totalSize = files.reduce((s, f) => s + f.size, 0);
    if (totalSize > 12 * 1024 * 1024) {
      errorList.innerHTML = `<li>Total file size exceeds 12MB.</li>`;
      setInactive();
      showState(bulkErrorBox);
      
      generateBtn.textContent = "Reset";
      generateBtn.disabled = false;
      return;
    }

    // Read files
    let loaded = 0;
    for (const f of files) {
      try {
        const dataUrl = await toDataURL(f);
        filesData.push({ name: f.name, data: dataUrl, bad: false });
      } catch {
        filesData.push({ name: f.name, data: null, bad: true });
      }

      loaded++;
      uploadingCount.textContent = `${loaded}/${files.length}`;
    }

    // Uploaded screen
    uploadingDoneCount.textContent = `${files.length}/${files.length}`;
    setInactive();
    showState(bulkUploadingDoneBox);
  });



  // ------------------------------------------------------
  // DESCRIPTION VALIDATION
  // ------------------------------------------------------
  descInput.addEventListener("input", () => {
    descError.textContent =
      descInput.value.length >= 100
        ? "Only 100 characters. Like a witty tweet but shorter 🪆"
        : "";
  });



  // ------------------------------------------------------
  // GENERATE / PROCESS
  // ------------------------------------------------------
  generateBtn.addEventListener("click", async () => {

    // RESET STATE
    if (generateBtn.textContent === "Reset") {
      input.value = "";
      filesData = [];
      resetUI();
      showState(bulkDefaultUI);
      setActive(); // restore pink border
      generateBtn.textContent = "Generate ALT Text for All";
      return;
    }

    // Validate
    if (!filesData.length) {
  errorList.innerHTML = "<li>Please upload some images first.</li>";
  setInactive();
  showState(bulkErrorBox);

  generateBtn.textContent = "Reset";
  generateBtn.disabled = false;
  return;
}


    // Processing screen
    setInactive();
    showState(bulkProcessingBox);
    generateBtn.textContent = "Generating…";
    generateBtn.disabled = true;

    progressFill.style.width = "0%";
    progressText.textContent = `Putting AI in Alt Tag of the image 0/${filesData.length}`;

    // Fake progress
    let done = 0;
    const total = filesData.length;

    progressTimer = setInterval(() => {
      if (done < total) {
        done++;
        progressFill.style.width = `${Math.round(done / total * 100)}%`;
        progressText.textContent = `Putting AI in Alt Tag of the image ${done}/${total}`;
      }
    }, 400);


    // Backend call
    try {
      const resp = await fetch("/api/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descInput.value, images: filesData })
      });

      const json = await resp.json();
      clearInterval(progressTimer);

      progressFill.style.width = "100%";
      progressText.textContent = `Putting AI in Alt Tag of the image ${total}/${total}`;

      if (!json.excelBase64) {
        setInactive();
        errorList.innerHTML = `<li>${json.error || "Something went wrong."}</li>`;
        showState(bulkErrorBox);
        generateBtn.textContent = "Reset";
        generateBtn.disabled = false;
        return;
      }

      // Auto-download
      const blob = b64ToBlob(json.excelBase64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = json.fileName;
      a.click();

      // Done screen
      setInactive();
      showState(bulkDoneBox);

      downloadLink.href = url;
      downloadLink.download = json.fileName;

      generateBtn.textContent = "Reset";
      generateBtn.disabled = false;

    } catch (err) {
      clearInterval(progressTimer);
      setInactive();
      errorList.innerHTML = `<li>Something went wrong.</li>`;
      showState(bulkErrorBox);
      generateBtn.textContent = "Reset";
      generateBtn.disabled = false;
    }
  });


});
