from pathlib import Path
import sys
from PIL import Image

NAMES = [
    'plank', 'cut_stone', 'composite_plank', 'goldstone',
    'hardwood_beam', 'reinforced_stone', 'ship_timber', 'dressed_marble',
    'laminated_timber', 'reinforced_concrete', 'carbon_composite', 'advanced_alloy'
]

source = Path(sys.argv[1])
output_dir = Path(sys.argv[2])
output_dir.mkdir(parents=True, exist_ok=True)
atlas = Image.open(source).convert('RGBA')
cell_width = atlas.width // 4
cell_height = atlas.height // 3

for index, name in enumerate(NAMES):
    column, row = index % 4, index // 4
    cell = atlas.crop((column * cell_width, row * cell_height,
                       (column + 1) * cell_width, (row + 1) * cell_height))
    pixels = cell.load()
    for y in range(cell.height):
        for x in range(cell.width):
            red, green, blue, alpha = pixels[x, y]
            magenta_distance = abs(red - 255) + green + abs(blue - 255)
            if magenta_distance < 85 or (red > 220 and blue > 180 and green < 80):
                pixels[x, y] = (red, green, blue, 0)
    bbox = cell.getchannel('A').getbbox()
    if not bbox:
        raise RuntimeError(f'No visible pixels found for {name}')
    subject = cell.crop(bbox)
    scale = min(108 / subject.width, 108 / subject.height)
    subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.NEAREST)
    icon = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    icon.alpha_composite(subject, ((128 - subject.width) // 2, (128 - subject.height) // 2))
    icon.save(output_dir / f'{name}.png', optimize=True)

print(f'Wrote {len(NAMES)} icons to {output_dir}')
