# Why Then: museum audio guide (concept demo)

A mobile-first web app demo. It explains paintings to people with no art background. It covers what you're looking at, and also **why it was made at that moment in history**, using a timeline of events, technology, literature and art movements.

This is a concept MVP, not a production app. It has no backend, no build step and no tracking. All data is local JSON.

## Run it

You need any static file server, because browsers block `fetch()` on `file://` URLs.

```bash
cd museum-audio-guide
python3 -m http.server 8000
# then open http://localhost:8000 on your computer
```

On your phone (same Wi-Fi), open `http://<your-computer-ip>:8000`. For a mobile view on desktop, use the browser's device toolbar.

Other options: `npx serve .`, or VS Code's "Live Server" extension.

### Get the painting images (one-time, optional)

The app works without images: it shows numbered colour placeholders. To add real public-domain images, run this on a machine with normal internet access:

```bash
python3 scripts/fetch_images.py --dry-run   # see what it would download
python3 scripts/fetch_images.py             # download to images/ and write data/image_credits.json
```

The script searches Wikimedia Commons, accepts **only** files whose Commons metadata says public domain (or CC0), and copies the source URL, author and license from Commons into `data/image_credits.json`. The app then shows that credit under each image. Search can still pick the wrong picture, such as a detail or a study, so open every printed "check" link and confirm it. To force a specific file:

```bash
python3 scripts/fetch_images.py --file car="File:Exact Commons file name.jpg"
```

### Check the data

```bash
python3 scripts/validate_data.py
```

This checks that every ID link resolves, that `related_paintings` matches the paintings' `why_then` lists, that every text field has a `status`, that each quick take is 3 to 4 sentences, and that all 14 language files contain every key.

## What's in it

| Spec item | Where |
|---|---|
| 1. Home: choose a museum (2 fake museums) | `#/` |
| 2. Pick a painting by number or from a list | `#/museum/velocita` (try 101–105) |
| 3a–c. Image/title/artist/year → quick take → "Why this, why then" (3–5 events) | `#/painting/<id>` |
| 3d. Play button (browser text-to-speech reads a–c) | sticky player on the painting page |
| 4. Horizontal timeline with type tags, current painting highlighted, tap for details and linked paintings | `#/timeline/<id>` |
| 5. Language switcher (14 languages, Arabic and Persian right-to-left) | top-right select |

The second museum ("Harbor Light Gallery") is empty on purpose, to show the empty state.

### Project layout

```
index.html               single page shell
css/styles.css           mobile-first styles, dark mode, RTL-safe
js/app.js                hash router, views, TTS, i18n (vanilla JS, no deps)
data/museums.json        museums -> painting ids
data/paintings.json      id, number, title, artist, year, image, quick_take, why_then[]
data/timeline_events.json id, year, type, title, short_text, related_paintings[]
data/image_credits.json  written by fetch_images.py (empty until you run it)
i18n/<lang>.json         UI strings + translated content overlays (en is the source)
scripts/fetch_images.py  pulls public-domain images and license data from Commons
scripts/validate_data.py data integrity checks
```

### Data model notes

- Every text field is `{ "text": ..., "status": "draft, needs fact-check" }`.
- Event `type` is one of `art_movement`, `world_event`, `tech`, `literature`.
- `year` on events is a number used for ordering. `year_label` is what's shown (for example "1907–1908").
- Translations live in `i18n/<lang>.json` under `content.painting|event|museum.<id>.<field>`. If a translation is missing, the app falls back to English per field.
- Language codes: `en fr de zh-Hant zh-Hans nl uk ar fa es it pt ja ko`.

### Text-to-speech

The app uses the browser's built-in `speechSynthesis`, reading sentence by sentence (long single utterances get cut off in Chrome). Which voices are available depends on the device and OS. If no voice exists for the selected language, the app says so under the button. Ukrainian, Persian and Arabic voices are often missing on desktop browsers. iOS and Android usually have more voices.

---

## What is faked or unverified

Read this before showing the demo to anyone.

### Faked

1. **Both museums are fictional.** "Museo della Velocità" and "Harbor Light Gallery" don't exist. The five paintings are real, but in real life they are in different collections (MoMA New York ×2, Pinacoteca di Brera Milan, Peggy Guggenheim Collection Venice, Centre Pompidou Paris). Each painting page names its real-life location, and that location also needs checking.
2. **Painting numbers (101–105)** are made up for the demo.
3. **No images ship with the repo.** The build sandbox could not reach Wikimedia, so the app shows placeholders until you run `scripts/fetch_images.py`. No image source or license is claimed until that script reads it from Commons.
4. **All 13 non-English languages are machine translations** written without native-speaker review. The app labels them as such. Painting titles in other languages are my best guess at the common local title, not checked against each museum's official title.
5. **The "Gen Z light" voice** is a tone choice, not tested with users.

### Unverified (every text field is marked `"status": "draft, needs fact-check"`)

These are things I wrote from general knowledge, with no sources checked during this build. They are the claims most worth checking first:

| Claim | Where | Why it needs a check |
|---|---|---|
| The City Rises is about 2 × 3 m and "often called" Boccioni's first major Futurist painting | `city_rises` | A web search during the build returned 199 × 301 cm and the "first major Futurist work" wording from secondary sources, but nothing authoritative was confirmed. |
| Riot in the Galleria still uses Divisionist technique | `riot_galleria` | Standard art-history reading, not checked against Brera's catalogue. |
| The usual MoMA version of *The Farewells* was repainted after Boccioni saw Cubism in Paris in 1911 | `farewells` | Commonly stated; the exact sequence of the two versions needs MoMA's own text. |
| Dynamism of a Cyclist is a long-term loan from the Gianni Mattioli Collection | `cyclist` | Loan status can change. |
| Dynamism of a Car is dated 1912–1913 and held by Centre Pompidou | `car` | Check dating and accession. |
| Milan's Edison power station opened in 1883, "one of the first in Europe" | `ev_milan_power_1883` | "One of the first" is a comparative claim. |
| 1906 Milan exhibition was themed on transport | `ev_simplon_1906` | Simplified description. |
| Boccioni read Bergson | `ev_bergson_1907` | Widely stated by art historians; needs a citation. |
| Cubism dated "around 1907 and 1908" | `ev_cubism_1907` | Start dates for Cubism are debated. |
| Manifesto on Le Figaro's front page, 20 Feb 1909; race car vs. Victory of Samothrace | `ev_manifesto_1909` | Paraphrased, not quoted, on purpose. Verify the paraphrase. |
| Technical Manifesto of Futurist Painting, April 1910, and its list of signatories | `ev_painters_1910` | The February and April 1910 manifestos had different signatories. |
| Bernheim-Jeune show Feb 1912, then London and Berlin | `ev_paris_1912` | Check dates and venues. |
| *The Art of Noises* dated March 1913; *intonarumori* translated as "noise intoners" | `ev_noises_1913` | Check the date and translation. |
| Boccioni, Russolo and Marinetti joined a volunteer cyclist and motorist battalion | `ev_ww1_1914` | Check the battalion name and membership. |
| Boccioni died in August 1916 near Verona after a fall from a horse, aged 33 | `ev_boccioni_1916` | Check the exact date and place. |
| Links between events and paintings (`why_then`) | all paintings | These are interpretive choices, not facts. For example, linking *Dynamism of a Cyclist* to WWI is context, not a claim that the painting is about the war. |

### Image rights: the different views

- **Copyright:** Boccioni died in 1916 and Russolo in 1947. Under life + 70 years, both are public domain in the EU, the UK and most other countries. In the US, works first published before 1931 are public domain. Wikimedia Commons treats faithful photos of 2D public-domain art as public domain (the "PD-Art" position).
- **Italy is a special case.** The Italian Cultural Heritage Code (art. 108) lets state museums charge fees for reproducing works in their collections, including public-domain ones. *Riot in the Galleria* is at the Pinacoteca di Brera, a state museum. A non-commercial demo is generally fine. A commercial product should check this with Brera.
- **Museums' own photos:** some museums claim rights in their photographs even when Commons doesn't. Using Commons files, not museum website images, avoids most of this. The license recorded is always the one on the Commons file page.
