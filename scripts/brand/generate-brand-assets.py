#!/usr/bin/env python3
"""Generate the ProofPath brand SVG assets from source geometry and DM Sans outlines.

The brand symbol is hand-authored vector geometry (see SYMBOL_PATHS); the wordmark is
outlined from the same DM Sans weights the application bundles, shaped with HarfBuzz so
kerning matches browser rendering. Outputs are self-contained SVGs with no font or
network dependencies.

Dependencies (Python 3.11+):  pip install fonttools brotli uharfbuzz
Inputs:   node_modules/@fontsource/dm-sans/files/dm-sans-latin-{500,700}-normal.woff2
Outputs:  public/brand/*.svg and public/favicon.svg

Run from the repository root:  python3 scripts/brand/generate-brand-assets.py
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import decompress as woff2_decompress
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = ROOT / "node_modules" / "@fontsource" / "dm-sans" / "files"
OUT_DIR = ROOT / "public" / "brand"

# Brand palette (see docs/brand/BRAND.md)
TEAL = "#0EA5A7"        # primary brand teal: symbol, dark-surface type
TEAL_DEEP = "#0C7E80"   # AA-passing teal for light-surface type and solid controls
INK = "#0B0F17"         # deep ink
IVORY = "#FAF9F6"       # warm ivory
GRAY = "#6B7280"        # neutral gray
GRAY_ON_INK = "#9AA3AF"

# --- Symbol geometry, 32x32 grid ---------------------------------------------------
# A continuous monoline draws the letter P; the upper arc extends into a rising path
# that terminates in an integral forward arrowhead: verified information (the structured
# P) becoming directional action. Stroke 3.7 with round joins stays legible at 16px.
SYMBOL_STROKE = 3.7
SYMBOL_PATHS = [
    "M9.2 25.4 V10.8",
    "M9.2 8.6 H14.4 Q21.4 8.6 21.4 14 Q21.4 19.2 15.2 19.2 H9.2",
    "M18.2 9.3 L24.8 5.4",
]
SYMBOL_ARROW = "M26.8 4.3 L22.1 4.9 L24.9 8.6 Z"


def symbol_inner(color: str, indent: str = "  ") -> str:
    strokes = f"\n{indent}".join(f'<path d="{d}"/>' for d in SYMBOL_PATHS)
    return (
        f'<g fill="none" stroke="{color}" stroke-width="{SYMBOL_STROKE}" '
        f'stroke-linecap="round" stroke-linejoin="round">\n{indent}{strokes}\n'
        f'</g>\n{indent}<path fill="{color}" d="{SYMBOL_ARROW}"/>'
    )


# --- DM Sans outlining --------------------------------------------------------------
class FontRun:
    def __init__(self, weight: int):
        woff_path = FONT_DIR / f"dm-sans-latin-{weight}-normal.woff2"
        ttf_buffer = BytesIO()
        woff2_decompress(str(woff_path), ttf_buffer)
        ttf = ttf_buffer.getvalue()
        self.tt = TTFont(BytesIO(ttf))
        self.upm = self.tt["head"].unitsPerEm
        self.glyph_set = self.tt.getGlyphSet()
        self.glyph_order = self.tt.getGlyphOrder()
        self.hb_font = hb.Font(hb.Face(hb.Blob(ttf)))
        self.hb_font.scale = (self.upm, self.upm)

    def shape(self, text: str, tracking_em: float = 0.0):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb_font, buf, {"kern": True, "liga": True})
        tracking = tracking_em * self.upm
        placements, cursor = [], 0.0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            name = self.glyph_order[info.codepoint]
            pen = SVGPathPen(self.glyph_set)
            self.glyph_set[name].draw(pen)
            placements.append(
                {"d": pen.getCommands(), "x": cursor + pos.x_offset, "y": pos.y_offset}
            )
            cursor += pos.x_advance + tracking
        return placements, cursor - tracking

    def run_svg(self, text: str, size: float, tracking_em: float, x: float, baseline: float):
        placements, width = self.shape(text, tracking_em)
        s = size / self.upm
        out = [
            f'<g transform="translate({round(x, 2)} {round(baseline, 2)}) '
            f'scale({round(s, 6)} {round(-s, 6)})">'
        ]
        for g in placements:
            out.append(
                f'<path transform="translate({round(g["x"], 2)} {round(-g["y"], 2)})" d="{g["d"]}"/>'
            )
        out.append("</g>")
        return "\n    ".join(out), width * s


def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n")
    print("wrote", path.relative_to(ROOT))


def standalone_symbol(color: str, filename: str):
    write(
        OUT_DIR / filename,
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="ProofPath symbol">
  {symbol_inner(color)}
</svg>""",
    )


def favicon(tile: str, mark: str, path: Path):
    scale = 42 / 32
    offset = (64 - 42) / 2
    write(
        path,
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="ProofPath">
  <rect width="64" height="64" rx="14" fill="{tile}"/>
  <g transform="translate({offset} {offset}) scale({scale})">
    {symbol_inner(mark, "    ")}
  </g>
</svg>""",
    )


def horizontal_logo(background: str, proof_color: str, path_color: str, tagline_color: str,
                    filename: str):
    bold, medium = FontRun(700), FontRun(500)

    symbol_h, gap = 64, 17
    text_x = symbol_h + gap
    word_size, word_tracking = 44, -0.02
    tag_size, tag_tracking = 15, 0.14

    cap_h = 0.7 * word_size
    word_baseline = (symbol_h - cap_h) / 2 + cap_h
    tag_baseline = word_baseline + 7 + tag_size * 0.72
    height = round(tag_baseline + tag_size * 0.30 + 4)

    proof_g, proof_w = bold.run_svg("Proof", word_size, word_tracking, text_x, word_baseline)
    path_g, path_w = bold.run_svg("Path", word_size, word_tracking, text_x + proof_w, word_baseline)
    tag_g, tag_w = medium.run_svg("Evidence to action", tag_size, tag_tracking, text_x, tag_baseline)

    width = round(text_x + max(proof_w + path_w, tag_w) + 10)
    symbol_y = (height - symbol_h) / 2

    write(
        OUT_DIR / filename,
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="ProofPath — Evidence to action">
  <rect width="{width}" height="{height}" rx="16" fill="{background}"/>
  <g transform="translate(0 {symbol_y}) scale(2)">
    {symbol_inner(TEAL)}
  </g>
  <g fill="{proof_color}">
    {proof_g}
  </g>
  <g fill="{path_color}">
    {path_g}
  </g>
  <g fill="{tagline_color}">
    {tag_g}
  </g>
</svg>""",
    )


def main():
    standalone_symbol(TEAL, "proofpath-symbol.svg")
    standalone_symbol(INK, "proofpath-symbol-ink.svg")
    standalone_symbol(IVORY, "proofpath-symbol-ivory.svg")

    horizontal_logo(IVORY, INK, TEAL_DEEP, GRAY, "proofpath-logo-light.svg")
    horizontal_logo(INK, IVORY, TEAL, GRAY_ON_INK, "proofpath-logo-dark.svg")
    horizontal_logo(IVORY, INK, INK, INK, "proofpath-logo-mono.svg")

    favicon(TEAL, IVORY, ROOT / "public" / "favicon.svg")
    favicon(INK, TEAL, OUT_DIR / "favicon-ink-tile.svg")


if __name__ == "__main__":
    main()
