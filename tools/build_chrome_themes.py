"""Generate the three static Chrome theme packs (tab strip / toolbar colours) that match the
new-tab themes. Chrome themes can't contain code and can't be recoloured at runtime, so these
are separate, fixed-colour extensions the user installs alongside Tab Prettier.

Chrome tiles `theme_frame` in both directions, and with vertical tabs the frame becomes a tall
side column — so frame images must be seamless vertically (no horizontal rules) and read well
along the left edge as well as across the top.

Usage: python tools/build_chrome_themes.py   → writes chrome-themes/<id>/
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "chrome-themes"


def hex_rgb(h: str) -> list[int]:
    h = h.lstrip("#")
    return [int(h[i : i + 2], 16) for i in (0, 2, 4)]


THEMES = {
    "editorial": {
        "name": "Tab Prettier — 日系雜誌極簡",
        "colors": {
            "frame": "#16141a",
            "frame_inactive": "#1d1b21",
            "frame_incognito": "#101013",
            "frame_incognito_inactive": "#16161a",
            "toolbar": "#221f27",
            "tab_text": "#f4efe7",
            "tab_background_text": "#9d96a3",
            "tab_background_text_inactive": "#7d7783",
            "toolbar_text": "#ece6dc",
            "toolbar_button_icon": "#c9a27a",
            "bookmark_text": "#d8d1c7",
            "omnibox_background": "#16141a",
            "omnibox_text": "#f4efe7",
            "ntp_background": "#0e0d10",
            "ntp_text": "#f4efe7",
            "button_background": "#221f27",
        },
        # plain ink: no frame image at all
        "frame": None,
    },
    "dreamy": {
        "name": "Tab Prettier — 夢幻柔光",
        "colors": {
            "frame": "#eadcee",
            "frame_inactive": "#f1e8f3",
            "frame_incognito": "#4b3f58",
            "frame_incognito_inactive": "#584b66",
            "toolbar": "#fbf6fb",
            "tab_text": "#4a3b52",
            "tab_background_text": "#7d6a88",
            "tab_background_text_inactive": "#9a89a3",
            "toolbar_text": "#4a3b52",
            "toolbar_button_icon": "#c77dab",
            "bookmark_text": "#5d4c66",
            "omnibox_background": "#f1e6f2",
            "omnibox_text": "#3e3146",
            "ntp_background": "#f6eef6",
            "ntp_text": "#4a3b52",
            "button_background": "#fbf6fb",
        },
        # pastel sunrise running both across the top and down the side
        "frame": {"stops": ["#f6cfdc", "#e2d2f4", "#cfe3f6"]},
    },
    "neon": {
        "name": "Tab Prettier — 賽博霓虹",
        "colors": {
            "frame": "#07090f",
            "frame_inactive": "#0c0f17",
            "frame_incognito": "#07090f",
            "frame_incognito_inactive": "#0c0f17",
            "toolbar": "#0f1420",
            "tab_text": "#37e2d5",
            "tab_background_text": "#5f7a8a",
            "tab_background_text_inactive": "#4a5f6c",
            "toolbar_text": "#cfe9f0",
            "toolbar_button_icon": "#37e2d5",
            "bookmark_text": "#7fdad2",
            "omnibox_background": "#070a12",
            "omnibox_text": "#bff7f1",
            "ntp_background": "#05070c",
            "ntp_text": "#37e2d5",
            "button_background": "#0f1420",
        },
        # deep navy with faint scanlines (a 3px period, so vertical tiling stays seamless)
        "frame": {"stops": ["#07090f", "#0b1020"], "scanlines": True},
    },
}


def frame_image(spec: dict, path: Path, w: int = 2560, h: int = 1440) -> None:
    """Gradient along t = x/w + y/(h*0.8), clamped: the top row sweeps the full range across the
    horizontal tab strip, and the left column sweeps it down a vertical tab strip."""
    stops = [hex_rgb(c) for c in spec["stops"]]
    n = len(stops) - 1

    def colour(t: float) -> tuple[int, ...]:
        t = min(1.0, t) * n
        i = min(int(t), n - 1)
        f = t - i
        return tuple(round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f) for c in range(3))

    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = colour(x / w + y / (h * 0.8))
    if spec.get("scanlines"):
        d = ImageDraw.Draw(img)
        for y in range(0, h, 3):
            d.line([(0, y), (w, y)], fill=(0, 0, 0))
    img.save(path, optimize=True)


def main() -> None:
    for tid, t in THEMES.items():
        d = OUT / tid
        # Chrome caches a loaded unpacked theme inside its folder; a stale cache hides new colours.
        (d / "Cached Theme.pak").unlink(missing_ok=True)
        if (d / "images").exists():
            for f in (d / "images").iterdir():
                f.unlink()
            (d / "images").rmdir()
        theme: dict = {
            "colors": {k: hex_rgb(v) for k, v in t["colors"].items()},
            "properties": {"ntp_background_alignment": "bottom"},
        }
        if t["frame"]:
            (d / "images").mkdir(parents=True)
            frame_image(t["frame"], d / "images" / "frame.png")
            theme = {"images": {"theme_frame": "images/frame.png"}, **theme}
        d.mkdir(parents=True, exist_ok=True)
        manifest = {
            "manifest_version": 3,
            "name": t["name"],
            "version": "1.0.0",
            "description": "Tab Prettier 的配套分頁列主題(固定配色)。",
            "theme": theme,
        }
        (d / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", d)


if __name__ == "__main__":
    main()
