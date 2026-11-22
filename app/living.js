/* Lookout — Living things: every plant and animal recorded in the Pacific Northwest (living/), and each species
   (living/?id=<iNaturalist number>, or ?id=<name> for the wildflower pack).
   The list and most species pages come live from iNaturalist. The 300 Cascades wildflowers in data/ add their
   flowering months, elevations and the key's traits, and keep working with no signal. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
const id = new URLSearchParams(location.search).get("id");
document.body.insertAdjacentHTML("beforeend", L.footer());

const ONE = {Aves: "Bird", Mammalia: "Mammal", Plantae: "Plant", Fungi: "Fungus", Insecta: "Insect", Amphibia: "Amphibian", Reptilia: "Reptile",
  Actinopterygii: "Fish", Mollusca: "Mollusc", Arachnida: "Arachnid", Animalia: "Animal", Chromista: "Seaweed or kelp", Protozoa: "Slime mould"};
const PETALS = {"3": "three", "4": "four", "5": "five", "6": "six", many: "many", daisy: "a daisy-like head", irregular: "irregular (pea, orchid or lipped)", tiny: "tiny, in clusters"};
const LEAF = {linear: "grass-like", lance: "lance-shaped", oval: "oval", heart: "heart-shaped or round", lobed: "lobed", three: "in threes", palmate: "fanned like fingers", pinnate: "feathery or fern-like", none: "no green leaves"};
const ARR = {basal: "from the base", alt: "alternate", opp: "opposite", whorl: "whorled", none: ""};
const HAB = {forest: "forest", meadow: "meadows", rocky: "rocks and talus", wet: "wet ground", dry: "dry open slopes", alpine: "near or above treeline"};
const BIRD = {size: {s: "sparrow-sized or smaller", m: "robin- to jay-sized", l: "crow- to duck-sized", xl: "goose-sized or bigger"},
  bill: {cone: "short and thick", thin: "thin and pointed", stout: "stout", hook: "hooked", dagger: "long and straight", probe: "long and thin, for probing", duck: "flat, like a duck's", chisel: "a chisel, for drilling wood"},
  colour: {k: "black", w: "white", g: "grey", n: "brown", r: "red or orange", y: "yellow", b: "blue", gr: "green"},
  behaviour: {ground: "feeds on the ground", trunk: "climbs tree trunks", swims: "swims", dives: "dives", wades: "wades", soars: "soars", hovers: "hovers", aerial: "catches insects in flight", flocks: "often in flocks", night: "out at night"},
  habitat: {forest: "forest", open: "fields and open country", water: "lakes and rivers", coast: "coast and salt water", marsh: "marshes", town: "towns and feeders", alpine: "mountains"}};
const list = (codes, names) => (codes || []).map(c => names[c]).filter(Boolean).join(", ");
const plain = h => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const shorten = (t, n = 520) => { if(t.length <= n) return t; const c = t.slice(0, n), e = c.lastIndexOf(". "); return e > 160 ? c.slice(0, e + 1) : c.replace(/\s\S*$/, "…"); };
const wikiTitle = u => u ? decodeURIComponent(u.split("/wiki/")[1] || "").replace(/_/g, " ") : "";

/* ---------- one species, from the pack, from iNaturalist, or both ---------- */
async function loadSpecies(key, F){
  const pack = F?.bySlug[key] || F?.byId[key] || null;
  const tid = pack?.id || (/^\d+$/.test(key) ? +key : null);
  let t = null;
  try {
    if(tid) t = (await L.nat("taxa/" + tid)).results?.[0];
    else t = (await L.nat("taxa", {q: key.replace(/-/g, " "), rank: "species,subspecies,variety", per_page: 1})).results?.[0];
  } catch(e){}
  if(!pack && !t) return null;
  const s = pack ? {...pack, pack: true} : {id: t.id, sci: t.name, common: L.cap(t.preferred_common_name || ""), photos: [], summary: "", wiki: "", family: ""};
  if(t){
    const anc = t.ancestors || [];
    s.group = t.iconic_taxon_name || s.group || "";
    s.family ||= anc.find(a => a.rank === "family")?.name || "";
    s.order = anc.find(a => a.rank === "order")?.name || "";
    s.genusId = anc.find(a => a.rank === "genus")?.id;
    s.ancestorIds = [...(t.ancestor_ids || []), t.id];
    s.anc = anc;
    s.cons = t.conservation_statuses;
    s.summary ||= shorten(plain(t.wikipedia_summary));
    s.wiki ||= wikiTitle(t.wikipedia_url);
    /* photos (up to 12): iNaturalist's own picks first (chosen to show the species), then Wikipedia's lead picture, then the region's
       sightings; then the better-looking ones forward, so a night-camera frame or a far-off speck doesn't lead */
    const cands = [], seen = new Set(), add = (p, keep) => { const k = p && (p.id || p.src); if(p && !seen.has(k)){ seen.add(k); cands.push(keep ? {...p, keep: true} : p); } };
    (t.taxon_photos || []).forEach(x => add(L.openPhoto(x.photo), true));
    if(cands.length < 2) add(await L.wikiLead(s.wiki), true);
    if(pack) s.photos.forEach(p => add(p));
    if(cands.length < 12){
      try { const j = await L.nat("observations", {taxon_id: t.id, photo_license: L.LICENSES, quality_grade: "research", per_page: 30, place_id: L.PNW});
        j.results.forEach(o => add(L.openPhoto(o.photos?.[0]))); } catch(e){}
    }
    /* the region's recent sightings rather than its most-voted (which run to book pages and cameras) */
    const ranked = await L.rankPhotos(cands);
    if(ranked.length) s.photos = ranked.slice(0, 12);
  }
  if(pack) s.group ||= "Plantae";
  return s;
}

/* ---------- where on your list to see it ---------- */
function whereToSee(s, P){
  const out = [];
  for(const p of P.list){
    const months = Object.entries(p.seen || {}).filter(([, ids]) => ids.includes(s.id)).map(([m]) => +m).sort((a, b) => a - b);
    if(months.length){ out.push({p, score: 10 + months.length, why: `Recorded near the trailhead in ${months.map(m => L.MON[m - 1]).join(", ")}`}); continue; }
    if(!s.regions?.includes(p.region) || !s.elev || p.high_ft == null) continue;
    const lo = Math.max(0, p.high_ft - (p.gain_ft || 0)), hi = p.high_ft;
    if(hi < s.elev[0] - 300 || lo > s.elev[1] + 300) continue;
    if(!s.bloom?.some(m => L.inSeason(p, m))) continue;
    out.push({p, score: 1 + (p.books?.length || 0) / 10, why: `In its range here: ${L.num(s.elev[0])}–${L.feet(s.elev[1])}, flowering ${L.bloomText(s.bloom.filter(m => L.inSeason(p, m)))}`});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

const monthBar = (on, m, shade) => `<div class="months">${L.MON.map((n, i) => {
  const a = shade ? shade[i] : on.includes(i + 1) ? 1 : 0;
  return `<span class="${a > .12 ? "on" : ""}${i + 1 === m ? " now" : ""}"${shade && a > .12 ? ` style="opacity:${(.35 + .65 * a).toFixed(2)}"` : ""} title="${L.MONTHS[i]}">${n[0]}</span>`;
}).join("")}</div>`;

/* ---------- classification: class › order › family › genus, each a page of its own ---------- */
const TREE = ["class", "order", "family", "genus"];
const RANK = {kingdom: "Kingdom", phylum: "Phylum", class: "Class", subclass: "Subclass", order: "Order", superfamily: "Superfamily", family: "Family",
  subfamily: "Subfamily", tribe: "Tribe", genus: "Genus", subgenus: "Subgenus", section: "Section", complex: "Species complex"};
const sciName = a => a.rank_level <= 20 ? `<i>${esc(a.name)}</i>` : esc(a.name);
const MAJOR = ["kingdom", "phylum", "class", "order", "family", "genus"];
const taxLink = a => `<a href="${L.speciesHref(a)}">${sciName(a)}</a>${a.preferred_common_name ? ` <span class="muted small">${esc(L.cap(a.preferred_common_name).toLowerCase())}</span>` : ""}`;
/* closed, it names the family and genus; open, every main rank from kingdom down, each on its own line */
const treeLine = anc => {
  const l = (anc || []).filter(a => MAJOR.includes(a.rank)); if(!l.length) return "";
  const head = l.filter(a => a.rank === "family" || a.rank === "genus");
  const shut = (head.length ? head : l.slice(-2)).map(a => `${RANK[a.rank]} ${sciName(a)}`).join(" · ");
  return `<details class="tree"><summary>${shut}</summary><dl>${l.map(a => `<dt>${RANK[a.rank]}</dt><dd>${taxLink(a)}</dd>`).join("")}</dl></details>`;
};

/* ---------- conservation status: the IUCN Red List, and any listing here that says it's at risk (as in Myriad) ---------- */
const IUCN = {LC: "Least Concern", NT: "Near Threatened", VU: "Vulnerable", EN: "Endangered", CR: "Critically Endangered", EW: "Extinct in the Wild", EX: "Extinct", DD: "Data Deficient"};
const WHERE = {46: "Washington", 10: "Oregon", 7085: "British Columbia", 6712: "Canada", 1: "the United States"};
const NS = {X: "Extirpated", H: "Possibly extirpated", 1: "Critically imperiled", 2: "Imperiled", 3: "Vulnerable"};
const USF = {E: "Endangered", T: "Threatened", C: "A candidate for listing"};
function statusText(cs){
  cs = cs || [];
  const red = cs.find(c => /IUCN/i.test(c.authority || "") && !c.place), code = String(red?.status || "").toUpperCase();
  /* NatureServe's ranking in each state or province (the most severe, where it has several), and the laws of Canada and the US */
  const worst = {}, laws = [];
  for(const c of cs){
    const id = c.place?.id, auth = c.authority || "";
    if(/NatureServe/i.test(auth) && [46, 10, 7085].includes(id)){
      const m = /^S([XH1-3])/i.exec(String(c.status || "").toUpperCase()); if(!m) continue;
      const r = {X: 0, H: 0.5}[m[1]] ?? +m[1];
      if(worst[id] == null || r < worst[id].r) worst[id] = {r, what: NS[m[1]]};
    }
    else if(id === 6712 && /Species at Risk/i.test(auth)) laws.push(`${L.cap(String(c.status_name || c.status).toLowerCase())} in Canada (Species at Risk Act)`);
    else if(id === 1 && /Fish & Wildlife/i.test(auth) && USF[String(c.status).toUpperCase()]) laws.push(`${USF[String(c.status).toUpperCase()]} in the United States (Endangered Species Act)`);
  }
  const here = {};
  for(const [id, w] of Object.entries(worst)) (here[w.what] ||= []).push(WHERE[id]);
  const local = [...new Set(laws), ...Object.entries(here).map(([w, pls]) => `${w} in ${andList(pls)}`)];
  if(!IUCN[code] && !local.length) return "";
  return `${IUCN[code] ? `${IUCN[code]} <span class="muted small">on the IUCN Red List</span>` : ""}${IUCN[code] && local.length ? "<br>" : ""}${local.length ? `<span class="${IUCN[code] ? "muted small" : ""}">${esc(local.join("; "))}</span>` : ""}`;
}

/* ---------- where it lives: GBIF's records as hexagons over the map, fitted to the Pacific Northwest (as in Myriad) ---------- */
const getJ = url => fetch(url, {signal: AbortSignal.timeout(15000)}).then(r => { if(!r.ok) throw new Error(r.status); return r.json(); });
const KINGDOM = {Plantae: "Plantae", Fungi: "Fungi", Chromista: "Chromista", Protozoa: "Protozoa"};
async function lifeMap(box, sci, taxonId, places, iconic = ""){
  const Lf = window.L, el = box.querySelector(".mapbox"), legend = box.querySelector(".legend");
  if(!Lf || !el || navigator.onLine === false) return;
  /* the same name in the same kingdom only, so a plant never borrows an animal's records */
  const kingdom = KINGDOM[iconic] || (iconic ? "Animalia" : "");
  const key = await getJ("https://api.gbif.org/v1/species/match?strict=true&name=" + encodeURIComponent(sci) + (kingdom ? "&kingdom=" + kingdom : ""))
    .then(m => ["EXACT", "FUZZY"].includes(m.matchType) && (!kingdom || m.kingdom === kingdom) && m.usageKey).catch(() => null);
  const caps = key ? await getJ(`https://api.gbif.org/v2/map/occurrence/density/capabilities.json?taxonKey=${key}`).catch(() => null) : null;
  box.hidden = false;
  const mine = `<span><i></i>Your places</span>`;
  /* no GBIF: iNaturalist's grid instead */
  if(!caps?.total){
    if(!L.rangeMap) return void (box.hidden = true);
    L.rangeMap(el, taxonId, places);
    legend.innerHTML = `<span><i class="grid-key"></i>Research-grade sightings on iNaturalist</span>${mine}`;
    return;
  }
  const m = Lf.map(el, {scrollWheelZoom: false, maxZoom: 12});
  Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 12, crossOrigin: "anonymous", className: "base-tiles",
    attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`}).addTo(m);
  Lf.tileLayer(`https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?taxonKey=${key}&bin=hex&hexPerTile=30&style=green.poly`,
    {maxZoom: 12, opacity: .9, className: "gbif-tiles", attribution: `records © <a href="https://www.gbif.org/species/${key}" target="_blank" rel="noopener">GBIF</a>`}).addTo(m);
  const done = L.log.all();
  for(const p of places) Lf.marker([p.pin.lat, p.pin.lon], {title: p.name, icon: Lf.divIcon({className: "", html: `<span class="pin${done[p.id] ? " done" : ""}"></span>`, iconSize: [14, 14]})})
    .addTo(m).bindPopup(`<a class="pop" href="${L.placeHref(p.id)}"><b>${esc(p.name)}</b><span>${esc(L.KIND[p.kind] || "")}</span></a>`);
  /* the Pacific Northwest, or less of it if that's all it lives in; somewhere else entirely, all of its range.
     (GBIF gives longitudes that can run past 180°, as -170 to 190 for a range across the Pacific, so the box is
     tried a world to the east and west as well.) */
  const PNW_BOX = [41.6, -128.8, 52.6, -115.6];
  let b = null;
  for(const k of [0, 360, -360]){
    const w = Math.max(caps.minLng, PNW_BOX[1] + k), e = Math.min(caps.maxLng, PNW_BOX[3] + k), sth = Math.max(caps.minLat, PNW_BOX[0]), nth = Math.min(caps.maxLat, PNW_BOX[2]);
    if(e - w > .5 && nth - sth > .5){ b = [sth, w - k, nth, e - k]; break; }
  }
  if(!b) b = caps.maxLng - caps.minLng > 300 ? [-50, -170, 72, 170] : [caps.minLat, caps.minLng, caps.maxLat, caps.maxLng];
  /* refit whenever the box changes size (the words beside it arriving), until someone moves the map */
  let moved = false;
  const fit = () => { if(moved || !el.clientHeight) return; m.invalidateSize(); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: [8, 8], maxZoom: 9, animate: false}); };
  fit();
  ["mousedown", "touchstart", "wheel", "keydown"].forEach(k => el.addEventListener(k, () => moved = true, {passive: true}));
  new ResizeObserver(fit).observe(el);
  legend.innerHTML = `<span><i class="grid-key"></i>${L.num(caps.total)} records on <a href="https://www.gbif.org/species/${key}" target="_blank" rel="noopener">GBIF</a>; the darker, the more</span>${mine}`;
}
const mapBlock = gap => `<div id="range" hidden${gap ? ` style="margin-top:36px"` : ""}><h2 class="side-h">Where it lives</h2><div class="mapbox tall"></div><p class="legend"></p></div>`;

/* ---------- field marks: what it looks like, from the Wikipedia article's Description section (as in Myriad) ---------- */
const MARKS = /^(description|identification|appearance|characteristics|morphology|physical (description|characteristics|appearance)|field (marks|identification)|description and identification|anatomy and morphology|features)$/i;
async function fieldMarks(title, max = 1100){
  if(!title) return [];
  const r = await fetch("https://en.wikipedia.org/w/api.php?format=json&origin=*&action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=" + encodeURIComponent(title), {signal: AbortSignal.timeout(15000)});
  if(!r.ok) return [];
  const text = Object.values((await r.json()).query?.pages || {})[0]?.extract || "", sec = {};
  let head = "Intro";
  for(const line of text.split("\n")){ const m = /^(=+)\s*(.*?)\s*=+$/.exec(line); if(m){ head = m[2]; continue; } if(line.trim()) (sec[head] ||= []).push(line.trim()); }
  const key = Object.keys(sec).find(k => MARKS.test(k)) || Object.keys(sec).find(k => /^(description|identification|appearance)/i.test(k));
  const out = []; let n = 0;
  for(const p of key ? sec[key] : []){ if(p.length < 40) continue; if(n && n + p.length > max) break; out.push(p); n += p.length; if(n > max) break; }
  return out;
}

/* ---------- range: how often it's recorded in each of the three, and whether it's native or introduced there ---------- */
const STATES = [[46, "Washington"], [10, "Oregon"], [7085, "British Columbia"]];
const andList = l => l.length < 3 ? l.join(" and ") : l.slice(0, -1).join(", ") + " and " + l[l.length - 1];
async function rangeText(id){
  const got = await Promise.all(STATES.map(async ([pid, name]) => {
    const [c, t] = await Promise.all([L.nat("observations", {taxon_id: id, place_id: pid, verifiable: "true", per_page: 0}).then(j => j.total_results).catch(() => null),
      L.nat("taxa/" + id, {preferred_place_id: pid}).then(j => j.results?.[0]?.establishment_means?.establishment_means || "").catch(() => "")]);
    return {name, n: c, means: t};
  }));
  if(got.every(g => g.n == null)) return "";
  const by = m => got.filter(g => g.n && g.means === m).map(g => g.name);
  const nat = by("native").concat(by("endemic")), intro = by("introduced");
  /* iNaturalist lists the status for some places and not others: "native" alone means native wherever it's listed */
  const words = intro.length ? `Introduced in ${andList(intro)}${nat.length ? `; native in ${andList(nat)}` : ""}` : nat.length ? "Native to the Pacific Northwest" : "";
  const none = got.filter(g => g.n === 0).map(g => g.name);
  return `${words ? esc(words) + "<br>" : ""}<span class="muted small">${got.filter(g => g.n).map(g => `${esc(g.name)} ${L.num(g.n)}`).join(" · ")}${none.length ? `${got.some(g => g.n) ? " · " : ""}not recorded in ${esc(andList(none))}` : ""}</span>`;
}

async function speciesPage(F, s){
  const P = await L.data.places().catch(() => null);
  document.title = `${s.common || s.sci} — Lookout`;
  const m = L.month(), ph = s.photos || [];
  const where = P ? whereToSee(s, P) : [];
  const facts = [
    s.pack ? ["Flowers", s.bloom?.length ? monthBar(s.bloom, m) + esc(L.bloomText(s.bloom)) : ""] : ["Seen", `<span id="seen-months"></span>`],
    ["Elevation", s.elev ? `${L.num(s.elev[0])}–${L.feet(s.elev[1])}` : ""],
    ["Colour", s.colour?.length ? s.colour.map(c => `${L.sw(c)}${esc(L.COLOUR[c]?.[0] || c)}`).join(" &nbsp; ") : ""],
    ["Petals", list(s.petals, PETALS)],
    ["Leaves", [list(s.leaf, LEAF), list(s.arr, ARR)].filter(Boolean).join("; ")],
    ["Habitat", list(s.habitat, HAB)],
    ["Regions", P && s.regions?.length ? s.regions.map(r => esc(P.region[r]?.name || r)).join(", ") : ""],
    ...(s.packQs || []).map(q => [esc(q.title), esc((s.packEntry[q.k] || []).map(c => q.opts[c]).filter(Boolean).join(", "))]),
    ["Family", s.family && !s.anc?.length ? esc(L.familyName(s.family)) : ""],
    ["Classification", treeLine(s.anc)],
    ["Status", statusText(s.cons)],
    ["Range", `<span id="range-text"></span>`],
    ["Sightings", `<span id="sightings"></span>`],
    ["Size", s.bird ? list(s.bird.size, BIRD.size) : ""],
    ["Bill", s.bird ? list(s.bird.bill, BIRD.bill) : ""],
    ["Look for", s.bird ? [list(s.bird.colour, BIRD.colour), list(s.bird.behaviour, BIRD.behaviour)].filter(Boolean).join("; ") : ""],
    ["Where", s.bird ? list(s.bird.habitat, BIRD.habitat) : ""],
    ["Pojar", s.pojar ? `p. ${esc(s.pojar)}` : ""]
  ].filter(x => x[1]);
  const kind = ONE[s.group] || "";
  main.innerHTML = `<section class="hero">${ph.length ? `<div class="frame" data-hide-broken id="big"><img src="${L.photoSrc(ph[0], "large")}"${s.pack ? ` data-fallback="${L.thumb(s)}"` : ""} alt="${esc(s.common || s.sci)}" crossorigin="anonymous">${L.photoCredit(ph[0])}</div>
      ${ph.length > 1 ? `<div class="strip">${ph.map((p, i) => `<button type="button" data-i="${i}" aria-current="${!i}" aria-label="Photo ${i + 1}"><img src="${L.photoSrc(p, "small")}" alt="" loading="lazy" crossorigin="anonymous"></button>`).join("")}</div>` : ""}` : ""}
      <p class="eyebrow">${esc([kind, s.family].filter(Boolean).join(" · "))}${s.pack && L.blooming(s, m) ? " · In bloom now" : ""}</p><h1>${esc(s.common || s.sci)}</h1>
      <p class="sub-line"><i class="sci">${esc(s.sci)}</i>${s.pojar ? ` · Pojar p. ${esc(s.pojar)}` : ""}</p></section>
    <div class="split"><div><dl class="facts">${facts.map(([k, v]) => `<dt${/id="/.test(v) ? " hidden" : ""}>${k}</dt><dd${/id="/.test(v) ? " hidden" : ""}>${v}</dd>`).join("")}</dl>
      ${s.summary ? `<div class="about" style="margin-top:24px"><p>${esc(s.summary)}</p><p class="credit">From ${s.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(s.wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a>` : "Wikipedia"}, CC BY-SA</p></div>` : ""}
      <div class="about" id="marks" style="margin-top:24px" hidden><h2 class="side-h">Field marks</h2><div></div><p class="credit">From the <a href="https://en.wikipedia.org/wiki/${encodeURIComponent((s.wiki || "").replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia article</a>'s description, CC BY-SA</p></div>
      <p style="margin-top:18px"><a href="${L.inatTaxon(s.id)}" target="_blank" rel="noopener">On iNaturalist ↗</a>${s.pack ? ` &nbsp;·&nbsp; <a href="${L.ROOT}key/">Name a flower with the key</a>` : s.bird ? ` &nbsp;·&nbsp; <a href="${L.ROOT}key/#key=birds">Name a bird with the key</a>` : s.packKey ? ` &nbsp;·&nbsp; <a href="${L.ROOT}key/#key=${s.packKey.id}">Name one with the key</a>` : ""}</p></div>
      <div>${where.length ? `<h2 class="side-h">Where to see it</h2><ul class="where">${where.map(({p, why}) => `<li><a href="${L.placeHref(p.id)}">${p.photo
        ? `<img src="${esc(L.sized(p.photo.src, 330))}" alt="" loading="lazy" crossorigin="anonymous">` : `<span class="ph"></span>`}<span><b>${esc(p.name)}</b><span>${esc(why)}</span></span></a></li>`).join("")}</ul>`
        : P ? `<h2 class="side-h">Where to see it</h2><p class="muted small">Not recorded near any of your places yet. A place shows here once iNaturalist observers have seen it near the trailhead${s.pack ? ", or when the place is in its range, elevation and flowering season" : ""}. The map below shows where it lives.</p>` : ""}
      ${mapBlock(where.length || P)}</div></div>
    <section class="section" id="alike" hidden><h2>Often confused with</h2><div class="row"></div></section>
    <section class="section" id="rel" hidden><h2>Relatives</h2><div class="row"></div></section>`;
  main.querySelector(".strip")?.addEventListener("click", e => {
    const b = e.target.closest("[data-i]"); if(!b) return;
    const p = ph[+b.dataset.i];
    $("big").innerHTML = `<img src="${L.photoSrc(p, "large")}" alt="${esc(s.common || s.sci)}" crossorigin="anonymous">${L.photoCredit(p)}`;
    main.querySelectorAll(".strip button").forEach(x => x.setAttribute("aria-current", x === b));
  });
  const show = el => { el.hidden = false; el.previousElementSibling?.removeAttribute("hidden"); };

  /* the live parts, each appearing only if it finds something */
  lifeMap($("range"), s.sci, s.id, P?.list || [], s.group).catch(() => {});
  L.nat("observations/histogram", {taxon_id: s.id, place_id: L.PNW, interval: "month_of_year", verifiable: "true"}).then(j => {
    const h = Object.values(j.results?.month_of_year || {}), top = Math.max(...h);
    const el = $("seen-months"); if(!el || !top) return;
    const shade = h.map(v => v / top), months = shade.map((v, i) => v > .12 ? i + 1 : 0).filter(Boolean);
    el.innerHTML = monthBar([], m, shade) + esc(L.bloomText(months)) + `<span class="muted small"> in the Pacific Northwest</span>`;
    show(el.parentElement);
  }).catch(() => {});
  L.nat("observations", {taxon_id: s.id, place_id: L.PNW, verifiable: "true", per_page: 0}).then(j => {
    const el = $("sightings"); if(!el || !j.total_results) return;
    el.innerHTML = `${L.num(j.total_results)} in the Pacific Northwest <a class="small" href="https://www.inaturalist.org/observations?taxon_id=${s.id}&place_id=${L.PNW}" target="_blank" rel="noopener">see them ↗</a>`;
    show(el.parentElement);
  }).catch(() => {});
  rangeText(s.id).then(html => { const el = $("range-text"); if(el && html){ el.innerHTML = html; show(el.parentElement); } }).catch(() => {});
  fieldMarks(s.wiki).then(ps => { if(!ps.length) return; $("marks").querySelector("div").innerHTML = ps.map(p => `<p>${esc(p)}</p>`).join(""); $("marks").hidden = false; }).catch(() => {});
  /* look-alikes: the species iNaturalist's identifiers here most often mix it up with */
  L.nat("identifications/similar_species", {taxon_id: s.id, place_id: L.PNW}).then(j => {
    const l = (j.results || []).filter(r => r.taxon && r.taxon.id !== s.id && r.taxon.rank_level <= 10 && r.count >= 2).slice(0, 12);
    if(!l.length) return;
    const box = $("alike"), row = box.querySelector(".row"), note = n => `<span class="note">Mistaken for it ${L.num(n)} ${n === 1 ? "time" : "times"}</span>`;
    row.innerHTML = l.map(r => F?.byId[r.taxon.id] ? L.speciesTile(F.byId[r.taxon.id], note(r.count)) : L.liveTile(L.taxonCard(r.taxon), note(r.count))).join("");
    box.hidden = false; L.fillPhotos(row);
  }).catch(() => {});
  /* relatives: others in its genus seen here (or, for the pack, its genus and family in the pack when offline) */
  const local = s.pack ? F.list.filter(x => x.id !== s.id && (x.sci.split(" ")[0] === s.sci.split(" ")[0] || x.family === s.family)).slice(0, 12) : [];
  const relBox = $("rel"), row = relBox.querySelector(".row");
  const fill = html => { if(!html) return; row.innerHTML = html; relBox.hidden = false; L.fillPhotos(row); };
  if(s.genusId){
    L.nat("observations/species_counts", {taxon_id: s.genusId, place_id: L.PNW, verifiable: "true", per_page: 16}).then(j => {
      const kin = j.results.map(r => r.taxon).filter(t => t.id !== s.id && t.rank === "species");
      if(kin.length) fill(kin.map(t => F?.byId[t.id] ? L.speciesTile(F.byId[t.id]) : L.liveTile(L.taxonCard(t))).join(""));
      else fill(local.map(x => L.speciesTile(x)).join(""));
    }).catch(() => fill(local.map(x => L.speciesTile(x)).join("")));
  } else fill(local.map(x => L.speciesTile(x)).join(""));
}

/* ---------- a genus, family, order or class: its picture, where it sits, and its species recorded here ---------- */
async function rankPage(F, t){
  const name = L.cap(t.preferred_common_name || "") || t.name, rank = RANK[t.rank] || L.cap(t.rank);
  document.title = `${name} — Lookout`;
  const photo = L.taxonCard(t).photo || await L.wikiLead(wikiTitle(t.wikipedia_url));
  const summary = shorten(plain(t.wikipedia_summary)), wiki = wikiTitle(t.wikipedia_url), up = treeLine(t.ancestors);
  const kind = ONE[t.iconic_taxon_name] || "";
  main.innerHTML = `<section class="hero">${photo ? `<div class="frame" data-hide-broken><img src="${L.photoSrc(photo, "large")}" alt="${esc(name)}" crossorigin="anonymous">${L.photoCredit(photo)}</div>` : ""}
      <p class="eyebrow">${esc([rank, kind].filter(Boolean).join(" · "))}</p><h1>${esc(name)}</h1>
      <p class="sub-line">${sciName(t)}</p></section>
    <div class="split"><div><dl class="facts">${up ? `<dt>Classification</dt><dd>${up}</dd>` : ""}${statusText(t.conservation_statuses) ? `<dt>Status</dt><dd>${statusText(t.conservation_statuses)}</dd>` : ""}<dt hidden>Sightings</dt><dd hidden><span id="sightings"></span></dd></dl>
      ${summary ? `<div class="about" style="margin-top:24px"><p>${esc(summary)}</p><p class="credit">From <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA</p></div>` : ""}
      <p style="margin-top:18px"><a href="${L.inatTaxon(t.id)}" target="_blank" rel="noopener">On iNaturalist ↗</a></p></div><div>${mapBlock(false)}</div></div>
    <section class="section" id="members"><h2 id="members-h">Species recorded in the Pacific Northwest</h2><div id="list"><p class="status muted">Asking iNaturalist…</p></div></section>`;
  L.nat("observations", {taxon_id: t.id, place_id: L.PNW, verifiable: "true", per_page: 0}).then(j => {
    const el = $("sightings"); if(!el || !j.total_results) return;
    el.innerHTML = `${L.num(j.total_results)} in the Pacific Northwest <a class="small" href="https://www.inaturalist.org/observations?taxon_id=${t.id}&place_id=${L.PNW}" target="_blank" rel="noopener">see them ↗</a>`;
    el.parentElement.hidden = false; el.parentElement.previousElementSibling.hidden = false;
  }).catch(() => {});
  L.data.places().then(P => P.list).catch(() => []).then(pl => lifeMap($("range"), t.name, t.id, pl, t.iconic_taxon_name)).catch(() => {});
  let page = 1;
  const draw = async () => {
    const box = $("list");
    try {
      const j = await L.nat("observations/species_counts", {taxon_id: t.id, place_id: L.PNW, quality_grade: "research", per_page: 48, page});
      if(page === 1){
        if(!j.total_results){ $("members").hidden = true; return; }
        box.innerHTML = `<div class="grid" id="grid"></div><p id="more-p" style="margin-top:22px" hidden><button type="button" class="btn ghost" id="more">More</button></p>`;
        $("members-h").innerHTML = `Species recorded in the Pacific Northwest <span class="n">${L.num(j.total_results)}, most recorded first</span>`;
      }
      $("grid").insertAdjacentHTML("beforeend", j.results.map(x => F?.byId[x.taxon.id] ? L.speciesTile(F.byId[x.taxon.id]) : L.liveTile(L.taxonCard(x.taxon))).join(""));
      $("more-p").hidden = page * 48 >= j.total_results;
      L.fillPhotos(box);
    } catch(e){ if(page === 1) $("members").hidden = true; }
  };
  main.addEventListener("click", e => { if(e.target.id === "more"){ page++; draw(); } });
  draw();
}

/* ---------- the guide ---------- */
const state = () => { const h = new URLSearchParams(location.hash.slice(1)); return {g: h.get("g") || "all", q: h.get("q") || ""}; };
const setState = st => { const h = new URLSearchParams(); if(st.g !== "all") h.set("g", st.g); if(st.q) h.set("q", st.q);
  history.replaceState(null, "", location.pathname + (h.toString() ? "#" + h : "")); };

async function heroPick(F, r){
  /* something seen across the region this month, with an open-licensed photo; else a wildflower from the pack */
  try {
    const j = await Promise.race([L.nat("observations/species_counts", {place_id: L.PNW, month: L.month(), quality_grade: "research", per_page: 60}),
      new Promise((_, no) => setTimeout(() => no(new Error("slow")), 5000))]);
    const cards = L.shuffle(j.results.map(x => L.taxonCard(x.taxon)).filter(t => t.photo && t.common), r);
    if(cards.length) return {href: L.speciesHref(F?.byId[cards[0].id] || cards[0]), name: cards[0].common, photo: cards[0].photo};
  } catch(e){}
  const pool = (F?.list || []).filter(s => s.photos?.length);
  const s = pool[Math.floor(r() * pool.length)];
  return s ? {href: L.speciesHref(s), name: s.common || s.sci, photo: s.photos[0], fb: L.thumb(s)} : null;
}

/* ---------- the season, live from iNaturalist (adapted from Myriad's Field Guide front page) ---------- */
const MONTH = L.MONTHS[L.month() - 1];
const daysAgo = n => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/* the most-seen species for a query: [{t: taxon card, count}] (hybrids and higher ranks left out) */
const counts = async params => (await L.nat("observations/species_counts", {place_id: L.PNW, quality_grade: "research", ...params})).results
  .filter(r => r.taxon && ["species", "subspecies", "variety"].includes(r.taxon.rank)).map(r => ({t: L.taxonCard(r.taxon), count: r.count}));
const tileOf = (F, x, note) => F?.byId[x.t.id] ? L.speciesTile(F.byId[x.t.id], `<span class="note">${esc(note)}</span>`) : L.liveTile(x.t, `<span class="note">${esc(note)}</span>`);

/* Out in <Month>: mushrooms, blooming, migrating, and mammals, amphibians and reptiles */
async function outNow(F){
  const at = {month: L.month()};
  const [fungi, bloomNative, bloomAll, birdsNow, birdsYear, animals] = await Promise.all([
    counts({...at, taxon_id: "50814", per_page: 40}),
    counts({...at, taxon_id: "47126", term_id: 12, term_value_id: 13, native: "true", per_page: 40}),
    counts({...at, taxon_id: "47126", term_id: 12, term_value_id: 13, per_page: 40}),
    counts({...at, taxon_id: "3", per_page: 200}),
    counts({taxon_id: "3", per_page: 400}),
    counts({...at, taxon_id: "40151,20978,26036", per_page: 40})].map(p => p.catch(() => [])));
  const bloom = bloomNative.length >= 8 ? bloomNative : bloomAll;
  /* migrating: birds whose share of this month's sightings is well above their share of the year's */
  const sum = l => l.reduce((a, x) => a + x.count, 0) || 1;
  const nowT = sum(birdsNow), yearT = sum(birdsYear), yearOf = Object.fromEntries(birdsYear.map(x => [x.t.id, x.count]));
  const migr = birdsNow.filter(x => x.count >= 25 && yearOf[x.t.id]).map(x => ({...x, lift: (x.count / nowT) / (yearOf[x.t.id] / yearT)}))
    .filter(x => x.lift >= 1.9).sort((a, b) => b.lift - a.lift).slice(0, 30);
  const n = x => `${L.num(x.count)} ${x.count === 1 ? "sighting" : "sightings"}`;
  const TABS = [
    ["fungi", "Mushrooms", fungi, n, "Mushrooms, brackets and puffballs seen this month"],
    ["bloom", "Blooming", bloom, x => `${L.num(x.count)} in flower`, "Wildflowers and shrubs seen in flower this month"],
    ["migr", "Migrating", migr, x => `${x.lift >= 10 ? "10" : x.lift.toFixed(1).replace(/\.0$/, "")}× its usual`, "Birds seen far more this month than the rest of the year: arriving, leaving or passing through"],
    ["animals", "Animals", animals, n, "Mammals, amphibians and reptiles seen this month"]].filter(t => t[2].length >= 6);
  if(!TABS.length) return;
  const sec = $("out"), m = L.month();
  /* open on the most seasonal: mushrooms in autumn, flowers in spring and summer */
  const pref = [9, 10, 11].includes(m) ? ["fungi", "migr", "animals", "bloom"] : [3, 4, 5, 6, 7, 8].includes(m) ? ["bloom", "migr", "animals", "fungi"] : ["migr", "animals", "fungi", "bloom"];
  let on = pref.find(k => TABS.some(t => t[0] === k));
  const draw = () => {
    const [, , list, note, sub] = TABS.find(t => t[0] === on);
    sec.querySelector(".body").innerHTML = `<div class="tabs" role="group" aria-label="Out in ${MONTH}">${TABS.map(([k, label, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === on}">${label} <span>${l.length}</span></button>`).join("")}</div>
      <p class="muted small tab-note">${esc(sub)}</p><div class="row">${list.slice(0, 30).map(x => tileOf(F, x, note(x))).join("")}</div>`;
    L.fillPhotos(sec);
    /* on a phone the tabs scroll sideways: keep the chosen one in view */
    const tabs = sec.querySelector(".tabs"), b = tabs.querySelector('[aria-pressed="true"]');
    if(b && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, b.offsetLeft - tabs.offsetLeft - 8);
  };
  sec.addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if(b){ on = b.dataset.tab; draw(); } });
  draw(); sec.hidden = false;
}

/* Songs & calls of the season: birds singing this month, then mammals and frogs when there are recordings, one after another */
async function songs(){
  const S = L.sound; if(!S) return;
  const at = {month: L.month(), sounds: "true"};
  const [birds, others] = await Promise.all([counts({...at, taxon_id: "3", per_page: 18}), counts({...at, taxon_id: "40151,20979", per_page: 8})].map(p => p.catch(() => [])));
  if(!birds.length && !others.length) return;
  const track = (x, rec) => ({...rec, name: x.t.common || x.t.sci, href: L.speciesHref(x.t), img: x.t.photo ? L.inat(x.t.photo, "small") : "", t: x.t});
  /* birds: Xeno-canto's recordings on Commons, one per bird; any without one, an observer's recording from here this month */
  const got = await S.commonsSounds(birds.map(x => x.t.sci)).catch(() => ({}));
  /* where it was recorded, as a town and a state or province: no street numbers or postcodes */
  const town = w => String(w || "").split(",").map(x => x.trim().replace(/\s+[A-Z]\d[A-Z] ?\d[A-Z]\d$|\s+\d{5}(-\d{4})?$/, "")).filter(x => x && !/\d/.test(x) && !/^(USA?|United States|Canada|CA)$/.test(x)).slice(-2).join(", ").replace(/\bCA-BC\b/, "BC");
  const near = x => S.natSounds({taxon_id: x.t.id, place_id: L.PNW, month: L.month(), per_page: 3}).then(l => l[0] ? track(x, {...l[0], note: town(l[0].where)}) : null).catch(() => null);
  const commons = await S.verified(birds.map(x => got[x.t.sci]?.[0] ? track(x, got[x.t.sci][0]) : null).filter(Boolean), 10, 4);
  /* any bird whose Commons recording didn't play (or has none), up to ten in all: an observer's recording from here this month */
  let b = commons;
  if(commons.length < 10){
    const have = new Set(commons.map(t => t.t.id));
    const more = (await Promise.all(birds.filter(x => !have.has(x.t.id)).slice(0, 12 - commons.length).map(near))).filter(Boolean);
    const extra = await S.verified(more, 10 - commons.length, 4), ids = new Set([...commons, ...extra].map(t => t.t.id));
    const all = [...commons, ...extra];
    b = birds.filter(x => ids.has(x.t.id)).map(x => all.find(t => t.t.id === x.t.id));   /* in order of how often they're recorded */
  }
  /* mammals and frogs: observers' recordings from the Northwest this month */
  const o = await S.verified((await Promise.all(others.slice(0, 6).map(near))).filter(Boolean), 3, 3);
  /* mostly birds, with a mammal or frog after every third */
  const list = []; b.forEach((t, i) => { list.push(t); if(i % 3 === 2 && o.length) list.push(o.shift()); }); list.push(...o);
  if(list.length < 3) return;
  /* a picture for each, open-licensed, where the species' own default photo isn't */
  const pics = await L.openPhotos(list.filter(t => !t.img).map(t => t.t.id)).catch(() => ({}));
  list.forEach(t => { if(!t.img && pics[t.t.id]) t.img = L.inat(pics[t.t.id], "small"); });
  const sec = $("songs");
  sec.querySelector(".body").innerHTML = `<p class="song-ctl"><button type="button" class="btn ghost" id="play-all">Play all ${list.length}</button></p><div class="track-box"><div id="tracks"></div></div>`;
  const player = S.trackList($("tracks"), list, {chain: true});
  /* the list scrolls inside its box; the bottom edge fades while there's more below */
  const tb = sec.querySelector(".track-box"), mark = () => tb.classList.toggle("more-down", tb.scrollTop < tb.scrollHeight - tb.clientHeight - 4);
  tb.addEventListener("scroll", mark, {passive: true}); new ResizeObserver(mark).observe(tb); mark();
  /* the playing track stays in view as the list plays through */
  S.audio.addEventListener("play", () => { const on = tb.querySelector(".track.on"); if(on && (on.offsetTop < tb.scrollTop || on.offsetTop + on.offsetHeight > tb.scrollTop + tb.clientHeight)) tb.scrollTo({top: on.offsetTop - 8, behavior: "smooth"}); });
  $("play-all").addEventListener("click", player.playAll);
  sec.hidden = false;
}

/* Seen this week: the most-sighted species over the last seven days, with their names */
async function week(F){
  const list = (await counts({d1: daysAgo(7), quality_grade: "research,needs_id", per_page: 160}).catch(() => [])).filter(x => x.t.photo);
  if(list.length < 8) return;
  const sec = $("week"), body = sec.querySelector(".body");
  const tile = x => { const name = x.t.common || x.t.sci;
    return `<a class="sp" href="${L.speciesHref(F?.byId[x.t.id] || x.t)}" title="${esc(`${L.num(x.count)} ${x.count === 1 ? "sighting" : "sightings"} this week. Photo © ${x.t.photo.by} · ${x.t.photo.lic}`)}">
      <div class="pic"><img src="${L.inat(x.t.photo, "small")}" alt="" loading="lazy" crossorigin="anonymous"></div><b>${esc(name)}</b></a>`; };
  sec.hidden = false;
  /* twelve, with their names; twelve more at a time on request */
  let n = 12;
  const draw = () => {
    body.innerHTML = `<div class="week-grid">${list.slice(0, n).map(tile).join("")}</div>`
      + `<p class="week-more">${n < list.length ? `<button type="button" class="btn ghost" data-more>Show ${Math.min(12, list.length - n)} more</button>` : ""}`
      + `<span class="muted small">${n < list.length ? `${n} of ${list.length}` : `All ${list.length}`}${n > 12 ? ` · <button type="button" class="linkish" data-less>Show fewer</button>` : ""}</span></p>`;
  };
  draw();
  body.addEventListener("click", e => {
    if(e.target.closest("[data-more]")){ n += 12; draw(); }
    if(e.target.closest("[data-less]")){ n = 12; draw(); sec.scrollIntoView({block: "nearest"}); }
  });
}

async function guidePage(F){
  const r = L.rng("living " + L.today()), st = state();
  const pick = await heroPick(F, r);
  const quiet = (id, title, sub) => `<section class="section" id="${id}" hidden><h2>${title}</h2>${sub ? `<p class="muted small sec-sub">${sub}</p>` : ""}<div class="body"></div></section>`;
  main.innerHTML = (pick ? `<section class="hero"><div class="frame" data-hide-broken><a href="${pick.href}"><img src="${L.photoSrc(pick.photo, "large")}"${pick.fb ? ` data-fallback="${pick.fb}"` : ""} alt="${esc(pick.name)}" crossorigin="anonymous"></a>${L.photoCredit(pick.photo)}</div>` : `<section class="hero">`)
    + `<h1>Living things</h1><p class="sub-line">Plants and animals of the Pacific Northwest${pick ? ` · <a href="${pick.href}">${esc(pick.name)}</a> above` : ""}</p></section>
    ${quiet("out", `Out in ${MONTH}`, "")}
    <div class="split pair">${quiet("songs", "Songs &amp; calls of the season", `Birds, and the mammals and frogs heard in ${MONTH}, recorded in the field. One plays after another.`)}
    ${quiet("week", "Seen this week", "The most-sighted species in Washington, Oregon and British Columbia over the last seven days")}</div>
    <section class="section" id="browse"><h2 id="list-h">Every species</h2>
    <div id="groups" style="margin:0 0 18px">${L.groupChips(st.g)}</div>
    <div class="filters"><input type="search" id="q" placeholder="Find any species" aria-label="Find any species" value="${esc(st.q)}"></div>
    <div id="list"></div></section>`;
  if(navigator.onLine !== false){
    outNow(F).catch(() => {});
    /* once both have answered, a lone one takes the whole width */
    Promise.all([songs().catch(() => {}), week(F).catch(() => {})]).then(() => main.querySelector(".pair")?.classList.toggle("solo", $("songs").hidden || $("week").hidden));
  }
  if(st.q || st.g !== "all") requestAnimationFrame(() => $("browse").scrollIntoView());
  let page = 1, token = 0;
  const draw = async (more = false) => {
    const s = state(), me = ++token, box = $("list"), head = $("list-h");
    $("groups").innerHTML = L.groupChips(s.q ? "" : s.g);
    if(s.g === "flowers" && !s.q) return flowerGrid(F, box, head);
    if(!more){ page = 1; box.innerHTML = `<p class="status muted">Asking iNaturalist…</p>`; }
    try {
      let tiles, total;
      if(s.q){
        const j = await L.nat("taxa/autocomplete", {q: s.q, per_page: 30, is_active: "true"});
        const ts = j.results.filter(t => ["species", "subspecies", "variety", "form"].includes(t.rank));
        tiles = ts.map(t => F?.byId[t.id] ? L.speciesTile(F.byId[t.id]) : L.liveTile(L.taxonCard(t))); total = ts.length;
        if(me !== token) return;
        head.innerHTML = `Matching “${esc(s.q)}” <span class="n">${total}</span>`;
      } else {
        /* a catalogue: every species recorded here, the most-recorded first (the month is up above) */
        const params = {place_id: L.PNW, quality_grade: "research", per_page: 48, page, ...(L.group(s.g).taxa ? {taxon_id: L.group(s.g).taxa} : {})};
        const j = await L.nat("observations/species_counts", params);
        if(me !== token) return;
        total = j.total_results;
        tiles = j.results.map(x => F?.byId[x.taxon.id] ? L.speciesTile(F.byId[x.taxon.id]) : L.liveTile(L.taxonCard(x.taxon)));
        const g = L.group(s.g);
        head.innerHTML = `${g.k === "all" ? "Every species" : esc(g.name)} <span class="n">${L.num(total)} recorded in the Pacific Northwest · most recorded first</span>`;
      }
      if(!more) box.innerHTML = `<div class="grid" id="grid"></div><p id="more-p" style="margin-top:22px" hidden><button type="button" class="btn ghost" id="more">More</button></p>`;
      $("grid").insertAdjacentHTML("beforeend", tiles.join("") || "");
      if(!$("grid").children.length) box.innerHTML = `<p class="muted">Nothing found.</p>`;
      $("more-p") && ($("more-p").hidden = !!s.q || page * 48 >= total);
      L.fillPhotos(box);
    } catch(e){
      if(me !== token) return;
      box.innerHTML = `<p class="muted">Couldn't reach iNaturalist just now. <button type="button" class="linkish" id="retry">Try again</button></p>`;
      if(F) box.insertAdjacentHTML("beforeend", `<p class="muted">The wildflowers are saved here: <button type="button" class="linkish" data-g="flowers">show them</button>.</p>`);
    }
  };
  const go = patch => { setState({...state(), ...patch}); draw(); };
  $("browse").addEventListener("click", e => {
    const g = e.target.closest("[data-g]"); if(g) return go({g: g.dataset.g, q: ""}), $("q").value = "";
    if(e.target.id === "more"){ page++; draw(true); }
    if(e.target.id === "retry") draw();
  });
  window.addEventListener("hashchange", () => { $("q").value = state().q; draw(); });
  let t; $("q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => go({q: e.target.value.trim().length > 1 ? e.target.value.trim() : ""}), 350); });
  draw();
}

/* the 300 Cascades wildflowers, from the pack: filter by colour and family, sorted by how often they're seen */
function flowerGrid(F, box, head){
  if(!F){ box.innerHTML = `<p class="muted">The wildflower pack didn't load.</p>`; return; }
  const families = [...new Set(F.list.map(s => s.family))].sort();
  const colours = Object.keys(L.COLOUR).filter(c => F.list.some(s => s.colour.includes(c)));
  head.innerHTML = `Cascades wildflowers <span class="n" id="shown">${F.list.length}</span><span class="aside"><a href="${L.ROOT}key/">Name one with the key →</a></span>`;
  box.innerHTML = `<div class="filters"><div class="chips" id="colours">${colours.map(c => `<button type="button" class="chip" aria-pressed="false" data-c="${c}">${L.sw(c)}${esc(L.COLOUR[c][0])}</button>`).join("")}</div>
      <label>Family <select id="fam"><option value="">All</option>${families.map(f => `<option>${esc(f)}</option>`).join("")}</select></label>
      <label>Sort <select id="sort"><option value="obs">Most seen</option><option value="name">Name</option><option value="sci">Scientific name</option></select></label></div>
    <div class="grid" id="fl"></div>`;
  const draw = () => {
    const fam = $("fam").value, sort = $("sort").value, cs = [...$("colours").querySelectorAll("[aria-pressed=true]")].map(b => b.dataset.c);
    const by = {obs: (a, b) => b.obs - a.obs, name: (a, b) => (a.common || a.sci).localeCompare(b.common || b.sci), sci: (a, b) => a.sci.localeCompare(b.sci)}[sort];
    const shown = F.list.filter(s => (!fam || s.family === fam) && (!cs.length || cs.some(c => s.colour.includes(c)))).sort(by);
    $("fl").innerHTML = shown.map(s => L.speciesTile(s)).join(""); $("shown").textContent = shown.length;
  };
  $("fam").addEventListener("change", draw); $("sort").addEventListener("change", draw);
  $("colours").addEventListener("click", e => { const b = e.target.closest(".chip"); if(!b) return; b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); draw(); });
  draw();
}

L.data.flowers().catch(() => null).then(async F => {
  if(!id) return guidePage(F);
  /* a number above species level (a genus, a family…) has a page of its own */
  if(/^\d+$/.test(id) && !F?.byId[id]){
    const t = await L.nat("taxa/" + id).then(j => j.results?.[0]).catch(() => null);
    if(t && t.rank_level > 10) return rankPage(F, t);
  }
  const s = await loadSpecies(id, F);
  /* a bird in the bird pack brings the key's traits along */
  const B = s && await L.data.birds().catch(() => null), b = B?.byId[s.id];
  if(b) Object.assign(s, {bird: b, regions: s.regions || b.regions});
  /* a species in one of the other trait keys brings that key's answers along */
  const pack = s && !b && (await L.data.packList().catch(() => [])).find(p => p.taxa.split(",").some(x => (s.ancestorIds || []).includes(+x)));
  if(pack){ const T = await L.data.trait(pack.id).catch(() => null), e = T?.byId[s.id];
    if(e) Object.assign(s, {packKey: pack, packQs: T.questions, packEntry: e, regions: s.regions || e.regions}); }
  if(!s){ main.innerHTML = `<h1>Not found</h1><p><a href="./">Living things</a></p>`; return; }
  return speciesPage(F, s);
}).catch(e => { main.innerHTML = `<p class="muted">Couldn't load the field guide (${esc(e.message)}).</p>`; });
}
