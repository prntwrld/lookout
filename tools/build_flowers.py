#!/usr/bin/env python3
"""Build the Cascades wildflower pack: data/flowers.json and data/thumbs/<id>.jpg.

    python3 tools/build_flowers.py            # about 30 minutes the first time; reruns use tools/.cache
    COUNT=150 python3 tools/build_flowers.py  # a smaller pack

From iNaturalist (research-grade, native, flowering plants, in the regions of data/regions.json):
  - which species: the most-recorded wildflowers across the Cascade regions (tools/flora_rules.py says what counts)
  - names, family, a short Wikipedia summary (iNaturalist carries it; CC BY-SA, credited on the page)
  - photos: Creative Commons (non-commercial allowed, never "no derivatives"), iNaturalist's own picks first, each credited
  - bloom months: when sightings are annotated "flowering" (or, when few are, when it's seen at all)
  - regions: which regions it has been recorded in
  - elevation: the middle 80% of its sightings' heights, from Open Topo Data (SRTM 30 m)
Traits for the key (colour, petals, leaves, habitat) are hand-written in data/flower-traits.json, and Pojar page
numbers in data/pojar.json; the page joins them to this file, so editing those needs no rebuild.
"""
import io
import json
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(__file__))
import net  # noqa: E402
import flora_rules  # noqa: E402

INAT = "https://api.inaturalist.org/v1"
COUNT = int(os.environ.get("COUNT", 300))
ANGIOSPERMS = 47125
REGIONS = net.load("regions.json")["regions"]
CASCADES = [r for r in REGIONS if r["id"] != "olympics"]
# one box around everything, for photos and seasons
S = min(r["bbox"][0] for r in REGIONS); W = min(r["bbox"][1] for r in REGIONS)
N = max(r["bbox"][2] for r in REGIONS); E = max(r["bbox"][3] for r in REGIONS)
BOX = {"swlat": S, "swlng": W, "nelat": N, "nelng": E}
THUMBS = net.ROOT / "data" / "thumbs"


def box(r):
    s, w, n, e = r["bbox"]
    return {"swlat": s, "swlng": w, "nelat": n, "nelng": e}


def region_counts():
    """{taxon id: {region id: count}} and {taxon id: taxon}"""
    counts, taxa = {}, {}
    for r in REGIONS:
        for page in (1, 2, 3):
            j = net.get_json(f"{INAT}/observations/species_counts", {
                "taxon_id": ANGIOSPERMS, **box(r), "native": "true", "quality_grade": "research",
                "per_page": 500, "page": page})
            for x in j["results"]:
                t = x["taxon"]
                counts.setdefault(t["id"], {})[r["id"]] = x["count"]
                taxa[t["id"]] = t
            if page * 500 >= j["total_results"]:
                break
    return counts, taxa


def names_of(ids):
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 30):
        j = net.get_json(f"{INAT}/taxa/" + ",".join(map(str, ids[i:i + 30])), {"per_page": 30})
        for t in j["results"]:
            out[t["id"]] = t
    return out


def photos_for(tid, detail):
    """Open-licensed photos: iNaturalist's own picks for the species first (chosen to show it well), then the region's
    best-voted sightings. Returns (curated, others)."""
    seen, curated, others = set(), [], []

    def add(p, to):
        rec = net.inat_photo(p)
        if rec and rec["id"] not in seen:
            seen.add(rec["id"]); to.append(rec)

    for tp in detail.get("taxon_photos") or []:
        add(tp["photo"], curated)
    if len(curated) < 4:
        for where in (BOX, {}):
            j = net.get_json(f"{INAT}/observations", {
                "taxon_id": tid, "photo_license": net.LICENSES, "quality_grade": "research", **where, "order_by": "votes", "per_page": 30})
            for o in j["results"]:
                for p in (o.get("photos") or [])[:1]:
                    add(p, others)
            if len(curated) + len(others) >= 6:
                break
    return curated[:5], others


def bloom_for(tid):
    """Months it flowers: from sightings annotated as flowering, or if there are few of those, all sightings."""
    def hist(extra):
        j = net.get_json(f"{INAT}/observations/histogram", {
            "taxon_id": tid, "interval": "month_of_year", "quality_grade": "research", **BOX, **extra})
        return {int(k): v for k, v in j["results"]["month_of_year"].items()}
    h = hist({"term_id": 12, "term_value_id": 13})
    cut = 0.12
    if sum(h.values()) < 15:
        h = hist({}); cut = 0.25
    top = max(h.values()) or 1
    months = [m for m in range(1, 13) if h[m] >= top * cut and h[m] > 0]
    return months, h


def elevation_for(tid):
    """[low, high] in feet: the 10th and 90th percentile of up to 100 research-grade sightings' heights."""
    j = net.get_json("https://api.inaturalist.org/v2/observations", {
        "taxon_id": tid, "quality_grade": "research", **BOX, "per_page": 100, "fields": "location",
        "geoprivacy": "open", "acc_below": 1000})
    pts = []
    for o in j["results"]:
        if o.get("location"):
            la, lo = o["location"].split(",")
            pts.append((round(float(la), 4), round(float(lo), 4)))
    if len(pts) < 5:
        return None
    hs = []
    for i in range(0, len(pts), 100):
        chunk = pts[i:i + 100]
        # Open Topo Data's 30 m SRTM heights (free: 1 call a second, 1,000 a day, 100 points a call)
        e = net.get_json("https://api.opentopodata.org/v1/srtm30m", {
            "locations": "|".join(f"{p[0]},{p[1]}" for p in chunk)}, max_age_days=3650)
        hs += [x["elevation"] for x in e.get("results", []) if x.get("elevation") is not None]
    if len(hs) < 5:
        return None
    qs = statistics.quantiles(hs, n=10)
    ft = lambda m: int(round(m * 3.28084 / 100) * 100)
    return [max(0, ft(qs[0])), ft(qs[-1])]


def summary(text):
    """iNaturalist's copy of the Wikipedia lead, as plain text, cut at a sentence near 420 characters."""
    if not text:
        return ""
    t = re.sub(r"<[^>]+>", "", text)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s*\([^()]*\)", "", t) if len(t) > 420 else t
    if len(t) <= 420:
        return t
    cut = t[:420]
    end = max(cut.rfind(". "), cut.rfind("; "))
    return (cut[:end + 1] if end > 120 else cut.rsplit(" ", 1)[0] + "…").strip()


def photo_url(photo, size="small"):
    """iNaturalist photos are {id, ext}; Wikimedia ones carry their own src (a 1280px thumbnail, renamed for other widths)."""
    if photo.get("src"):
        return re.sub(r"/1280px-", "/330px-", photo["src"]) if size == "small" else photo["src"]
    return f"https://inaturalist-open-data.s3.amazonaws.com/photos/{photo['id']}/{size}.{photo['ext']}"


def wiki_lead(title):
    """Wikipedia's lead picture for the article, if it's public domain, CC0 or CC BY (the rule for species photos)."""
    if not title:
        return None
    W = "https://en.wikipedia.org/w/api.php"
    try:
        j = net.get_json(W, {"action": "query", "titles": title, "prop": "pageimages", "piprop": "name", "redirects": 1, "format": "json"})
        name = next(iter(j.get("query", {}).get("pages", {}).values()), {}).get("pageimage")
        if not name or not re.search(r"\.(jpe?g|png|webp)$", name, re.I):
            return None
        f = net.get_json(W, {"action": "query", "titles": "File:" + name, "prop": "imageinfo", "iiprop": "url|extmetadata|size", "format": "json"})
        ii = next(iter(f["query"]["pages"].values())).get("imageinfo", [{}])[0]
    except Exception as e:
        print(f"  ! wikipedia {title}: {e}")
        return None
    m = ii.get("extmetadata", {})
    lic = re.sub(r"<[^>]+>", "", m.get("LicenseShortName", {}).get("value", "")).strip()
    if ii.get("width", 0) < 600 or not re.match(r"^(public domain|pd|cc0|cc by(-sa)? \d|cc-by(-sa)?-\d)", lic, re.I):
        return None
    by = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", ""))).strip()[:80] or "Wikimedia Commons"
    url = ii["url"].split("?")[0]
    mm = re.match(r"(https://upload\.wikimedia\.org/wikipedia/commons)/(\w/\w\w)/(.+)$", url)
    src = f"{mm.group(1)}/thumb/{mm.group(2)}/{mm.group(3)}/1280px-{mm.group(3)}" if mm and ii["width"] > 1280 else url
    return {"src": src, "by": by, "lic": lic, "page": ii.get("descriptionurl", "").split("?")[0]}


def looks(photo):
    """How good a photo looks as a portrait, from a small copy: grey (night cameras), dark or flat pictures score low."""
    from PIL import Image, ImageStat
    try:
        im = Image.open(io.BytesIO(net.get_bytes(photo_url(photo)))).convert("RGB").resize((48, 48))
    except Exception:
        return -1
    hsv = im.convert("HSV"); sat = ImageStat.Stat(hsv).mean[1] / 255
    g = ImageStat.Stat(im.convert("L")); lum, sd = g.mean[0] / 255, g.stddev[0] / 255
    return min(sat, .45) / .45 * .5 + min(sd, .22) / .22 * .3 + (.2 if .18 < lum < .85 else 0) - (.6 if sat < .07 else 0)


def best_photos(found, wiki_title):
    """iNaturalist's own picks first (unless grey or dark), then Wikipedia's lead picture if its licence allows,
    then the sightings, better-looking ones forward."""
    curated, others = found
    keep = [p for p in curated if looks(p) > .1]
    scored = sorted(((looks(p), i, p) for i, p in enumerate(others)), key=lambda x: (-(x[0] > .35), x[1]))
    rest = [p for s, i, p in scored if s >= 0]
    lead = wiki_lead(wiki_title) if len(keep) < 2 else None
    return (keep + ([lead] if lead else []) + rest)[:6]


def thumb(tid, photo, force=False):
    """A small square picture for the key and the walls, kept in the repository so it works offline."""
    from PIL import Image
    path = THUMBS / f"{tid}.jpg"
    if path.exists() and not force:
        return True
    try:
        im = Image.open(io.BytesIO(net.get_bytes(photo_url(photo)))).convert("RGB")
    except Exception as e:  # a missing photo shouldn't stop the build
        print(f"  ! thumb {tid}: {e}")
        return False
    w, h = im.size; s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((200, 200), Image.LANCZOS)
    THUMBS.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=74, optimize=True, progressive=True)
    return True


def thumb_from(tid, photos):
    """The first photo that downloads becomes the thumbnail."""
    for p in photos:
        if thumb(tid, p, force=True):
            return


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    counts, taxa = region_counts()
    anc = names_of(a for t in taxa.values() for a in (t.get("ancestor_ids") or [])[:-1])
    family = lambda t: next((anc[a]["name"] for a in t.get("ancestor_ids") or [] if a in anc and anc[a]["rank"] == "family"), "")
    ranked = sorted(taxa, key=lambda i: -sum(c for r, c in counts[i].items() if r != "olympics"))
    chosen = [i for i in ranked if taxa[i]["rank"] == "species" and flora_rules.is_wildflower(taxa[i]["name"], family(taxa[i]))][:COUNT]
    detail = names_of(chosen)
    traits = net.load("flower-traits.json")["traits"]
    out = []
    for n, tid in enumerate(chosen, 1):
        t, d = taxa[tid], detail.get(tid, taxa[tid])
        print(f"[{n}/{len(chosen)}] {t['name']}")
        wiki = (d.get("wikipedia_url") or "").rsplit("/wiki/", 1)[-1].replace("_", " ") if d.get("wikipedia_url") else ""
        photos = best_photos(photos_for(tid, d), wiki)
        months, _ = bloom_for(tid)
        try:
            elev = elevation_for(tid)
        except Exception as e:
            print(f"  ! elevation: {e}"); elev = None
        if photos:
            thumb_from(tid, photos)
        out.append({
            "id": tid, "slug": slug(t["name"]), "sci": t["name"],
            "common": (d.get("preferred_common_name") or t.get("preferred_common_name") or "").strip(),
            "family": family(t), "obs": sum(counts[tid].values()),
            "regions": [r["id"] for r in REGIONS if counts[tid].get(r["id"], 0) >= 2],
            "bloom": months, "elev": elev, "photos": photos,
            "wiki": wiki, "summary": summary(d.get("wikipedia_summary")),
        })
        if t["name"] not in traits:
            print(f"  ? no traits yet for {t['name']} — add a line to data/flower-traits.json")
    net.save("flowers.json", {"_note": "Built by tools/build_flowers.py from iNaturalist; don't edit by hand (edit flower-traits.json and pojar.json instead).",
                              "photo": "https://inaturalist-open-data.s3.amazonaws.com/photos/{id}/{size}.{ext}",
                              "species": out})
    # keep a hand-editable list of Pojar page numbers, adding new species without touching what's filled in
    pj_path = net.ROOT / "data" / "pojar.json"
    pj = json.loads(pj_path.read_text()) if pj_path.exists() else {}
    pages = pj.get("pages", {})
    for s in out:
        pages.setdefault(s["sci"], "")
    pj_path.write_text('{"_note": "Page numbers in Pojar & MacKinnon, Plants of the Pacific Northwest Coast (or your edition). Fill in the number; leave blank to hide.",\n"pages": {\n'
                       + ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in pages.items()) + "\n}}\n")
    # drop pictures for species no longer in any pack (the bird pack shares data/thumbs/)
    keep = {f"{s['id']}.jpg" for s in out}
    birds = net.ROOT / "data" / "birds.json"
    if birds.exists():
        keep |= {f"{s['id']}.jpg" for s in json.loads(birds.read_text())["species"]}
    for f in THUMBS.glob("*.jpg"):
        if f.name not in keep:
            f.unlink()


if __name__ == "__main__":
    main()
