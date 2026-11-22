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

/* Cascadia (British Columbia, Washington, Oregon and Idaho, data/cascadia.json): the land outside it faded, the edge drawn
   in the accent, and the map framed on it */
function cascadia(m, c, frame = true){
  const [w, s, e, n] = c.bounds, flip = ring => ring.map(([lon, lat]) => [lat, lon]);
  const css = getComputedStyle(document.documentElement), tok = k => css.getPropertyValue(k).trim();
  const rings = c.geometry.coordinates.map(poly => flip(poly[0]));
  const shade = L_.polygon([[[85, -200], [85, 20], [-10, 20], [-10, -200]], ...rings], {stroke: false, fillColor: tok("--bg") || "#eef1ed", fillOpacity: .62, interactive: false}).addTo(m);
  const edge = L_.polygon(rings, {color: tok("--accent") || "#2d5c43", weight: 1.6, opacity: .9, fill: false, interactive: false}).addTo(m);
  /* the colours follow the theme */
  document.addEventListener("lookout-theme", () => { const k = getComputedStyle(document.documentElement);
    shade.setStyle({fillColor: k.getPropertyValue("--bg").trim()}); edge.setStyle({color: k.getPropertyValue("--accent").trim()}); });
  if(!frame) return;
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
  /* Washington, Oregon, Idaho and southern British Columbia */
  m.fitBounds([[42, -124.8], [50.8, -111.5]]);
  new ResizeObserver(() => m.invalidateSize()).observe(el);
  return m;
}

/* the seeds: places across Cascadia from OpenStreetMap, a dot per place coloured by kind, drawn on a canvas so
   thousands stay quick. Saved ones are bigger and ringed. seedMap(el, outline) returns {show(list), fit(bbox), focus(seed)}. */
const SEED_COLOUR = {"lighthouse": "#c8402f", "market": "#d98a1c", "farm": "#6f8f2a", "camera-obscura": "#7b52ab", "ferry": "#2f6db0",
  "campground": "#8a5f3c", "hot-spring": "#cf5d86", "waterfall": "#23948f"};
function seedMap(el, outline, names = {}){
  if(!L_ || !el) return null;
  const {saved} = window.Lookout;
  const m = L_.map(el, {scrollWheelZoom: false, preferCanvas: true, zoomSnap: .25});
  L_.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 17, crossOrigin: "anonymous",
    attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`}).addTo(m);
  const layer = L_.layerGroup().addTo(m), ring = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1c2320";
  let list = [], byId = {};
  const popup = s => {
    const on = saved.has(s.id), where = [s.region, ...(s.waters || [])].map(r => names[r]).filter(Boolean);
    return `<div class="pop seed-pop"><b>${esc(s.name)}</b><span>${esc(KIND[s.kind] || s.kind)}${where.length ? " · " + esc(where.join(", ")) : ""}</span>
      ${s.hours ? `<span class="hours">${esc(s.hours)}</span>` : ""}
      <span class="links">${s.web ? `<a href="${esc(s.web)}" target="_blank" rel="noopener">Website ↗</a>` : ""}${s.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(s.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ""}<a href="https://www.openstreetmap.org/${{n: "node", w: "way", r: "relation"}[s.id[4]]}/${s.id.slice(5)}" target="_blank" rel="noopener">Map ↗</a></span>
      <button type="button" class="btn${on ? " ghost" : ""} save-seed" data-seed="${esc(s.id)}">${on ? "Saved ✓" : "Save"}</button></div>`;
  };
  const show = next => {
    list = next; byId = Object.fromEntries(list.map(s => [s.id, s]));
    layer.clearLayers();
    const all = saved.all();
    /* the saved last, so they draw on top */
    for(const s of [...list].sort((a, b) => !!all[a.id] - !!all[b.id])){
      const on = !!all[s.id];
      L_.circleMarker([s.lat, s.lon], {radius: on ? 8 : 5, color: on ? ring : "#fff", weight: on ? 2.5 : 1, fillColor: SEED_COLOUR[s.kind] || "#777", fillOpacity: .92})
        .bindPopup(() => popup(s), {maxWidth: 260}).addTo(layer);
    }
  };
  el.addEventListener("click", e => {
    const b = e.target.closest(".save-seed"); if(!b) return;
    const s = byId[b.dataset.seed]; if(!s) return;
    const on = saved.toggle(s);
    b.textContent = on ? "Saved ✓" : "Save"; b.classList.toggle("ghost", on);
  });
  document.addEventListener("lookout-saved", () => show(list));
  const fit = bbox => { const [s, w, n, e] = bbox; m.invalidateSize(); m.fitBounds([[s, w], [n, e]], {padding: [10, 10], animate: false}); };
  if(outline){ cascadia(m, outline, false); const [w, so, e, n] = outline.bounds; m.fitBounds([[so, w], [n, e]], {padding: [6, 6], animate: false}); } else m.setView([47.5, -121], 6);
  new ResizeObserver(() => m.invalidateSize()).observe(el);
  return {map: m, show, fit, focus(s){ m.setView([s.lat, s.lon], 12); layer.eachLayer(k => { const p = k.getLatLng(); if(p.lat === s.lat && p.lng === s.lon) k.openPopup(); }); el.scrollIntoView({behavior: "smooth", block: "center"}); }};
}

window.Lookout.map = map;
window.Lookout.seedMap = seedMap;
window.Lookout.SEED_COLOUR = SEED_COLOUR;
window.Lookout.rangeMap = rangeMap;
}
