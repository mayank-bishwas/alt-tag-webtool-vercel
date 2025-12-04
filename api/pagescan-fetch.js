// api/pagescan-fetch.js
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing URL." });

    // Fetch page HTML
    const fetched = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    if (!fetched.ok) {
      return res.status(500).json({ error: "Could not load webpage." });
    }

    const html = await fetched.text();
    const $ = cheerio.load(html);

    // Extract page title
    const title = $("title").first().text().trim() || "";

    // Helper to resolve relative URLs
    function absoluteUrl(src) {
      try {
        return new URL(src, url).href;
      } catch {
        return null;
      }
    }

    // Filters to remove unwanted images
    const BAD_KEYWORDS = [
      "logo",
      "icon",
      "avatar",
      "sprite",
      "favicon",
      "ads",
      "ad-",
      "tracking",
      "/promo/",
      "pixel",
      "badge",
      "placeholder",
      "dummy",
      "thumbsvg",
    ];

    function shouldSkip(srcLower) {
      if (srcLower.endsWith(".svg")) return true;
      return BAD_KEYWORDS.some((k) => srcLower.includes(k));
    }

    // Extract up to 10 good images
    let collected = [];

    $("img").each((i, el) => {
      if (collected.length >= 10) return;

      const tag = $(el);

      // Get src (lazy-load supported)
      const rawSrc =
        tag.attr("src") ||
        tag.attr("data-src") ||
        tag.attr("data-lazy-src") ||
        tag.attr("data-original");

      if (!rawSrc) return;

      const finalSrc = absoluteUrl(rawSrc);
      if (!finalSrc) return;

      const lower = finalSrc.toLowerCase();
      if (shouldSkip(lower)) return;

      // Context neighborhood extraction
      const contextRaw = extractLocalContext($, tag);

      collected.push({
        src: finalSrc,
        alt: tag.attr("alt") || "",
        caption: "",
        filename: finalSrc.split("/").pop() || "",
        contextRaw,
        previewOk: true,
        error: null,
      });
    });

    return res.status(200).json({
      url,
      title,
      totalImages: $("img").length,
      usedImages: collected.length,
      images: collected,
      warnings: buildWarnings(collected.length, $("img").length),
    });
  } catch (err) {
    console.error("FETCH ERROR:", err);
    return res.status(500).json({ error: "Unexpected error while scanning." });
  }
}


/* ----------------------------------------
   1. Extract local header + nearby paragraphs
----------------------------------------- */
function extractLocalContext($, imgTag) {
  let out = [];

  // 1. Previous header
  const prevHeader = imgTag.prevAll("h1, h2, h3, h4, h5, h6").first();
  if (prevHeader.length) out.push(prevHeader.text().trim());

  // 2. Closest paragraph ABOVE
  const prevP = imgTag.prevAll("p").first();
  if (prevP.length) out.push(prevP.text().trim());

  // 3. Closest paragraph BELOW
  const nextP = imgTag.nextAll("p").first();
  if (nextP.length) out.push(nextP.text().trim());

  const combined = out.join(" ").trim();
  return combined || ""; // return "" if nothing found
}


/* ----------------------------------------
   Build warnings for UI
----------------------------------------- */
function buildWarnings() {
  return []; // no warnings ever
}
