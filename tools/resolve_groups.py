"""Turn the classics in data/groups.json (scientific names) into iNaturalist numbers, written beside them as "ids".
Run after editing a group's classics:  python3 tools/resolve_groups.py
A name iNaturalist doesn't know exactly is printed and left out."""
import json, pathlib, time, urllib.parse, urllib.request

PATH = pathlib.Path(__file__).resolve().parent.parent / "data" / "groups.json"

def taxon(name):
    url = "https://api.inaturalist.org/v1/taxa?" + urllib.parse.urlencode({"q": name, "per_page": 5, "is_active": "true"})
    req = urllib.request.Request(url, headers={"User-Agent": "lookout-field-guide (tools/resolve_groups.py)"})
    for t in json.load(urllib.request.urlopen(req, timeout=30))["results"]:
        if t["name"].lower() == name.lower():
            return t["id"]
    return None

doc = json.loads(PATH.read_text())
for key, g in doc["groups"].items():
    if not g.get("classics"):
        continue
    ids = []
    for name in g["classics"]:
        i = taxon(name)
        time.sleep(1)
        if i:
            ids.append(i)
        else:
            print(f"{key}: no exact match for {name}")
    g["ids"] = ids
    print(key, len(ids), "of", len(g["classics"]))
PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
