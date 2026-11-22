/* Lookout — the map, shared by the front page, Places and each place.
   Lookout.map(el, places, {single, around}) draws OpenStreetMap tiles with a pin per place: filled when you've
   done it, hollow when you haven't. Leaflet is kept in vendor/, so the pins still draw offline; tiles you've
   already seen come from the offline worker's cache, and the rest show as plain ground. */
{
const L_ = window.L, {esc, placeHref, log, KIND, feet, miles} = window.Lookout;

const pin = (done, big) => L_.divIcon({className: "", iconSize: big ? [26, 26] : [18, 18], iconAnchor: big ? [13, 13] : [9, 9],
  html: `<span class="pin${done ? " done" : ""}${big ? " big" : ""}"></span>`});
const dot = kind => L_.divIcon({className: "", iconSize: [12, 12], iconAnchor: [6, 6], html: `<span class="dot-pin" data-kind="${esc(kind)}"></span>`});

function map(el, places, {single = null, around = [], outline = null} = {}){
  if(!L_ || !el) return null;
  const m = L_.map(el, {scrollWheelZoom: false, zoomControl: true, attributionControl: true, tap: true, zoomSnap: outline ? .25 : 1});
  L_.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 17, crossOrigin: "anonymous",
    attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`}).addTo(m);
  const marks = [];
  const draw = () => {
    marks.forEach(k => k.remove()); marks.length = 0;
    const done = log.all();
    for(const p of places){
      const me = single && p.id === single.id;
      const k = L_.marker([p.pin.lat, p.pin.lon], {icon: pin(!!done[p.id], me), title: p.name, zIndexOffset: me ? 1000 : done[p.id] ? 0 : 100}).addTo(m);
      k.bindPopup(`<a class="pop" href="${placeHref(p.id)}"><b>${esc(p.name)}</b><span>${esc(KIND[p.kind] || "")}${p.distance_mi ? ` · ${miles(p.distance_mi)}` : ""}${done[p.id] ? " · done" : ""}</span></a>`);
      marks.push(k);
    }
    for(const a of around){
      const k = L_.marker([a.lat, a.lon], {icon: dot(a.kind), title: a.name}).addTo(m);
      k.bindTooltip(`${esc(a.name)}${a.ele_ft ? ` · ${feet(a.ele_ft)}` : ""}`); marks.push(k);
    }
  };
  draw();
  document.addEventListener("lookout-log", draw);
  if(single){
    const pts = [[single.pin.lat, single.pin.lon], ...around.map(a => [a.lat, a.lon])];
    pts.length > 1 ? m.fitBounds(pts, {padding: [30, 30], maxZoom: 14}) : m.setView(pts[0], 13);
  } else if(outline){
    m.setView([51, -126.5], 4);
    cascadia(m, outline);
  } else if(places.length){
    m.fitBounds(places.map(p => [p.pin.lat, p.pin.lon]), {padding: [24, 24]});
  }
  /* the map is often drawn before its box has its final size */
  new ResizeObserver(() => m.invalidateSize()).observe(el);
  return m;
}

/* Cascadia (British Columbia, Washington and Oregon, data/cascadia.json): the land outside it faded, the edge drawn
   in the accent, and the map framed on it */
function cascadia(m, c){
  const [w, s, e, n] = c.bounds, flip = ring => ring.map(([lon, lat]) => [lat, lon]);
  const css = getComputedStyle(document.documentElement), tok = k => css.getPropertyValue(k).trim();
  const rings = c.geometry.coordinates.map(poly => flip(poly[0]));
  const shade = L_.polygon([[[85, -200], [85, 20], [-10, 20], [-10, -200]], ...rings], {stroke: false, fillColor: tok("--bg") || "#eef1ed", fillOpacity: .62, interactive: false}).addTo(m);
  const edge = L_.polygon(rings, {color: tok("--accent") || "#2d5c43", weight: 1.6, opacity: .9, fill: false, interactive: false}).addTo(m);
  /* the colours follow the theme */
  document.addEventListener("lookout-theme", () => { const k = getComputedStyle(document.documentElement);
    shade.setStyle({fillColor: k.getPropertyValue("--bg").trim()}); edge.setStyle({color: k.getPropertyValue("--accent").trim()}); });
  /* frame it once the box has its size, and again if the box changes, until the reader moves the map */
  let moved = false;
  const fit = () => { if(moved || !m.getContainer().clientHeight) return; m.invalidateSize(); m.setMinZoom(0);
    m.fitBounds([[s, w], [n, e]], {padding: [6, 6], animate: false}); m.setMinZoom(m.getZoom() - 1); };
  ["mousedown", "touchstart", "wheel", "keydown"].forEach(k => m.getContainer().addEventListener(k, () => moved = true, {passive: true}));
  m.setMaxBounds([[s - 8, w - 14], [n + 6, e + 14]]);
  fit(); requestAnimationFrame(fit);
  new ResizeObserver(fit).observe(m.getContainer());
}

/* where a species has been seen: iNaturalist's grid of research-grade sightings over the map, with your places pinned */
function rangeMap(el, taxonId, places = []){
  if(!L_ || !el) return null;
  const m = L_.map(el, {scrollWheelZoom: false, maxZoom: 13});
  L_.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 13, crossOrigin: "anonymous",
    attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · sightings © <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a>`}).addTo(m);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d5c43";
  L_.tileLayer(`https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?taxon_id=${taxonId}&quality_grade=research&color=${encodeURIComponent(accent)}`,
    {maxZoom: 13, opacity: .75, className: "grid-layer"}).addTo(m);
  const done = log.all();
  for(const p of places) L_.marker([p.pin.lat, p.pin.lon], {icon: pin(!!done[p.id]), title: p.name}).addTo(m)
    .bindPopup(`<a class="pop" href="${placeHref(p.id)}"><b>${esc(p.name)}</b><span>${esc(KIND[p.kind] || "")}</span></a>`);
  /* Washington, Oregon and southern British Columbia */
  m.fitBounds([[42, -124.8], [50.8, -116.5]]);
  new ResizeObserver(() => m.invalidateSize()).observe(el);
  return m;
}

window.Lookout.map = map;
window.Lookout.rangeMap = rangeMap;
}
