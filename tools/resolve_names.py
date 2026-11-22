"""Fill in iNaturalist numbers for the scientific names in a data file: every object with "sci" gets "id", and with
"danger" gets "dangerId". A name iNaturalist doesn't know exactly is printed and left without one.
    python3 tools/resolve_names.py data/foraging.json"""
import json, pathlib, sys, time, urllib.parse, urllib.request

def taxon(name):
    url = "https://api.inaturalist.org/v1/taxa?" + urllib.parse.urlencode({"q": name, "per_page": 10, "is_active": "true"})
    req = urllib.request.Request(url, headers={"User-Agent": "lookout-field-guide (tools/resolve_names.py)"})
    for t in json.load(urllib.request.urlopen(req, timeout=30))["results"]:
        if t["name"].lower() == name.lower():
            return t["id"]
    return None

path = pathlib.Path(sys.argv[1])
doc = json.loads(path.read_text())
memo = {}
def walk(x):
    if isinstance(x, dict):
        for k, out in (("sci", "id"), ("danger", "dangerId")):
            if isinstance(x.get(k), str):
                n = x[k]
                if n not in memo:
                    memo[n] = taxon(n); time.sleep(1)
                    if not memo[n]: print("no exact match for", n)
                if memo[n]: x[out] = memo[n]
        for v in x.values(): walk(v)
    elif isinstance(x, list):
        for v in x: walk(v)
walk(doc)
path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
print(len(memo), "names,", sum(1 for v in memo.values() if v), "found")
