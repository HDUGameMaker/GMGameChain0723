#!/usr/bin/env python3
"""Windows-compatible grid slicer for assetify image boards.

The upstream assetify helper shells out to macOS `sips` for dimensions. This
local adapter keeps the same grid/name workflow while using Pillow end-to-end.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--grid', required=True, help='COLSxROWS')
    parser.add_argument('--names', required=True, help='comma-separated slugs')
    parser.add_argument('--contact-sheet', action='store_true')
    parser.add_argument('--chroma-key', help='hex RGB key removed with a soft alpha matte')
    parser.add_argument('--require-alpha', action='store_true')
    parser.add_argument('--reject-checkerboard', action='store_true')
    return parser.parse_args()


def remove_chroma(asset: Image.Image, hex_color: str) -> Image.Image:
    key = tuple(int(hex_color.lstrip('#')[offset:offset + 2], 16) for offset in (0, 2, 4))
    if len(key) != 3:
        raise SystemExit('--chroma-key must be a six-digit RGB hex color')
    result = asset.convert('RGBA')
    pixels = []
    for red, green, blue, alpha in result.get_flattened_data():
        distance = math.sqrt((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2)
        matte = max(0.0, min(1.0, (distance - 54.0) / 76.0))
        if matte <= 0.0:
            pixels.append((0, 0, 0, 0))
            continue
        if matte < 1.0:
            red = round(max(0, min(255, (red - (1.0 - matte) * key[0]) / matte)))
            green = round(max(0, min(255, (green - (1.0 - matte) * key[1]) / matte)))
            blue = round(max(0, min(255, (blue - (1.0 - matte) * key[2]) / matte)))
        pixels.append((red, green, blue, round(alpha * matte)))
    result.putdata(pixels)
    return result


def looks_like_baked_checkerboard(asset: Image.Image) -> bool:
    rgb = asset.convert('RGB')
    width, height = rgb.size
    samples = [rgb.getpixel((x, y)) for y in range(0, height, max(1, height // 12))
               for x in range(0, width, max(1, width // 12))]
    neutral_bright = [pixel for pixel in samples if max(pixel) - min(pixel) < 7 and min(pixel) > 205]
    buckets = {tuple(round(channel / 8) * 8 for channel in pixel) for pixel in neutral_bright}
    return len(neutral_bright) > len(samples) * 0.45 and len(buckets) >= 2


def validate_asset(asset: Image.Image, name: str, require_alpha: bool, reject_checkerboard: bool) -> None:
    rgba = asset.convert('RGBA')
    width, height = rgba.size
    alphas = rgba.getchannel('A')
    opaque = sum(1 for alpha in alphas.get_flattened_data() if alpha >= 24)
    coverage = opaque / (width * height)
    if require_alpha:
        corners = [alphas.getpixel((0, 0)), alphas.getpixel((width - 1, 0)),
                   alphas.getpixel((0, height - 1)), alphas.getpixel((width - 1, height - 1))]
        if max(corners) > 12 or not 0.04 <= coverage <= 0.88:
            raise SystemExit(f'{name}: invalid alpha matte (coverage={coverage:.3f}, corners={corners})')
    if reject_checkerboard and looks_like_baked_checkerboard(asset):
        raise SystemExit(f'{name}: probable baked checkerboard background')


def main() -> int:
    args = parse_args()
    cols, rows = (int(value) for value in args.grid.lower().split('x', 1))
    names = [name.strip() for name in args.names.split(',') if name.strip()]
    if not names or len(names) > cols * rows:
        raise SystemExit('name count must be between 1 and the number of grid cells')

    source_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert('RGBA')
    width, height = source.size
    x_edges = [round(index * width / cols) for index in range(cols + 1)]
    y_edges = [round(index * height / rows) for index in range(rows + 1)]
    manifest = []

    for index, name in enumerate(names):
        row, col = divmod(index, cols)
        box = (x_edges[col], y_edges[row], x_edges[col + 1], y_edges[row + 1])
        asset = source.crop(box)
        if args.chroma_key:
            asset = remove_chroma(asset, args.chroma_key)
        validate_asset(asset, name, args.require_alpha, args.reject_checkerboard)
        destination = output_dir / f'{name}.png'
        asset.save(destination, optimize=True)
        manifest.append({
            'slug': name,
            'source': source_path.as_posix(),
            'output': destination.as_posix(),
            'box': {'x': box[0], 'y': box[1], 'width': box[2] - box[0], 'height': box[3] - box[1]},
        })

    (output_dir / f'{source_path.stem}-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8'
    )

    if args.contact_sheet:
        preview = source.copy()
        draw = ImageDraw.Draw(preview)
        font = ImageFont.load_default()
        for index, name in enumerate(names):
            row, col = divmod(index, cols)
            x0, y0 = x_edges[col], y_edges[row]
            x1, y1 = x_edges[col + 1], y_edges[row + 1]
            draw.rectangle((x0, y0, x1 - 1, y1 - 1), outline=(214, 168, 75, 255), width=3)
            label = f'{index + 1}. {name}'
            label_box = draw.textbbox((0, 0), label, font=font)
            label_width = label_box[2] - label_box[0] + 12
            draw.rectangle((x0 + 4, y0 + 4, x0 + label_width, y0 + 24), fill=(12, 16, 24, 220))
            draw.text((x0 + 10, y0 + 8), label, fill=(255, 240, 195, 255), font=font)
        preview.save(output_dir / f'{source_path.stem}-contact-sheet.png', optimize=True)

    print(f'Exported {len(names)} assets to {output_dir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
