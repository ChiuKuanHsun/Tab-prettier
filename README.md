<!-- prettier-ignore -->
<div align="center">

<img src="./assets/icon/icon.svg" alt="" align="center" height="96" />

# Tab Prettier

*Every new tab is a new anime scene: scenery and a character composed in layered depth*

<a href="https://chromewebstore.google.com/detail/fnacfhfopcdcgidgjllgngoigaajbapi">
    <img src="https://res.cloudinary.com/do2max7gt/image/upload/v1745580622/chrome-web-store_vkyxkm.png" alt="Logo" width="250">
</a>


[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285f4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/fnacfhfopcdcgidgjllgngoigaajbapi)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-a0522d?style=flat-square)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Preact](https://img.shields.io/badge/Preact-673ab8?style=flat-square&logo=preact&logoColor=white)](https://preactjs.com)
[![ONNX Runtime Web](https://img.shields.io/badge/ONNX_Runtime-Web-005ce6?style=flat-square)](https://onnxruntime.ai)
[![License](https://img.shields.io/badge/License-GPL--3.0-a0522d?style=flat-square)](LICENSE)
[![Support](https://img.shields.io/badge/Support-ko--fi-ff5e5b?style=flat-square&logo=kofi&logoColor=white)](https://kuanhsun.pages.dev/support?lang=en)

[Screenshots](#screenshots) • [Features](#features) • [How it works](#how-it-works) • [Getting started](#getting-started) • [Using it](#using-it) • [FAQ](#faq)

English · [繁體中文](README.zh-TW.md)

</div>

Tab Prettier replaces Chrome's new tab page with a picture composed on the spot: a piece of
scenery for the background, an anime character cut out and standing in front of it, and the
clock tucked between the two. Move the mouse and the scene shifts in depth.

Around the picture sit the things a new tab is for — search, your links, to-dos, a focus timer
and what's airing today — kept quiet so the picture stays the point.

> [!TIP]
> Cutting out the character and estimating depth happen **on your own computer**. No picture is
> uploaded anywhere, and there is no account or server behind the extension.

---

## Screenshots

<!-- prettier-ignore -->
<div align="center">
  <img src="docs/screenshots/newtab-1.png" alt="A new tab: scenery in the back, a character in front, the clock between them" width="720" />
  <br /><br />
  <img src="docs/screenshots/newtab-2.png" alt="Another new tab scene" width="720" />
</div>

---

## Features

**The scene**

- **Composed, not picked** — background and character are chosen separately, then cut out, colour-matched and lit to sit together, so no two tabs look the same
- **Depth parallax** — the background is split by depth and moves in layers with the mouse; the character gently breathes
- **Follows the day and the weather** — dawn, dusk and night scenes; rain, snow and distant haze when it's actually raining or snowing where you are
- **Composition switches** — close-ups only, long shots, or scenery with no one in it; tags you never want to see
- **Keep or hide** — save scenes you love, export them as a wallpaper, and hide any picture with one click
- **Your own pictures** — upload images or point it at a folder on your computer

**Your anime list**

- **AniList** — sign in and characters from the shows on your list appear on your new tab
- **Birthdays** — a character whose birthday is today gets the stage
- **Anime panel** — what airs today and this season, no sign-in needed

**New tab tools**

- **Clock and weather**
- **Search box** with address-bar style suggestions: sites you've visited and tabs that are already open
- **Links** — pinned links with two-tone icons, recently closed tabs, top sites
- **To-dos and notes** that sync with your Chrome profile
- **Focus timer** — the clock turns into a countdown, and distracting sites you list get a gentle reminder while you focus
- **Easy on the laptop** — performance tiers, a power-saving mode, and ambient motion that ticks as slowly as it can

---

## How it works

A new tab has to open instantly, but cutting out a character and estimating depth takes seconds.
So the work is done ahead of time, in the background, and the new tab only ever shows a scene
that is already finished:

```
background, every 30 min or when the pool runs low
 │
 ├─► fetch a scenery picture ──────► depth map (Depth Anything V2)
 │                                     │
 ├─► fetch a character picture ────► cut-out (anime-segmentation)
 │                                     │  refine the mask edge
 │                                     │  match colours to the scenery
 │                                     │  add rim light from the scenery's light
 │                                     ▼
 └─────────────────────────────────► composition: where the character stands,
                                       where the clock fits, which side is lighter
                                       │
                                       ▼
                               pool of ready scenes (on your computer)
                                       │
new tab ◄──────────────────────────────┘  six layers: background · clock · character ·
                                          haze · particles · tools
```

Both models run in the browser with ONNX Runtime Web — on the GPU through WebGPU where it's
available, on the CPU otherwise. On slower machines the background work waits until the
computer is idle.

---

## Getting started

Install it from the **[Chrome Web Store](https://chromewebstore.google.com/detail/fnacfhfopcdcgidgjllgngoigaajbapi)**
and open a new tab. The very first scene takes 10–30 seconds while the first pictures are
prepared; after that every tab opens instantly.

<details>
<summary><b>Or build it yourself</b></summary>

```bash
git clone https://github.com/ChiuKuanHsun/Tab-prettier.git && cd Tab-prettier
npm install
npm run build        # outputs dist/
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select
`dist/`. During development `npm run dev` rebuilds on every change; press reload on the
extensions page to pick it up.

`npm test` runs the unit tests; `npm run package` builds and zips `dist/` for the store.

| Part | Where | What it does |
|---|---|---|
| New tab | `src/newtab/` | Takes a ready scene from IndexedDB and renders the six layers |
| Service worker | `src/background/` | Schedules refills (alarms, idle detection) and runs the offscreen document |
| Offscreen | `src/offscreen/` | Fetch → cut-out (WebGPU, WASM fallback) → mask refinement → colour transfer → rim light → composition |
| Pure algorithms | `src/lib/compose.ts`, `src/offscreen/{refine,harmonize}.ts`, `src/lib/palette.ts` | Unit-tested |
| Settings | `src/options/` | The options page |

The cut-out model is converted to fp16 with `tools/convert_model.py`.

</details>

---

## Using it

| Key | What it does |
|---|---|
| `/` | Focus the search box |
| `Alt+1` … `Alt+6` | Toggle the links, to-do, notes, focus, anime and credits panels |
| `Esc` | Close the open panel |

- **Settings** — the gear in the new tab's dock (or *Details → Extension options* on
  `chrome://extensions`). Themes,
  picture sources, composition, motion, performance, uploads, favourites, AniList and backup all
  live there, with a help page linked at the top.
- **Credits** — the credits panel names the source and tags of the current picture and links to
  the original page.
- **Optional features ask first** — recently closed tabs, top sites, search suggestions and focus
  reminders ask for permission only when you switch them on.

### AniList

Today's airing and this season's shows work without signing in. To use your own list, open the
AniList section in Settings and follow the steps there to create an AniList API client; the
redirect URL to paste is shown on that page.

### Tab bar themes (optional)

Chrome only lets a separate *theme* change the colours of the tab strip, and a theme can't
contain code. `chrome-themes/` has three to match the new tab themes — `editorial`, `dreamy`
and `neon`. Load one from `chrome://extensions` → *Load unpacked*.

---

## FAQ

**Is any picture uploaded?**
No. Pictures are downloaded from the sources below and processed on your computer.

**Why is the extension so large?**
The two models — character cut-out (88 MB) and depth (50 MB) — ship inside it so everything
works without downloading anything else later.

**Does it make the computer warm?**
Ambient motion is kept to as few frames per second as it needs. If it still runs warm, turn off
particles or choose the power-saving performance tier in Settings.

**Can I choose which characters show up?**
Yes: favourite characters, characters from your AniList list, or exclude tags you never want to see.

**Is there NSFW content?**
No. Every source is limited to its safest rating and adult tags are always excluded.

---

## Privacy

- Pictures are processed on your computer; nothing is uploaded and there is no developer server
- Settings, links, to-dos and notes stay in Chrome (and sync with your Chrome profile if you use Chrome sync)
- Some features talk to outside services directly from your browser: picture sources, Open-Meteo for weather, Google for search suggestions, AniList when you sign in

Full details: **[Privacy policy](https://chiukuanhsun.github.io/Tab-prettier/)**

---

## Built with

| | Role | Licence |
|---|---|---|
| [anime-segmentation](https://github.com/SkyTNT/anime-segmentation) by SkyTNT | character cut-out (fp16) | Apache-2.0 |
| [Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small) | depth maps (fp16) | Apache-2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | in-browser inference | MIT |
| [Preact](https://preactjs.com) | UI | MIT |
| [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond), [Shippori Mincho](https://fonts.google.com/specimen/Shippori+Mincho) | type | OFL-1.1 |

Pictures come from [Wallhaven](https://wallhaven.cc), [Danbooru](https://danbooru.donmai.us)
(general rating only), [Nekosia](https://nekosia.cat) and [waifu.im](https://waifu.im); weather
from [Open-Meteo](https://open-meteo.com); anime data from [AniList](https://anilist.co).

> [!NOTE]
> Only the **Small** Depth Anything V2 model is Apache-2.0. Base and Large are non-commercial,
> so don't swap them in.

---

## Support

If Tab Prettier makes your new tab a little nicer, you can
**[buy me a coffee](https://kuanhsun.pages.dev/support?lang=en)**. Bug reports and ideas are
welcome in [Issues](https://github.com/ChiuKuanHsun/Tab-prettier/issues).

---

## Disclaimer

Tab Prettier contains no artwork. Pictures are fetched from the public galleries above and
remain the work of their artists; the credits panel links each one to its source. Tab Prettier
has no affiliation with any of those sites or with AniList.

---

## Licence

Tab Prettier is licensed under the [GNU General Public License v3.0](LICENSE). You may use, study,
change and share it; anything you distribute that is built on it must be released under GPL-3.0
too, with its source.

The third-party components above keep their own licences. The two models are Apache-2.0, which
GPL-3.0 can include; keep their attribution if you redistribute them.
