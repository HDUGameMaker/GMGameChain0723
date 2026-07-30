import json

path = r"E:\unityproject\GMGameChain0723\config\buildings.json"
with open(path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

for b in buildings:
    bid = b["id"]
    b["mapIcon"] = f"assets/buildings/icon_{bid}.png"
    b["imageDetail"] = f"assets/buildings/detail_{bid}.png"

with open(path, "w", encoding="utf-8") as f:
    json.dump(buildings, f, ensure_ascii=False, indent=2)

print(f"Updated {len(buildings)} buildings")
for b in buildings:
    print(f"  {b['id']:25s} mapIcon={b['mapIcon']}  imageDetail={b['imageDetail']}")
