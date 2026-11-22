#!/usr/bin/env python3
"""Build data/places-extra.json: what the page adds to your hand-written data/places.json.

    python3 tools/build_places.py     # a few minutes; reruns use tools/.cache

For each place:
  - trailhead: the nearest OpenStreetMap trailhead (or trailhead parking) within 1.5 km, for the map pin
  - around: named peaks, fire lookouts, hot springs, viewpoints, lakes and waterfalls within 4 km (OpenStreetMap,
    via Overpass; when no Overpass server answers, via Nominatim's search, more slowly)
  - photo: the lead picture of its Wikipedia article (the place's "wiki" field, else the nearest article with one),
    with its author and licence; only freely licensed pictures (public domain, CC0, CC BY, CC BY-SA)
  - about: two sentences from that article (CC BY-SA, credited on the page)
  - seen: for each month, the species most often recorded within 3 km of the trailhead (iNaturalist),
    with an open-licensed photo where there is one (CC0 or CC BY)
"""
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import net  # noqa: E402

INAT = "https://api.inaturalist.org/v1"
WIKI = "https://en.wikipedia.org/w/api.php"
OVERPASS = [os.environ.get("OVERPASS", "https://overpass-api.de/api/interpreter"), "https://overpass.private.coffee/api/interpreter"]
FREE = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? \d|cc-by(-sa)?-\d)", re.I)


_overpass_down = False


def overpass(q):
    """Ask Overpass; if no Overpass server answers, say so once and let the caller use Nominatim instead."""
    global _overpass_down
    if _overpass_down:
        return None
    for url in OVERPASS:
        try:
            return net.get_json(url, data=q, tries=2, timeout=60)
        except Exception as e:
            print(f"  ! overpass {url}: {e.__class__.__name__}")
    print("  ! no Overpass server answered; using Nominatim searches for the rest of this run")
    _overpass_down = True
    return None


NOMINATIM = "https://nominatim.openstreetmap.org/search"
# (search words, OSM tags that make a hit count, what to call it)
SEARCHES = [("trailhead", {("highway", "trailhead"), ("amenity", "parking")}, "trailhead"),
            ("peak", {("natural", "peak")}, "peak"), ("lookout", {("man_made", "tower"), ("tourism", "attraction"), ("historic", "building")}, "lookout"),
            ("hot spring", {("natural", "hot_spring"), ("leisure", "resort")}, "hot spring"), ("viewpoint", {("tourism", "viewpoint")}, "viewpoint"),
            ("lake", {("natural", "water")}, "lake"), ("falls", {("waterway", "waterfall"), ("natural", "waterfall")}, "waterfall")]


def nominatim_elements(p, r_km=4.0):
    """The same kinds of features as the Overpass query, found with Nominatim's bounded search (1 request a second)."""
    from math import cos, radians
    dlat = r_km / 111.0; dlon = r_km / (111.0 * cos(radians(p["lat"])))
    box = f"{p['lon'] - dlon},{p['lat'] + dlat},{p['lon'] + dlon},{p['lat'] - dlat}"
    els = []
    for words, tags, kind in SEARCHES:
        try:
            hits = net.get_json(NOMINATIM, {"q": words, "format": "jsonv2", "viewbox": box, "bounded": 1, "limit": 12, "extratags": 1})
        except Exception as e:
            print(f"  ! nominatim {words}: {e}"); continue
        for h in hits:
            if (h.get("category"), h.get("type")) not in tags:
                continue
            if kind == "lookout" and "lookout" not in (h.get("name") or "").lower():
                continue
            t = {"name": h.get("name") or "", **(h.get("extratags") or {})}
            k, v = h["category"], h["type"]
            t[k] = v
            if kind == "trailhead" and v == "parking" and "trail" not in t["name"].lower():
                continue
            if kind == "lookout":
                t["man_made"] = "tower"
            if kind == "waterfall":
                t["waterway"] = "waterfall"
            if kind == "lake":
                t["water"] = "lake"
            els.append({"type": h["osm_type"], "id": h["osm_id"], "lat": float(h["lat"]), "lon": float(h["lon"]), "tags": t})
    return els


def osm_around(p):
    q = f"""[out:json][timeout:60];
(
  nwr(around:1500,{p['lat']},{p['lon']})[highway=trailhead];
  nwr(around:1500,{p['lat']},{p['lon']})[amenity=parking][name~"[Tt]rail"];
  node(around:4000,{p['lat']},{p['lon']})[natural=peak][name];
  nwr(around:4000,{p['lat']},{p['lon']})[man_made=tower]["tower:type"~"lookout|observation"];
  nwr(around:4000,{p['lat']},{p['lon']})[natural=hot_spring];
  node(around:4000,{p['lat']},{p['lon']})[tourism=viewpoint][name];
  nwr(around:4000,{p['lat']},{p['lon']})[natural=water][water=lake][name];
  nwr(around:4000,{p['lat']},{p['lon']})[waterway=waterfall][name];
);
out center tags;"""
    got = overpass(q)
    els = got["elements"] if got else nominatim_elements(p)
    from math import cos, radians, hypot
    def dist(e):
        la = e.get("lat", e.get("center", {}).get("lat")); lo = e.get("lon", e.get("center", {}).get("lon"))
        return hypot(la - p["lat"], (lo - p["lon"]) * cos(radians(p["lat"]))) * 111.0, la, lo
    trailhead, around = None, []
    for e in els:
        t = e.get("tags", {})
        d, la, lo = dist(e)
        if t.get("highway") == "trailhead" or t.get("amenity") == "parking":
            if d > 1.5:
                continue
            if not trailhead or d < trailhead["km"]:
                trailhead = {"lat": round(la, 5), "lon": round(lo, 5), "name": t.get("name", ""), "km": round(d, 2),
                             "osm": f"{e['type']}/{e['id']}"}
            continue
        if d > 4.5:
            continue
        kind = ("peak" if t.get("natural") == "peak" else "lookout" if t.get("man_made") == "tower" else
                "hot spring" if t.get("natural") == "hot_spring" else "viewpoint" if t.get("tourism") == "viewpoint" else
                "waterfall" if t.get("waterway") == "waterfall" else "lake")
        name = t.get("name")
        if not name:
            continue
        ele = t.get("ele")
        try:
            ele = int(round(float(re.sub(r"[^\d.]", "", ele)) * 3.28084)) if ele else None
        except ValueError:
            ele = None
        around.append({"name": name, "kind": kind, "ele_ft": ele, "lat": round(la, 5), "lon": round(lo, 5),
                       "km": round(d, 1), "osm": f"{e['type']}/{e['id']}"})
    seen, uniq, peaks = set(), [], 0
    for a in sorted(around, key=lambda a: a["km"]):
        if a["name"] in seen or (a["kind"] == "peak" and peaks >= 4):
            continue
        seen.add(a["name"]); uniq.append(a); peaks += a["kind"] == "peak"
    if trailhead:
        trailhead.pop("km")
    return trailhead, uniq[:8]


def wiki_page(title, lat, lon):
    """The article to use: the given title if it has a picture, else the nearest article that does."""
    cands = [title] if title else []
    g = net.get_json(WIKI, {"action": "query", "list": "geosearch", "gscoord": f"{lat}|{lon}", "gsradius": 10000,
                            "gslimit": 15, "format": "json"})
    cands += [x["title"] for x in g.get("query", {}).get("geosearch", [])]
    for t in cands:
        j = net.get_json(WIKI, {"action": "query", "titles": t, "prop": "pageimages|extracts|info", "piprop": "original|name",
                                "exintro": 1, "explaintext": 1, "exsentences": 3, "redirects": 1, "inprop": "url", "format": "json"})
        for page in j.get("query", {}).get("pages", {}).values():
            if "missing" in page or not page.get("pageimage"):
                continue
            photo = image_info(page["pageimage"])
            if photo:
                return page, photo
    return None, None


def image_info(name):
    j = net.get_json(WIKI, {"action": "query", "titles": "File:" + name, "prop": "imageinfo",
                            "iiprop": "url|extmetadata|size", "iiurlwidth": 1600, "format": "json"})
    for page in j.get("query", {}).get("pages", {}).values():
        for ii in page.get("imageinfo", []):
            m = ii.get("extmetadata", {})
            lic = re.sub(r"<[^>]+>", "", m.get("LicenseShortName", {}).get("value", "")).strip()
            if not FREE.match(lic) or ii.get("width", 0) < 900 or not re.search(r"\.(jpe?g|png|webp)$", name, re.I):
                return None
            by = html.unescape(re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", ""))).strip() or "Wikimedia Commons"
            return {"src": thumb_url(ii["url"], ii["width"]), "w": ii["width"], "h": ii["height"],
                    "by": re.sub(r"\s+", " ", by)[:80], "lic": lic, "page": ii.get("descriptionurl", "").split("?")[0]}
    return None


def thumb_url(original, width, want=1280):
    """Wikimedia's own thumbnail at one of its standard widths (the page picks smaller ones from the same name),
    rather than the full-size original, which Wikimedia limits when it's linked from other sites."""
    url = original.split("?")[0]
    mm = re.match(r"(https://upload\.wikimedia\.org/wikipedia/commons)/(\w/\w\w)/(.+)$", url)
    if not mm or width <= want:
        return url
    base, path, name = mm.groups()
    return f"{base}/thumb/{path}/{name}/{want}px-{name}"


def seen_by_month(p):
    out = {}
    for m in range(1, 13):
        j = net.get_json(f"{INAT}/observations/species_counts", {
            "lat": p["lat"], "lng": p["lon"], "radius": 3, "month": m, "verifiable": "true", "per_page": 14,
            "hrank": "species"})
        out[str(m)] = [x["taxon"]["id"] for x in j["results"] if x["count"] >= 2][:12]
    return out


def taxa_cards(ids):
    cards = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 30):
        j = net.get_json(f"{INAT}/taxa/" + ",".join(map(str, ids[i:i + 30])), {"per_page": 30})
        for t in j["results"]:
            photo = None
            for p in [t.get("default_photo")] + [tp["photo"] for tp in t.get("taxon_photos") or []]:
                if p and p.get("url"):
                    p = {**p, "url": p.get("url") or p.get("square_url")}
                    photo = net.inat_photo(p)
                    if photo:
                        break
            cards[str(t["id"])] = {"sci": t["name"], "common": t.get("preferred_common_name") or "",
                                   "group": t.get("iconic_taxon_name") or "", "photo": photo}
    return cards


def main():
    places = net.load("places.json")["places"]
    out, every = {}, []
    for p in places:
        print(p["name"])
        trailhead, around = osm_around(p)
        page, photo = wiki_page(p.get("wiki"), p["lat"], p["lon"])
        seen = seen_by_month(p)
        every += [i for v in seen.values() for i in v]
        rec = {"seen": seen}
        if trailhead:
            rec["trailhead"] = trailhead
        if around:
            rec["around"] = around
        if photo:
            rec["photo"] = photo
        if page:
            rec["about"] = {"title": page["title"], "text": page.get("extract", "").strip(), "url": page.get("fullurl", "")}
        out[p["id"]] = rec
    net.save("places-extra.json", {"_note": "Built by tools/build_places.py; don't edit by hand.",
                                   "places": out, "taxa": taxa_cards(every)})


if __name__ == "__main__":
    main()
