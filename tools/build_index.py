#!/usr/bin/env python3
"""Write data/packs/index.json: for every key, how many species it has and a few of its best-known species
(whose thumbnails show on the key's "What is it?" tiles). tools/build_pack.py runs this at the end."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "data"


def main():
    files = {"flowers": D / "flowers.json", "birds": D / "birds.json"}
    for p in json.loads((D / "packs.json").read_text())["packs"]:
        files[p["id"]] = D / "packs" / f"{p['id']}.json"
    out = {}
    for k, f in files.items():
        if not f.exists():
            continue
        sp = [s for s in json.loads(f.read_text())["species"] if (D / "thumbs" / f"{s['id']}.jpg").exists()]
        sp.sort(key=lambda s: -s.get("obs", 0))
        out[k] = {"n": len(sp), "top": [s["id"] for s in sp[:4]]}
    (D / "packs" / "index.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"wrote data/packs/index.json ({len(out)} keys)")


if __name__ == "__main__":
    main()
