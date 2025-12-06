// api/pagescan-generate.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Utility – safe JSON parse
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ⭐ NEW: Utility to shorten context safely
function shortenContext(str = "", max = 180) {
  str = str.trim();
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trim() + "…";
}

export default async function handler(req, res) {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: "Invalid payload." });
    }

    const results = [];

    for (const img of images) {
      /* ----------------------------------------------------
         CONTEXT PREPARATION
         (Added shortening + cleaner fallback)
      ----------------------------------------------------- */

      const rawContext =
        img.finalContext?.trim() ||
        img.contextRaw?.trim() ||
        "Couldn't find relevant context for this image. While we can still generate the AI-output by reading the image, we recommend adding some.";

      // ⭐ Shorten the context before using it in prompt
      const context = shortenContext(rawContext, 180);

      /* ----------------------------------------------------
         EXISTING META
      ----------------------------------------------------- */
      const existingAlt = img.alt || "";
      const existingCaption = img.caption || "";
      const existingFilename = img.filename || "";

      /* ----------------------------------------------------
         AI PROMPT (rewritten + tightened)
      ----------------------------------------------------- */
      const prompt = `
You are an SEO-focused assistant. Generate clean metadata for an image.

Return **ONLY valid JSON**, no comments.

JSON format:
{
  "alt": "...",
  "caption": "...",
  "filename": "..."
}

Rules:
- ALT text must be **80–120 characters**, natural, contextual, not visual description.
- Caption must be **50–80 characters**, useful, human, not promotional.
- Filename must be **3–6 lowercase hyphenated words** (no extension).
- Use the provided context + existing metadata to infer meaning and keyword.
- Avoid visual description (“a man holding a ball”).
- Do NOT mention page titles or headers directly.
- If unsure, infer the best SEO-relevant meaning.

Context: "${context}"
Existing ALT: "${existingAlt}"
Existing Caption: "${existingCaption}"
Existing Filename: "${existingFilename}"
      `;

      let aiJSON = null;

      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        });

        const text = response.choices[0].message.content.trim();
        aiJSON = safeParseJSON(text);
      } catch (err) {
        aiJSON = null;
      }

      /* ----------------------------------------------------
         FALLBACK HANDLING
      ----------------------------------------------------- */
      if (!aiJSON) {
        results.push({
          aiAlt: "<<missing>>",
          aiCaption: "<<missing>>",
          aiFilename: "image-file",
        });
        continue;
      }

      /* ----------------------------------------------------
         PUSH CLEAN OUTPUT
      ----------------------------------------------------- */
      results.push({
        aiAlt: aiJSON.alt || "<<missing>>",
        aiCaption: aiJSON.caption || "<<missing>>",
        aiFilename: aiJSON.filename || "image-file",
      });
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({
      error: "Unexpected server error in AI generation.",
    });
  }
}
