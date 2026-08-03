#!/usr/bin/env python3
"""Windows-compatible grid slicer for assetify image boards.

The upstream assetify helper shells out to macOS `sips` for dimensions. This
local adapter keeps the same grid/name workflow while using Pillow end-to-end.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--grid', required=True, help='COLSxROWS')
    parser.add_argument('--names', required=True, help='comma-separated slugs')
    parser.add_argument('--contact-sheet', action='store_true')
    return parser.parse_args()


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
