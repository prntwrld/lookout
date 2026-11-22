"""Find a public-domain natural-history plate (an old drawing, engraving or lithograph) on Wikimedia Commons for each
species Lookout features, and write data/plates.json: {iNaturalist id: {src, page, title, by, year}}.

    python3 tools/build_plates.py            (about an hour; reruns ask only for what's new)
    python3 tools/build_plates.py 40         (only the first 40 species, for a quick look)

Only files that are public domain, that look like a plate rather than a photograph (by their title, description or
categories), that are dated 1930 or earlier when a date is given, and that name the species are used. Edit
data/plates.json by hand to drop a plate you don't like (set it to null) or to point a species at another file."""
import json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import net
net.PAUSE["commons.wikimedia.org"] = 2.5

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "plates.json"
API = "https://commons.wikimedia.org/w/api.php"
WORKS = re.compile(r"audubon|birds of america|curtis|botanical magazine|k[öo]hler|medizinal|thom[ée]|sowerby|english botany|lindman|bilder ur nordens|"
                   r"gould|naumann|fuertes|haeckel|kunstformen|lear|wilson'?s american|catesby|redout|jacquin|flora danica|sturm|bessler|"
                   r"biodiversity heritage|\bbhl\b|iconographia|walcott|north american wild flowers|brehm|keulemans|thorburn|ridgway", re.I)
ART = re.compile(r"plate|tafel|\bpl\.|lithograph|engraving|etching|illustration|drawing|watercolou?r|painting|chromolitho|woodcut|hand-colou?red|"
                 r"botanical|ornitholog", re.I)
NOT = re.compile(r"\bmap\b|distribution|range map|specimen|herbarium|skull|skeleton|\begg|stamp|coin|\bphoto|DSC|IMG_|\bP\d{6,}|"
                 r"diagram|chart|label|cladogram|sonogram|spectrogram|\(\d{8,}\)|flickr|national forest|national park service|usfws|fish and wildlife service|\bnps\b", re.I)
strip = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", str(s or ""))).strip()

def species():
    """(id, sci, common) for each species featured, the most visible first, without repeats."""
    out, seen = [], set()
    def add(i, sci, common=""):
        if i and sci and i not in seen and " " in sci:
            seen.add(i); out.append((i, sci, common or ""))
    g = json.loads((DATA / "groups.json").read_text())["groups"]
    for k, v in g.items():
        for i, sci in zip(v.get("ids", []), v.get("classics", [])): add(i, sci)
    fo = json.loads((DATA / "foraging.json").read_text())
    for w in fo["wild"]:
        add(w.get("id"), w["sci"]); add(w.get("dangerId"), w.get("danger"))
    for d in fo["deadly"]: add(d.get("id"), d["sci"])
    for name in ["birds.json"]:
        for s in json.loads((DATA / name).read_text())["species"]: add(s["id"], s["sci"], s.get("common"))
    for pack in ["mammals", "amphibians", "reptiles", "fish", "conifers", "ferns", "butterflies", "mushrooms"]:
        f = DATA / "packs" / f"{pack}.json"
        if f.exists():
            for s in json.loads(f.read_text())["species"]: add(s["id"], s["sci"], s.get("common"))
    for s in json.loads((DATA / "flowers.json").read_text())["species"]: add(s["id"], s["sci"], s.get("common"))
    return out

def candidates(query):
    j = net.get_json(API, {"format": "json", "action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": 40,
                           "gsrsearch": query, "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 900,
                           "iiextmetadatafilter": "LicenseShortName|DateTimeOriginal|Artist|ObjectName|Categories|ImageDescription"}, max_age_days=120)
    return list((j.get("query") or {}).get("pages", {}).values())

def pick(pages, names, need_work=False):
    best, top = None, -1e9
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]; m = ii.get("extmetadata", {})
        v = lambda k: strip(m.get(k, {}).get("value"))
        title, desc, cats = p["title"][5:], v("ImageDescription"), v("Categories")
        text = " ".join([title, desc, cats])
        if not re.search(r"public domain|^pd\b|cc0", v("LicenseShortName"), re.I): continue
        if NOT.search(title + " " + desc): continue
        if not any(n.lower() in (title + " " + desc).lower() for n in names if n): continue
        years = [int(y) for y in re.findall(r"\b(1[5-9]\d\d)\b", v("DateTimeOriginal"))]
        year = max(years) if years else None
        if year and year > 1930: continue
        # a plate: from one of the known old works, or called a drawing, engraving or the like in its own words and dated
        if not (WORKS.search(text) or (not need_work and ART.search(title + " " + desc) and year)): continue
        if (ii.get("width") or 0) < 450 or not ii.get("thumburl"): continue
        score = (6 if WORKS.search(text) else 0) + (2 if re.search(r"plate|tafel", text, re.I) else 0) + (1 if year else 0) - (ii.get("width", 0) < 700)
        if score > top:
            name = re.sub(r"[_-]+", " ", (v("ObjectName") or title).rsplit(".", 1)[0]).strip()
            by = v("Artist")[:90]
            top, best = score, {"src": ii["thumburl"], "page": ii.get("descriptionurl", ""), "title": name[:120],
                                "by": "" if re.match(r"unknown|anonymous", by, re.I) else by, "year": year}
    return best

def best_plate(sci, common=""):
    """by its scientific name first; then by its common name, but only in the known old works"""
    p = pick(candidates(f'"{sci}" filetype:bitmap'), [sci])
    if not p and common:
        p = pick(candidates(f'"{common}" (Audubon OR plate OR lithograph OR engraving) filetype:bitmap'), [common], need_work=True)
    return p

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    plates = json.loads(OUT.read_text()).get("plates", {}) if OUT.exists() else {}
    todo = species()[:limit]
    for n, (i, sci, common) in enumerate(todo, 1):
        if str(i) in plates and plates[str(i)]: continue
        try:
            plates[str(i)] = best_plate(sci, common)
        except Exception as e:
            print(f"  ! {sci}: {e}"); continue
        if plates[str(i)]: print(f"{n}/{len(todo)} {sci}: {plates[str(i)]['title'][:70]}")
        if n % 10 == 0: save(plates)
    save(plates)
    print(sum(1 for v in plates.values() if v), "plates for", len(plates), "species")

def save(plates):
    OUT.write_text(json.dumps({"note": "Public-domain plates from Wikimedia Commons, found by tools/build_plates.py. Set a species to null to drop its plate.",
                               "plates": plates}, indent=1, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    main()
