"""Seed data/seeds.json: places across Cascadia that aren't hikes (lighthouses, farmers markets, farm stands,
camping, hot springs, waterfalls, ferries, camera obscuras), from OpenStreetMap.

These are seeds, not your list: the Places page shows them on a map, and you save the ones you want.

  python3 tools/seed_places.py                 # every kind
  python3 tools/seed_places.py lighthouse farm # just these kinds; the others already in seeds.json are kept
  NO_OVERPASS=1 python3 tools/seed_places.py   # don't wait on Overpass when it's down

Each kind asks Overpass first (one query over Cascadia). When no Overpass server answers, the kinds that are small
enough are found with Nominatim's category search instead, tile by tile at one request a second; the big ones
(camping, waterfalls, hot springs) wait for Overpass, and whatever seeds.json already holds for them is kept.
Every answer is cached in tools/.cache, so a rerun is quick. Only named places inside Cascadia's outline
(data/cascadia.json) are kept. Data © OpenStreetMap contributors, ODbL.
"""
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import net  # noqa: E402

OVERPASS = [os.environ.get("OVERPASS", "https://overpass-api.de/api/interpreter"), "https://overpass.private.coffee/api/interpreter"]
NOMINATIM = "https://nominatim.openstreetmap.org/search"

# kind: what it's called, the Overpass filters (any of), the Nominatim search (a category phrase, or None to wait
# for Overpass), the OSM tags a Nominatim hit must have, and a test on the name
MARKET = re.compile(r"farm|market|grange|growers|harvest", re.I)
# navigation lights and markers tagged as lighthouses: not somewhere to go
NAV_AID = re.compile(r"range (front|rear)|aid to navigation|daybeacon|beacon|buoy|\blight \d|\b[A-Z]{1,3}\d{2,}\b|\bdolphin\b", re.I)
KINDS = {
    "lighthouse": {"name": "Lighthouse", "osm": ['nwr["man_made"="lighthouse"]["name"]'], "nom": "lighthouse", "tags": {("man_made", "lighthouse")},
                   "test": lambda n: not NAV_AID.search(n)},
    "market": {"name": "Farmers market", "osm": ['nwr["amenity"="marketplace"]["name"~"farm|market|grange|growers|harvest",i]'],
               "nom": "marketplace", "tags": {("amenity", "marketplace")}, "test": MARKET.search},
    "farm": {"name": "Farm stand", "osm": ['nwr["shop"="farm"]["name"]'], "nom": "farm shop", "tags": {("shop", "farm")}},
    "camera-obscura": {"name": "Camera obscura", "osm": ['nwr["name"~"camera obscura",i]'], "nom": "", "tags": None,
                       "test": re.compile(r"camera obscura", re.I).search},
    "ferry": {"name": "Ferry", "osm": ['nwr["amenity"="ferry_terminal"]["name"]'], "nom": "ferry terminal", "tags": {("amenity", "ferry_terminal")}},
    "campground": {"name": "Campground", "osm": ['nwr["tourism"="camp_site"]["name"]["access"!~"private|no"]'], "nom": None},
    "hot-spring": {"name": "Hot spring", "osm": ['nwr["natural"="hot_spring"]["name"]'], "nom": None},
    "waterfall": {"name": "Waterfall", "osm": ['nwr["waterway"="waterfall"]["name"]["wikidata"]', 'nwr["waterway"="waterfall"]["name"]["wikipedia"]'], "nom": None},
}

CASCADIA = net.load("cascadia.json")
REGIONS = net.load("regions.json")["regions"]
W, S, E, N = CASCADIA["bounds"]


# ---------- where a point is ----------
def _in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_cascadia(lat, lon):
    if not (S <= lat <= N and W <= lon <= E):
        return False
    for poly in CASCADIA["geometry"]["coordinates"]:
        if _in_ring(lon, lat, poly[0]) and not any(_in_ring(lon, lat, h) for h in poly[1:]):
            return True
    # the outline is simplified, so a lighthouse on a rock just offshore can fall outside it: allow ~3 km
    return any(abs(lat - y) < 0.03 and abs(lon - x) < 0.045 for poly in CASCADIA["geometry"]["coordinates"] for x, y in poly[0])


def regions_at(lat, lon):
    """(the smallest land region holding the point, or None; the waters holding it)"""
    inside = [r for r in REGIONS if r["bbox"][0] <= lat <= r["bbox"][2] and r["bbox"][1] <= lon <= r["bbox"][3]]
    area = lambda r: (r["bbox"][2] - r["bbox"][0]) * (r["bbox"][3] - r["bbox"][1])
    land = sorted((r for r in inside if r.get("kind") != "water"), key=area)
    return (land[0]["id"] if land else None), [r["id"] for r in sorted((r for r in inside if r.get("kind") == "water"), key=area)]


# ---------- what to keep of each hit ----------
def clean_url(u):
    u = (u or "").strip().split(";")[0].strip()
    if not u:
        return None
    return u if re.match(r"^https?://", u) else "https://" + u


def record(kind, osm, name, lat, lon, tags):
    lat, lon = round(float(lat), 5), round(float(lon), 5)
    region, waters = regions_at(lat, lon)
    r = {"id": "osm-" + osm, "name": name.strip(), "kind": kind, "lat": lat, "lon": lon}
    if region:
        r["region"] = region
    if waters:
        r["waters"] = waters
    web = clean_url(tags.get("website") or tags.get("contact:website") or tags.get("url"))
    if web:
        r["web"] = web
    if tags.get("opening_hours"):
        r["hours"] = tags["opening_hours"][:160]
    wiki = tags.get("wikipedia", "")
    if wiki.startswith("en:"):
        r["wiki"] = wiki[3:]
    if tags.get("operator"):
        r["by"] = tags["operator"][:80]
    if tags.get("fee") in ("yes", "no"):
        r["fee"] = tags["fee"] == "yes"
    return r


def keep(kind, name, lat, lon):
    k = KINDS[kind]
    return bool(name) and in_cascadia(lat, lon) and (not k.get("test") or k["test"](name))


# ---------- Overpass ----------
_down = bool(os.environ.get("NO_OVERPASS"))   # NO_OVERPASS=1 goes straight to Nominatim (and its cache)


def from_overpass(kind):
    """the kind's records, or None when no Overpass server answers (after which the rest of the run doesn't ask again)"""
    global _down
    if _down:
        return None
    body = "".join(f"{f}({S},{W},{N},{E});" for f in KINDS[kind]["osm"])
    q = f"[out:json][timeout:180];({body});out tags center;"
    for url in OVERPASS:
        try:
            j = net.get_json(url, data=q, tries=2, timeout=200)
        except Exception as e:
            print(f"  ! {url}: {e.__class__.__name__}")
            continue
        out = []
        for el in j.get("elements", []):
            t = el.get("tags", {})
            c = el if "lat" in el else el.get("center")
            if not c or not keep(kind, t.get("name"), c["lat"], c["lon"]):
                continue
            out.append(record(kind, el["type"][0] + str(el["id"]), t["name"], c["lat"], c["lon"], t))
        return out
    _down = True
    return None


# ---------- Nominatim, tile by tile ----------
def tiles(step=2.0):
    lat = S
    while lat < N:
        lon = W
        while lon < E:
            box = (lat, lon, min(lat + step, N), min(lon + step, E))
            # only tiles that touch Cascadia: a corner, the middle or a point of the outline inside it
            pts = [(box[0], box[1]), (box[0], box[3]), (box[2], box[1]), (box[2], box[3]), ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)]
            if any(in_cascadia(a, b) for a, b in pts) or any(box[0] <= y <= box[2] and box[1] <= x <= box[3]
                                                          for poly in CASCADIA["geometry"]["coordinates"] for x, y in poly[0][::5]):
                yield box
            lon += step
        lat += step


def nominatim(q, box, exclude=()):
    s, w, n, e = box
    p = {"q": q, "format": "jsonv2", "limit": 50, "bounded": 1, "viewbox": f"{w},{n},{e},{s}", "extratags": 1, "namedetails": 0}
    if exclude:
        p["exclude_place_ids"] = ",".join(map(str, exclude))
    return net.get_json(NOMINATIM, p, max_age_days=60)


def from_nominatim(kind):
    k = KINDS[kind]
    boxes = [(S, W, N, E)] if k["nom"] == "" else list(tiles())
    q = k["nom"] or "camera obscura"
    out = []
    for i, box in enumerate(boxes):
        seen = []
        for page in range(12):
            hits = nominatim(q, box, seen)
            for h in hits:
                seen.append(h["place_id"])
                if k["tags"] and (h.get("category"), h.get("type")) not in k["tags"]:
                    continue
                name = h.get("name") or ""
                if not keep(kind, name, float(h["lat"]), float(h["lon"])):
                    continue
                out.append(record(kind, h["osm_type"][0] + str(h["osm_id"]), name, h["lat"], h["lon"], h.get("extratags") or {}))
            if len(hits) < 50:
                break
        if len(boxes) > 1:
            print(f"  {kind}: tile {i + 1} of {len(boxes)}, {len(out)} so far", end="\r")
    if len(boxes) > 1:
        print()
    return out


# ---------- the run ----------
def dedupe(rows):
    """one record per OSM object, and one per place: the same name within ~300 m (a market's node and its area, say),
    or one name starting the other within ~1 km ("New Dungeness" and "New Dungeness Lighthouse"), keeping the fuller record"""
    by_id = {}
    for r in rows:
        by_id.setdefault(r["id"], r)
    rows = sorted(by_id.values(), key=lambda r: (-len(r), -len(r["name"])))
    out = []
    for r in rows:
        a = r["name"].lower()
        def same(o):
            b = o["name"].lower()
            near = lambda d: abs(o["lat"] - r["lat"]) < d and abs(o["lon"] - r["lon"]) < d * 1.4
            return (a == b and near(0.003)) or ((a.startswith(b) or b.startswith(a)) and near(0.009))
        if not any(same(o) for o in out):
            out.append(r)
    return out


def main():
    want = sys.argv[1:] or list(KINDS)
    for k in want:
        if k not in KINDS:
            sys.exit(f"no kind {k!r}; the kinds are {', '.join(KINDS)}")
    try:
        old = net.load("seeds.json")
    except FileNotFoundError:
        old = {"seeds": [], "kinds": {}}
    have = {k: [s for s in old["seeds"] if s["kind"] == k] for k in KINDS}
    how = dict(old.get("from", {}))
    for kind in want:
        print(f"== {KINDS[kind]['name']}")
        rows = from_overpass(kind)
        if rows is not None:
            how[kind] = "overpass"
        elif KINDS[kind]["nom"] is not None:
            print("  no Overpass server answered; searching Nominatim instead")
            rows = from_nominatim(kind)
            how[kind] = "nominatim"
        else:
            print(f"  no Overpass server answered, and there are too many to search one by one: keeping the {len(have[kind])} already seeded")
            continue
        have[kind] = dedupe(rows)
        print(f"  {len(have[kind])} {KINDS[kind]['name'].lower()}s")
    seeds = sorted((s for k in KINDS for s in have[k]), key=lambda s: (s["kind"], s["name"].lower()))
    net.save("seeds.json", {
        "_note": "Written by tools/seed_places.py; don't edit by hand. Places across Cascadia from OpenStreetMap, to save onto your list from the Places page's map.",
        "source": "© OpenStreetMap contributors, ODbL",
        "built": datetime.date.today().isoformat(),
        "kinds": {k: {"name": v["name"], "n": len(have[k])} for k, v in KINDS.items()},
        "from": {k: how[k] for k in KINDS if k in how},
        "seeds": seeds})


if __name__ == "__main__":
    main()
