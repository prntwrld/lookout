#!/usr/bin/env python3
"""Add or replace trait lines in a pack's trait file, keeping one species per line.

    python3 tools/add_traits.py mammals "Aplodontia rufa: m | n | short | forest | digs" ...
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
pack, lines = sys.argv[1], sys.argv[2:]
path = ROOT / "data" / "traits" / f"{pack}.json"
d = json.loads(path.read_text())
qs = d["questions"]
for line in lines:
    name, v = (x.strip() for x in line.split(":", 1))
    parts = [x.split() for x in v.split("|")]
    assert len(parts) == len(qs), f"{name}: {len(parts)} slots, want {len(qs)}"
    for slot, q in zip(parts, qs):
        for x in slot:
            assert x in q["opts"], f"{name}: '{x}' isn't an answer to {q['k']}"
    d["traits"][name] = v
path.write_text('{"_note":' + json.dumps(d["_note"], ensure_ascii=False) + ',\n"questions":' + json.dumps(qs, ensure_ascii=False)
                + ',\n"traits":{\n' + ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in d["traits"].items()) + "\n}}\n")
print(f"{pack}: {len(d['traits'])} species")
