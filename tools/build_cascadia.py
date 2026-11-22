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
   (40.44 N). The Peace River's channel is cut through its dams first, or Williston Lake would spill into the
   Fraser. The Peace, Liard and Yukon headwaters in northern British Columbia drain to the Arctic and fall out.

Writes:
  data/cascadia.json         the outline (MultiPolygon, lon/lat) and its bounds
  data/cascadia-relief.webp  shaded relief in Web Mercator: grey is the light on the land, alpha is land (sea is
                             clear). app/map.js colours it from the theme's tokens, so it follows light and dark.
  data/rivers.json           Natural Earth's rivers and lakes around Cascadia, simplified
  data/borders.json          Natural Earth's country, state and province lines in the same box, for the map's switch
  data/atlas-flow.png, data/atlas-ground.png, data/atlas.json
                             the Atlas's raindrop: which way water runs from every ~5 km block, the ground's height,
                             and the named watersheds

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
# Outlets the 1 km elevation gets wrong, cut by hand (lon, lat): Shuswap Lake runs west down the South Thompson and
# the Thompson's canyon to the Fraser at Lytton, not over the Armstrong divide to the Okanagan; Babine Lake leaves
# from its north end by the Babine River to the Skeena; Takla Lake by the Middle River to Stuart Lake and the Fraser;
# Lake Pend Oreille west by the Pend Oreille River to the Columbia, not north up the Purcell Trench to the Kootenay.
CHANNELS = [  # (the line, the height in metres it's cut to from start to end, or None to cut it like the rivers)
    ([(-118.98, 50.83), (-119.3, 50.95), (-119.55, 50.88), (-119.68, 50.83), (-119.95, 50.75), (-120.33, 50.68),
      (-120.85, 50.75), (-121.28, 50.72), (-121.35, 50.42), (-121.58, 50.23)], (300, 150)),
    ([(-125.75, 54.5), (-126.0, 54.75), (-126.2, 54.9), (-126.45, 55.15), (-126.62, 55.32), (-126.75, 55.45)], None),
    ([(-116.4, 48.15), (-116.55, 48.28), (-116.9, 48.18), (-117.05, 48.18), (-117.3, 48.55), (-117.42, 48.85), (-117.63, 49.0)], (600, 400)),
    ([(-125.85, 55.6), (-125.62, 55.2), (-125.45, 55.0), (-125.1, 54.85), (-124.85, 54.7), (-124.6, 54.58), (-124.25, 54.44)], (300, 300))]
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
    edge of the mosaic, -4 a closed basin, -3 the sea itself. down: the neighbour (0-7, clockwise from north) each
    land cell drains into, 8 into the sea, 9 a sink, 10 off the edge. order: the cells, downstream first."""
    H, W = dem.shape
    label = np.full((H, W), -1, np.int64)
    down = np.full((H, W), 255, np.uint8)
    order = np.empty(H * W, np.int64)
    fill = dem.copy()
    DI = (-1, -1, 0, 1, 1, 1, 0, -1)
    DJ = (0, 1, 1, 1, 0, -1, -1, -1)
    heap = [(np.float32(0.0), np.int64(0), np.int64(0))]
    heap.pop()
    cnt = 0; n = 0
    for i in range(H):
        for j in range(W):
            if ocean[i, j]:
                label[i, j] = -3
    for i in range(H):
        for j in range(W):
            if ocean[i, j]:
                for d in range(8):
                    a = i + DI[d]; b = j + DJ[d]
                    if 0 <= a < H and 0 <= b < W and not ocean[a, b] and label[a, b] == -1:
                        label[a, b] = i * W + j; down[a, b] = 8
                        heapq.heappush(heap, (fill[a, b], np.int64(cnt), np.int64(a * W + b))); cnt += 1
            elif (i == 0 or j == 0 or i == H - 1 or j == W - 1) and label[i, j] == -1:
                label[i, j] = -2; down[i, j] = 10
                heapq.heappush(heap, (fill[i, j], np.int64(cnt), np.int64(i * W + j))); cnt += 1
            elif sinks[i, j] and label[i, j] == -1:
                label[i, j] = -4; down[i, j] = 9
                heapq.heappush(heap, (fill[i, j], np.int64(cnt), np.int64(i * W + j))); cnt += 1
    while len(heap):
        e, _, c = heapq.heappop(heap)
        i = c // W; j = c % W
        order[n] = c; n += 1
        for d in range(8):
            a = i + DI[d]; b = j + DJ[d]
            if 0 <= a < H and 0 <= b < W and label[a, b] == -1:
                label[a, b] = label[i, j]
                down[a, b] = (d + 4) % 8
                if fill[a, b] < e:
                    fill[a, b] = e
                heapq.heappush(heap, (fill[a, b], np.int64(cnt), np.int64(a * W + b))); cnt += 1
    return label, fill, down, order[:n]


@njit(cache=True)
def accumulate(down, order):
    """How many cells drain through each cell."""
    H, W = down.shape
    acc = np.ones((H, W), np.float32)
    DI = (-1, -1, 0, 1, 1, 1, 0, -1)
    DJ = (0, 1, 1, 1, 0, -1, -1, -1)
    for k in range(len(order) - 1, -1, -1):
        c = order[k]; i = c // W; j = c % W; d = down[i, j]
        if d < 8:
            acc[i + DI[d], j + DJ[d]] += acc[i, j]
    return acc


@njit(cache=True)
def coarsen(down, acc, f):
    """Directions on a grid f times coarser: from each block's busiest cell, follow the water until it leaves the
    block, and point at the block it enters (or 8/9/10 if it reaches the sea, a sink or the edge first)."""
    H, W = down.shape
    h = H // f; w = W // f
    out = np.full((h, w), 255, np.uint8)
    DI = (-1, -1, 0, 1, 1, 1, 0, -1)
    DJ = (0, 1, 1, 1, 0, -1, -1, -1)
    for bi in range(h):
        for bj in range(w):
            best = -1.0; ci = -1; cj = -1
            for a in range(bi * f, bi * f + f):
                for b in range(bj * f, bj * f + f):
                    if down[a, b] != 255 and acc[a, b] > best:
                        best = acc[a, b]; ci = a; cj = b
            if ci < 0:
                continue
            i = ci; j = cj
            while True:
                d = down[i, j]
                if d >= 8:
                    out[bi, bj] = d; break
                i += DI[d]; j += DJ[d]
                if i // f != bi or j // f != bj:
                    di = i // f - bi; dj = j // f - bj
                    for k in range(8):
                        if DI[k] == di and DJ[k] == dj:
                            out[bi, bj] = k
                    break
    return out


def burn(dem, z, x0, y0):
    """Help the water find the real rivers. At 1 km, narrow canyons (the Babine's, the Peace's) vanish and low divides
    win, so the Babine would reach the sea down the Fraser instead of the Skeena. So Natural Earth's rivers, lake
    centrelines and lakes are cut 250 m into the ground (stream burning), and the Peace's channel is cut through the W.A.C.
    Bennett and Peace Canyon dams, which wall off its canyon and would send Williston Lake into the Fraser."""
    H, W = dem.shape
    to_px = lambda c: np.c_[(c[:, 0] + 180) / 360 * 2 ** z * 256 - x0 * 256,
                            (1 - np.log(np.tan(np.radians(c[:, 1])) + 1 / np.cos(np.radians(c[:, 1]))) / math.pi) / 2 * 2 ** z * 256 - y0 * 256]
    lines = []
    for f in ["ne_10m_rivers_lake_centerlines", "ne_10m_rivers_north_america"]:
        for ft in json.load(open(fetch(NE.format(f), CACHE / f"{f}.geojson")))["features"]:
            if ft["geometry"]:
                g = shapely.transform(shape(ft["geometry"]), to_px)
                if g.intersects(box(0, 0, W, H)):
                    lines.append(g)
    for f in ["ne_10m_lakes", "ne_10m_lakes_north_america"]:
        for ft in json.load(open(fetch(NE.format(f), CACHE / f"{f}.geojson")))["features"]:
            if ft["geometry"]:
                g = shapely.transform(shape(ft["geometry"]), to_px)
                if g.intersects(box(0, 0, W, H)):
                    lines.append(g)
    lines += [shapely.transform(LineString(c), to_px).buffer(1) for c, h in CHANNELS if not h]
    mask = rasterio.features.rasterize([(g, 1) for g in lines], out_shape=(H, W), dtype=np.uint8)
    dem -= mask * 250
    for c, h in CHANNELS:
        if not h:
            continue
        line = shapely.transform(LineString(c), to_px)
        for t in np.linspace(0, 1, int(line.length * 2) + 2):
            x, y = line.interpolate(t, normalized=True).coords[0]
            i, j = int(y), int(x)
            dem[i - 1:i + 2, j - 1:j + 2] = np.minimum(dem[i - 1:i + 2, j - 1:j + 2], h[0] + (h[1] - h[0]) * t)
    for ft in json.load(open(fetch(NE.format("ne_10m_rivers_lake_centerlines"), CACHE / "ne_10m_rivers_lake_centerlines.geojson")))["features"]:
        if ft["properties"].get("name") != "Peace" or not ft["geometry"]:
            continue
        line = shape(ft["geometry"]).intersection(box(-122.6, 55, -120.5, 57))
        for part in (line.geoms if hasattr(line, "geoms") else [line]):
            if part.is_empty:
                continue
            for t in np.linspace(0, part.length, int(part.length / .003) + 2):
                lo, la = part.interpolate(t).coords[0]
                j = int((lo + 180) / 360 * 2 ** z * 256) - x0 * 256
                i = int(ty_px(la, z)) - y0 * 256
                dem[i - 1:i + 2, j - 1:j + 2] = np.minimum(dem[i - 1:i + 2, j - 1:j + 2], 600)


def ty_px(lat, z): r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z * 256


def sea_of(dem):
    lab, _ = ndimage.label(dem <= 0)
    edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    return np.isin(lab, list(edge))


def outline():
    z = 7
    dem, x0, y0 = mosaic(z, -153, 37, -105, 65)
    ground = dem.copy()
    ocean = sea_of(dem)                     # before the rivers are cut, so no channel is taken for the sea
    burn(dem, z, x0, y0)
    dem[~ocean] = np.maximum(dem[~ocean], 1)
    H, W = dem.shape
    lon, lat = px2lon(np.arange(W) + .5, z, x0), px2lat(np.arange(H) + .5, z, y0)
    print("flooding", dem.shape)
    label, fill, _, _ = flood(dem, ocean, np.zeros_like(ocean))
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
    label, _, down, order = flood(dem, ocean, sinks)
    np.savez_compressed(CACHE / "flow7.npz", label=label, down=down, order=order, dem=ground, x0=x0, y0=y0)
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


def split_snake(name, c):
    """Natural Earth names the Snake's main stem "Columbia" above the confluence at Pasco: give it back its name, and
    tidy its spellings ("Pend Orielle", "Middle Fk.  Flathead")."""
    if name:   # and tidy Natural Earth's spellings
        name = " ".join(name.replace("Fk.", "Fork").replace("Orielle", "Oreille").split())
    if name != "Columbia":
        return [(name, c)]
    snake = lambda x, y: y < 46.7 and (x > -118.0 or (x > -119.03 and y >= 46.17))
    runs, cur, was = [], [], None
    for pt in c:
        k = snake(*pt)
        if was is not None and k != was:
            runs.append(("Snake" if was else "Columbia", cur + [pt])); cur = []
        cur.append(pt); was = k
    runs.append(("Snake" if was else "Columbia", cur))
    return runs


def rivers(area, inside):
    """Natural Earth's rivers and lakes in the box: the big ones everywhere, the smaller ones only in Cascadia. Ranks 10
    and 11 (the Yakima, the Deschutes, the Okanogan...) are kept for the Atlas to name a raindrop's rivers; the maps
    draw rank 9 and bigger."""
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
                if rank > 11 or not ls.intersects(area) or (rank > 6 and not ls.intersects(inside)) or (rank > 9 and not p.get("name")):
                    continue
                ls = ls.intersection(area).simplify(.02)
                for part in (ls.geoms if hasattr(ls, "geoms") else [ls]):
                    if part.length < .15:
                        continue
                    c = [[round(x, 2), round(y, 2)] for x, y in part.coords]
                    for name, run in split_snake(p.get("name"), c):
                        key = json.dumps(run)
                        if key not in seen and len(run) > 1:
                            seen.add(key); out["rivers"].append({"r": rank, "c": run, **({"n": name} if name else {})})
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


# names for river mouths Natural Earth doesn't name near the coast (lon, lat of the mouth)
MOUTHS = {"Copper": (-144.97, 60.41), "Alsek": (-138.5, 59.1), "Taku": (-134.1, 58.3), "Nass": (-130.05, 55.0),
          "Skeena": (-130.16, 54.08), "Stikine": (-132.32, 56.64), "Fraser": (-122.99, 49.08), "Columbia": (-123.55, 46.22)}


def atlas(inside, box_):
    """The Atlas's raindrop grid: which way water runs from every 4 x 4 block of the zoom-7 cells (about 5 km), and
    the ground's height there. Writes data/atlas-flow.png (0-7 the neighbour downhill, clockwise from north; 8 the
    sea; 9 a closed basin; 10 off the edge of the data; 255 sea), data/atlas-ground.png (height in 25 m steps, plus
    one; 0 is sea) and data/atlas.json (where the grid sits, the named watersheds and their mouths)."""
    f = 4
    d = np.load(CACHE / "flow7.npz")
    down, order, ground, x0, y0 = d["down"], d["order"], d["dem"], int(d["x0"]), int(d["y0"])
    acc = accumulate(down, order)
    g = coarsen(down, acc, f)
    h, w = g.shape
    el = ground[:h * f, :w * f].reshape(h, f, w, f).mean((1, 3))
    z = 7 - 2                                     # the coarse grid is zoom 5's pixels
    X0, Y0 = x0 * 256 // f, y0 * 256 // f         # its top-left, in zoom-5 world pixels
    lon = px2lon(np.arange(w) + .5, z, X0 / 256); lat = px2lat(np.arange(h) + .5, z, Y0 / 256)
    w_, s_, e_, n_ = box_
    c0, c1 = int(np.searchsorted(lon, w_)), int(np.searchsorted(lon, e_))
    r0, r1 = int(np.searchsorted(-lat, -n_)), int(np.searchsorted(-lat, -s_))
    g, el, lon, lat = g[r0:r1, c0:c1], el[r0:r1, c0:c1], lon[c0:c1], lat[r0:r1]
    h, w = g.shape
    # a step that leaves the crop is off the edge
    DI = np.array([-1, -1, 0, 1, 1, 1, 0, -1]); DJ = np.array([0, 1, 1, 1, 0, -1, -1, -1])
    I, J = np.mgrid[0:h, 0:w]
    dir_ = np.where(g < 8, g, 0)
    ni, nj = I + DI[dir_], J + DJ[dir_]
    off = (g < 8) & ((ni < 0) | (nj < 0) | (ni >= h) | (nj >= w))
    g[off] = 10
    Image.fromarray(g).save(DATA / "atlas-flow.png", optimize=True)
    Image.fromarray(np.where(g == 255, 0, np.clip(el / 25, 0, 253) + 1).astype(np.uint8)).save(DATA / "atlas-ground.png", optimize=True)
    # where each block's water ends: pointer jumping
    idx = np.arange(h * w).reshape(h, w)
    nxt = np.where(g < 8, np.clip(ni, 0, h - 1) * w + np.clip(nj, 0, w - 1), idx).ravel()
    for _ in range(14):
        nxt = nxt[nxt]
    end = nxt.reshape(h, w)
    land = g != 255
    ends, counts = np.unique(end[land & (g.ravel()[end] == 8)], return_counts=True)
    cell = (40075 * np.cos(np.radians(lat)) / (2 ** z * 256)) ** 2
    named = []
    riv = []
    for fn in ["ne_10m_rivers_lake_centerlines", "ne_10m_rivers_north_america"]:
        for ft in json.load(open(fetch(NE.format(fn), CACHE / f"{fn}.geojson")))["features"]:
            if ft["geometry"] and ft["properties"].get("name"):
                riv.append((ft["properties"]["name"], shape(ft["geometry"])))
    from shapely.geometry import Point
    for k in ends[np.argsort(-counts)][:40]:
        i, j = divmod(int(k), w)
        mlon, mlat = float(lon[j]), float(lat[i])
        if not inside.buffer(.3).contains(Point(mlon, mlat)):
            continue
        m = end == k
        area = float((cell[:, None] * m).sum())
        if area < 6000:
            continue
        name = next((n for n, (a, b) in MOUTHS.items() if abs(a - mlon) < .3 and abs(b - mlat) < .3), None)
        if not name:
            near = sorted((geo.distance(Point(mlon, mlat)), n) for n, geo in riv if geo.distance(Point(mlon, mlat)) < .2)
            name = near[0][1] if near else None
        if not name:
            continue
        polys = [shape(q) for q, v in rasterio.features.shapes(m.astype(np.uint8), mask=m) if v == 1]
        geo = shapely.transform(unary_union(polys), lambda c: np.c_[px2lon(c[:, 0] + c0, z, X0 / 256), px2lat(c[:, 1] + r0, z, Y0 / 256)])
        geo = geo.simplify(.04)
        parts = geo.geoms if geo.geom_type == "MultiPolygon" else [geo]
        named.append({"name": name, "km2": round(area, -2), "mouth": [i, j],
                      "rings": [[[round(x, 2), round(y, 2)] for x, y in p.exterior.coords] for p in parts if p.area > .05]})
        print(" ", name, round(area), "km2")
    json.dump({"grid": {"z": z, "x": X0 + c0, "y": Y0 + r0, "w": w, "h": h},
               "watersheds": named},
              open(DATA / "atlas.json", "w"), separators=(",", ":"))


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
    atlas(m, [round(w - 2.5, 1), round(s - 2, 1), round(e + 3, 1), round(n + 1.2, 1)])
    for f in ["cascadia.json", "cascadia-relief.webp", "rivers.json", "borders.json", "atlas.json", "atlas-flow.png", "atlas-ground.png"]:
        print(f, (DATA / f).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
