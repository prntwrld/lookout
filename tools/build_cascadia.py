"""Build Cascadia for the front page's map: the bioregion traced from its watersheds, a relief picture, and its rivers.

Cascadia here is every river that reaches the Pacific between the Copper River in Alaska and Cape Mendocino in
California, inland to the Continental Divide: the Columbia, the Fraser, and the coastal rivers from the Copper,
Alsek, Stikine, Skeena and Nass down to the Klamath and the Eel. Nobody publishes that outline in a form this
environment can reach, so it's traced here from elevation:

1. Terrain Tiles (AWS open data, from Mapzen; SRTM, GMTED, NRCan CDEM, USGS 3DEP and others) at zoom 7, about 1 km.
2. A priority flood from the sea inward labels every cell with the stretch of coast its water reaches. The closed
   basins of the Great Basin (Great Salt Lake, the Nevada sinks, and southeast Oregon's Harney, Summer, Abert,
   Fort Rock, Silver, Warner and Alvord basins) are sinks of their own, so they don't spill into the Snake.
3. Cascadia is the land whose water reaches the Pacific from the Copper River delta (145.6 W) to Cape Mendocino
   (40.44 N). The Peace, Liard and Yukon headwaters in northern British Columbia drain to the Arctic and fall out.

Writes:
  data/cascadia.json         the outline (MultiPolygon, lon/lat) and its bounds
  data/cascadia-relief.webp  shaded relief in Web Mercator: grey is the light on the land, alpha is land (sea is
                             clear). app/map.js colours it from the theme's tokens, so it follows light and dark.
  data/rivers.json           Natural Earth's rivers and lakes around Cascadia, simplified
  data/borders.json          Natural Earth's country, state and province lines in the same box, for the map's switch

  pip install numpy scipy shapely pillow rasterio numba   # numba is optional; without it the flood takes ~an hour
  python3 tools/build_cascadia.py

Sources: Terrain Tiles https://registry.opendata.aws/terrain-tiles/ (attribution in the README), Natural Earth
rivers, lakes and boundary lines (public domain). Downloads are cached in tools/.cache/.
"""
import concurrent.futures as cf
import heapq
import json
import math
import pathlib
import urllib.request

import numpy as np
import rasterio.features
from PIL import Image
from scipy import ndimage
from shapely.geometry import LineString, MultiPolygon, Polygon, box, shape
from shapely.ops import unary_union
import shapely

try:
    from numba import njit
except ImportError:                      # pure Python works too, only slowly
    def njit(**_):
        return lambda f: f

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache" / "cascadia"
DATA = ROOT / "data"
TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"
NORTH_END = -145.6           # the Copper River delta; Prince William Sound starts just west
SOUTH_END = 40.44            # Cape Mendocino
CLOSED = [(43.3, -118.8), (42.85, -120.75), (42.6, -120.22), (43.25, -121.0), (43.2, -120.65), (43.1, -121.05),
          (42.35, -119.85), (42.5, -118.5), (42.95, -119.6), (42.2, -119.15), (43.5, -120.4)]   # southeast Oregon


def fetch(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        urllib.request.urlretrieve(url, path)
    return path


def tx(lon, z): return int((lon + 180) / 360 * 2 ** z)
def ty(lat, z): r = math.radians(lat); return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z)


def mosaic(z, w, s, e, n):
    """Elevations in metres over the tiles covering the box, Web Mercator rows; and the mosaic's tile origin."""
    xs, ys = range(tx(w, z), tx(e, z) + 1), range(ty(n, z), ty(s, z) + 1)
    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda a: fetch(TERRAIN.format(z=z, x=a[0], y=a[1]), CACHE / f"t{z}" / f"{a[0]}_{a[1]}.png"),
                    [(x, y) for x in xs for y in ys]))
    dem = np.zeros((len(ys) * 256, len(xs) * 256), np.float32)
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            a = np.asarray(Image.open(CACHE / f"t{z}" / f"{x}_{y}.png").convert("RGB")).astype(np.float32)
            dem[i * 256:(i + 1) * 256, j * 256:(j + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return dem, xs[0], ys[0]


def px2lon(x, z, x0): return (np.asarray(x) + x0 * 256) / (2 ** z * 256) * 360 - 180
def px2lat(y, z, y0): return np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (np.asarray(y) + y0 * 256) / (2 ** z * 256)))))


@njit(cache=True)
def flood(dem, ocean, sinks):
    """Priority flood from the sea and the sinks. label: the sea cell (row*W+col) a land cell drains to, -2 off the
    edge of the mosaic, -4 a closed basin, -3 the sea itself."""
    H, W = dem.shape
    label = np.full((H, W), -1, np.int64)
    fill = dem.copy()
    heap = [(np.float32(0.0), np.int64(0), np.int64(0))]
    heap.pop()
    cnt = 0
    for i in range(H):
        for j in range(W):
            if ocean[i, j]:
                label[i, j] = -3
    for i in range(H):
        for j in range(W):
            if ocean[i, j]:
                for di in (-1, 0, 1):
                    for dj in (-1, 0, 1):
                        a = i + di; b = j + dj
                        if 0 <= a < H and 0 <= b < W and not ocean[a, b] and label[a, b] == -1:
                            label[a, b] = i * W + j
                            heapq.heappush(heap, (fill[a, b], np.int64(cnt), np.int64(a * W + b))); cnt += 1
            elif (i == 0 or j == 0 or i == H - 1 or j == W - 1) and label[i, j] == -1:
                label[i, j] = -2
                heapq.heappush(heap, (fill[i, j], np.int64(cnt), np.int64(i * W + j))); cnt += 1
            elif sinks[i, j] and label[i, j] == -1:
                label[i, j] = -4
                heapq.heappush(heap, (fill[i, j], np.int64(cnt), np.int64(i * W + j))); cnt += 1
    while len(heap):
        e, _, c = heapq.heappop(heap)
        i = c // W; j = c % W
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                a = i + di; b = j + dj
                if 0 <= a < H and 0 <= b < W and label[a, b] == -1:
                    label[a, b] = label[i, j]
                    if fill[a, b] < e:
                        fill[a, b] = e
                    heapq.heappush(heap, (fill[a, b], np.int64(cnt), np.int64(a * W + b))); cnt += 1
    return label, fill


def sea_of(dem):
    lab, _ = ndimage.label(dem <= 0)
    edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    return np.isin(lab, list(edge))


def outline():
    z = 7
    dem, x0, y0 = mosaic(z, -153, 37, -105, 65)
    H, W = dem.shape
    lon, lat = px2lon(np.arange(W) + .5, z, x0), px2lat(np.arange(H) + .5, z, y0)
    ocean = sea_of(dem)
    print("flooding", dem.shape)
    label, fill = flood(dem, ocean, np.zeros_like(ocean))
    # the Great Basin's deep hollows south of 42 N, and southeast Oregon's named closed basins, become sinks
    depth = fill - dem
    dl, k = ndimage.label(depth > 1)
    mx = ndimage.maximum(depth, dl, range(1, k + 1)); area = ndimage.sum(np.ones_like(depth), dl, range(1, k + 1))
    sinks = np.zeros_like(ocean)
    for idx in np.nonzero((mx > 20) & (area > 20))[0]:
        i, j = divmod(int(np.argmax(np.where(dl == idx + 1, depth, -1))), W)
        if lat[i] < 42.0 and lon[j] > -121.0:
            sinks[i, j] = True
    for la, lo in CLOSED:
        i, j, r = int(np.argmin(abs(lat - la))), int(np.argmin(abs(lon - lo))), 12
        win = dem[i - r:i + r, j - r:j + r]; a, b = np.unravel_index(np.argmin(win), win.shape)
        sinks[i - r + a, j - r + b] = True
    print("flooding again with", int(sinks.sum()), "sinks")
    label, _ = flood(dem, ocean, sinks)
    pos = label >= 0
    olat, olon = lat[np.where(pos, label // W, 0)], lon[np.where(pos, label % W, 0)]
    casc = pos & (olat >= SOUTH_END) & (olon >= NORTH_END) & (olon < -117)
    casc = ndimage.binary_opening(ndimage.binary_closing(casc))
    polys = [shape(g) for g, v in rasterio.features.shapes(casc.astype(np.uint8), mask=casc) if v == 1]
    g = shapely.transform(unary_union(polys), lambda c: np.c_[px2lon(c[:, 0], z, x0), px2lat(c[:, 1], z, y0)])
    g = g.buffer(.002).buffer(-.002)
    parts = [p for p in (g.geoms if g.geom_type == "MultiPolygon" else [g]) if p.area > .01]
    m = MultiPolygon(parts).simplify(.02, preserve_topology=True)
    return m


def relief(w, s, e, n):
    """Shaded relief of the box at zoom 6, halved: grey is the light on the ground, alpha is land."""
    z = 6
    dem, x0, y0 = mosaic(z, w, s, e, n)
    ocean = sea_of(dem)
    land = np.where(ocean, 0, np.maximum(dem, 0))
    gy, gx = np.gradient(land)
    H, W = dem.shape
    lat = px2lat(np.arange(H) + .5, z, y0)
    k = (3.0 / (40075016 / (2 ** z * 256) * np.cos(np.radians(lat))))[:, None]   # metres per cell, 3x exaggeration
    nx, ny, nz = -gx * k, gy * k, 1.0
    az, alt = math.radians(315), math.radians(42)
    lx, ly, lz = math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)
    hs = (nx * lx + ny * ly + nz * lz) / np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    hs = np.clip(hs / lz, 0, 1.6) / 1.6                        # flat ground sits at 0.625
    # crop to the box
    lon, lat = px2lon(np.arange(W), z, x0), px2lat(np.arange(H), z, y0)
    c0, c1 = int(np.searchsorted(lon, w)), int(np.searchsorted(lon, e))
    r0, r1 = int(np.searchsorted(-lat, -n)), int(np.searchsorted(-lat, -s))
    hs, ocean = hs[r0:r1, c0:c1], ocean[r0:r1, c0:c1]
    bounds = [float(px2lon(c0, z, x0)), float(px2lat(r1, z, y0)), float(px2lon(c1, z, x0)), float(px2lat(r0, z, y0))]
    grey = Image.fromarray((hs * 255).astype(np.uint8))
    alpha = Image.fromarray(np.where(ocean, 0, 255).astype(np.uint8))
    size = (grey.width // 2, grey.height // 2)
    img = Image.merge("LA", (grey.resize(size, Image.LANCZOS), alpha.resize(size, Image.LANCZOS))).convert("RGBA")
    img.save(DATA / "cascadia-relief.webp", quality=60, method=6)
    return [round(v, 4) for v in bounds]


def rivers(area, inside):
    """Natural Earth's rivers and lakes in the box: the big ones everywhere, the smaller ones only in Cascadia."""
    out = {"rivers": [], "lakes": []}
    seen = set()
    for f in ["ne_10m_rivers_lake_centerlines", "ne_10m_rivers_north_america"]:
        for ft in json.load(open(fetch(NE.format(f), CACHE / f"{f}.geojson")))["features"]:
            g, p = ft["geometry"], ft["properties"]
            if not g:
                continue
            rank = p.get("scalerank") or 9
            for line in ([g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]):
                ls = LineString(line)
                if rank > 9 or not ls.intersects(area) or (rank > 6 and not ls.intersects(inside)):
                    continue
                ls = ls.intersection(area).simplify(.02)
                for part in (ls.geoms if hasattr(ls, "geoms") else [ls]):
                    if part.length < .15:
                        continue
                    c = [[round(x, 2), round(y, 2)] for x, y in part.coords]
                    key = json.dumps(c)
                    if key not in seen:
                        seen.add(key); out["rivers"].append({"r": rank, "c": c})
    for f in ["ne_10m_lakes", "ne_10m_lakes_north_america"]:
        for ft in json.load(open(fetch(NE.format(f), CACHE / f"{f}.geojson")))["features"]:
            if not ft["geometry"]:
                continue
            g = shape(ft["geometry"])
            if not g.intersects(inside) or g.area < .01:
                continue
            g = g.intersection(area).simplify(.015)
            for p in (g.geoms if hasattr(g, "geoms") else [g]):
                if isinstance(p, Polygon) and p.area > .01:
                    out["lakes"].append([[round(x, 2), round(y, 2)] for x, y in p.exterior.coords])
    out["rivers"].sort(key=lambda x: -x["r"])          # big rivers drawn last, on top
    return out


def borders(area):
    """The country lines and the US states' and Canadian provinces' lines in the box."""
    out = {"country": [], "state": []}
    for f, k in [("ne_10m_admin_0_boundary_lines_land", "country"), ("ne_10m_admin_1_states_provinces_lines", "state")]:
        for ft in json.load(open(fetch(NE.format(f), CACHE / f"{f}.geojson")))["features"]:
            g = ft["geometry"]
            if not g or (k == "state" and ft["properties"].get("ADM0_A3") not in ("USA", "CAN")):
                continue
            g = shape(g)
            if not g.intersects(area):
                continue
            g = g.intersection(area).simplify(.02)
            for part in (g.geoms if hasattr(g, "geoms") else [g]):
                if part.geom_type == "LineString" and part.length > .05:
                    out[k].append([[round(x, 2), round(y, 2)] for x, y in part.coords])
    return out


def main():
    m = outline()
    w, s, e, n = m.bounds
    r = lambda c: [[round(x, 3), round(y, 3)] for x, y in c]
    parts = list(m.geoms)
    box_ = [round(w - 6, 1), round(s - 3, 1), round(e + 6, 1), round(n + 2.5, 1)]
    rb = relief(*box_)
    json.dump({"name": "Cascadia",
               "about": "Every river that reaches the Pacific from the Copper River to Cape Mendocino, inland to the Continental Divide",
               "source": "Traced from Terrain Tiles (AWS open data) by tools/build_cascadia.py",
               "bounds": [round(v, 2) for v in m.bounds],
               "relief": {"file": "cascadia-relief.webp", "bounds": rb},
               "geometry": {"type": "MultiPolygon",
                            "coordinates": [[r(p.exterior.coords)] + [r(i.coords) for i in p.interiors if Polygon(i).area > .01] for p in parts]}},
              open(DATA / "cascadia.json", "w"), separators=(",", ":"))
    json.dump(rivers(box(*rb), m.buffer(.3)), open(DATA / "rivers.json", "w"), separators=(",", ":"))
    json.dump(borders(box(*rb)), open(DATA / "borders.json", "w"), separators=(",", ":"))
    for f in ["cascadia.json", "cascadia-relief.webp", "rivers.json", "borders.json"]:
        print(f, (DATA / f).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
