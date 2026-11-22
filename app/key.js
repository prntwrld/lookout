/* Lookout — the key: a multi-access key, not a dichotomous one. Answer whatever you can see, in any order;
   every answer narrows the candidates, shown as photos. Each choice says how many would be left if you picked it.
   Month comes from today's date, and region and elevation from your location if you allow it.
   Everything here runs on the data already in the page (and its offline thumbnails), so it works with no signal.
   No AI: just the traits in data/flower-traits.json and the seasons and heights from iNaturalist sightings. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
document.body.insertAdjacentHTML("beforeend", L.footer());

/* ---------- little drawings for the choices ---------- */
const svg = (body, vb = "0 0 24 24") => `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ring = (n, len = 6, w = 2.6) => Array.from({length: n}, (_, i) => `<ellipse cx="12" cy="${12 - len}" rx="${w}" ry="${len - 1}" transform="rotate(${i * 360 / n} 12 12)"/>`).join("");
const PETAL_ICON = {
  "3": svg(ring(3, 6.5, 3.4) + `<circle cx="12" cy="12" r="1.4" fill="currentColor"/>`),
  "4": svg(ring(4, 6.5, 3) + `<circle cx="12" cy="12" r="1.4" fill="currentColor"/>`),
  "5": svg(ring(5, 6.5, 2.8) + `<circle cx="12" cy="12" r="1.4" fill="currentColor"/>`),
  "6": svg(ring(6, 6.5, 2.4) + `<circle cx="12" cy="12" r="1.4" fill="currentColor"/>`),
  many: svg(ring(11, 7, 1.3)),
  daisy: svg(ring(14, 7.5, 1) + `<circle cx="12" cy="12" r="3.2" fill="currentColor"/>`),
  irregular: svg(`<path d="M12 3c4 0 6 3 5 7-1.5-1-3.5-1.5-5-1.5S8.5 9 7 10C6 6 8 3 12 3z"/><path d="M7 11c-2 1-3 4-1 7 2 1 4 0 5-3M17 11c2 1 3 4 1 7-2 1-4 0-5-3"/><path d="M12 12v8"/>`),
  tiny: svg([[12,6],[8,9],[16,9],[10,13],[14,13],[12,17],[7,14],[17,14]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor"/>`).join(""))
};
const LEAF_ICON = {
  linear: svg(`<path d="M12 22C11 15 11 8 12 2c1 6 1 13 0 20z"/>`),
  lance: svg(`<path d="M12 22c-3-5-3.5-12 0-20 3.5 8 3 15 0 20z"/><path d="M12 6v16"/>`),
  oval: svg(`<path d="M12 22c-5-3-6-12 0-18 6 6 5 15 0 18z"/><path d="M12 7v15"/>`),
  heart: svg(`<path d="M12 22c-6-4-9-10-6-14 2-2.5 5-1.5 6 1 1-2.5 4-3.5 6-1 3 4 0 10-6 14z"/><path d="M12 9v13"/>`),
  lobed: svg(`<path d="M12 22v-6m0 0c-3 0-4-2-6-1 0-3 2-3 2-5-2 0-3-2-2-4 2 0 3 1 4 0 0-2 1-3 2-4 1 1 2 2 2 4 1 1 2 0 4 0 1 2 0 4-2 4 0 2 2 2 2 5-2-1-3 1-6 1z"/>`),
  three: svg(`<path d="M12 22v-9"/><path d="M12 13c-1-4 0-8 0-10 0 2 1 6 0 10zM12 13c-3-1-7-4-8-6 3 0 7 2 8 6zM12 13c3-1 7-4 8-6-3 0-7 2-8 6z"/>`),
  palmate: svg(`<path d="M12 22v-9"/>` + [-60, -30, 0, 30, 60].map(a => `<path d="M12 13c-1-3-1-7 0-10 1 3 1 7 0 10z" transform="rotate(${a} 12 13)"/>`).join("")),
  pinnate: svg(`<path d="M12 22V2"/>` + [5, 9, 13, 17].map(y => `<path d="M12 ${y}c-2-1-5-1-6 1 2 1 4 1 6-1zM12 ${y}c2-1 5-1 6 1-2 1-4 1-6-1z"/>`).join("")),
  none: svg(`<path d="M12 22V4" stroke-dasharray="2 2"/><circle cx="12" cy="4" r="2"/>`)
};
const ARR_ICON = {
  basal: svg(`<path d="M12 21V5"/>` + [-70, -35, 35, 70].map(a => `<path d="M12 21c-1-3-1-6 0-8 1 2 1 5 0 8z" transform="rotate(${a} 12 21)"/>`).join("")),
  alt: svg(`<path d="M12 22V2"/><path d="M12 7c-2-2-5-2-7 0 2 1.5 5 1.5 7 0zM12 12c2-2 5-2 7 0-2 1.5-5 1.5-7 0zM12 17c-2-2-5-2-7 0 2 1.5 5 1.5 7 0z"/>`),
  opp: svg(`<path d="M12 22V2"/><path d="M12 8c-2-2-5-2-7 0 2 1.5 5 1.5 7 0zM12 8c2-2 5-2 7 0-2 1.5-5 1.5-7 0zM12 15c-2-2-5-2-7 0 2 1.5 5 1.5 7 0zM12 15c2-2 5-2 7 0-2 1.5-5 1.5-7 0z"/>`),
  whorl: svg(`<path d="M12 22V2"/>` + [0, 72, 144, 216, 288].map(a => `<ellipse cx="12" cy="7" rx="1.8" ry="4" transform="rotate(${a} 12 11)"/>`).join(""))
};
const HAB_ICON = {
  forest: svg(`<path d="M7 21v-3M7 18 3 18l4-6H4.5L7 7l2.5 5H8l4 6zM17 21v-3m0 0h-4l4-7h-2.5L17 4l2.5 7H17l4 7z"/>`),
  meadow: svg(`<path d="M2 20h20M5 20c0-3 1-5 2-6M9 20c0-4 0-7-1-9M14 20c0-3 1-6 3-8M18 20c0-2 0-4-1-5"/><circle cx="8" cy="10" r="1.5"/><circle cx="17.5" cy="11" r="1.5"/>`),
  rocky: svg(`<path d="M2 20l4-7 3 2 4-8 4 6 2-2 3 9z"/>`),
  wet: svg(`<path d="M12 3c3 5 5 7.5 5 10a5 5 0 0 1-10 0c0-2.5 2-5 5-10z"/><path d="M3 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 2-1"/>`),
  dry: svg(`<circle cx="17" cy="7" r="3"/><path d="M2 20h20M6 20v-5m0 2-2-2m2 1 2-2M12 20v-4m0 1 2-2"/>`),
  alpine: svg(`<path d="M2 20 9 7l3 5 3-3 7 11z"/><path d="M7.5 10l1.5 1.5L10.5 10"/>`)
};
const BANDS = [[0, 2000, "Under 2,000 ft"], [2000, 4000, "2,000–4,000 ft"], [4000, 6000, "4,000–6,000 ft"], [6000, 8000, "6,000–8,000 ft"], [8000, 15000, "Over 8,000 ft"]];

/* ---------- the questions ---------- */
let F = null, REG = [];
const Q = () => [
  {k: "colour", title: "Flower colour", multi: true, opts: Object.entries(L.COLOUR).map(([v, [name]]) => ({v, label: name, icon: L.sw(v)}))},
  {k: "petals", title: "Petals", multi: true, opts: [["3","3"],["4","4"],["5","5"],["6","6"],["many","Many"],["daisy","Daisy-like"],["irregular","Irregular"],["tiny","Tiny, clustered"]].map(([v, label]) => ({v, label, icon: PETAL_ICON[v]}))},
  {k: "leaf", title: "Leaf shape", multi: true, opts: [["linear","Grass-like"],["lance","Lance"],["oval","Oval"],["heart","Heart or round"],["lobed","Lobed"],["three","In threes"],["palmate","Fingers"],["pinnate","Feathery"],["none","No leaves"]].map(([v, label]) => ({v, label, icon: LEAF_ICON[v]}))},
  {k: "arr", title: "Leaves grow", multi: true, opts: [["basal","From the base"],["alt","Alternate"],["opp","Opposite"],["whorl","Whorled"]].map(([v, label]) => ({v, label, icon: ARR_ICON[v]}))},
  {k: "habitat", title: "Where it's growing", multi: true, opts: [["forest","Forest"],["meadow","Meadow"],["rocky","Rocks"],["wet","Wet ground"],["dry","Dry and open"],["alpine","Alpine"]].map(([v, label]) => ({v, label, icon: HAB_ICON[v]}))},
  {k: "month", title: "Month", opts: L.MON.map((m, i) => ({v: String(i + 1), label: m}))},
  {k: "elev", title: "Elevation", opts: BANDS.map((b, i) => ({v: String(i), label: b[2]}))},
  {k: "region", title: "Region", opts: REG.map(r => ({v: r.id, label: r.name}))}
];

/* does species s fit answer(s) vals for question k? null when the guide doesn't know (that never rules it out) */
function fits(s, k, vals){
  if(!vals?.length) return true;
  if(k === "month"){
    if(!s.bloom?.length) return true;
    const m = +vals[0], near = [m, m === 1 ? 12 : m - 1, m === 12 ? 1 : m + 1];   /* a month either side: seasons vary */
    return near.some(x => s.bloom.includes(x));
  }
  if(k === "elev"){
    if(!s.elev) return true;
    const [a, b] = BANDS[+vals[0]];
    return s.elev[1] + 500 >= a && s.elev[0] - 500 <= b;
  }
  if(k === "region") return !s.regions?.length || s.regions.includes(vals[0]);
  const have = s[k] || [];
  return !have.length || vals.some(v => have.includes(v));
}

/* ---------- the state: answers, kept in the address so the back button and a reload keep them ---------- */
let A = {}, auto = {};
const read = () => {
  const h = new URLSearchParams(location.hash.slice(1)); A = {};
  for(const [k, v] of h) if(v) A[k] = v.split(",");
};
const write = () => {
  const h = new URLSearchParams(); for(const [k, v] of Object.entries(A)) if(v?.length) h.set(k, v.join(","));
  history.replaceState(null, "", location.pathname + location.search + (h.toString() ? "#" + h : ""));
};

function draw(){
  const qs = Q();
  const others = k => F.list.filter(s => Object.entries(A).every(([k2, v]) => k2 === k || fits(s, k2, v)));
  $("qs").innerHTML = qs.map(q => {
    const base = others(q.k), sel = A[q.k] || [];
    return `<div class="q"><h3><span>${q.title}${auto[q.k] ? ` <small class="muted" style="text-transform:none;letter-spacing:0">· ${esc(auto[q.k])}</small>` : ""}</span>${sel.length ? `<button class="linkish" data-clear="${q.k}">Clear</button>` : ""}</h3>
      <div class="chips">${q.opts.map(o => {
        const on = sel.includes(o.v), n = base.filter(s => fits(s, q.k, [o.v])).length;
        return `<button type="button" class="chip" data-k="${q.k}" data-v="${o.v}" aria-pressed="${on}"${!n && !on ? " disabled" : ""}>${o.icon || ""}${esc(o.label)} <span class="c">${n}</span></button>`;
      }).join("")}</div>${q.k === "region" ? `<button type="button" class="linkish here-btn" id="here">Use my location</button>` : ""}</div>`;
  }).join("");
  const hits = F.list.filter(s => Object.entries(A).every(([k, v]) => fits(s, k, v))).sort((a, b) => b.obs - a.obs);
  const chosen = qs.flatMap(q => (A[q.k] || []).map(v => ({q, o: q.opts.find(o => o.v === v)}))).filter(x => x.o);
  $("left").innerHTML = `<span class="count">${hits.length}<small>left</small></span>
    <span class="answered">${chosen.map(({q, o}) => `<button type="button" class="chip on" data-k="${q.k}" data-v="${o.v}" title="Remove">${esc(o.label)}</button>`).join("")}</span>
    ${chosen.length ? `<button type="button" class="linkish small" id="reset">Start again</button>` : ""}`;
  let body = hits.length ? `<div class="grid">${hits.slice(0, 120).map(s => L.speciesTile(s)).join("")}</div>${hits.length > 120 ? `<p class="muted">and ${hits.length - 120} more — answer another question</p>` : ""}` : "";
  if(!hits.length){
    /* nothing fits everything: show what misses by the fewest answers, and say which */
    const keys = Object.keys(A).filter(k => A[k]?.length);
    const scored = F.list.map(s => ({s, miss: keys.filter(k => !fits(s, k, A[k]))})).filter(x => x.miss.length);
    const least = Math.min(...scored.map(x => x.miss.length));
    const near = scored.filter(x => x.miss.length === least).sort((a, b) => b.s.obs - a.s.obs).slice(0, 60);
    const title = Object.fromEntries(qs.map(q => [q.k, q.title.toLowerCase()]));
    body = near.length ? `<h3 class="near-head">Nothing fits every answer. Closest:</h3><div class="grid">${near.map(({s, miss}) => L.speciesTile(s, `<span class="miss">except ${esc(miss.map(k => title[k]).join(", "))}</span>`)).join("")}</div>` : "";
  }
  $("hits").innerHTML = body;
  $("peek").innerHTML = `${hits.length} left <span aria-hidden="true">↓</span>`;
}

function regionAt(lat, lon){
  const inBox = REG.filter(r => { const [s, w, n, e] = r.bbox; return lat >= s && lat <= n && lon >= w && lon <= e; });
  return inBox.sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]))[0] || null;
}
const bandFor = ft => String(Math.max(0, BANDS.findIndex(([a, b]) => ft >= a && ft < b)));

function locate(){
  if(!navigator.geolocation){ L.toast("This browser can't share a location"); return; }
  L.toast("Finding you…");
  navigator.geolocation.getCurrentPosition(async pos => {
    const {latitude: lat, longitude: lon, altitude} = pos.coords;
    const r = regionAt(lat, lon);
    if(r){ A.region = [r.id]; auto.region = "from your location"; } else L.toast("You're outside the regions in this guide");
    let ft = altitude != null ? altitude * 3.28084 : null;
    if(ft == null && navigator.onLine){
      /* the phone didn't say how high you are: ask a free elevation service, if there's signal */
      try { const j = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${lat.toFixed(5)},${lon.toFixed(5)}`, {signal: AbortSignal.timeout(6000)}).then(x => x.json());
        const m = j.results?.[0]?.elevation; if(m != null) ft = m * 3.28084; } catch(e){}
    }
    if(ft != null){ A.elev = [bandFor(ft)]; auto.elev = `about ${L.num(Math.round(ft / 100) * 100)} ft, from your location`; }
    write(); draw();
  }, () => L.toast("No location — that's fine, pick a region instead"), {enableHighAccuracy: true, timeout: 15000, maximumAge: 600000});
}

async function start(){
  const [fl, regions] = await Promise.all([L.data.flowers(), L.data.json("regions.json")]);
  F = fl; REG = regions.regions;
  const r = L.rng("key " + L.today()), pic = F.list.filter(s => s.photos?.length && L.blooming(s))[0] || F.list[Math.floor(r() * F.list.length)];
  main.innerHTML = `${pic ? `<section class="hero"><div class="frame"><img src="${L.inat(pic.photos[0], "large")}" data-fallback="${L.thumb(pic)}" alt="" crossorigin="anonymous">${L.inatCredit(pic.photos[0])}</div>` : `<section class="hero">`}
    <h1>The key</h1><p class="sub-line">${F.list.length} Cascades wildflowers</p></section>
    <div class="key"><div class="qs" id="qs"></div><div id="results"><div class="left" id="left"></div><div id="hits"></div></div></div>
    <button type="button" class="peek btn" id="peek"></button>`;
  read();
  if(!location.hash){ A.month = [String(L.month())]; auto.month = "today"; write(); }
  draw();
  $("qs").addEventListener("click", e => {
    if(e.target.closest("#here")) return locate();
    const c = e.target.closest("[data-clear]"); if(c){ delete A[c.dataset.clear]; delete auto[c.dataset.clear]; write(); return draw(); }
    const b = e.target.closest("[data-k]"); if(!b || b.disabled) return;
    const {k, v} = b.dataset, q = Q().find(q => q.k === k), sel = A[k] || [];
    A[k] = sel.includes(v) ? sel.filter(x => x !== v) : q.multi ? [...sel, v] : [v];
    if(!A[k].length) delete A[k];
    delete auto[k]; write(); draw();
  });
  $("peek").addEventListener("click", () => $("results").scrollIntoView({behavior: "smooth"}));
  /* the floating count only shows while the results are off screen */
  new IntersectionObserver(([en]) => $("peek").classList.toggle("away", en.isIntersecting), {rootMargin: "0px 0px -40% 0px"}).observe($("results"));
  $("left").addEventListener("click", e => {
    if(e.target.id === "reset"){ A = {}; auto = {}; write(); return draw(); }
    const b = e.target.closest("[data-k]"); if(!b) return;
    A[b.dataset.k] = (A[b.dataset.k] || []).filter(x => x !== b.dataset.v); if(!A[b.dataset.k].length) delete A[b.dataset.k];
    delete auto[b.dataset.k]; write(); draw();
  });
}
start().catch(e => { main.innerHTML = `<p class="muted">Couldn't load the key (${esc(e.message)}).</p>`; });
}
