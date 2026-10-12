# Shutter Sense 📷

A photography guessing game that runs in the browser. You get a real photo, and you guess the **aperture**, **shutter speed** and **ISO** the photographer used.

It's plain HTML, CSS and JavaScript, so there's no build step. It's hosted on GitHub Pages.

## Levels

Most photos are **public-domain or CC0** photos from Wikimedia Commons. 46 are my own (Canon EOS R50 / 450D), spread across all three levels. The answers always come from the camera's own EXIF data.

| Level | Name | Photos | Help |
|---|---|---|---|
| 1 · Beginner | **Textbook Shots** | Clear-cut examples: light trails, silky waterfalls, fireworks, blurry backgrounds, frozen action, sunny landscapes. | A hint about the light (and whether a tripod was used) is always shown. 4 stops off scores 0. |
| 2 · Intermediate | **Everyday Shots** | Normal camera photos where the settings are less obvious. | Optional hint. 3 stops off scores 0. |
| 3 · Expert | **Tricky Shots** | Phones, compact cameras and unusual values, where depth-of-field clues are misleading. | Optional lens info. 2½ stops off scores 0. |

Each round has 5 photos, and each setting is worth up to 100 points. After each guess the game explains what the settings mean and links to the photo's source page.

## Run it locally

Open `index.html` in a browser. To use the photo review page, serve the folder instead:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 for the game, or http://localhost:8000/tools/review.html to see every photo grouped by level.

## Publish on GitHub Pages

1. Create a new repository on GitHub, for example `shutter-sense`.
2. Push this folder to it. You can use git or GitHub Desktop, or drag the files into the repository's **Add file → Upload files** page.
3. In the repository, go to **Settings → Pages**. Under **Source**, pick **Deploy from a branch**, then choose `main` and `/ (root)`.
4. After a minute the game is live at `https://<your-username>.github.io/shutter-sense/`.

## Project layout

```
index.html                    screens: menu, game, summary
css/style.css                 all styling
js/camera.js                  stop scales, formatting, scoring, explanations
js/game.js                    game flow and UI
data/photos.js                photo list with levels (generated)
data/photo-candidates.json    raw results from Commons
data/my-photos.json           my own photos with their EXIF (generated)
images/mine/                  my own photos
tools/                        photo curation, level overrides, review page, favicon generator
```

## Updating the photos

```bash
node tools/curate-photos.mjs      # finds PD/CC0 photos with full EXIF on Commons -> data/photo-candidates.json
node tools/build-photo-data.mjs   # sorts them into levels -> data/photos.js
```

`build-photo-data.mjs` sorts photos into levels automatically:

- **Expert:** phones, compact cameras and odd values.
- **Beginner:** textbook combinations from interchangeable-lens cameras.
- **Intermediate:** everything else.

To exclude a photo or move it to another level, add its id to `tools/photo-levels.json` and run the build again.

### Adding my own photos

```bash
node tools/import-my-photos.mjs "D:\Dev\egekiyici.com\photos" "D:\Dev\egekiyici.com\Website Photos"
node tools/build-photo-data.mjs
```

The import reads the `animal`, `event`, `portrait`, `landscape` and `street` folders and copies the photos into `images/mine/`. The website copies have their EXIF stripped, so the import reads the camera settings from the full-size originals, matched through `imported.txt`. Photos without settings are skipped. Files listed under `excludeMine` in `tools/photo-levels.json` are never used. My photos are placed by hand in the level lists of the same file (ids like `mine-animal-12`).

## Credits & license

- Code: MIT, see [LICENSE](LICENSE).
- Photos: Wikimedia Commons contributors, public domain / CC0. The author, license and a link to the source page appear in the game after each guess. Images load directly from Wikimedia and are not stored in this repository.
- My photos in `images/mine/`: © Ege Kıyıcı. They are not covered by the MIT license.
- Fonts: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) and [Inter](https://fonts.google.com/specimen/Inter) (SIL Open Font License).
