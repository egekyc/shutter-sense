// Searches Wikimedia Commons for photos that are public domain / CC0 AND carry real EXIF
// (aperture, shutter speed, ISO), so the answers are the photographer's own settings.
// Results are merged into data/photo-candidates.json (existing entries are kept).
//
// Usage:  node tools/curate-photos.mjs
// Then:   review, edit tools/photo-levels.json, run node tools/build-photo-data.mjs
// Node 18+ (uses global fetch).

import { readFile, writeFile } from "node:fs/promises";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "ShutterSenseCurator/1.1 (photography guessing game; github)";
const OUT = new URL("../data/photo-candidates.json", import.meta.url);

const LICENSE_CATS = [
  "CC-Zero", "PD-self", "PD-user", "PD-author",
  "PD-USGov-Interior-FWS", "PD-USGov-NPS", "PD-USGov-NASA", "PD-USGov-Military-Navy",
];
// "Textbook" subjects first: they make the best Beginner photos.
const SUBJECTS = [
  "light trails", "long exposure", "waterfall", "silky water", "fireworks", "star trails",
  "milky way night sky", "aurora", "lightning", "night skyline", "bokeh", "shallow depth of field",
  "portrait", "bird in flight", "motorsport", "surfing", "horse racing", "cycling race",
  "airshow jet", "sports action", "landscape mountain", "beach", "sunset", "macro insect",
  "flower", "concert", "street", "wildlife", "snow", "lake", "forest", "moon", "interior church",
  "cat", "dog", "ocean waves", "city night", "fountain",
];
const PER_QUERY = 4;
const PER_SUBJECT = 10;
const ALLOWED_LICENSE = /^(cc0|public domain|pd)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, attempt = 0) {
  const url = API + "?" + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", maxlag: "5", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(res.status + " " + url);
    const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
    await sleep(wait);
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(res.status + " " + url);
  return res.json();
}

const stripHtml = (s = "") => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function parseRational(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function metaMap(list = []) {
  const m = {};
  for (const { name, value } of list) m[name] = value;
  return m;
}

async function search(query) {
  const data = await api({ action: "query", list: "search", srnamespace: "6", srlimit: "40", srsearch: query });
  return (data.query?.search ?? []).map((s) => s.title).filter((t) => /\.(jpe?g)$/i.test(t));
}

async function details(titles) {
  const data = await api({
    action: "query",
    prop: "imageinfo",
    titles: titles.join("|"),
    iiprop: "url|extmetadata|metadata|size",
    iiurlwidth: "1280",
  });
  return data.query?.pages ?? [];
}

function toPhoto(page) {
  const ii = page.imageinfo?.[0];
  if (!ii) return null;
  const ext = ii.extmetadata ?? {};
  const license = ext.LicenseShortName?.value ?? "";
  if (!ALLOWED_LICENSE.test(license)) return null;
  const m = metaMap(ii.metadata);
  const aperture = parseRational(m.FNumber);
  const shutter = parseRational(m.ExposureTime);
  let iso = m.ISOSpeedRatings;
  if (Array.isArray(iso)) iso = iso[0];
  iso = parseRational(iso);
  if (!aperture || !shutter || !iso) return null;
  if (aperture < 0.9 || aperture > 45 || shutter <= 0 || shutter > 60 || iso < 25 || iso > 204800) return null;
  if (ii.width < 800 || ii.width / ii.height > 2.2 || ii.height / ii.width > 1.8) return null;
  return {
    id: page.pageid,
    title: page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
    image: ii.thumburl ?? ii.url,
    source: ii.descriptionurl,
    author: stripHtml(ext.Artist?.value) || "Unknown",
    license,
    camera: [m.Make, m.Model].filter(Boolean).join(" ").trim() || null,
    focalLength: parseRational(m.FocalLength),
    aperture: Math.round(aperture * 10) / 10,
    shutter,
    iso: Math.round(iso),
  };
}

let photos = [];
try {
  photos = JSON.parse(await readFile(OUT, "utf8"));
} catch {
  /* first run */
}
const known = new Set(photos.map((p) => p.id));
const seen = new Set();

for (const subject of SUBJECTS) {
  let subjectCount = photos.filter((p) => p.subject === subject).length;
  // Quality images first (sharper, better composed), then anything with a free license.
  for (const quality of [true, false]) {
    for (const lic of LICENSE_CATS) {
      if (subjectCount >= PER_SUBJECT) break;
      const q = `${subject} incategory:"${lic}"${quality ? ' incategory:"Quality_images"' : ""} filemime:image/jpeg`;
      let titles;
      try {
        titles = (await search(q)).filter((t) => !seen.has(t));
      } catch (e) {
        console.warn("search failed", q, e.message);
        continue;
      }
      titles.forEach((t) => seen.add(t));
      let added = 0;
      for (let i = 0; i < titles.length && added < PER_QUERY && subjectCount < PER_SUBJECT; i += 20) {
        const pages = await details(titles.slice(i, i + 20));
        for (const p of pages) {
          if (added >= PER_QUERY || subjectCount >= PER_SUBJECT || known.has(p.pageid)) continue;
          const photo = toPhoto(p);
          if (!photo) continue;
          photos.push({ ...photo, subject, quality });
          known.add(photo.id);
          added++;
          subjectCount++;
        }
        await sleep(1000);
      }
      if (added) console.log(`${subject} / ${lic}${quality ? " / QI" : ""}: +${added} (total ${photos.length})`);
      await sleep(1000);
    }
  }
  await writeFile(OUT, JSON.stringify(photos, null, 1));
}

console.log(`Wrote ${photos.length} candidates to data/photo-candidates.json`);
console.log("Review them, edit tools/photo-levels.json, then run: node tools/build-photo-data.mjs");
