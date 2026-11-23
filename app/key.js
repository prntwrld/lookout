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

/* birds: size as a silhouette that grows, and the bill's shape */
const SIZE_ICON = Object.fromEntries([["s", 5], ["m", 7], ["l", 9], ["xl", 11]].map(([k, r]) => [k, svg(`<ellipse cx="12" cy="${20 - r * .7}" rx="${r}" ry="${r * .62}"/><circle cx="${12 + r * .7}" cy="${20 - r * 1.25}" r="${r * .32}"/>`)]));
const head = bill => svg(`<circle cx="9" cy="12" r="5.5"/><circle cx="10" cy="10.5" r=".9" fill="currentColor"/>${bill}`);
const BILL_ICON = {
  cone: head(`<path d="M14.3 10l5 2-5 2z"/>`), thin: head(`<path d="M14.4 11.3 22 12l-7.6.7"/>`), stout: head(`<path d="M14.2 10.3 20 12l-5.8 2"/>`),
  hook: head(`<path d="M14.2 10.2c3.5-.4 5.6.8 5.3 3.6-.3-1-1-1.6-1.8-1.6l-3.5.9"/>`), dagger: head(`<path d="M14.4 11.1 23 12l-8.6.9"/>`),
  probe: head(`<path d="M14.4 11.6c3 .2 6 1.2 8.6 3"/>`), duck: head(`<path d="M14.2 10.6c2.5-.2 5.3.3 6.3 1.2.2.6-.1 1.2-1 1.4l-5.3-.2"/>`),
  chisel: head(`<path d="M14.3 10.8 21 11.5v1l-6.7.7"/>`)
};
const BIRD_HAB_ICON = {...HAB_ICON, open: HAB_ICON.meadow, alpine: HAB_ICON.alpine,
  water: svg(`<path d="M2 14c2 0 2-1.5 4-1.5S8 14 10 14s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 19c2 0 2-1.5 4-1.5S8 19 10 19s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/>`),
  coast: svg(`<path d="M2 18c3 0 4-2 7-2s4 2 7 2 4-2 6-2M4 13l4-7 3 4 2-2 5 5"/>`),
  marsh: svg(`<path d="M2 20h20M6 20V9M10 20V6M14 20v-9M18 20V8"/><ellipse cx="6" cy="8" rx="1" ry="2.2"/><ellipse cx="10" cy="5" rx="1" ry="2.2"/>`),
  town: svg(`<path d="M3 21V11l5-4 5 4v10M13 21V8h8v13M2 21h20M6 21v-4h4v4"/>`)};
const BIRD_COLOUR = {k: ["black", "#1d1d1d"], w: ["white", "#f3f2ec"], g: ["grey", "#8a9096"], n: ["brown", "#8a5f3c"], r: ["red or orange", "#cf5a2e"],
  y: ["yellow", "#e8c43a"], b: ["blue", "#4a78c8"], gr: ["green", "#3e8a4e"]};
const bsw = c => `<i class="sw" style="background:${BIRD_COLOUR[c]?.[1] || "#999"}"></i>`;

/* ---------- the keys: each a pack of species and the questions it can answer ---------- */
let REG = [];
/* the regions this key's species are tagged with (a pack built before the regions grew knows only the Cascade ones); never the waters */
const regsWithData = () => { const have = new Set((F?.list || []).flatMap(s => s.regions || [])); return REG.filter(r => r.kind !== "water" && have.has(r.id)); };
const regOpts = () => regsWithData().map(r => ({v: r.id, label: r.name}));
const near = (list, m) => { const n = [m, m === 1 ? 12 : m - 1, m === 12 ? 1 : m + 1]; return n.some(x => list.includes(x)); };
const KEYS = {
  flowers: {name: "Wildflowers", what: "Cascades wildflowers", load: () => L.data.flowers(), months: s => s.bloom, taxa: "47126",
    Q: () => [
      {k: "colour", title: "Flower colour", multi: true, opts: Object.entries(L.COLOUR).map(([v, [name]]) => ({v, label: name, icon: L.sw(v)}))},
      {k: "petals", title: "Petals", multi: true, opts: [["3","3"],["4","4"],["5","5"],["6","6"],["many","Many"],["daisy","Daisy-like"],["irregular","Irregular"],["tiny","Tiny, clustered"]].map(([v, label]) => ({v, label, icon: PETAL_ICON[v]}))},
      {k: "leaf", title: "Leaf shape", multi: true, opts: [["linear","Grass-like"],["lance","Lance"],["oval","Oval"],["heart","Heart or round"],["lobed","Lobed"],["three","In threes"],["palmate","Fingers"],["pinnate","Feathery"],["none","No leaves"]].map(([v, label]) => ({v, label, icon: LEAF_ICON[v]}))},
      {k: "arr", title: "Leaves grow", multi: true, opts: [["basal","From the base"],["alt","Alternate"],["opp","Opposite"],["whorl","Whorled"]].map(([v, label]) => ({v, label, icon: ARR_ICON[v]}))},
      {k: "habitat", title: "Where it's growing", multi: true, opts: [["forest","Forest"],["meadow","Meadow"],["rocky","Rocks"],["wet","Wet ground"],["dry","Dry and open"],["alpine","Alpine"]].map(([v, label]) => ({v, label, icon: HAB_ICON[v]}))},
      {k: "month", title: "Month", opts: L.MON.map((m, i) => ({v: String(i + 1), label: m}))},
      {k: "elev", title: "Elevation", opts: BANDS.map((b, i) => ({v: String(i), label: b[2]}))},
      {k: "region", title: "Region", opts: regOpts()}]},
  birds: {name: "Birds", what: "Pacific Northwest birds", load: () => L.data.birds(), months: s => s.months, byId: true, taxa: "3",
    Q: () => [
      {k: "size", title: "Size", multi: true, opts: [["s","Sparrow or smaller"],["m","Robin to jay"],["l","Crow to duck"],["xl","Goose or bigger"]].map(([v, label]) => ({v, label, icon: SIZE_ICON[v]}))},
      {k: "colour", title: "Colours you can see", multi: true, opts: Object.entries(BIRD_COLOUR).map(([v, [name]]) => ({v, label: name, icon: bsw(v)}))},
      {k: "bill", title: "Bill", multi: true, opts: [["cone","Short and thick"],["thin","Thin and pointed"],["stout","Stout"],["hook","Hooked"],["dagger","Long and straight"],["probe","Long, for probing"],["duck","Flat, like a duck"],["chisel","Chisel, drills wood"]].map(([v, label]) => ({v, label, icon: BILL_ICON[v]}))},
      {k: "habitat", title: "Where it is", multi: true, opts: [["forest","Forest"],["open","Fields, open country"],["water","Lake or river"],["coast","Coast, salt water"],["marsh","Marsh"],["town","Town, feeder"],["alpine","Mountains"]].map(([v, label]) => ({v, label, icon: BIRD_HAB_ICON[v]}))},
      {k: "behaviour", title: "What it's doing", multi: true, opts: [["ground","On the ground"],["trunk","Climbing a trunk"],["swims","Swimming"],["dives","Diving"],["wades","Wading"],["soars","Soaring"],["hovers","Hovering"],["aerial","Catching insects in the air"],["flocks","In a flock"],["night","At night"]].map(([v, label]) => ({v, label}))},
      {k: "month", title: "Month", opts: L.MON.map((m, i) => ({v: String(i + 1), label: m}))},
      {k: "region", title: "Region", opts: regOpts()}]}
};
let K = null, F = null, mode = "flowers";
/* the other trait keys come from data/packs.json; their questions are in each pack's trait file */
const HEX = {w: "#f3f2ec", y: "#e8c43a", o: "#e48a3a", r: "#c8402f", p: "#e08aa8", v: "#8a5bb0", b: "#4a78c8", gr: "#3e8a4e", n: "#8a5f3c", g: "#8a9096", k: "#1d1d1d", t: "#c9a46c", s: "#c9ced3"};
const HEXNAME = {w: "white", y: "yellow", o: "orange", r: "red", p: "pink", v: "purple", b: "blue", gr: "green", n: "brown", g: "grey", k: "black", t: "tan", s: "silver"};
const genericKey = p => ({name: p.name, what: p.what, load: () => L.data.trait(p.id), months: s => s.months, byId: true, qs: [], taxa: p.taxa,
  Q(){ return [...this.qs.map(q => ({k: q.k, title: q.title, multi: q.multi !== false, opts: Object.entries(q.opts).map(([v, label]) => ({v, label,
      icon: q.swatch && HEXNAME[v] === label ? `<i class="sw" style="background:${HEX[v]}"></i>` : ""}))})),
    {k: "month", title: "Month", opts: L.MON.map((m, i) => ({v: String(i + 1), label: m}))},
    {k: "region", title: "Region", opts: regOpts()}]; }});

/* does species s fit answer(s) vals for question k? An unknown never rules a species out. */
function fits(s, k, vals){
  if(!vals?.length) return true;
  if(k === "month"){ const ms = K.months(s); return !ms?.length || near(ms, +vals[0]); }   /* a month either side: seasons vary */
  if(k === "elev"){
    if(!s.elev) return true;
    const [a, b] = BANDS[+vals[0]];
    return s.elev[1] + 500 >= a && s.elev[0] - 500 <= b;
  }
  if(k === "region") return !s.regions?.length || s.regions.includes(vals[0]);
  if(k === "near") return true;   /* near here doesn't rule anything out: what's been seen near you comes first (see draw) */
  const have = s[k] || [];
  return !have.length || vals.some(v => have.includes(v));
}
const tile = (s, extra) => L.speciesTile(K.byId ? {...s, slug: String(s.id)} : s, extra);

/* ---------- near here: what iNaturalist observers have recorded within 2, 10 or 50 km of you, for the key in use.
   Your location is kept on this device for a few hours, so changing keys or reloading keeps it. ---------- */
const RADII = [["2", "Within 2 km"], ["10", "Within 10 km"], ["50", "Within 50 km"]];
const NEAR = {at: null, key: "", sets: {}, name: "", msg: ""};
const nearQ = () => ({k: "near", title: "Recorded near here", opts: RADII.map(([v, label]) => ({v, label}))});
async function loadNear(){
  const here = NEAR.at || L.store.get("lookout-near", null);
  if(!here || Date.now() - here.t > 6 * 36e5 || !K?.taxa || navigator.onLine === false){ NEAR.sets = {}; return; }
  NEAR.at = here;
  const key = `${mode}|${here.lat}|${here.lon}`; if(NEAR.key === key) return;
  NEAR.key = key; NEAR.sets = {};
  /* the place's name: the smallest of iNaturalist's places around you (a park, a beach), else the county */
  L.nat("places/nearby", {nelat: here.lat + .001, nelng: here.lon + .001, swlat: here.lat - .001, swlng: here.lon - .001, per_page: 20}).then(j => {
    const c = (j.results?.community || []).sort((a, b) => (a.bbox_area || 1) - (b.bbox_area || 1))[0], st = (j.results?.standard || []).sort((a, b) => (a.bbox_area || 1) - (b.bbox_area || 1))[0];
    NEAR.name = c && c.bbox_area < .05 ? c.name.trim() : st ? `${st.name}${st.admin_level === 20 ? " County" : ""}` : "";
    if(NEAR.name && mode !== "here" && mode !== "pick") draw();
  }).catch(() => {});
  const got = await Promise.all(RADII.map(([r]) => L.nat("observations/species_counts", {lat: here.lat, lng: here.lon, radius: r, taxon_id: K.taxa, verifiable: "true", per_page: 500})
    .then(j => [r, new Set(j.results.map(x => x.taxon.id))]).catch(() => null)));
  if(NEAR.key !== key) return;
  for(const x of got) if(x) NEAR.sets[x[0]] = x[1];
}

/* ---------- the state: the key and its answers, kept in the address so the back button and a reload keep them ---------- */
let A = {}, auto = {};
const read = () => {
  const h = new URLSearchParams(location.hash.slice(1)); A = {};
  mode = KEYS[h.get("key")] || ["here", "pick"].includes(h.get("key")) ? h.get("key") : "pick";
  for(const [k, v] of h) if(v && k !== "key") A[k] = v.split(",");
};
const write = () => {
  const h = new URLSearchParams(); if(mode !== "pick") h.set("key", mode);
  for(const [k, v] of Object.entries(A)) if(v?.length) h.set(k, v.join(","));
  history.replaceState(null, "", location.pathname + location.search + (h.toString() ? "#" + h : ""));
};

function draw(){
  $("results").parentElement.classList.toggle("picking", mode === "pick");
  if(mode === "pick") return drawPick();
  if(mode === "here") return drawHere();
  const qs = K.Q();
  const nearOn = !!Object.keys(NEAR.sets).length;
  if(!nearOn) delete A.near;
  const others = k => F.list.filter(s => Object.entries(A).every(([k2, v]) => k2 === k || fits(s, k2, v)));
  $("qs").innerHTML = qs.map(q => {
    const base = others(q.k), sel = A[q.k] || [];
    return `<div class="q"><h3><span>${q.title}${auto[q.k] ? ` <small class="muted" style="text-transform:none;letter-spacing:0">· ${esc(auto[q.k])}</small>` : ""}</span>${sel.length ? `<button class="linkish" data-clear="${q.k}">Clear</button>` : ""}</h3>
      <div class="chips">${q.opts.map(o => {
        const on = sel.includes(o.v), n = base.filter(s => fits(s, q.k, [o.v])).length;
        return `<button type="button" class="chip" data-k="${q.k}" data-v="${o.v}" aria-pressed="${on}"${!n && !on ? " disabled" : ""}>${o.icon || ""}${esc(o.label)} <span class="c">${n}</span></button>`;
      }).join("")}</div></div>`;
  }).join("");
  /* where you are: one switch, and once it's on, how far around you to look */
  const pool = F.list.filter(s => Object.entries(A).every(([k, v]) => k === "near" || fits(s, k, v)));
  $("qs").insertAdjacentHTML("afterbegin", `<div class="q here-q"><h3><span>Where you are</span>${nearOn || NEAR.at ? `<button class="linkish" data-loc-off>Stop using it</button>` : ""}</h3>
    ${nearOn ? `<p class="small here-on"><b>Using your location</b>${NEAR.name ? ` · ${esc(NEAR.name)}` : ""}</p>
      <div class="chips">${RADII.map(([v, label]) => `<button type="button" class="chip" data-nr="${v}" aria-pressed="${A.near?.[0] === v}">Seen ${label.toLowerCase()} <span class="c">${pool.filter(s => NEAR.sets[v]?.has(s.id)).length}</span></button>`).join("")}</div>
      <p class="muted small" style="margin:8px 0 0">What's been seen near you comes first; everything else that fits stays in the list, after it.</p>`
    : `<button type="button" class="chip" id="here">Use my location</button><p class="muted small" style="margin:8px 0 0">Fills in your region and elevation, and puts what's been seen around you first.</p>`}
    ${NEAR.msg ? `<p class="small" style="margin:8px 0 0">${esc(NEAR.msg)}</p>` : ""}</div>`);
  if(mode !== "flowers") $("qs").insertAdjacentHTML("afterbegin", `<p class="small" style="margin:0 0 4px"><button type="button" class="linkish" data-kg="${mode}" data-near>Or see ${esc(K.name.toLowerCase())} recorded near you</button></p>`);
  const hits = F.list.filter(s => Object.entries(A).every(([k, v]) => fits(s, k, v))).sort((a, b) => b.obs - a.obs);
  const chosen = qs.flatMap(q => (A[q.k] || []).map(v => ({q, o: q.opts.find(o => o.v === v)}))).filter(x => x.o);
  const seenN = nearOn && A.near?.[0] ? hits.filter(s => NEAR.sets[A.near[0]]?.has(s.id)).length : null;
  $("left").innerHTML = `<span class="count">${hits.length}<small>left${seenN != null ? `, ${seenN} seen near you` : ""}</small></span>
    <span class="answered">${chosen.map(({q, o}) => `<button type="button" class="chip on" data-k="${q.k}" data-v="${o.v}" title="Remove">${esc(o.label)}</button>`).join("")}</span>
    ${chosen.length ? `<button type="button" class="linkish small" id="reset">Start again</button>` : ""}`;
  const set = nearOn && A.near?.[0] ? NEAR.sets[A.near[0]] : null;
  const seen = set ? hits.filter(s => set.has(s.id)) : [], rest = set ? hits.filter(s => !set.has(s.id)) : hits;
  const grid = (l, n) => `<div class="grid">${l.slice(0, n).map(s => tile(s)).join("")}</div>${l.length > n ? `<p class="muted">and ${l.length - n} more — answer another question</p>` : ""}`;
  const radius = set ? RADII.find(r => r[0] === A.near[0])[1].toLowerCase() : "";
  let body = !hits.length ? "" : set ? (seen.length ? `<h3 class="near-head">Seen ${radius} of you <span class="muted">${seen.length}</span></h3>${grid(seen, 120)}` : `<p class="muted">Nothing that fits has been recorded ${radius} of you yet.</p>`)
      + (!rest.length ? "" : A.region?.length
        /* a region is known: the rest are in its range here */
        ? `<h3 class="near-head">Also in its range here <span class="muted">${rest.length}</span></h3><p class="muted small" style="margin:-6px 0 12px">Not recorded nearby yet, but they fit your answers and live in this region.</p>${grid(rest, Math.max(24, 120 - seen.length))}`
        /* no region (you're outside the guide's): what's been seen a little farther out, then the rest */
        : (() => { const wide = NEAR.sets["50"] && A.near[0] !== "50" ? rest.filter(s => NEAR.sets["50"].has(s.id)) : [], far = rest.filter(s => !wide.includes(s));
            return (wide.length ? `<h3 class="near-head">Seen farther out, within 50 km <span class="muted">${wide.length}</span></h3>${grid(wide, 60)}` : "")
              + (far.length ? `<h3 class="near-head">Elsewhere in the Northwest <span class="muted">${far.length}</span></h3><p class="muted small" style="margin:-6px 0 12px">Not recorded near you; they fit your other answers.</p>${grid(far, 24)}` : ""); })())
    : grid(hits, 120);
  if(!hits.length){
    /* nothing fits everything: show what misses by the fewest answers, and say which */
    const keys = Object.keys(A).filter(k => A[k]?.length);
    const scored = F.list.map(s => ({s, miss: keys.filter(k => !fits(s, k, A[k]))})).filter(x => x.miss.length);
    const least = Math.min(...scored.map(x => x.miss.length));
    const close = scored.filter(x => x.miss.length === least).sort((a, b) => b.s.obs - a.s.obs).slice(0, 60);
    const title = Object.fromEntries(qs.map(q => [q.k, q.title.toLowerCase()]));
    body = close.length ? `<h3 class="near-head">Nothing fits every answer. Closest:</h3><div class="grid">${close.map(({s, miss}) => tile(s, `<span class="miss">except ${esc(miss.map(k => title[k]).join(", "))}</span>`)).join("")}</div>` : "";
  }
  $("hits").innerHTML = body;
  $("peek").innerHTML = `${hits.length} left <span aria-hidden="true">↓</span>`;
}

/* ---------- Here & now: everything recorded near you (or in a region), by group, live from iNaturalist ---------- */
let packs = {}, page = 1, token = 0;
async function drawHere(more = false){
  const g = A.g?.[0] || "all", r = A.r?.[0] || "5", when = A.when?.[0] || "month", at = A.at?.length === 2 ? A.at.join(",") : A.at?.[0], reg = REG.find(x => x.id === A.region?.[0]);
  const q = (k, title, opts, sel, extra = "") => `<div class="q"><h3><span>${title}${auto[k] ? ` <small class="muted" style="text-transform:none;letter-spacing:0">· ${esc(auto[k])}</small>` : ""}</span></h3>
    <div class="chips">${opts.map(([v, label]) => `<button type="button" class="chip" data-h="${k}" data-v="${v}" aria-pressed="${v === sel}">${esc(label)}</button>`).join("")}</div>${extra}</div>`;
  const alt = KEYS[g] || PRESET[g] ? `<p class="small" style="margin:0 0 4px"><button type="button" class="linkish" data-kg="${g}">Answer questions about it instead</button></p>`
    : g === "all" || L.group(g).sub ? `<p class="small" style="margin:0 0 4px"><button type="button" class="linkish" data-kg="${g}">Pick what kind by picture instead</button></p>` : "";
  if(!more) $("qs").innerHTML = alt + q("region", "Where", [["", "All of the Pacific Northwest"], ...REG.map(x => [x.id, x.name])], at ? "-" : A.region?.[0] || "", `<button type="button" class="linkish here-btn" id="here">${at ? "Near you ✓ · update" : "Use my location"}</button>`)
    + (at ? q("r", "Within", [["1", "1 km"], ["5", "5 km"], ["25", "25 km"]], r) : "")
    + q("when", "When", [["month", `In ${L.MONTHS[L.month() - 1]}`], ["year", "Any time of year"]], when);
  const me = ++token;
  /* nowhere chosen: the whole region (Washington, Oregon, Idaho and British Columbia) */
  const placeName = at ? "near you" : reg ? "in " + reg.name : "in the Pacific Northwest";
  if(!more){ page = 1; $("hits").innerHTML = `<p class="muted">Asking iNaturalist what's been seen ${esc(placeName)}…</p>`; }
  const [lat, lng] = at ? at.split(",").map(Number) : [];
  const where = at ? {lat, lng, radius: r} : reg ? {swlat: reg.bbox[0], swlng: reg.bbox[1], nelat: reg.bbox[2], nelng: reg.bbox[3]} : {place_id: L.PNW};
  try {
    const j = await L.nat("observations/species_counts", {...where, verifiable: "true", per_page: 60, page, ...(L.group(g).taxa ? {taxon_id: L.group(g).taxa} : {}), ...(when === "month" ? {month: L.month()} : {})});
    if(me !== token) return;
    const pick = t => packs.flowers?.byId[t.id] ? L.speciesTile(packs.flowers.byId[t.id]) : packs.birds?.byId[t.id] ? L.speciesTile({...packs.birds.byId[t.id], slug: String(t.id)}) : L.liveTile(L.taxonCard(t));
    const tiles = j.results.filter(x => ["species", "subspecies", "variety", "form"].includes(x.taxon.rank)).map(x => pick(x.taxon)).join("");
    $("left").innerHTML = `<span class="count">${L.num(j.total_results)}<small>recorded ${at ? `within ${r} km` : esc(placeName)}</small></span>`;
    if(!more) $("hits").innerHTML = `<div class="grid" id="hgrid"></div><p id="hmore-p" style="margin-top:22px"><button type="button" class="btn ghost" id="hmore">More</button></p>`;
    $("hgrid").insertAdjacentHTML("beforeend", tiles);
    $("hmore-p").hidden = page * 60 >= j.total_results;
    if(!$("hgrid").children.length) $("hits").innerHTML = `<p class="muted">Nothing recorded here${when === "month" ? " this month" : ""}. Try a wider circle${when === "month" ? " or any time of year" : ""}.</p>`;
    $("peek").innerHTML = `${L.num(j.total_results)} here <span aria-hidden="true">↓</span>`;
    L.fillPhotos($("hits"));
  } catch(e){
    if(me !== token) return;
    $("hits").innerHTML = `<p class="muted">Here & now needs a connection to iNaturalist. The Wildflowers and Birds keys work without one.</p>`;
  }
}

function regionAt(lat, lon){
  const inBox = regsWithData().filter(r => { const [s, w, n, e] = r.bbox; return lat >= s && lat <= n && lon >= w && lon <= e; });
  return inBox.sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]))[0] || null;
}
const bandFor = ft => String(Math.max(0, BANDS.findIndex(([a, b]) => ft >= a && ft < b)));

function locate(){
  if(!navigator.geolocation){ L.toast("This browser can't share a location"); return; }
  if(mode === "here") L.toast("Finding you…"); else { NEAR.msg = "Finding you…"; draw(); }
  navigator.geolocation.getCurrentPosition(async pos => {
    const {latitude: lat, longitude: lon, altitude} = pos.coords;
    if(mode === "here"){ A.at = [`${lat.toFixed(4)},${lon.toFixed(4)}`]; delete A.region; write(); return draw(); }
    const r = regionAt(lat, lon);
    NEAR.msg = r ? "" : `This key's species haven't been sorted by region where you are yet, so region is left open. What's been seen near you comes first.`;
    if(r){ A.region = [r.id]; auto.region = "from your location"; }
    /* and what's been recorded around you, if there's signal: 10 km to start */
    NEAR.at = {lat: +lat.toFixed(3), lon: +lon.toFixed(3), t: Date.now()}; L.store.set("lookout-near", NEAR.at); NEAR.key = "";
    await loadNear();
    if(NEAR.sets["10"]){ A.near = ["10"]; auto.near = "from your location"; }
    else if(navigator.onLine === false) NEAR.msg = (NEAR.msg ? NEAR.msg + " " : "") + "With no signal, what's been seen near you can't be looked up; region and elevation still work.";
    if(mode === "flowers"){
      let ft = altitude != null ? altitude * 3.28084 : null;
      if(ft == null && navigator.onLine){
        /* the phone didn't say how high you are: ask a free elevation service, if there's signal */
        try { const j = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${lat.toFixed(5)},${lon.toFixed(5)}`, {signal: AbortSignal.timeout(6000)}).then(x => x.json());
          const m = j.results?.[0]?.elevation; if(m != null) ft = m * 3.28084; } catch(e){}
      }
      if(ft != null){ A.elev = [bandFor(ft)]; auto.elev = `about ${L.num(Math.round(ft / 100) * 100)} ft, from your location`; }
    }
    write(); draw();
  }, () => { NEAR.msg = "Your browser didn't share a location. Allow it for this site, or pick a region below."; draw(); }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 600000});
}

async function setMode(m){
  mode = m; auto = {};
  /* month and region carry over; the rest belongs to the key you were using */
  A = Object.fromEntries(Object.entries(A).filter(([k]) => k === "region" || k === "near" || (k === "month" && m !== "here")));
  if(m !== "here" && m !== "pick"){
    K = KEYS[m];
    try { F = packs[m] ||= await K.load(); }
    catch(e){ mode = "here"; A.g = [m]; write(); return draw(); }   /* a pack that isn't built yet: show what's recorded instead */
    if(F.questions) K.qs = F.questions;
    await loadNear();
  }
  if(m !== "here" && m !== "pick" && !A.month){ A.month = [String(L.month())]; auto.month = "today"; }
  write(); draw();
}
/* "What is it?": the same groups as Living things. A group with a trait key (wildflowers, birds, mammals, mushrooms…)
   asks questions; everything else narrows to what's been recorded where you are */
const groupSel = () => mode === "here" || mode === "pick" ? A.g?.[0] || "all" : A.sg?.[0] || mode;
const drawGroups = () => {
  $("kgroups").innerHTML = L.groupChips(groupSel(), "data-kg");
  const g = L.group(groupSel());
  $("what").textContent = mode === "pick" ? (g.k === "all" ? "What is it? Pick what it looks like" : `${g.name}: which kind?`)
    : mode === "here" ? (g.k === "all" ? "Anything recorded around you" : `${g.name} recorded around you`) : `${F.list.length} ${K.what}`;
};
/* the tide-pool sub-groups open the tide-pool key with their kind already chosen */
const PRESET = {stars: {kind: ["star", "urchin", "cucumber"]}, anemones: {kind: ["anemone", "jelly", "pen"]}, crabs: {kind: ["crab", "hermit", "small", "barnacle"]},
  nudibranchs: {kind: ["nudibranch"]}, chitons: {kind: ["chiton"]}, sponges: {kind: ["squirt"]}};
async function pickGroup(v, near){
  const g = L.group(v);
  if(near){                                         /* "recorded near you" for this group */
    if(mode !== "here") await setMode("here");
    if(v === "all") delete A.g; else A.g = [v];
    write(); draw();
  } else if(PRESET[v] && KEYS[g.top.k]){
    await setMode(g.top.k); Object.assign(A, PRESET[v], {sg: [v]}); write(); draw();
  } else if(KEYS[v]) await setMode(v);
  else if(v === "all" || g.sub){                    /* a broad group: pick which kind, by picture */
    await setMode("pick"); if(v === "all") delete A.g; else A.g = [v]; write(); draw();
  } else {
    await setMode("here"); A.g = [v]; write(); draw();
  }
  drawGroups();
}

/* ---------- the picture choice: what kind is it? ---------- */
let IDX = {};
const idxOf = k => { const g = L.group(k);
  if(IDX[k]) return IDX[k];
  const kids = (g.sub || []).map(x => idxOf(x.k)).filter(Boolean);       /* a broad group: its keys added up */
  return kids.length ? {n: kids.reduce((a, b) => a + b.n, 0), top: kids.flatMap(x => x.top.slice(0, 1)).concat(kids[0].top.slice(1)).slice(0, 4)} : null; };
function drawPick(){
  const g = A.g?.[0] || "all", kids = g === "all" ? L.GROUPS.filter(x => x.k !== "all") : L.group(g).sub || [];
  $("qs").innerHTML = "";
  $("left").innerHTML = `<span class="count" style="font-size:28px">Pick what it looks like</span>
    <button type="button" class="linkish small" data-kg="${g}" data-near>Or see ${g === "all" ? "everything" : esc(L.group(g).name.toLowerCase())} recorded near you</button>`;
  $("hits").innerHTML = `<div class="kinds">${kids.map(x => { const i = idxOf(x.k);
    return `<button type="button" class="kind" data-kg="${x.k}"><span class="pics">${(i?.top || []).slice(0, 4).map(id => `<img src="${L.thumb({id})}" alt="" loading="lazy">`).join("")}</span>
      <b>${esc(x.name)}</b>${i ? `<i>${L.num(i.n)} species${x.sub ? ` · ${x.sub.length} kinds` : ""}</i>` : `<i>recorded near you</i>`}</button>`; }).join("")}</div>`;
  $("peek").innerHTML = "";
}

async function start(){
  const regions = await L.data.json("regions.json"); REG = regions.regions;
  for(const p of await L.data.packList()) KEYS[p.id] = genericKey(p);
  IDX = await L.data.json("packs/index.json").catch(() => ({}));
  const [fl, bi] = await Promise.all([L.data.flowers().catch(() => null), L.data.birds().catch(() => null)]);
  packs = {flowers: fl, birds: bi};
  const r = L.rng("key " + L.today()), pool = [...(fl?.list || []), ...(bi?.list || [])].filter(s => s.photos?.length), pic = pool[Math.floor(r() * pool.length)];
  main.innerHTML = `${pic ? `<section class="hero short"><div class="frame" data-hide-broken><a href="${L.speciesHref(bi?.byId[pic.id] ? {id: pic.id} : pic)}"><img src="${L.photoSrc(pic.photos[0], "large")}" data-fallback="${L.thumb(pic)}" alt="${esc(pic.common || pic.sci)}"></a>${L.photoCredit(pic.photos[0])}</div>` : `<section class="hero">`}
    <h1>The key</h1><p class="sub-line" id="what"></p></section>
    <div class="kgroups" id="kgroups"></div>
    <div class="key"><div class="qs" id="qs"></div><div id="results"><div class="left" id="left"></div><div id="hits"></div></div></div>
    <button type="button" class="peek btn" id="peek"></button>`;
  const hadHash = !!location.hash;
  read();
  const keep = {...A};
  await setMode(mode);
  if(hadHash){ A = keep; auto = {}; write(); draw(); }
  drawGroups();
  /* a group with a trait key opens on its questions; a link there switches to "recorded near you", and back */
  main.addEventListener("click", e => { const b = e.target.closest("[data-kg]"); if(b){ pickGroup(b.dataset.kg, b.hasAttribute("data-near")); if(b.closest("#hits")) $("kgroups").scrollIntoView({behavior: "smooth"}); } });
  $("qs").addEventListener("click", e => {
    if(e.target.closest("#here")) return locate();
    if(e.target.closest("[data-loc-off]")){
      NEAR.at = null; NEAR.sets = {}; NEAR.key = ""; NEAR.name = ""; NEAR.msg = ""; L.store.set("lookout-near", null);
      for(const k of ["near", "region", "elev"]) if(auto[k] || k === "near"){ delete A[k]; delete auto[k]; }
      write(); return draw();
    }
    const nr = e.target.closest("[data-nr]"); if(nr){ A.near = [nr.dataset.nr]; delete auto.near; write(); return draw(); }
    const h = e.target.closest("[data-h]");
    if(h){ const {h: k, v} = h.dataset; A[k] = v ? [v] : []; if(k === "region") delete A.at; if(!A[k].length) delete A[k]; delete auto[k]; write(); return draw(); }
    const c = e.target.closest("[data-clear]"); if(c){ delete A[c.dataset.clear]; delete auto[c.dataset.clear]; write(); return draw(); }
    const b = e.target.closest("[data-k]"); if(!b || b.disabled) return;
    const {k, v} = b.dataset, q = [...K.Q(), nearQ()].find(q => q.k === k), sel = A[k] || [];
    A[k] = sel.includes(v) ? sel.filter(x => x !== v) : q.multi ? [...sel, v] : [v];
    if(!A[k].length) delete A[k];
    delete auto[k]; write(); draw();
  });
  $("hits").addEventListener("click", e => { if(e.target.id === "hmore"){ page++; drawHere(true); } });
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
