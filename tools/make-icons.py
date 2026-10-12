"""Generates the pixel-art favicon (icons/icon.svg) from a 16x16 grid.

Usage:  python tools/make-icons.py
"""
import os

GRID = [
    "................",
    "................",
    "....AAAAA.......",
    "...AAAAAAA..RR..",
    ".BBBBBBBBBBBBBB.",
    ".BBBBBLLLLBBBBB.",
    ".BBBBLLDDLLBBBB.",
    ".BBBLLDDDDLLBBB.",
    ".BBBLDDGWDDLBBB.",
    ".BBBLDDGGDDLBBB.",
    ".BBBLLDDDDLLBBB.",
    ".BBBBLLDDLLBBBB.",
    ".BBBBBLLLLBBBBB.",
    ".BBBBBBBBBBBBBB.",
    "................",
    "................",
]
COLORS = {
    "A": "#c77d14",
    "R": "#ff6b6b",
    "B": "#ffb547",
    "L": "#2b2f3a",
    "D": "#3d5a80",
    "G": "#7cc4ff",
    "W": "#ffffff",
}
BG = "#101217"

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")


def write_svg(path):
    rects = []
    for y, row in enumerate(GRID):
        for x, ch in enumerate(row):
            if ch in COLORS:
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{COLORS[ch]}"/>')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">'
        f'<rect width="16" height="16" rx="3" fill="{BG}"/>' + "".join(rects) + "</svg>\n"
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write_svg(os.path.join(OUT, "icon.svg"))
    print("icon written to", os.path.abspath(OUT))
