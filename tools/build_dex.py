"""Build data/dex.json: the species in Lookout's keys, by group, most-recorded first, for the field guide on the Me page.

Every species here has a thumbnail in data/thumbs/, so the field guide works offline. Run it after the packs change:
  python3 tools/build_dex.py
"""
import json
import pathlib

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"


def rows(path):
    out = []
    for s in sorted(json.load(open(path))["species"], key=lambda s: -(s.get("obs") or 0)):
        if not (DATA / "thumbs" / f"{s['id']}.jpg").exists():
            continue
        row = [s["id"], s.get("common") or "", s["sci"]]
        if s.get("slug") and not str(s["slug"]).isdigit():
            row.append(s["slug"])
        out.append(row)
    return out


groups = [{"k": "flowers", "name": "Wildflowers", "s": rows(DATA / "flowers.json")},
          {"k": "birds", "name": "Birds", "s": rows(DATA / "birds.json")}]
for p in json.load(open(DATA / "packs.json"))["packs"]:
    f = DATA / "packs" / f"{p['id']}.json"
    if f.exists():
        groups.append({"k": p["id"], "name": p["name"], "s": rows(f)})
seen = set()
for g in groups:                     # a species in two keys counts once, in the first
    g["s"] = [r for r in g["s"] if not (r[0] in seen or seen.add(r[0]))]
groups = [g for g in groups if g["s"]]
json.dump({"_note": "Written by tools/build_dex.py from the keys' packs. Don't edit.", "groups": groups},
          open(DATA / "dex.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(sum(len(g["s"]) for g in groups), "species in", len(groups), "groups,", (DATA / "dex.json").stat().st_size // 1024, "KB")
