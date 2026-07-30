"""
Extract frames from video, remove green background, create sprite sheet.
Usage: python scripts/extract_sprite_frames.py <video_path> <output_prefix> [--frames N] [--fps F]
"""
import cv2
import numpy as np
from PIL import Image
import os
import sys
import json
import argparse

PROJECT_ROOT = r"E:\unityproject\GMGameChain0723"
OUT_DIR = os.path.join(PROJECT_ROOT, "assets", "buildings")

def remove_green_background(frame, tolerance=60):
    """Remove chroma-key green background (pure green #00FF00), return RGBA."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    # Green hue range in HSV
    lower_green = np.array([40 - tolerance, 50, 50])
    upper_green = np.array([80 + tolerance, 255, 255])
    mask = cv2.inRange(hsv, lower_green, upper_green)

    # Also mask pure green in RGB space (the AI might not produce exactly green HSV)
    b, g, r = cv2.split(frame)
    # Pure green: G is high, R and B are low
    rgb_mask = (g > 150) & (g > r * 1.5) & (g > b * 1.5)
    rgb_mask = rgb_mask.astype(np.uint8) * 255

    # Combine masks
    combined_mask = cv2.bitwise_or(mask, rgb_mask)

    # Clean up mask edges
    kernel = np.ones((3, 3), np.uint8)
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    # Convert to RGBA
    rgba = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = 255 - combined_mask  # Alpha channel: 0 where green, 255 elsewhere

    return rgba


def extract_frames(video_path, num_frames=8):
    """Extract evenly spaced frames from video, skipping first/last 10%."""
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        cap.release()
        raise ValueError("Cannot read video frame count")

    # Skip first 10% and last 10% (often have fade-in/out artifacts)
    start_frame = int(total_frames * 0.1)
    end_frame = int(total_frames * 0.9)
    usable_range = end_frame - start_frame

    if num_frames >= usable_range:
        frame_indices = list(range(start_frame, end_frame))
    else:
        step = usable_range / num_frames
        frame_indices = [int(start_frame + i * step) for i in range(num_frames)]

    frames = []
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            frames.append(frame)
        else:
            print(f"  Warning: Could not read frame {idx}")

    cap.release()
    print(f"  Extracted {len(frames)} frames from {total_frames} total")
    return frames


def resize_frames(frames, target_size=None):
    """Resize frames to a consistent target size. If None, use the first frame's size."""
    if target_size is None:
        h, w = frames[0].shape[:2]
        target_size = (w, h)
    return [cv2.resize(f, target_size) for f in frames]


def create_sprite_sheet(frames, output_path, layout='horizontal'):
    """Combine frames into a sprite sheet. Returns (sheet_width, sheet_height, frame_width, frame_height)."""
    if not frames:
        raise ValueError("No frames to combine")

    h, w = frames[0].shape[:2]

    if layout == 'horizontal':
        sheet_w = w * len(frames)
        sheet_h = h
        sheet = np.zeros((sheet_h, sheet_w, 4), dtype=np.uint8)
        for i, frame in enumerate(frames):
            sheet[:, i * w:(i + 1) * w] = frame
    else:
        # Grid layout (auto-calculate columns)
        cols = int(np.ceil(np.sqrt(len(frames))))
        rows = int(np.ceil(len(frames) / cols))
        sheet_w = w * cols
        sheet_h = h * rows
        sheet = np.zeros((sheet_h, sheet_w, 4), dtype=np.uint8)
        for i, frame in enumerate(frames):
            row = i // cols
            col = i % cols
            sheet[row * h:(row + 1) * h, col * w:(col + 1) * w] = frame

    # Save
    img = Image.fromarray(sheet, 'RGBA')
    img.save(output_path, 'PNG')
    print(f"  Sprite sheet saved: {output_path}")
    print(f"  Sheet size: {sheet_w}x{sheet_h}, Frame size: {w}x{h}, Frames: {len(frames)}")
    return sheet_w, sheet_h, w, h, len(frames)


def main():
    parser = argparse.ArgumentParser(description="Extract frames from video and create sprite sheet")
    parser.add_argument("video_path", help="Path to input video")
    parser.add_argument("output_name", help="Output base name (e.g. 'lumber_mill')")
    parser.add_argument("--frames", type=int, default=8, help="Number of frames to extract")
    parser.add_argument("--size", type=int, default=None, help="Target frame size in pixels (square)")
    parser.add_argument("--layout", default="horizontal", choices=["horizontal", "grid"])
    args = parser.parse_args()

    video_path = args.video_path
    if not os.path.isabs(video_path):
        video_path = os.path.join(PROJECT_ROOT, video_path)

    print(f"Processing: {video_path}")
    print(f"Extracting {args.frames} frames...")

    # Extract frames
    raw_frames = extract_frames(video_path, args.frames)

    # Remove green background
    print("Removing green background...")
    rgba_frames = [remove_green_background(f) for f in raw_frames]

    # Resize if needed
    if args.size:
        target = (args.size, args.size)
        print(f"Resizing frames to {target}...")
        rgba_frames = resize_frames(rgba_frames, target)

    # Create sprite sheet
    sheet_path = os.path.join(OUT_DIR, f"anim_{args.output_name}.png")
    sheet_w, sheet_h, fw, fh, n_frames = create_sprite_sheet(rgba_frames, sheet_path, args.layout)

    # Save metadata JSON
    meta = {
        "spriteSheet": f"assets/buildings/anim_{args.output_name}.png",
        "frameWidth": fw,
        "frameHeight": fh,
        "frameCount": n_frames,
        "fps": 8,
        "layout": args.layout
    }
    meta_path = os.path.join(OUT_DIR, f"anim_{args.output_name}.json")
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    print(f"  Metadata saved: {meta_path}")

    # Also copy individual frames for inspection
    frames_dir = os.path.join(OUT_DIR, f"frames_{args.output_name}")
    os.makedirs(frames_dir, exist_ok=True)
    for i, frame in enumerate(rgba_frames):
        frame_path = os.path.join(frames_dir, f"frame_{i:02d}.png")
        Image.fromarray(frame, 'RGBA').save(frame_path)
    print(f"  Individual frames saved: {frames_dir}/")

    print("Done!")


if __name__ == "__main__":
    main()
