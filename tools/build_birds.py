#!/usr/bin/env python3
"""Build the Pacific Northwest bird pack: data/birds.json and data/thumbs/<id>.jpg.

    python3 tools/build_birds.py            # about 10 minutes the first time; reruns use tools/.cache
    COUNT=200 python3 tools/build_birds.py  # a bigger pack (add their lines to data/bird-traits.json)

From iNaturalist (research-grade, Washington, Oregon and British Columbia):
  - which species: the most-recorded birds in the region
  - names, family and a short Wikipedia summary
  - photos: Creative Commons, credited, iNaturalist's own picks first (the same rules as the wildflowers)
  - months: when it's seen in the region
  - regions: which of data/regions.json's regions it has been recorded in
The key's traits are hand-written in data/bird-traits.json; the page joins them to this file.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import net  # noqa: E402
import build_flowers as B  # noqa: E402  (shares its photo, name and thumbnail helpers)

INAT = "https://api.inaturalist.org/v1"
PNW = "46,10,7085"
COUNT = int(os.environ.get("COUNT", 150))


def months_for(tid):
    j = net.get_json(f"{INAT}/observations/histogram", {"taxon_id": tid, "place_id": PNW, "interval": "month_of_year", "quality_grade": "research"})
    h = {int(k): v for k, v in j["results"]["month_of_year"].items()}
    top = max(h.values()) or 1
    return [m for m in range(1, 13) if h[m] >= top * 0.15 and h[m] > 0]


def main():
    j = net.get_json(f"{INAT}/observations/species_counts", {"place_id": PNW, "iconic_taxa": "Aves", "quality_grade": "research", "per_page": 300})
    chosen = [x["taxon"] for x in j["results"] if x["taxon"]["rank"] == "species"][:COUNT]
    counts = {t["id"]: x["count"] for x in j["results"] for t in [x["taxon"]]}
    seen_in = {}
    for r in B.REGIONS:
        for page in (1, 2):
            rj = net.get_json(f"{INAT}/observations/species_counts", {"iconic_taxa": "Aves", **B.box(r), "quality_grade": "research", "per_page": 500, "page": page})
            for x in rj["results"]:
                if x["count"] >= 2:
                    seen_in.setdefault(x["taxon"]["id"], []).append(r["id"])
            if page * 500 >= rj["total_results"]:
                break
    detail = B.names_of(t["id"] for t in chosen)
    anc = B.names_of(a for d in detail.values() for a in (d.get("ancestor_ids") or [])[:-1])
    traits = net.load("bird-traits.json")["traits"]
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
            print(f"  ? no traits yet for {t['name']} — add a line to data/bird-traits.json")
    net.save("birds.json", {"_note": "Built by tools/build_birds.py from iNaturalist; don't edit by hand (edit bird-traits.json instead).",
                            "photo": "https://inaturalist-open-data.s3.amazonaws.com/photos/{id}/{size}.{ext}", "species": out})


if __name__ == "__main__":
    main()
