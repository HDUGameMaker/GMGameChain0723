"""
Post-process generated building images:
1. Snap near-green background pixels to exact #00FF00
2. Convert to RGBA with transparent background (optional, for game use)
"""
import os
import sys
from PIL import Image
import numpy as np

BUILDINGS_DIR = r"E:\unityproject\GMGameChain0723\assets\buildings"
TARGET_GREEN = (0, 255, 0)  # exact chroma key green
GREEN_THRESHOLD = 60  # max distance from target green to be considered "background"


def process_image(filepath):
    """Snap near-green pixels to exact #00FF00."""
    img = Image.open(filepath).convert("RGB")
    arr = np.array(img, dtype=np.int16)

    # Calculate distance from each pixel to target green
    diff = arr - np.array(TARGET_GREEN, dtype=np.int16)
    dist = np.sqrt(np.sum(diff ** 2, axis=2))

    # Create mask of green-ish pixels
    green_mask = dist < GREEN_THRESHOLD

    # Snap to exact green
    result = np.array(img)
    result[green_mask] = TARGET_GREEN

    out = Image.fromarray(result, "RGB")
    out.save(filepath)
    return green_mask.sum()


def main():
    files = sorted(f for f in os.listdir(BUILDINGS_DIR)
                   if f.endswith(".png") and (f.startswith("icon_") or f.startswith("detail_")))

    print(f"Processing {len(files)} images...")
    for f in files:
        path = os.path.join(BUILDINGS_DIR, f)
        snapped = process_image(path)
        print(f"  {f:45s} snapped {snapped:>8d} px")

    print("Done.")


if __name__ == "__main__":
    main()
