// api/generate.js

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { image: imageDataUrl, keyword: optionalKeyword = "" } = req.body || {};

    if (!imageDataUrl) {
      return res.status(400).json({ error: "No image provided" });
    }

    // ⭐⭐⭐ ADDED: keyword cleaning + soft enforcement ⭐⭐⭐
    let keywordNote = "";
if (optionalKeyword.trim()) {
  const parts = optionalKeyword
    .split(",")
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (parts.length > 2) {
    return res.status(400).json({ error: "Only 2 keywords allowed." });
  }

  if (parts.length > 0) {
    keywordNote = `
When writing "alt" and "caption":
• Gently incorporate ALL of these keywords in both alt and caption output: ${parts.join(", ")}  
• Use synonyms or semantic variations IF needed to make the text natural.  
• The keywords should feel smoothly integrated, not forced or artificial.  
• DO NOT include these keywords in the "filename".  
• The "filename" should only reflect what is visually present in the image.

Keep tone natural and descriptive. Avoid keyword stuffing.
`;
  }
}


    const systemPrompt = `
You are an Image SEO Expert. Given the image attached, return EXACTLY ONE JSON object (no extra commentary)
with these keys: "alt", "caption", "filename".

Rules:
- "alt": concise, descriptive, accessible alt text (max 125 characters). Mention important visible details only.
- "caption": short caption usable on blog/social (max 75 characters).
- "filename": lowercase, words separated by hyphens, no special chars, no file extension name; meant to describe the image in short keywords.

Return only JSON. Example:
{"alt":"The Taj Mahal, a white marble mausoleum with minarets, reflects in a long pool under a blue sky with scattered clouds in Agra, India.","caption":"The Taj Mahal on a sunny day","filename":"taj-mahal"}`;

    // ⭐⭐⭐ ADDED: final prompt = base prompt + keyword logic ⭐⭐⭐
    const finalPrompt = systemPrompt + keywordNote;

    // Build OpenAI Responses API payload
    const payload = {
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            // ⭐⭐⭐ CHANGED: send finalPrompt instead of systemPrompt ⭐⭐⭐
            { type: "input_text", text: finalPrompt },
            { type: "input_image", image_url: imageDataUrl }
          ]
        }
      ],
      temperature: 0.0
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfigured: OPENAI_API_KEY missing" });
    }

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const detail = await apiResponse.text();
      return res.status(apiResponse.status).json({ error: "OpenAI error", detail });
    }

    const data = await apiResponse.json();

    // Attempt to extract text
    let rawText = "";
    try {
      if (data.output && Array.isArray(data.output)) {
        rawText = data.output.map(o => {
          if (typeof o === "string") return o;
          if (o?.content) {
            if (typeof o.content === "string") return o.content;
            return Array.isArray(o.content)
              ? o.content.map(c => c.text || "").join(" ")
              : "";
          }
          return "";
        }).join("\n");
      }
      if (!rawText && data.output_text) rawText = data.output_text;
      if (!rawText && data.choices?.[0]?.message) {
        rawText = data.choices[0].message.content?.[0]?.text ||
                  data.choices[0].message.content ||
                  "";
      }
    } catch (e) {
      rawText = "";
    }

    if (!rawText) rawText = JSON.stringify(data);

    // Extract JSON object from rawText
    const match = rawText.match(/\{[\s\S]*\}/);
    let parsed = null;

    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (err1) {
        try {
          const sanitized = match[0]
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
            .replace(/'/g, '"');
          parsed = JSON.parse(sanitized);
        } catch (err2) {
          parsed = null;
        }
      }
    }

    if (!parsed) {
      return res.status(200).json({ error: "could-not-parse-json", raw: rawText });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}