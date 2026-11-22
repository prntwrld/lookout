#!/usr/bin/env python3
"""Build the trait keys listed in data/packs.json: data/packs/<id>.json and data/thumbs/<id>.jpg.

    python3 tools/build_pack.py                 # every pack (an hour or two the first time; reruns use tools/.cache)
    python3 tools/build_pack.py mammals ferns   # just these

For each pack, from iNaturalist (research-grade, Washington, Oregon and British Columbia):
  - which species: the group's most-recorded species, less any listed under "skip"
  - names, family and a short Wikipedia summary
  - photos: Creative Commons, credited; iNaturalist's own picks first (the same rules as the wildflowers and birds)
  - months: when it's seen in the region; regions: which of data/regions.json's regions it has been recorded in
The questions and each species' answers are hand-written in data/traits/<id>.json; the page joins them to this file.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import net  # noqa: E402
import build_flowers as B  # noqa: E402
from build_birds import months_for  # noqa: E402

INAT = "https://api.inaturalist.org/v1"
PNW = "46,10,7085"


def build(p):
    print(f"== {p['name']}")
    skip = set(p.get("skip", []))
    j = net.get_json(f"{INAT}/observations/species_counts", {"place_id": PNW, "taxon_id": p["taxa"], "quality_grade": "research",
                                                              "per_page": min(500, p["count"] + len(skip) + 40)})
    chosen = [x["taxon"] for x in j["results"] if x["taxon"]["rank"] == "species" and x["taxon"]["name"] not in skip][:p["count"]]
    counts = {x["taxon"]["id"]: x["count"] for x in j["results"]}
    seen_in = {}
    for r in B.REGIONS:
        rj = net.get_json(f"{INAT}/observations/species_counts", {"taxon_id": p["taxa"], **B.box(r), "quality_grade": "research", "per_page": 500})
        for x in rj["results"]:
            if x["count"] >= 2:
                seen_in.setdefault(x["taxon"]["id"], []).append(r["id"])
    detail = B.names_of(t["id"] for t in chosen)
    anc = B.names_of(a for d in detail.values() for a in (d.get("ancestor_ids") or [])[:-1])
    traits = json.loads((net.ROOT / "data" / "traits" / f"{p['id']}.json").read_text())["traits"]
    out = []
    for n, t in enumerate(chosen, 1):
        d = detail.get(t["id"], t)
        print(f"[{n}/{len(chosen)}] {t['name']}")
        wiki = (d.get("wikipedia_url") or "").rsplit("/wiki/", 1)[-1].replace("_", " ") if d.get("wikipedia_url") else ""
        photos = B.best_photos(B.photos_for(t["id"], d), wiki)
        if photos:
            B.thumb_from(t["id"], photos)
        fam = next((anc[a]["name"] for a in d.get("ancestor_ids") or [] if a in anc and anc[a]["rank"] == "family"), "")
        out.append({"id": t["id"], "slug": B.slug(t["name"]), "sci": t["name"], "common": (d.get("preferred_common_name") or "").strip(),
                    "family": fam, "obs": counts.get(t["id"], 0), "regions": [r["id"] for r in B.REGIONS if r["id"] in seen_in.get(t["id"], [])],
                    "months": months_for(t["id"]), "photos": photos, "wiki": wiki, "summary": B.summary(d.get("wikipedia_summary"))})
        if t["name"] not in traits:
            print(f"  ? no traits yet for {t['name']} — add a line to data/traits/{p['id']}.json")
    net.save(f"packs/{p['id']}.json", {"_note": "Built by tools/build_pack.py from iNaturalist; don't edit by hand (edit data/traits instead).",
                                         "species": out})


def main():
    cfg = net.load("packs.json")["packs"]
    want = set(sys.argv[1:])
    for p in cfg:
        if not want or p["id"] in want:
            build(p)
    import build_index
    build_index.main()


if __name__ == "__main__":
    main()
