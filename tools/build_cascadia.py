"""Build data/cascadia.json: one outline of British Columbia, Washington and Oregon for the front page's map.

Source: Natural Earth's 1:10m states and provinces (public domain).
  curl -o a1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
  pip install shapely
  python3 tools/build_cascadia.py a1.geojson data/cascadia.json
"""
import json, sys
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.ops import unary_union

src, out = sys.argv[1], sys.argv[2]
g = json.load(open(src))
want = {"British Columbia", "Washington", "Oregon"}
polys = [shape(f["geometry"]) for f in g["features"]
         if f["properties"].get("name") in want and f["properties"].get("admin") in ("Canada", "United States of America")]
u = unary_union(polys).buffer(0.002).buffer(-0.002)
parts = [p for p in (u.geoms if u.geom_type == "MultiPolygon" else [u]) if p.area > 0.004]   # drop the smallest islands
m = MultiPolygon(parts).simplify(0.012, preserve_topology=True)
r = lambda c: [[round(x, 3), round(y, 3)] for x, y in c]
poly = lambda p: [r(p.exterior.coords)] + [r(i.coords) for i in p.interiors if Polygon(i).area > 0.01]
parts = list(m.geoms) if m.geom_type == "MultiPolygon" else [m]
json.dump({"name": "British Columbia, Washington and Oregon",
           "source": "Natural Earth admin-1 (public domain), merged and simplified by tools/build_cascadia.py",
           "bounds": [round(v, 2) for v in m.bounds],
           "geometry": {"type": "MultiPolygon", "coordinates": [poly(p) for p in parts]}},
          open(out, "w"), separators=(",", ":"))
