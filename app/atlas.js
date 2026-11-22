/* Lookout — the Atlas: Cascadia on one big map.
   Tap anywhere and a raindrop runs downhill to the sea along the grid tools/build_cascadia.py traced from elevation
   (data/atlas-flow.png: which way water runs from every ~5 km block; data/atlas-ground.png: how high the ground is;
   data/atlas.json: where the grid sits and the named watersheds). The panel tells its story, then what's here: the
   region, your nearest places, and what's been seen near it this month. Switches show your places, the watersheds,
   Beyond the trail, salmon, whales and tide pools; the month setting fades what's out of season. Below, a short
   primer moves the map as you read. */
{
const L = window.Lookout, {esc, $} = L, LL = window.L;
const main = $("main");
document.body.insertAdjacentHTML("beforeend", L.footer());

const KEY = "lookout-atlas";
const LAYERS = [["places", "Your places", true], ["watersheds", "Watersheds", true], ["seeds", "Beyond the trail", false],
  ["salmon", "Salmon", false], ["whales", "Whales", false], ["tidepools", "Tide pools", false]];
const on = k => (L.store.get(KEY, {})[k] ?? LAYERS.find(x => x[0] === k)[2]);
const setOn = (k, v) => L.store.set(KEY, {...L.store.get(KEY, {}), [k]: v});
const tok = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
let month = L.month();

/* a line or two about each named watershed */
const ABOUT = {
  Columbia: "The fourth-largest river in the United States by volume. It drains seven states and British Columbia, and once carried the biggest salmon runs on Earth.",
  Fraser: "British Columbia's longest river, and one of the world's great salmon rivers: in a big year, tens of millions of sockeye come home up it.",
  Copper: "It cuts through the Chugach Mountains to a delta that millions of shorebirds stop on each spring. Cascadia's northern end.",
  Stikine: "One of the last big undammed rivers on the coast, through the Grand Canyon of the Stikine.",
  Skeena: "One of the great salmon rivers of the north coast, gathering the Bulkley and the Babine.",
  Alsek: "It rises in the Yukon and cuts straight through the Coast Mountains, a World Heritage wilderness of ice.",
  Nass: "Home of the Nisga'a, and of the eulachon, the little candlefish whose spring run feeds the whole valley.",
  Klamath: "Four of its dams came down in 2023 and 2024, the largest dam removal in history, and the salmon came back within weeks.",
  Taku: "It rises in British Columbia and reaches the sea near Juneau.",
  Rogue: "One of the first rivers named Wild and Scenic, in 1968.",
  Umpqua: "From the Cascades through the Coast Range to the sea at Winchester Bay.",
  Nimpkish: "One of Vancouver Island's biggest rivers, running north to Johnstone Strait.",
  Skagit: "The biggest river into Puget Sound, and the only one where all five kinds of Pacific salmon spawn in numbers.",
  Eel: "The southern edge of Cascadia's rivers, reaching the sea just north of Cape Mendocino."
};

/* ---------- the page ---------- */
main.innerHTML = `<section class="hero"><h1>Atlas</h1><p class="sub-line">Cascadia is every river that reaches the Pacific from the Copper River to Cape Mendocino. Tap anywhere on the map to follow a raindrop to the sea.</p></section>
  <div class="atlas-grid">
    <div class="atlas-mapcol"><div class="mapbox atlas-map" id="atlas-map"></div>
      <p class="legend"><span><i></i>To do</span><span><i class="done"></i>Done</span><span class="switches"><button type="button" class="chip" data-borders aria-pressed="false">Borders</button><button type="button" class="chip" data-rivers aria-pressed="false">Rivers in blue</button></span></p></div>
    <div class="atlas-side">
      <div class="atlas-drop" id="drop"><p class="eyebrow">Follow a raindrop</p><h3>Tap anywhere on the map</h3>
        <p class="small">A drop of rain runs downhill from where you tap, along the rivers it would really take, to the sea, or to wherever else it ends.</p></div>
      <h3 class="atlas-h">On the map</h3>
      <div class="chips atlas-layers">${LAYERS.map(([k, name]) => `<button type="button" class="chip" data-layer="${k}" aria-pressed="${on(k)}">${name}</button>`).join("")}</div>
      <div class="month-pick"><button type="button" class="chip" data-mo="-1" aria-label="The month before">‹</button><b id="mo"></b><button type="button" class="chip" data-mo="1" aria-label="The month after">›</button></div>
      <p class="small muted" id="mo-line"></p>
      <div id="primer"></div>
    </div>
  </div>`;

/* ---------- the raindrop grid ---------- */
const readGrey = src => new Promise((ok, no) => {
  const im = new Image();
  im.onload = () => {
    const c = Object.assign(document.createElement("canvas"), {width: im.naturalWidth, height: im.naturalHeight});
    const x = c.getContext("2d", {willReadFrequently: true}); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, out = new Uint8Array(c.width * c.height);
    for(let i = 0; i < out.length; i++) out[i] = d[i * 4];
    ok(out);
  };
  im.onerror = no; im.src = L.ROOT + "data/" + src;
});
const DI = [-1, -1, 0, 1, 1, 1, 0, -1], DJ = [0, 1, 1, 1, 0, -1, -1, -1];

function trace(G, m, latlng){
  const p = m.project(latlng, G.z);
  let i = Math.floor(p.y) - G.y, j = Math.floor(p.x) - G.x;
  if(i < 0 || j < 0 || i >= G.h || j >= G.w) return {outside: true};
  const at = (i, j) => G.flow[i * G.w + j];
  if(at(i, j) === 255) return {sea: true};
  const cells = [[i, j]], seen = new Set();
  let code = 8, dir = 0;
  for(let n = 0; n < 30000; n++){
    code = at(i, j);
    if(code >= 8) break;
    const k = i * G.w + j;
    if(seen.has(k)){ code = 11; break; }
    seen.add(k); dir = code;
    i += DI[code]; j += DJ[code];
    if(i < 0 || j < 0 || i >= G.h || j >= G.w){ code = 10; break; }
    if(at(i, j) === 255){ code = 8; cells.push([i, j]); break; }
    cells.push([i, j]);
  }
  const pts = cells.map(([i, j]) => m.unproject([G.x + j + .5, G.y + i + .5], G.z));
  const [si, sj] = cells[0], g = G.ground[si * G.w + sj];
  return {cells, pts, code, dir, ft: g ? (g - 1) * 25 * 3.281 : 0, km: pts.slice(1).reduce((a, q, n) => a + L.km({lat: pts[n].lat, lon: pts[n].lng}, {lat: q.lat, lon: q.lng}), 0)};
}

/* two passes of corner cutting, so the 5 km steps read as a river */
const smooth = pts => {
  let a = pts.map(p => [p.lat, p.lng]);
  for(let r = 0; r < 2 && a.length > 2; r++){
    const b = [a[0]];
    for(let k = 0; k < a.length - 1; k++){ const [x1, y1] = a[k], [x2, y2] = a[k + 1]; b.push([.75 * x1 + .25 * x2, .75 * y1 + .25 * y2], [.25 * x1 + .75 * x2, .25 * y1 + .75 * y2]); }
    b.push(a[a.length - 1]); a = b;
  }
  return a;
};

/* the named rivers the drop runs along, in order (Natural Earth's, within about 8 km of its path) */
function riversOf(R, pts){
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length, cx = Math.cos(lat0 * Math.PI / 180);
  const lo = Math.min(...pts.map(p => p.lng)) - .2, hi = Math.max(...pts.map(p => p.lng)) + .2, so = Math.min(...pts.map(p => p.lat)) - .2, no = Math.max(...pts.map(p => p.lat)) + .2;
  const near = R.rivers.filter(r => r.n && r.c.some(([x, y]) => x >= lo && x <= hi && y >= so && y <= no));
  const d2 = (px, py, [ax, ay], [bx, by]) => { ax *= cx; bx *= cx; px *= cx; const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const ex = ax + t * dx - px, ey = ay + t * dy - py; return ex * ex + ey * ey; };
  const seq = [];
  for(const p of pts){
    let best = null, bd = .09 ** 2;
    for(const r of near) for(let k = 0; k < r.c.length - 1; k++){ const d = d2(p.lng, p.lat, r.c[k], r.c[k + 1]); if(d < bd){ bd = d; best = r.n; } }
    seq.push(best);
  }
  /* a river counts once the drop has followed it for about 20 km; they're told in the order the drop meets them */
  const at = {}; seq.forEach((n, k) => n && (at[n] ||= []).push(k));
  return Object.keys(at).filter(n => at[n].length >= 4).sort((a, b) => at[a][at[a].length >> 1] - at[b][at[b].length >> 1]);
}

/* point in Cascadia's outline */
const inside = (c, lat, lon) => c.geometry.coordinates.some(poly => {
  let hit = false;
  for(const ring of poly) for(let a = 0, b = ring.length - 1; a < ring.length; b = a++){
    const [xa, ya] = ring[a], [xb, yb] = ring[b];
    if((ya > lat) !== (yb > lat) && lon < (xb - xa) * (lat - ya) / (yb - ya) + xa) hit = !hit;
  }
  return hit;
});

const list = names => names.length < 2 ? names[0] || "" : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];

/* which sea, from where the drop meets it */
function seaAt(P, lat, lon){
  const water = L.regionsAt(P.regions, lat, lon).filter(r => r.kind === "water").sort((a, b) => area(a) - area(b));
  if(water.length) return water[0].name.startsWith("Puget") || water[0].name.startsWith("Hood") ? water[0].name : "the Salish Sea";
  if(lat > 59 || lon < -137.5) return "the Gulf of Alaska";
  if(lat > 54.6 && lon > -136.5 && lon < -130) return "the Inside Passage";
  return "the Pacific";
}
const area = r => (r.bbox[2] - r.bbox[0]) * (r.bbox[3] - r.bbox[1]);

/* where water ends when it leaves Cascadia */
function beyond(t, last){
  const {lat, lng} = last;
  if(t.code === 9 || t.code === 11) return {to: "the Great Basin", line: "where rivers never reach the sea: they end in lakes and salt flats that the sun dries out."};
  if(t.code === 8){
    if(lat < 40.44) return {to: lat > 37.6 && lat < 38.3 && lng > -122.7 ? "San Francisco Bay" : "the Pacific, south of Cape Mendocino", line: "south of Cascadia's last river."};
    if(lng < -145.6) return {to: "the Gulf of Alaska, west of the Copper River", line: "beyond Cascadia's northern end."};
    return null;
  }
  /* off the edge of the grid: which way it was going */
  const di = DI[t.dir], dj = DJ[t.dir];
  if(dj > 0){
    if(lat < 49.5) return {to: "the Gulf of Mexico", line: "by the Missouri and the Mississippi, more than 3,000 miles away."};
    if(lat < 55.5) return {to: "Hudson Bay", line: "by the Saskatchewan and the Nelson, across the prairies."};
    return {to: "the Arctic Ocean", line: "by the Peace or the Liard and then the Mackenzie, north across the boreal forest."};
  }
  if(di < 0) return lng > -136 ? {to: "the Arctic Ocean", line: "by the Mackenzie."} : {to: "the Bering Sea", line: "by the Yukon, across Alaska."};
  if(dj < 0) return {to: "the Bering Sea or Cook Inlet", line: "west across Alaska."};
  return lng > -115 ? {to: "the Gulf of California", line: "by the Green and the Colorado."} : {to: "the Great Basin or the Sacramento", line: "south of this map's edge."};
}

/* ---------- the map ---------- */
async function start(){
  const [outline, A, R, P, S, salmon, whales, tide] = await Promise.all([L.data.json("cascadia.json"), L.data.json("atlas.json"), L.data.json("rivers.json"),
    L.data.places(), L.data.seeds(), L.data.json("salmon.json").catch(() => null), L.data.json("whales.json").catch(() => null), L.data.json("tidepools.json").catch(() => null)]);
  const {relief, cascadia, pin, dot} = L.mapParts;
  const el = $("atlas-map");
  const m = LL.map(el, {scrollWheelZoom: true, zoomSnap: .25, tap: true});
  const osm = LL.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 17, crossOrigin: "anonymous",
    attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`});
  m.setView([51, -126.5], 4);
  relief(m, outline, osm);
  cascadia(m, outline);
  new ResizeObserver(() => m.invalidateSize()).observe(el);

  /* the layers */
  const group = {};
  for(const [k] of LAYERS) group[k] = LL.layerGroup();
  const done = () => L.log.all();
  const placeMarks = P.list.map(p => {
    const k = LL.marker([p.pin.lat, p.pin.lon], {icon: pin(!!done()[p.id]), title: p.name});
    k.bindPopup(`<a class="pop" href="${L.placeHref(p.id)}"><b>${esc(p.name)}</b><span>${esc(L.KIND[p.kind] || "")} · ${esc(L.seasonText(p.season))}</span></a>`);
    k.place = p; return k.addTo(group.places);
  });
  const ws = A.watersheds.map(w => {
    const poly = LL.polygon(w.rings.map(r => r.map(([x, y]) => [y, x])), {color: tok("--accent"), weight: 1, opacity: .55, fill: true, fillOpacity: 0, interactive: false});
    if(w.km2 >= 15000) poly.bindTooltip(w.name, {permanent: true, direction: "center", className: "ws-label", interactive: false});
    poly.w = w; return poly.addTo(group.watersheds);
  });
  const canvas = LL.canvas({padding: .3});
  for(const s of S?.seeds || []) LL.circleMarker([s.lat, s.lon], {renderer: canvas, radius: 4, color: "#fff", weight: 1, fillColor: L.SEED_COLOUR[s.kind] || "#777", fillOpacity: .9, bubblingMouseEvents: false})
    .bindPopup(`<div class="pop"><b>${esc(s.name)}</b><span>${esc(L.KIND[s.kind] || S.kinds?.[s.kind]?.name || s.kind)}</span></div>`).addTo(group.seeds);
  const spots = (layer, list, line) => (list || []).map(s => {
    const k = LL.marker([s.lat, s.lon], {icon: dot(layer), title: s.name});
    k.bindPopup(`<div class="pop"><b>${esc(s.name)}</b><span>${esc(line(s))}</span></div>`, {maxWidth: 260}); k.spot = s; return k;
  });
  const fish = spots("salmon", salmon?.spots, s => `${s.where} · ${s.fish}. ${s.note}`);
  const whale = spots("whales", whales?.spots, s => `${s.where} · ${s.who}. ${s.note}`);
  spots("tidepools", tide?.spots, s => `${s.where}. ${s.note}`).forEach(k => k.addTo(group.tidepools));

  /* the month: what's in season shows, the rest fades or steps back */
  const paint = () => {
    $("mo").textContent = L.MONTHS[month - 1];
    for(const k of placeMarks){ k.setOpacity(L.inSeason(k.place, month) ? 1 : .35); }
    group.salmon.clearLayers(); fish.filter(k => k.spot.months?.includes(month)).forEach(k => k.addTo(group.salmon));
    group.whales.clearLayers(); whale.filter(k => k.spot.months?.includes(month)).forEach(k => k.addTo(group.whales));
    const runs = (salmon?.fish || []).filter(f => f.river?.includes(month)).map(f => f.name);
    const pods = (whales?.whales || []).filter(w => w.months?.includes(month)).map(w => w.name);
    const open = P.list.filter(p => L.inSeason(p, month)).length;
    $("mo-line").innerHTML = [open ? `${open} of your ${P.list.length} places in season` : "None of your places in season",
      runs.length ? `${list(runs)} in the rivers` : "", pods.length ? `${list(pods)} along the coast` : ""].filter(Boolean).map(esc).join(" · ");
  };
  main.addEventListener("click", e => {
    const b = e.target.closest("[data-mo]");
    if(b){ month = (month + 11 + +b.dataset.mo) % 12 + 1; paint(); return; }
    const c = e.target.closest("[data-layer]");
    if(c){ const k = c.dataset.layer, v = !on(k); setOn(k, v); c.setAttribute("aria-pressed", v); v ? group[k].addTo(m) : group[k].remove(); }
  });
  for(const [k] of LAYERS) if(on(k)) group[k].addTo(m);
  paint();
  document.addEventListener("lookout-log", () => placeMarks.forEach(k => k.setIcon(pin(!!done()[k.place.id]))));
  document.addEventListener("lookout-theme", () => ws.forEach(p => p.setStyle({color: tok("--accent"), fillColor: tok("--accent")})));

  /* the raindrop */
  const G = {...A.grid};
  const ready = Promise.all([readGrey("atlas-flow.png"), readGrey("atlas-ground.png")]).then(([flow, ground]) => Object.assign(G, {flow, ground}));
  const drop = LL.layerGroup().addTo(m);
  let anim = 0;
  async function rain(latlng, {fly = false} = {}){
    await ready;
    const t = trace(G, m, latlng), box = $("drop");
    drop.clearLayers(); cancelAnimationFrame(anim);
    ws.forEach(p => p.setStyle({fillOpacity: 0}));
    history.replaceState(null, "", `#at=${latlng.lat.toFixed(3)},${latlng.lng.toFixed(3)}`);
    if(t.sea){ box.innerHTML = `<p class="eyebrow">Follow a raindrop</p><h3>That's the sea</h3><p class="small">Tap on land and a raindrop will find its way back here.</p>`; return; }
    if(t.outside){ box.innerHTML = `<p class="eyebrow">Follow a raindrop</p><h3>Off the edge of the atlas</h3><p class="small">The raindrop map covers Cascadia and a little around it. Tap closer in.</p>`; return; }
    const water = tok("--water"), last = t.pts[t.pts.length - 1];
    const line = LL.polyline([], {color: water, weight: 3, opacity: .95, lineCap: "round", lineJoin: "round", interactive: false}).addTo(drop);
    LL.circleMarker(latlng, {radius: 5, color: water, weight: 2, fillColor: tok("--paper"), fillOpacity: 1, interactive: false}).addTo(drop);
    const head = LL.circleMarker(latlng, {radius: 4, color: tok("--paper"), weight: 1.5, fillColor: water, fillOpacity: 1, interactive: false}).addTo(drop);
    const path = smooth(t.pts), t0 = performance.now(), dur = Math.min(2600, 500 + path.length * 4);
    const step = now => {
      const n = Math.max(2, Math.ceil(path.length * Math.min(1, (now - t0) / dur)));
      line.setLatLngs(path.slice(0, n)); head.setLatLng(path[n - 1]);
      if(n < path.length) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
    if(fly) m.fitBounds(LL.latLngBounds(path).pad(.25), {maxZoom: 7});

    /* the story */
    const startIn = inside(outline, latlng.lat, latlng.lng);
    const end = t.cells[t.cells.length - 1], shed = t.code === 8 ? ws.find(p => p.w.mouth[0] === end[0] && p.w.mouth[1] === end[1]) : null;
    if(shed) shed.setStyle({fillOpacity: .08, fillColor: tok("--accent")});
    const far = beyond(t, last), names = riversOf(R, t.pts);
    if(shed && !names.includes(shed.w.name)) names.push(shed.w.name);
    const miles = Math.round(t.km * .621371 / 5) * 5 || Math.round(t.km * .621371);
    const up = t.ft > 300 ? `, about ${L.feet(Math.round(t.ft / 50) * 50)} up,` : "";
    const sea = far ? far.to : seaAt(P, last.lat, last.lng);
    const title = far ? `To ${far.to}` : `To ${sea}${shed ? ` by the ${shed.w.name}` : ""}`;
    const runs = names.length ? ` runs down the ${list(names)}` : " runs down a stream too small to name here";
    const story = far ? `Rain falling here${up}${names.length ? runs + "," : ""} and reaches ${far.to} ${far.line}`
      : `Rain falling here${up}${runs} and reaches ${sea}${miles > 2 ? `, about ${L.miles(miles)} as the water flows` : ""}.`;
    const reg = L.regionsAt(P.regions, latlng.lat, latlng.lng).filter(r => r.kind !== "water").sort((a, b) => area(a) - area(b))[0];
    const here = {lat: latlng.lat, lon: latlng.lng};
    const nearest = P.list.map(p => ({p, d: L.km(here, p.pin)})).filter(x => x.d < 160).sort((a, b) => a.d - b.d).slice(0, 3);
    box.innerHTML = `<p class="eyebrow">${startIn ? "Inside Cascadia" : "Outside Cascadia"}${reg ? ` · ${esc(reg.name)}` : ""}</p><h3>${esc(title)}</h3>
      <p>${esc(story)}</p>
      ${shed ? `<p class="small muted">The ${esc(shed.w.name)}'s watershed: about ${L.num(shed.w.km2)} km² (${L.num(Math.round(shed.w.km2 * .3861 / 100) * 100)} sq mi). ${esc(ABOUT[shed.w.name] || "")}</p>` : ""}
      ${nearest.length ? `<p class="small"><b>Your places nearby:</b> ${nearest.map(x => `<a href="${L.placeHref(x.p.id)}">${esc(x.p.name)}</a> <span class="muted">${L.miles(Math.round(x.d * .621371))}</span>`).join(" · ")}</p>` : ""}
      <div id="drop-seen" hidden><p class="small"><b>Seen within 10 km in ${L.MONTHS[month - 1]}</b> <a class="muted" href="https://www.inaturalist.org/observations?lat=${here.lat.toFixed(4)}&lng=${here.lon.toFixed(4)}&radius=10&month=${month}" target="_blank" rel="noopener">iNaturalist ↗</a></p><div class="row"></div></div>`;
    try {
      const j = await L.nat("observations/species_counts", {lat: here.lat, lng: here.lon, radius: 10, month, verifiable: "true", per_page: 12});
      const seen = $("drop-seen"); if(!seen) return;
      const tiles = j.results.filter(x => ["species", "subspecies", "variety"].includes(x.taxon.rank)).map(x => L.liveTile(L.taxonCard(x.taxon)));
      if(tiles.length){ seen.querySelector(".row").innerHTML = tiles.join(""); seen.hidden = false; L.fillPhotos(seen); }
    } catch(e){}
  }
  m.on("click", e => rain(e.latlng));
  const at = /#at=(-?[\d.]+),(-?[\d.]+)/.exec(location.hash);
  if(at) rain(LL.latLng(+at[1], +at[2]));
  return {m, rain, ws, dot};
}

/* ---------- the primer: seven short chapters; each moves the map as you read it ---------- */
const VOLCANOES = [["Mount Meager", 50.63, -123.5], ["Mount Garibaldi", 49.85, -123.0], ["Mount Baker", 48.777, -121.813], ["Glacier Peak", 48.112, -121.113],
  ["Mount Rainier", 46.853, -121.76], ["Mount St. Helens", 46.191, -122.194, "left"], ["Mount Adams", 46.202, -121.491], ["Mount Hood", 45.374, -121.696],
  ["Mount Jefferson", 44.674, -121.8], ["Three Sisters", 44.103, -121.769], ["Crater Lake", 42.94, -122.1], ["Mount Shasta", 41.409, -122.195]];
const FLOOD = [[46.87, -114.0], [47.9, -116.3], [47.66, -117.4], [47.6, -119.36], [46.9, -119.1], [46.06, -118.93], [45.7, -120.6], [45.65, -121.9], [45.55, -122.7], [45.0, -123.0], [44.6, -123.1]];
const CHAPTERS = [
  {k: "what", title: "One country of rivers", view: [[38.5, -150], [64, -108]], sheds: "all",
    text: [`Cascadia isn't drawn by surveyors. It's drawn by water: every river that reaches the Pacific between the Copper River in Alaska and Cape Mendocino in California, inland to the Continental Divide, where rain starts running toward Hudson Bay or the Gulf of Mexico instead.`,
      `That makes one region of temperate rainforest, glaciers, dry interior plateaus and salmon rivers, shared by Alaska, British Columbia, the Yukon, Washington, Oregon, Idaho, and slices of Montana, Wyoming, Nevada, Utah and California.`]},
  {k: "rivers", title: "The Columbia and the Fraser", sheds: ["Columbia", "Fraser"],
    text: [`Two rivers hold most of it. The Columbia rises in the Rocky Mountain Trench of British Columbia, runs north, turns south through Washington, gathers the Snake from as far as Wyoming, and cuts through the Cascades to the sea at Astoria.`,
      `The Fraser rises near Mount Robson, loops north around the Cariboo, and squeezes through the Fraser Canyon to reach the Salish Sea at Vancouver. Undammed on its main stem, it's still one of the world's great salmon rivers.`],
    try: ["Rain on Mount Robson", 53.11, -119.16]},
  {k: "mountains", title: "Mountains of fire and ice", view: [[40.8, -125.5], [51.2, -118.5]], marks: VOLCANOES,
    text: [`The Cascade volcanoes stand in a line from Mount Meager and Garibaldi in British Columbia to Shasta in California, fed by the Juan de Fuca plate sliding under the continent just offshore.`,
      `Mount St. Helens erupted in 1980. Crater Lake fills the hollow left when Mount Mazama blew apart about 7,700 years ago. North of them, the Coast Mountains carry some of the largest temperate icefields on Earth; to the east, the Rockies make the far wall.`]},
  {k: "rain", title: "The rain and its shadow", view: [[45.6, -125.2], [48.6, -118.2]], marks: [["Hoh Rain Forest", 47.86, -123.93], ["Columbia Basin", 47.25, -119.4]],
    text: [`Storms come off the Pacific and drop their rain on the first mountains they meet. The Hoh Rain Forest on the Olympic Peninsula gets around 140 inches a year, enough for moss to hang from every branch.`,
      `By the time the air has crossed the Cascades it's dry. Two hundred miles east, parts of the Columbia Basin get under 8 inches: sagebrush, basalt and wheat. Every hike's character on Lookout comes down to which side of a crest it's on.`]},
  {k: "floods", title: "The Ice Age floods", view: [[44.3, -124.2], [48.4, -113.4]], flood: true,
    text: [`Toward the end of the last ice age, a lobe of ice dammed the Clark Fork in Idaho and backed up Glacial Lake Missoula, holding about as much water as Lakes Erie and Ontario together. Again and again the dam floated and broke.`,
      `Each time, the lake emptied in a few days, tearing across eastern Washington, scouring the Channeled Scablands and Dry Falls, piling up at Wallula Gap, roaring down the Columbia Gorge and flooding the Willamette Valley hundreds of feet deep.`]},
  {k: "salmon", title: "Salmon carry the sea uphill", view: [[42.5, -126.5], [55, -113.5]], salmon: true,
    text: [`Salmon hatch in fresh water, grow up in the ocean, and come home to spawn where they were born. When they die, bears, eagles and the stream itself carry their bodies into the forest, and a large share of the nitrogen in streamside trees can come from the sea.`,
      `Snake River sockeye climb 6,500 feet over 900 miles to Redfish Lake in Idaho. Drop rain there and watch the path they swim in reverse.`],
    try: ["Rain at Redfish Lake", 44.14, -114.92], link: ["Salmon runs", "living/?f=salmon"]},
  {k: "peoples", title: "The peoples of the rivers", view: [[40, -140], [61, -112]], sheds: "all",
    text: [`These watersheds are the homelands of many Indigenous nations, who have lived with these rivers and their salmon since time immemorial: among them the Tlingit, Haida, Tsimshian, Nisga'a and Gitxsan in the north; the Kwakwaka'wakw, Nuu-chah-nulth and the Coast Salish peoples around the Salish Sea; the Secwépemc, Syilx and Ktunaxa in the interior; and the Chinook, Yakama, Nimiipuu (Nez Perce), Umatilla, Klamath and many more down the Columbia and to the south.`,
      `To learn whose land a place is, start with the nations themselves; Native Land Digital's map is a good first step.`],
    link: ["Native Land map ↗", "https://native-land.ca/"]}];

function primer({m, rain, ws, dot}){
  const box = $("primer"); if(!box) return;
  box.innerHTML = L.section("Cascadia, a primer", CHAPTERS.map(c => `<article class="chapter" data-ch="${c.k}"><h3 class="atlas-h">${esc(c.title)}</h3>
    ${c.text.map(t => `<p>${esc(t)}</p>`).join("")}
    ${c.try || c.link ? `<p class="chips">${c.try ? `<button type="button" class="chip" data-try="${c.try[1]},${c.try[2]}">${esc(c.try[0])}</button>` : ""}${c.link ? `<a class="chip" href="${c.link[1].startsWith("http") ? c.link[1] : L.ROOT + c.link[1]}"${c.link[1].startsWith("http") ? ` target="_blank" rel="noopener"` : ""}>${esc(c.link[0])}</a>` : ""}</p>` : ""}</article>`).join(""), {id: "primer-s"});
  const layer = LL.layerGroup().addTo(m);
  let current = "", hold = 0;
  const show = k => {
    if(k === current || performance.now() < hold) return; current = k;
    const c = CHAPTERS.find(x => x.k === k); layer.clearLayers();
    ws.forEach(p => p.setStyle({fillOpacity: 0}));
    let bounds = c.view ? LL.latLngBounds(c.view) : null;
    if(c.sheds){
      for(const p of ws) if(c.sheds === "all" || c.sheds.includes(p.w.name)){ p.setStyle({fillColor: tok("--accent"), fillOpacity: c.sheds === "all" ? .05 : .12}); if(c.sheds !== "all") bounds = bounds ? bounds.extend(p.getBounds()) : p.getBounds(); }
    }
    for(const [name, lat, lon, side = "right"] of c.marks || [])
      LL.marker([lat, lon], {icon: dot("mark"), title: name, interactive: false}).bindTooltip(name, {permanent: true, direction: side, className: "ws-label", offset: [side === "left" ? -6 : 6, 0]}).addTo(layer);
    if(c.flood) LL.polyline(FLOOD, {color: tok("--water"), weight: 4, opacity: .8, dashArray: "8 6", interactive: false}).addTo(layer);
    if(bounds) m.flyToBounds(bounds, {padding: [16, 16], duration: .9, maxZoom: 7});
  };
  /* the chapter nearest the middle of the screen moves the map; on a phone, the middle of what's below the map */
  const io = new IntersectionObserver(es => { for(const e of es) if(e.isIntersecting) show(e.target.dataset.ch); }, {rootMargin: "-45% 0px -45% 0px"});
  box.querySelectorAll(".chapter").forEach(a => io.observe(a));
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-try]"); if(!b) return;
    const [lat, lon] = b.dataset.try.split(",").map(Number);
    hold = performance.now() + 2500;   /* the scroll up to the story passes other chapters: let the map stay on the drop */
    rain(LL.latLng(lat, lon), {fly: true});
    $("drop").scrollIntoView({behavior: "smooth", block: "nearest"});
  });
}
start().then(x => { window.Lookout.atlas = x; primer(x); document.dispatchEvent(new CustomEvent("lookout-atlas")); })
  .catch(e => { $("drop").innerHTML = `<p class="muted">Couldn't load the atlas (${esc(e.message)}).</p>`; });
}
