import ExcelJS from "exceljs";

/**
 * Bulk Image SEO Generator using OpenAI Responses API (gpt-4o-mini)
 * Adds "error_reason" column to Excel output
 */

const CONCURRENCY = 3;
const MAX_IMAGES = 15;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

function pad(n) {
  return String(n).padStart(2, "0");
}
function istTimestampForFilename(d = new Date()) {
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600 * 1000);
  return (
    ist.getFullYear() +
    pad(ist.getMonth() + 1) +
    pad(ist.getDate()) +
    "_" +
    pad(ist.getHours()) +
    pad(ist.getMinutes()) +
    pad(ist.getSeconds())
  );
}

async function callOpenAI_imageToJson(apiKey, dataUrl, description) {
  const basePrompt = `You are an Image SEO expert. Use the batch description, if given, as context guidance for the image batch uploaded.
Understand its tone, brand, product, and use-case to apply but softly — judge whether a particular image needs it or not. 
Analyze the image and return EXACTLY one JSON object:
{"alt":"...", "caption":"...", "filename":"..."}

Rules:
- alt: 75–125 characters; blend visual accuracy with the batch context naturally.
- caption: 40–75 characters; concise and brand-aligned.
- filename: 10–20 characters, lowercase, hyphens only, no extension.
- No keyword stuffing. No extra text. Output ONLY valid JSON.`;

  const payload = {
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: basePrompt + (description ? `\nBatch context: ${description}` : "")
          },
          { type: "input_image", image_url: dataUrl }
        ]
      }
    ],
    temperature: 0
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(`OpenAI error (${resp.status}): ${msg}`);
  }

  const data = await resp.json();

  let raw = "";
  if (Array.isArray(data.output)) {
    raw = data.output
      .map((c) => {
        if (typeof c === "string") return c;
        if (c?.content && Array.isArray(c.content)) {
          return c.content.map(x => x?.text || "").join(" ");
        }
        return "";
      })
      .join(" ");
  } else if (typeof data.output_text === "string") raw = data.output_text;

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("JSON parse failed: no object found");

  return JSON.parse(match[0]);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method Not Allowed" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      return res.status(500).json({ error: "OPENAI_API_KEY missing" });

    const body = req.body || {};
    const description = (body.description || "").toString().slice(0, 200);
    const images = Array.isArray(body.images) ? body.images : [];

    if (images.length === 0)
      return res.status(400).json({ error: "No images provided" });

    if (images.length > MAX_IMAGES)
      return res.status(400).json({ error: `Too many images. Max ${MAX_IMAGES}.` });

    let totalBytesEstimate = 0;
    for (const im of images) {
      if (im?.data) {
        totalBytesEstimate += Math.ceil((im.data.length * 3) / 4);
      }
    }
    if (totalBytesEstimate > MAX_TOTAL_BYTES)
      return res.status(400).json({ error: "Total files exceed 12 MB (approx)." });

    const items = images.map((im, i) => ({
      idx: i + 1,
      name: im?.name || `file-${i + 1}`,
      data: im?.data || null,
      bad: !im?.data
    }));

    const queue = [...items];
    const results = new Array(items.length);

    async function worker() {
      while (queue.length > 0) {
        const it = queue.shift();

        // Default failure
        const fallback = {
          idx: it.idx,
          name: it.name,
          alt: "PROCESSING FAILED",
          caption: "PROCESSING FAILED",
          filename: "failed",
          error: "Unknown error"
        };

        if (it.bad) {
          results[it.idx - 1] = {
            ...fallback,
            error: "Unreadable file or unsupported format"
          };
          continue;
        }

        try {
          const parsed = await callOpenAI_imageToJson(apiKey, it.data, description);

          const alt = (parsed.alt || "").toString().slice(0, 125);
          const caption = (parsed.caption || "").toString().slice(0, 75);

          let filename = (parsed.filename || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 120);

          if (!filename) filename = `file-${it.idx}`;

          results[it.idx - 1] = {
            idx: it.idx,
            name: it.name,
            alt: alt,
            caption: caption,
            filename: filename,
            error: ""
          };
        } catch (err) {
          let shortMsg = "Unknown error";

if (err.message.includes("unsupported") || err.message.includes("invalid")) {
  shortMsg = "File format not supported. Allowed: JPG, JPEG, PNG, GIF, WebP.";
}
else if (err.message.includes("OpenAI error")) {
  shortMsg = "AI could not analyze the image.";
}

results[it.idx - 1] = {
  ...fallback,
  error: shortMsg
};
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      () => worker()
    );
    await Promise.all(workers);

    // Build Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("bulk image seo");

    sheet.columns = [
      { header: "#", key: "idx", width: 6 },
      { header: "original_name", key: "name", width: 36 },
      { header: "alt_text", key: "alt", width: 60 },
      { header: "caption", key: "caption", width: 40 },
      { header: "file_name", key: "filename", width: 30 },
      { header: "error_reason", key: "error", width: 60 } // NEW COLUMN
    ];

    results.forEach((r) => sheet.addRow(r));

    // Write brand stamp below the table (in column F)
const lastRow = sheet.rowCount + 1;   // one row after the last data row

const stampLine1 = "Generated by Image SEO Checker with ♥";
const stampLine2 = "on " + istTimestampForFilename(new Date()) + " IST";

sheet.getCell(`F${lastRow}`).value = `${stampLine1}\n${stampLine2}`;
sheet.getCell(`F${lastRow}`).alignment = { wrapText: true };



    const buffer = await workbook.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(buffer).toString("base64");

    const outName = `bulk_image_seo_output—${istTimestampForFilename(new Date())}.xlsx`;

    return res.status(200).json({
      excelBase64,
      fileName: outName
    });

  } catch (err) {
    console.error("bulk-generate critical error:", err);
    return res.status(500).json({ error: "backend-failure" });
  }
}
