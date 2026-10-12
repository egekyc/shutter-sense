// Imports my own photos into the game.
// Reads EXIF (aperture, shutter, ISO, camera, focal length) straight from each JPEG,
// copies the photo to images/mine/ and writes data/my-photos.json for build-photo-data.mjs.
// Photos without full EXIF are skipped, because the game needs real settings to score against.
//
// Usage:  node tools/import-my-photos.mjs "D:\Dev\egekiyici.com\photos" "D:\Dev\egekiyici.com\Website Photos"
// The web-sized photos (first folder) have their EXIF stripped, so the settings are read from the
// full-size originals (second folder), matched through <photos folder>/imported.txt ("original => folder/file").
// Only the folders in FOLDERS are read; files listed in tools/photo-levels.json "excludeMine" are skipped.

import { readFile, writeFile, readdir, mkdir, copyFile, open } from "node:fs/promises";
import path from "node:path";

const FOLDERS = ["animal", "event", "portrait", "landscape", "street"];
const AUTHOR = "Ege Kıyıcı";
const [root, originals] = process.argv.slice(2);
if (!root) {
  console.error('Usage: node tools/import-my-photos.mjs "<photos folder>" ["<originals folder>"]');
  process.exit(1);
}

// web file (folder/file) -> original file name
const originalOf = new Map();
if (originals) {
  const map = await readFile(path.join(root, "imported.txt"), "utf8");
  for (const line of map.split(/\r?\n/)) {
    const [orig, web] = line.split("=>").map((s) => s?.trim());
    if (orig && web) originalOf.set(web.replace(/\\/g, "/"), orig);
  }
}

// EXIF sits at the start of a JPEG, so the first 512 KB is plenty (originals can be 30 MB).
async function head(file) {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(512 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

const here = (p) => new URL(p, import.meta.url);
const levels = JSON.parse(await readFile(here("./photo-levels.json"), "utf8"));
const excluded = new Set((levels.excludeMine ?? []).map((p) => p.replace(/\\/g, "/")));

// ---------- minimal EXIF reader ----------
const TAGS = { 0x010f: "Make", 0x0110: "Model", 0x829a: "ExposureTime", 0x829d: "FNumber", 0x8827: "ISO", 0x920a: "FocalLength", 0x9003: "DateTimeOriginal" };

function readExif(buf) {
  if (buf.readUInt16BE(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < buf.length) {
    const marker = buf.readUInt16BE(off);
    const size = buf.readUInt16BE(off + 2);
    if (marker === 0xffe1 && buf.toString("latin1", off + 4, off + 10) === "Exif\0\0") return parseTiff(buf, off + 10);
    if (marker === 0xffda) break; // image data starts: no EXIF
    off += 2 + size;
  }
  return null;
}

function parseTiff(buf, start) {
  const le = buf.toString("latin1", start, start + 2) === "II";
  const u16 = (o) => (le ? buf.readUInt16LE(start + o) : buf.readUInt16BE(start + o));
  const u32 = (o) => (le ? buf.readUInt32LE(start + o) : buf.readUInt32BE(start + o));
  const out = {};
  const readIfd = (ifd) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const valOff = e + 8;
      if (tag === 0x8769) {
        readIfd(u32(valOff)); // Exif sub-IFD
        continue;
      }
      const name = TAGS[tag];
      if (!name) continue;
      if (type === 2) {
        const at = count > 4 ? u32(valOff) : valOff;
        out[name] = buf.toString("latin1", start + at, start + at + count).replace(/\0.*$/s, "").trim();
      } else if (type === 3) {
        out[name] = u16(valOff);
      } else if (type === 4) {
        out[name] = u32(valOff);
      } else if (type === 5) {
        const at = u32(valOff);
        const den = u32(at + 4);
        out[name] = den ? u32(at) / den : null;
      }
    }
  };
  readIfd(u32(4));
  return out;
}

// ---------- import ----------
await mkdir(here("../images/mine/"), { recursive: true });
const photos = [];
const skipped = [];
for (const folder of FOLDERS) {
  const files = (await readdir(path.join(root, folder))).filter((f) => /\.jpe?g$/i.test(f));
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const file of files) {
    const rel = `${folder}/${file}`;
    if (excluded.has(rel)) {
      skipped.push(`${rel} (excluded)`);
      continue;
    }
    let x = readExif(await head(path.join(root, folder, file))) ?? {};
    const orig = originalOf.get(rel);
    if (!x.FNumber && orig) {
      try {
        x = readExif(await head(path.join(originals, orig))) ?? {};
      } catch {
        /* original missing */
      }
    }
    if (!x.FNumber || !x.ExposureTime || !x.ISO) {
      skipped.push(`${rel} (no full EXIF)`);
      continue;
    }
    const name = `${folder}-${path.basename(file, path.extname(file))}.jpg`.replace(/^(\w+)-\1-/, "$1-");
    await copyFile(path.join(root, folder, file), here(`../images/mine/${name}`));
    const n = Number(path.basename(file).match(/(\d+)/)?.[1] ?? photos.length + 1);
    photos.push({
      id: `mine-${folder}-${n}`,
      category: folder,
      title: `${folder[0].toUpperCase() + folder.slice(1)} #${n}`,
      image: `images/mine/${name}`,
      source: null,
      author: AUTHOR,
      license: null,
      camera: [x.Make, x.Model].filter(Boolean).join(" ") || null,
      focalLength: x.FocalLength ?? null,
      aperture: Math.round(x.FNumber * 10) / 10,
      shutter: x.ExposureTime,
      iso: x.ISO,
    });
  }
}

await writeFile(here("../data/my-photos.json"), JSON.stringify(photos, null, 1));
console.log(`Imported ${photos.length} photos to images/mine/ and data/my-photos.json`);
if (skipped.length) console.log("Skipped:\n  " + skipped.join("\n  "));
