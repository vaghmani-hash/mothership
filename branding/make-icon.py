"""Turns a generated logo tile into the macOS app icon.

The image model draws the rounded tile on a black square. This finds the tile, crops it, and
redraws it the way macOS expects: an 824x824 rounded square centered on a transparent 1024x1024
canvas (Apple's icon grid), with smooth see-through corners.

    python3 branding/make-icon.py branding/c-beam/logo.png build/icon.png src/renderer/assets/logo.png
"""

import sys

from PIL import Image, ImageDraw

CANVAS = 1024
TILE = 824
RADIUS = 185
SUPERSAMPLE = 4


def tile_box(img: Image.Image) -> tuple[int, int, int, int]:
    """The bounds of everything brighter than the black surround."""
    gray = img.convert('L').point(lambda v: 255 if v > 12 else 0)
    box = gray.getbbox()
    if box is None:
        raise SystemExit('no tile found in the image')
    left, top, right, bottom = box
    side = min(right - left, bottom - top)
    cx, cy = (left + right) // 2, (top + bottom) // 2
    return cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2


def rounded_mask(size: int, radius: int) -> Image.Image:
    big = Image.new('L', (size * SUPERSAMPLE, size * SUPERSAMPLE), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, size * SUPERSAMPLE - 1, size * SUPERSAMPLE - 1), radius * SUPERSAMPLE, fill=255)
    return big.resize((size, size), Image.LANCZOS)


def main() -> None:
    source, *targets = sys.argv[1:]
    if not targets:
        raise SystemExit('usage: make-icon.py <logo.png> <out.png> [more out.png]')
    img = Image.open(source).convert('RGB')
    # Trim a few pixels inside the drawn edge, so none of the old corner survives.
    left, top, right, bottom = tile_box(img)
    inset = 14
    tile = img.crop((left + inset, top + inset, right - inset, bottom - inset)).resize((TILE, TILE), Image.LANCZOS).convert('RGBA')
    tile.putalpha(rounded_mask(TILE, RADIUS))
    icon = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    offset = (CANVAS - TILE) // 2
    icon.paste(tile, (offset, offset), tile)
    for target in targets:
        icon.save(target)
        print(target)


if __name__ == '__main__':
    main()
