"""Polite HTTP for Lookout's build scripts.

- One request per host at a time, no faster than PAUSE seconds apart (iNaturalist asks for at most ~1 a second).
- Every answer is cached on disk (tools/.cache), so a rerun only asks for what it hasn't seen.
- On 429 or a 5xx it waits and tries again, longer each time.
"""
import hashlib
import json
import os
import pathlib
import time
import urllib.parse

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = pathlib.Path(os.environ.get("LOOKOUT_CACHE", ROOT / "tools" / ".cache"))
UA = "LookoutFieldGuide/1.0 (static PNW field guide; https://github.com/prntwrld/lookout)"
PAUSE = {"api.inaturalist.org": 1.1, "en.wikipedia.org": 0.3, "overpass-api.de": 2.0,
         "api.open-meteo.com": 0.5, "api.opentopodata.org": 1.1, "nominatim.openstreetmap.org": 1.1}
for _h in list(PAUSE):
    _env = os.environ.get("PAUSE_" + _h.split(".")[-2].upper().replace("-", "_"))
    if _env:
        PAUSE[_h] = float(_env)
_last = {}
_session = requests.Session()
_session.headers["User-Agent"] = UA


def _wait(host):
    gap = PAUSE.get(host, 0.5)
    dt = time.time() - _last.get(host, 0)
    if dt < gap:
        time.sleep(gap - dt)
    _last[host] = time.time()


def get_json(url, params=None, data=None, max_age_days=30, tries=6, timeout=60):
    """GET (or POST when data is given) a JSON answer, from the disk cache when it's fresh enough."""
    full = url + ("?" + urllib.parse.urlencode(params, doseq=True) if params else "")
    key = hashlib.sha1((full + "|" + (data or "")).encode()).hexdigest()
    path = CACHE / (key[:2]) / (key + ".json")
    if path.exists() and time.time() - path.stat().st_mtime < max_age_days * 86400:
        return json.loads(path.read_text())
    host = urllib.parse.urlparse(url).hostname
    delay = 5
    for attempt in range(tries):
        _wait(host)
        try:
            if data is not None:
                r = _session.post(url, data={"data": data}, timeout=max(timeout, 90))
            else:
                r = _session.get(full, timeout=timeout)
        except requests.RequestException as e:
            print(f"  ! {host}: {e.__class__.__name__}; retrying in {delay}s")
            time.sleep(delay); delay *= 2
            continue
        if r.status_code == 429 or r.status_code >= 500:
            wait = int(r.headers.get("Retry-After", delay)) if str(r.headers.get("Retry-After", "")).isdigit() else delay
            print(f"  ! {host}: HTTP {r.status_code}; waiting {wait}s")
            time.sleep(wait); delay *= 2
            continue
        r.raise_for_status()
        out = r.json()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out))
        return out
    raise RuntimeError(f"gave up on {full}")


def get_bytes(url, max_age_days=365):
    """Download a file (a photo), cached on disk."""
    key = hashlib.sha1(url.encode()).hexdigest()
    path = CACHE / "bin" / key[:2] / key
    if path.exists():
        return path.read_bytes()
    host = urllib.parse.urlparse(url).hostname
    delay = 5
    for attempt in range(5):
        _wait(host)
        try:
            r = _session.get(url, timeout=60)
        except requests.RequestException:
            time.sleep(delay); delay *= 2
            continue
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(delay); delay *= 2
            continue
        r.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r.content)
        return r.content
    raise RuntimeError(f"gave up on {url}")


def load(name):
    return json.loads((ROOT / "data" / name).read_text())


def save(name, obj):
    """Write compact JSON: one record per line, so a diff stays readable and the file stays small."""
    path = ROOT / "data" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(obj, dict) and any(isinstance(v, list) and len(v) > 20 for v in obj.values()):
        parts = []
        for k, v in obj.items():
            if isinstance(v, list) and len(v) > 20:
                rows = ",\n".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in v)
                parts.append(f"{json.dumps(k)}:[\n{rows}\n]")
            else:
                parts.append(f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, separators=(',', ':'))}")
        path.write_text("{" + ",\n".join(parts) + "}\n")
    else:
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote data/{name} ({path.stat().st_size // 1024} KB)")


# iNaturalist photo licences we may show (the user's rule: CC0 and CC BY only)
OPEN = {"cc0": "CC0", "cc-by": "CC BY"}


def inat_photo(p):
    """A compact photo record {id, ext, by, lic} from an iNaturalist photo, or None if its licence isn't open enough.
    The page rebuilds the URL: https://inaturalist-open-data.s3.amazonaws.com/photos/{id}/{size}.{ext}"""
    lic = (p.get("license_code") or "").lower()
    if lic not in OPEN or not p.get("url"):
        return None
    url = p["url"]
    if "inaturalist-open-data" not in url:
        return None
    ext = url.rsplit(".", 1)[-1].split("?")[0]
    by = p.get("attribution") or ""
    # "(c) Jane Doe, some rights reserved (CC BY)" -> "Jane Doe"
    name = by.replace("(c) ", "").split(", some rights")[0].split(", no rights")[0].strip()
    if name.lower().startswith("no rights reserved"):
        name = ""
    return {"id": p["id"], "ext": ext, "by": name or "an iNaturalist observer", "lic": OPEN[lic]}
