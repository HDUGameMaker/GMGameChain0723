"""
Batch generate map icons (top-down) and detail pictures (isometric) for all buildings.
Uses bailian CLI with wan2.7-image-pro model.
Background: solid chroma-key green for easy cutout.
"""
import subprocess
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

PROJECT_ROOT = r"E:\unityproject\GMGameChain0723"
OUT_DIR = os.path.join(PROJECT_ROOT, "assets", "buildings")
MODEL = "wan2.7-image"
SIZE = "1024*1024"
MAX_WORKERS = 3  # parallel generation jobs

# ── Style anchors (matched to existing detail_work_shed.png / detail_plank_house.png) ──
DETAIL_STYLE = (
    "Isometric 3/4 view pixel art game asset, detailed pixel art with visible pixel grain, "
    "muted earthy color palette (dark browns, tans, olive greens, weathered wood), "
    "post-apocalyptic survival aesthetic, small dirt/grass ground patch under the building, "
    "no sky, no horizon, no extra decorations, no text, no watermark. "
    "Solid pure chroma-key green background hex 00FF00 filling the entire canvas behind the building and ground patch."
)

ICON_STYLE = (
    "Top-down overhead bird-eye view pixel art game map icon, seen from directly above, "
    "only the rooftop and building footprint visible, no ground, no sky, no trees, no sun, no clouds, "
    "pixel art style with visible pixel grain, muted earthy tones. "
    "Solid pure chroma-key green background hex 00FF00 filling entire canvas. No shadow on background. "
    "Centered, clean isolated game sprite, no text, no watermark."
)

NEGATIVE = (
    "text, watermark, signature, border, frame, white background, transparent background, "
    "gradient background, realistic photo, 3D render, blurry, low quality"
)

# ── Building definitions ──
# Each entry: (id, name_cn, footprint_w, footprint_h, icon_desc, detail_desc)
BUILDINGS = [
    (
        "work_shed", "工棚", 1, 1,
        "a small open-sided work shed with thatched straw roof and rough wooden frame posts, "
        "rectangular thatched roof seen from above with ridge line down the center",
        "a small open-sided work shed with thatched straw roof supported by rough wooden frame posts, "
        "a workbench with hand tools (axe, saw) inside, stacked logs beside it, half-height wooden plank walls on two sides, "
        "dirt ground patch, weathered and crude construction"
    ),
    (
        "plank_house", "木板房", 1, 1,
        "a small enclosed wooden plank house with dark pitched roof, brick chimney on one side, "
        "rectangular roof with ridge line seen from above",
        "a small enclosed house built from horizontal wooden planks, dark weathered wood pitched roof, "
        "brick chimney with thin smoke, warm-lit small windows, a wooden door with iron handle, "
        "stone foundation, grass and dirt ground patch"
    ),
    (
        "tile_house", "瓦房", 2, 2,
        "a large sturdy house with grey clay tile roof, wider rectangular footprint (2x2 tiles), "
        "tile roof pattern visible from above with ridge line",
        "a large sturdy two-room house with grey clay tile roof, stone and wood walls, "
        "multiple warm-lit windows, a solid wooden front door with stone steps, "
        "brick chimney, wider and more solid construction than a plank house, "
        "grass and dirt ground patch"
    ),
    (
        "hunting_hut", "狩猎小屋", 1, 1,
        "a small rustic hunting cabin with steep pointed roof covered in animal hides and branches, "
        "narrow rectangular roof seen from above",
        "a small rustic hunting cabin with steep pointed roof covered in animal hides and woven branches, "
        "rough log walls, a rack of drying meat on the side, hunting trophies (antlers) mounted on wall, "
        "a bow and quiver leaning against the wall, dirt ground patch"
    ),
    (
        "farm", "农田", 3, 3,
        "a large rectangular farm field divided into neat crop rows and furrows, "
        "3x3 grid of tilled soil plots with green crop rows, irrigation ditches between plots, "
        "seen from directly above",
        "a large cultivated farm field with neat rows of crops in tilled soil, "
        "wooden fence border, a small scarecrow, irrigation ditch, "
        "wheelbarrow with harvested vegetables, wide 3x3 tile area of farmland, "
        "dirt paths between crop rows"
    ),
    (
        "warehouse", "仓库", 3, 3,
        "a large rectangular warehouse building with flat corrugated metal roof, "
        "3x3 footprint, roof has skylights and ventilation hatches seen from above",
        "a large sturdy warehouse building with corrugated metal roof and reinforced wooden walls, "
        "large double sliding doors, stacked crates and barrels visible through open door, "
        "metal brackets reinforcing corners, wide 3x3 tile footprint, "
        "dirt and gravel ground patch"
    ),
    (
        "industrial_warehouse", "工业仓储中心", 3, 3,
        "a large industrial warehouse with metal roof, crane rail on top, "
        "3x3 footprint, industrial ventilation units and pipes on roof seen from above",
        "a large industrial-grade warehouse with corrugated steel walls and roof, "
        "overhead crane rail, metal scaffolding, reinforced concrete foundation, "
        "loading dock with ramp, industrial pipes and vents, "
        "much more robust and metallic than basic warehouse, wide 3x3 tile footprint"
    ),
    (
        "lumber_mill", "木材处理厂", 2, 2,
        "a lumber mill building with saw-tooth roof pattern, log storage area beside it, "
        "2x2 footprint, roof has saw-blade ventilation slots seen from above",
        "a lumber processing mill with a large circular saw blade mounted on frame, "
        "stacks of raw logs on one side and cut planks on the other, "
        "wooden shed structure with open sides, sawdust on ground, "
        "2x2 tile footprint, dirt ground patch"
    ),
    (
        "quarry", "采石场", 2, 2,
        "an open-pit stone quarry with excavated rock face, "
        "2x2 footprint, irregular pit with stone piles and tool marks seen from above",
        "an open-pit stone quarry with rough excavated rock walls, "
        "piles of cut stone blocks, pickaxes and wedges stuck in rock face, "
        "a wooden cart loaded with stones, rope pulley system, "
        "2x2 tile footprint, rocky ground"
    ),
    (
        "logging_camp", "伐木集散点", 1, 1,
        "a small logging camp outpost with stacked logs and a lean-to shelter, "
        "small rectangular footprint, log pile and tent roof seen from above",
        "a small logging camp outpost with a lean-to shelter made of branches, "
        "neatly stacked cut logs, an axe stuck in a chopping stump, "
        "a rack of drying tools, rope coils, "
        "forest-edge setting, dirt ground patch"
    ),
    (
        "furnace", "熔炉", 2, 2,
        "a smelting furnace structure with chimney and heat glow, "
        "2x2 footprint, round furnace top with chimney and coal pile seen from above",
        "a high-temperature smelting furnace built from stone and clay, "
        "glowing orange opening, tall brick chimney with smoke, "
        "piles of coal and iron ore beside it, metal tongs and molds, "
        "heat-distorted air effect, 2x2 tile footprint, scorched ground"
    ),
    (
        "mine_support", "矿洞支撑结构", 2, 2,
        "a mine entrance with heavy timber support frame and dark tunnel opening, "
        "2x2 footprint, rectangular timber frame around dark mine shaft seen from above",
        "a reinforced mine cave entrance with heavy timber support beams forming a frame, "
        "dark tunnel opening leading underground, wooden rail tracks going into the mine, "
        "lanterns hanging on support posts, pile of excavated rock beside entrance, "
        "2x2 tile footprint, rocky ground"
    ),
    (
        "basic_workshop", "基础工作站", 1, 1,
        "a simple outdoor crafting workbench with basic tools, "
        "small square footprint, flat workbench surface with tools seen from above",
        "a simple outdoor crafting workbench made of rough wooden planks, "
        "basic hand tools laid on surface (hammer, chisel, knife), "
        "a small shelf with raw materials underneath, "
        "wooden stool beside it, dirt ground patch"
    ),
    (
        "advanced_workshop", "进阶工作站", 1, 1,
        "an advanced crafting station with precision tools and metal components, "
        "small square footprint, organized workbench with clamps and metal parts seen from above",
        "an advanced crafting station with a sturdy reinforced workbench, "
        "precision tools (files, calipers, vise grip), metal components and iron ingots on shelves, "
        "a grinding wheel on the side, oil lamp for lighting, "
        "more organized and equipped than basic workshop, dirt ground patch"
    ),
]


def build_prompt(bld, kind):
    """kind: 'icon' or 'detail'"""
    bid, name_cn, fw, fh, icon_desc, detail_desc = bld
    if kind == "icon":
        return f"{icon_desc}. {ICON_STYLE}"
    else:
        return f"{detail_desc}. {DETAIL_STYLE}"


def generate_one(bld, kind):
    """Run bailian image generate for one building+kind. Returns (filename, success, msg)."""
    bid, name_cn, fw, fh, icon_desc, detail_desc = bld
    prefix = "icon" if kind == "icon" else "detail"
    out_name = f"{prefix}_{bid}.png"
    out_path = os.path.join(OUT_DIR, out_name)

    # Always regenerate to ensure green background

    prompt = build_prompt(bld, kind)
    neg = NEGATIVE
    if kind == "icon":
        neg += ", isometric, side view, front view, 3/4 view"
    else:
        neg += ", top-down, overhead, bird-eye, flat map"

    cmd = [
        "bailian", "image", "generate",
        "--model", MODEL,
        "--prompt", prompt,
        "--negative-prompt", neg,
        "--size", SIZE,
        "--watermark", "false",
        "--prompt-extend", "false",
        "--out-dir", OUT_DIR,
        "--out-prefix", f"{prefix}_{bid}",
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180,
            cwd=PROJECT_ROOT, shell=True
        )
        if result.returncode == 0:
            # The CLI saves as {prefix}_{bid}.png or {prefix}_{bid}_0.png etc.
            # Find the actual saved file
            saved = None
            for f in os.listdir(OUT_DIR):
                if f.startswith(f"{prefix}_{bid}") and f.endswith(".png") and "test" not in f:
                    saved = f
                    break
            # Rename to exact name if needed
            if saved and saved != out_name:
                src = os.path.join(OUT_DIR, saved)
                dst = os.path.join(OUT_DIR, out_name)
                if os.path.exists(dst):
                    os.remove(dst)
                os.rename(src, dst)
            return (out_name, True, "ok")
        else:
            return (out_name, False, result.stderr.strip() or result.stdout.strip())
    except subprocess.TimeoutExpired:
        return (out_name, False, "timeout")
    except Exception as e:
        return (out_name, False, str(e))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Build task list: (building, kind)
    tasks = []
    for bld in BUILDINGS:
        tasks.append((bld, "icon"))
        tasks.append((bld, "detail"))

    print(f"Total tasks: {len(tasks)} ({len(BUILDINGS)} buildings x 2 types)")
    print(f"Parallel workers: {MAX_WORKERS}")
    print(f"Output dir: {OUT_DIR}")
    print("=" * 60)

    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(generate_one, bld, kind): (bld[0], kind) for bld, kind in tasks}
        for i, future in enumerate(as_completed(futures), 1):
            bid, kind = futures[future]
            fname, ok, msg = future.result()
            status = "[OK]" if ok else "[FAIL]"
            print(f"[{i:2d}/{len(tasks)}] {status} {fname:40s} {msg}")
            results.append((fname, ok, msg))

    # Summary
    ok_count = sum(1 for _, ok, _ in results if ok)
    fail_count = sum(1 for _, ok, _ in results if not ok)
    print("=" * 60)
    print(f"Done: {ok_count} ok, {fail_count} failed out of {len(results)}")
    if fail_count > 0:
        print("Failed:")
        for fname, ok, msg in results:
            if not ok:
                print(f"  - {fname}: {msg}")


if __name__ == "__main__":
    main()
