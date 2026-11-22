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
  const [P, Fo] = await Promise.all([L.data.places().catch(() => null), L.data.json("foraging.json").catch(() => null)]);
  /* edible or poisonous: only from the hand-checked foraging list (by species, or by genus for morels and false morels) */
  const mine = new Set(s.ancestorIds || [s.id]);
  const eat = Fo?.wild.find(w => mine.has(w.id));
  const bad = Fo ? [...Fo.wild.filter(w => mine.has(w.dangerId)).map(w => w.dangerNote), ...Fo.deadly.filter(d => mine.has(d.id)).map(d => d.note)][0] : "";
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
    ["Edible", eat ? `${esc(eat.note)}<br><span class="muted small">Harvest ${esc(L.bloomText(eat.months))}. Only ever eat it if you're completely sure of it. <a href="./?f=foraging">Foraging</a></span>` : ""],
    ["Poisonous", bad ? `<b>Yes.</b> ${esc(bad)}<br><span class="muted small">Don't eat any part of it. <a href="./?f=foraging">Foraging</a></span>` : ""],
    ["Range", `<span id="range-text"></span>`],
    ["Sightings", `<span id="sightings"></span>`],
    ["Size", s.bird ? list(s.bird.size, BIRD.size) : ""],
    ["Bill", s.bird ? list(s.bird.bill, BIRD.bill) : ""],
    ["Look for", s.bird ? [list(s.bird.colour, BIRD.colour), list(s.bird.behaviour, BIRD.behaviour)].filter(Boolean).join("; ") : ""],
    ["Where", s.bird ? list(s.bird.habitat, BIRD.habitat) : ""],
    ["Pojar", s.pojar ? `p. ${esc(s.pojar)}` : ""]
  ].filter(x => x[1]);
  const kind = ONE[s.group] || "";
  /* like an encyclopedia: the name and the facts on the left; the photograph, the map of where it lives and where to
     see it on the right (on a phone: the photograph first) */
  const where_ = where.length ? `<h2 class="side-h">Where to see it</h2><ul class="where">${where.map(({p, why}) => `<li><a href="${L.placeHref(p.id)}">${p.photo
        ? `<img src="${esc(L.sized(p.photo.src, 330))}" alt="" loading="lazy">` : `<span class="ph"></span>`}<span><b>${esc(p.name)}</b><span>${esc(why)}</span></span></a></li>`).join("")}</ul>`
    : P ? `<h2 class="side-h">Where to see it</h2><p class="muted small">Not recorded near any of your places yet. A place shows here once iNaturalist observers have seen it near the trailhead${s.pack ? ", or when the place is in its range, elevation and flowering season" : ""}. The map shows where it lives.</p>` : "";
  main.innerHTML = `<div class="sp-layout"><div class="sp-main">
      <p class="eyebrow">${esc([kind, s.family].filter(Boolean).join(" · "))}${s.pack && L.blooming(s, m) ? " · In bloom now" : ""}</p><h1>${esc(s.common || s.sci)}</h1>
      <p class="sub-line"><i class="sci">${esc(s.sci)}</i>${s.pojar ? ` · Pojar p. ${esc(s.pojar)}` : ""}</p>
      <dl class="facts" style="margin-top:22px">${facts.map(([k, v]) => `<dt${/id="/.test(v) ? " hidden" : ""}>${k}</dt><dd${/id="/.test(v) ? " hidden" : ""}>${v}</dd>`).join("")}</dl>
      ${s.summary ? `<div class="about" style="margin-top:24px"><p>${esc(s.summary)}</p><p class="credit">From ${s.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(s.wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a>` : "Wikipedia"}, CC BY-SA</p></div>` : ""}
      <div class="about" id="marks" style="margin-top:24px" hidden><h2 class="side-h">Field marks</h2><div></div><p class="credit"></p></div>
      <p style="margin-top:18px"><a href="${L.inatTaxon(s.id)}" target="_blank" rel="noopener">On iNaturalist ↗</a>${s.pack ? ` &nbsp;·&nbsp; <a href="${L.ROOT}key/">Name a flower with the key</a>` : s.bird ? ` &nbsp;·&nbsp; <a href="${L.ROOT}key/#key=birds">Name a bird with the key</a>` : s.packKey ? ` &nbsp;·&nbsp; <a href="${L.ROOT}key/#key=${s.packKey.id}">Name one with the key</a>` : ""}</p></div>
    <aside class="sp-side">${ph.length ? `<figure class="plate"><div class="frame" data-hide-broken id="big"><img src="${L.photoSrc(ph[0], "large")}"${s.pack ? ` data-fallback="${L.thumb(s)}"` : ""} alt="${esc(s.common || s.sci)}">${L.photoCredit(ph[0])}</div>
      ${ph.length > 1 ? `<div class="strip">${ph.map((p, i) => `<button type="button" data-i="${i}" aria-current="${!i}" aria-label="Photo ${i + 1}"><img src="${L.photoSrc(p, "small")}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}</figure>` : ""}
      ${mapBlock(ph.length)}
      ${where_ ? `<div class="where-box">${where_}</div>` : ""}</aside></div>
    <section class="section" id="alike" hidden><h2>Often confused with</h2><div class="row"></div></section>
    <section class="section" id="rel" hidden><h2>Relatives</h2><div class="row"></div></section>`;
  main.querySelector(".strip")?.addEventListener("click", e => {
    const b = e.target.closest("[data-i]"); if(!b) return;
    const p = ph[+b.dataset.i];
    $("big").innerHTML = `<img src="${L.photoSrc(p, "large")}" alt="${esc(s.common || s.sci)}">${L.photoCredit(p)}`;
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
  /* field marks: the article iNaturalist links, or else the one under its scientific name (many fungi have only that) */
  (async () => {
    let title = s.wiki, ps = await fieldMarks(title).catch(() => []);
    if(!ps.length && s.sci && s.sci !== s.wiki){ title = s.sci; ps = await fieldMarks(title).catch(() => []); }
    if(!ps.length) return;
    const box = $("marks"); box.querySelector("div").innerHTML = ps.map(p => `<p>${esc(p)}</p>`).join("");
    box.querySelector(".credit").innerHTML = `From the <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia article</a>'s description, CC BY-SA`;
    box.hidden = false;
  })();
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

/* ---------- the kinds within a group or a taxon: its families (or orders, or genera) recorded here, the most seen first ---------- */
const CHILD = {kingdom: "phylum", phylum: "class", subphylum: "class", class: "order", subclass: "order", superorder: "order", order: "family", suborder: "family", infraorder: "family",
  superfamily: "family", family: "genus", subfamily: "genus", tribe: "genus"};
const KINDS = {phylum: "Phyla", class: "Classes", order: "Orders", family: "Families", genus: "Genera"};
async function kindsOf(taxa, rank){
  /* this region's species (the 500 most recorded), each counted towards every taxon above it */
  const sp = await L.nat("observations/species_counts", {place_id: L.PNW, taxon_id: taxa, quality_grade: "research", per_page: 500}).then(j => j.results).catch(() => []);
  if(!sp.length) return [];
  const up = new Map();
  for(const r of sp) for(const a of r.taxon.ancestor_ids || []){ const e = up.get(a) || {n: 0, obs: 0, top: r.taxon}; e.n++; e.obs += r.count; up.set(a, e); }
  /* then which of those are at the rank wanted: that rank's taxa within it, worldwide, most observed first */
  const ranked = (await Promise.all(String(taxa).split(",").map(id => L.nat("taxa", {taxon_id: id, rank, per_page: 200, order_by: "observations_count", is_active: "true"}).then(j => j.results).catch(() => [])))).flat();
  return ranked.filter(x => up.has(x.id)).map(x => ({t: x, ...up.get(x.id)})).sort((a, b) => b.obs - a.obs);
}
async function showKinds(sec, taxa, rank){
  if(!sec || navigator.onLine === false) return;
  const l = await kindsOf(taxa, rank); if(l.length < 2) return;
  const box = sec.querySelector(".cards"), FEW = 12;
  const card = x => { const c = L.taxonCard(x.t), p = L.taxonCard(x.top).photo || c.photo, name = c.common || x.t.name;   /* its most-seen species here, not a picture from elsewhere */
    return `<a class="card" href="${L.speciesHref(x.t)}"><div class="pic">${p ? `<img src="${L.inat(p, "medium")}" alt="" loading="lazy" title="Photo © ${esc(p.by)} · ${esc(p.lic)}">` : `<span class="ph">${L.initials(name)}</span>`}</div>
      <h3>${esc(name)}</h3><p>${c.common ? `${sciName(x.t)} · ` : ""}${L.num(x.n)} ${x.n === 1 ? "species" : "species"} here</p></a>`; };
  let all = false;
  const draw = () => { box.innerHTML = (all ? l : l.slice(0, FEW)).map(card).join("");
    sec.querySelector(".more-kinds")?.remove();
    if(l.length > FEW) box.insertAdjacentHTML("afterend", `<p class="more-kinds" style="margin-top:20px"><button type="button" class="btn ghost">${all ? "Show fewer" : `Show all ${l.length}`}</button></p>`); };
  sec.addEventListener("click", e => { if(e.target.closest(".more-kinds button")){ all = !all; draw(); if(!all) sec.scrollIntoView({block: "nearest"}); } });
  sec.querySelector("h2 .n").textContent = l.length;
  draw(); sec.hidden = false;
}

/* ---------- a genus, family, order or class: its picture, where it sits, and its species recorded here ---------- */
async function rankPage(F, t){
  const name = L.cap(t.preferred_common_name || "") || t.name, rank = RANK[t.rank] || L.cap(t.rank);
  document.title = `${name} — Lookout`;
  const photo = L.taxonCard(t).photo || await L.wikiLead(wikiTitle(t.wikipedia_url));
  const summary = shorten(plain(t.wikipedia_summary)), wiki = wikiTitle(t.wikipedia_url), up = treeLine(t.ancestors);
  const kind = ONE[t.iconic_taxon_name] || "";
  const below = CHILD[t.rank];
  main.innerHTML = `<div class="sp-layout"><div class="sp-main">
      <p class="eyebrow">${esc([rank, kind].filter(Boolean).join(" · "))}</p><h1>${esc(name)}</h1>
      <p class="sub-line">${sciName(t)}</p>
      <dl class="facts" style="margin-top:22px">${up ? `<dt>Classification</dt><dd>${up}</dd>` : ""}${statusText(t.conservation_statuses) ? `<dt>Status</dt><dd>${statusText(t.conservation_statuses)}</dd>` : ""}<dt hidden>Recorded here</dt><dd hidden id="g-species"></dd><dt hidden>Sightings</dt><dd hidden><span id="sightings"></span></dd></dl>
      ${summary ? `<div class="about" style="margin-top:24px"><p>${esc(summary)}</p><p class="credit">From <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA</p></div>` : ""}
      <p style="margin-top:18px"><a href="${L.inatTaxon(t.id)}" target="_blank" rel="noopener">On iNaturalist ↗</a></p></div>
    <aside class="sp-side">${photo ? `<figure class="plate"><div class="frame" data-hide-broken><img src="${L.photoSrc(photo, "large")}" alt="${esc(name)}">${L.photoCredit(photo)}</div></figure>` : ""}${mapBlock(!!photo)}</aside></div>
    <section class="section" id="g-now" hidden><h2>Out in ${MONTH}</h2><div class="row"></div></section>
    ${below ? `<section class="section" id="kinds-sec" hidden><h2>${KINDS[below]} <span class="n"></span></h2><div class="cards" id="kind-cards"></div></section>` : ""}
    <section class="section" id="members"><h2 id="members-h">Species recorded in the Pacific Northwest</h2><div id="list"><p class="status muted">Asking iNaturalist…</p></div></section>`;
  L.nat("observations/species_counts", {place_id: L.PNW, taxon_id: t.id, quality_grade: "research", per_page: 0}).then(j => {
    const el = $("g-species"); if(!el || !j.total_results) return; el.innerHTML = `${L.num(j.total_results)} species in the Pacific Northwest`; el.hidden = false; el.previousElementSibling.hidden = false; }).catch(() => {});
  counts({month: L.month(), taxon_id: t.id, per_page: 30}).then(l => {
    if(l.length < 4) return;
    const sec = $("g-now"); sec.querySelector(".row").innerHTML = l.map(x => tileOf(F, x, `${L.num(x.count)} ${x.count === 1 ? "sighting" : "sightings"}`)).join(""); sec.hidden = false; L.fillPhotos(sec);
  }).catch(() => {});
  if(below) showKinds($("kinds-sec"), String(t.id), below);
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
/* answers kept in this browser for a while (the same day, and at most so many hours), so a refresh asks nothing again */
const kept = async (key, hours, make) => {
  const k = "lookout-kept-" + key, c = L.store.get(k);
  if(c && c.day === L.today() && Date.now() - c.at < hours * 36e5) return c.v;
  const v = await make();
  if(v && (!Array.isArray(v) || v.length)) L.store.set(k, {day: L.today(), at: Date.now(), v});
  return v;
};
/* the most-seen species for a query, in the Pacific Northwest (or, given lat, lng and radius, around a point) */
const counts = async params => (await L.nat("observations/species_counts", {...(params.lat ? {} : {place_id: L.PNW}), quality_grade: "research", ...params})).results
  .filter(r => r.taxon && ["species", "subspecies", "variety"].includes(r.taxon.rank)).map(r => ({t: L.taxonCard(r.taxon), count: r.count}));
const tileOf = (F, x, note) => F?.byId[x.t.id] ? L.speciesTile(F.byId[x.t.id], `<span class="note">${esc(note)}</span>`) : L.liveTile(x.t, `<span class="note">${esc(note)}</span>`);

/* Out in <Month>: mushrooms, blooming, migrating, and mammals, amphibians and reptiles */
/* Out in the month and Seen this week also serve the Near you page (living/?f=near), given a point and a radius */
const nearTag = w => w ? `-${w.lat},${w.lng},${w.radius}` : "";
async function outNow(F, where = null){
  const at = {month: L.month(), ...(where || {})};
  const sec = $("out"); sec.querySelector("h2").textContent = `Out in ${MONTH}${where ? " near you" : ""}`;
  const [fungi, bloomNative, bloomAll, birdsNow, birdsYear, animals] = (await kept("out" + nearTag(where), 24, () => Promise.all([
    counts({...at, taxon_id: "50814", per_page: 40}),
    counts({...at, taxon_id: "47126", term_id: 12, term_value_id: 13, native: "true", per_page: 40}),
    counts({...at, taxon_id: "47126", term_id: 12, term_value_id: 13, per_page: 40}),
    counts({...at, taxon_id: "3", per_page: 200}),
    counts({taxon_id: "3", per_page: 400, ...(where || {})}),
    counts({...at, taxon_id: "40151,20978,26036", per_page: 40})].map(p => p.catch(() => []))).then(l => l.some(x => x.length) ? l : null))) || [[], [], [], [], [], []];
  const bloom = bloomNative.length >= 8 ? bloomNative : bloomAll;
  /* migrating: birds whose share of this month's sightings is well above their share of the year's */
  const sum = l => l.reduce((a, x) => a + x.count, 0) || 1;
  const nowT = sum(birdsNow), yearT = sum(birdsYear), yearOf = Object.fromEntries(birdsYear.map(x => [x.t.id, x.count]));
  const migr = birdsNow.filter(x => x.count >= (where ? 4 : 25) && yearOf[x.t.id]).map(x => ({...x, lift: (x.count / nowT) / (yearOf[x.t.id] / yearT)}))
    .filter(x => x.lift >= 1.9).sort((a, b) => b.lift - a.lift).slice(0, 30);
  const n = x => `${L.num(x.count)} ${x.count === 1 ? "sighting" : "sightings"}`;
  const TABS = [
    ["fungi", "Mushrooms", fungi, n, "Mushrooms, brackets and puffballs seen this month"],
    ["bloom", "Blooming", bloom, x => `${L.num(x.count)} in flower`, "Wildflowers and shrubs seen in flower this month"],
    ["migr", "Migrating", migr, x => `${x.lift >= 10 ? "10" : x.lift.toFixed(1).replace(/\.0$/, "")}× its usual`, "Birds seen far more this month than the rest of the year: arriving, leaving or passing through"],
    ["animals", "Animals", animals, n, "Mammals, amphibians and reptiles seen this month"]].filter(t => t[2].length >= (where ? 3 : 6));
  const within = where ? `, within ${where.radius} km of you` : "";
  if(!TABS.length){
    if(where){ sec.querySelector(".body").innerHTML = `<p class="muted">Little has been recorded within ${where.radius} km of you this month yet.</p>`; sec.hidden = false; }
    else sec.hidden = true;
    return;
  }
  const m = L.month();
  /* open on the most seasonal: mushrooms in autumn, flowers in spring and summer */
  const pref = [9, 10, 11].includes(m) ? ["fungi", "migr", "animals", "bloom"] : [3, 4, 5, 6, 7, 8].includes(m) ? ["bloom", "migr", "animals", "fungi"] : ["migr", "animals", "fungi", "bloom"];
  let on = pref.find(k => TABS.some(t => t[0] === k));
  const draw = () => {
    const [, , list, note, sub] = TABS.find(t => t[0] === on);
    sec.querySelector(".body").innerHTML = `<div class="tabs" role="group" aria-label="Out in ${MONTH}">${TABS.map(([k, label, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === on}">${label} <span>${l.length}</span></button>`).join("")}</div>
      <p class="muted small tab-note">${esc(sub + within)}</p><div class="row">${list.slice(0, 30).map(x => tileOf(F, x, note(x))).join("")}</div>`;
    L.fillPhotos(sec);
    /* on a phone the tabs scroll sideways: keep the chosen one in view */
    const tabs = sec.querySelector(".tabs"), b = tabs.querySelector('[aria-pressed="true"]');
    if(b && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, b.offsetLeft - tabs.offsetLeft - 8);
  };
  sec.onclick = e => { const b = e.target.closest("[data-tab]"); if(b){ on = b.dataset.tab; draw(); } };
  draw(); sec.hidden = false;
}

/* Songs & calls of the season: birds singing this month, then mammals and frogs when there are recordings, one after another */
/* the season's recordings, as plain data (kept for the day): mostly birds, with a mammal or frog after every third */
async function buildSongs(){
  const S = L.sound, at = {month: L.month(), sounds: "true"};
  const [birds, others] = await Promise.all([counts({...at, taxon_id: "3", per_page: 18}), counts({...at, taxon_id: "40151,20979", per_page: 8})].map(p => p.catch(() => [])));
  if(!birds.length && !others.length) return [];
  const track = (x, rec) => ({...rec, name: x.t.common || x.t.sci, href: L.speciesHref(x.t), img: x.t.photo ? L.inat(x.t.photo, "small") : "", id: x.t.id});
  /* where it was recorded, as a town and a state or province: no street numbers or postcodes */
  const town = w => String(w || "").split(",").map(x => x.trim().replace(/\s+[A-Z]\d[A-Z] ?\d[A-Z]\d$|\s+\d{5}(-\d{4})?$/, "")).filter(x => x && !/\d/.test(x) && !/^(USA?|United States|Canada|CA)$/.test(x)).slice(-2).join(", ").replace(/\bCA-BC\b/, "BC");
  /* observers' recordings from here this month: one request for the birds, one for the mammals and frogs, the first for each species */
  const local = async taxa => { const by = {};
    for(const r of await S.natSounds({taxon_id: taxa, place_id: L.PNW, month: L.month(), per_page: 120}).catch(() => [])) if(r.taxon && !by[r.taxon.id]) by[r.taxon.id] = {...r, note: town(r.where), taxon: undefined};
    return by; };
  const [got, birdRec, otherRec] = await Promise.all([S.commonsSounds(birds.slice(0, 12).map(x => x.t.sci)).catch(() => ({})), local("3"), local("40151,20979")]);
  /* birds: Xeno-canto's recording on Commons where there's one that plays, else an observer's from here */
  const commons = await S.verified(birds.map(x => got[x.t.sci]?.[0] ? track(x, got[x.t.sci][0]) : null).filter(Boolean), 10, 4);
  const have = new Set(commons.map(t => t.id));
  const extra = await S.verified(birds.filter(x => !have.has(x.t.id) && birdRec[x.t.id]).map(x => track(x, birdRec[x.t.id])), 10 - commons.length, 4);
  const ok = new Set([...commons, ...extra].map(t => t.id)), all = [...commons, ...extra];
  const b = birds.filter(x => ok.has(x.t.id)).map(x => all.find(t => t.id === x.t.id));   /* in order of how often they're recorded */
  const o = await S.verified(others.filter(x => otherRec[x.t.id]).map(x => track(x, otherRec[x.t.id])), 3, 3);
  const list = []; b.forEach((t, i) => { list.push(t); if(i % 3 === 2 && o.length) list.push(o.shift()); }); list.push(...o);
  if(list.length < 3) return [];
  /* a picture for each, open-licensed, where the species' own default photo isn't */
  const pics = await L.openPhotos(list.filter(t => !t.img).map(t => t.id)).catch(() => ({}));
  list.forEach(t => { if(!t.img && pics[t.id]) t.img = L.inat(pics[t.id], "small"); });
  return list;
}

async function songs(){
  const S = L.sound; if(!S) return;
  const list = await kept("songs", 24, buildSongs).catch(() => null);
  if(!list || list.length < 3) return;
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
async function week(F, where = null){
  const sec = $("week"), body = sec.querySelector(".body");
  sec.querySelector("h2").textContent = `Seen this week${where ? " near you" : ""}`;
  const sub = sec.querySelector(".sec-sub"); if(sub) sub.textContent = where ? `The most-sighted species within ${where.radius} km of you over the last seven days` : "The most-sighted species in Washington, Oregon and British Columbia over the last seven days";
  const list = (await kept("week" + nearTag(where), 3, () => counts({d1: daysAgo(7), quality_grade: "research,needs_id", per_page: 160, ...(where || {})}).catch(() => []))).filter(x => x.t.photo);
  if(list.length < (where ? 3 : 8)){
    if(where){ body.innerHTML = `<p class="muted">Little has been recorded within ${where.radius} km of you this week yet.</p>`; sec.hidden = false; } else sec.hidden = true;
    return;
  }
  const tile = x => { const name = x.t.common || x.t.sci;
    return `<a class="sp" href="${L.speciesHref(F?.byId[x.t.id] || x.t)}" title="${esc(`${L.num(x.count)} ${x.count === 1 ? "sighting" : "sightings"} this week. Photo © ${x.t.photo.by} · ${x.t.photo.lic}`)}">
      <div class="pic"><img src="${L.inat(x.t.photo, "small")}" alt="" loading="lazy"></div><b>${esc(name)}</b></a>`; };
  sec.hidden = false;
  /* the Near you card on Explore takes this week's most-seen species as its picture */
  const nc = !where && main.querySelector('#explore-cards [data-k="near"] .pic .ph'), p0 = list[0].t.photo;
  if(nc) nc.replaceWith(Object.assign(document.createElement("img"), {src: L.inat(p0, "medium"), alt: "", loading: "lazy", title: `Photo © ${p0.by} · ${p0.lic}`}));
  /* twelve, with their names; twelve more at a time on request */
  let n = 12;
  const draw = () => {
    body.innerHTML = `<div class="week-grid">${list.slice(0, n).map(tile).join("")}</div>`
      + `<p class="week-more">${n < list.length ? `<button type="button" class="btn ghost" data-more>Show ${Math.min(12, list.length - n)} more</button>` : ""}`
      + `<span class="muted small">${n < list.length ? `${n} of ${list.length}` : `All ${list.length}`}${n > 12 ? ` · <button type="button" class="linkish" data-less>Show fewer</button>` : ""}</span></p>`;
  };
  draw();
  body.onclick = e => {
    if(e.target.closest("[data-more]")){ n += 12; draw(); }
    if(e.target.closest("[data-less]")){ n = 12; draw(); sec.scrollIntoView({block: "nearest"}); }
  };
}

async function guidePage(F){
  const r = L.rng("living " + L.today()), st = state();
  const pick = await heroPick(F, r);
  const quiet = (id, title, sub) => `<section class="section" id="${id}" hidden><h2>${title}</h2>${sub ? `<p class="muted small sec-sub">${sub}</p>` : ""}<div class="body"></div></section>`;
  main.innerHTML = (pick ? `<section class="hero"><div class="frame" data-hide-broken><a href="${pick.href}"><img src="${L.photoSrc(pick.photo, "large")}"${pick.fb ? ` data-fallback="${pick.fb}"` : ""} alt="${esc(pick.name)}"></a>${L.photoCredit(pick.photo)}</div>` : `<section class="hero">`)
    + `<h1>Living things</h1><p class="sub-line">Plants and animals of the Pacific Northwest${pick ? ` · <a href="${pick.href}">${esc(pick.name)}</a> above` : ""}</p></section>
    ${quiet("out", `Out in ${MONTH}`, "")}
    <div class="split pair">${quiet("songs", "Songs &amp; calls of the season", `Birds, and the mammals and frogs heard in ${MONTH}, recorded in the field. One plays after another.`)}
    ${quiet("week", "Seen this week", "The most-sighted species in Washington, Oregon and British Columbia over the last seven days")}</div>
    <section class="section" id="browse"><h2 id="list-h">Explore</h2>
    <div class="filters"><input type="search" id="q" placeholder="Find any species" aria-label="Find any species" value="${esc(st.q)}"></div>
    <div class="cards" id="explore-cards"></div><div class="cards" id="group-cards" style="margin-top:28px"></div><p class="muted small" id="group-line" style="margin-top:20px"></p><div id="list"></div></section>`;
  if(navigator.onLine !== false){
    outNow(F).catch(() => {});
    /* once both have answered, a lone one takes the whole width */
    Promise.all([songs().catch(() => {}), week(F).catch(() => {})]).then(() => main.querySelector(".pair")?.classList.toggle("solo", $("songs").hidden || $("week").hidden));
  }
  explore(F).catch(() => {});
  if(st.q) requestAnimationFrame(() => $("browse").scrollIntoView());
  /* a search shows its species in place of the cards; clearing it brings the cards back */
  let token = 0;
  const draw = async () => {
    const q = state().q, me = ++token, box = $("list"), head = $("list-h");
    for(const id of ["explore-cards", "group-cards", "group-line"]) $(id).hidden = !!q;
    if(!q){ box.innerHTML = ""; head.innerHTML = "Explore"; return; }
    box.innerHTML = `<p class="status muted">Asking iNaturalist…</p>`;
    try {
      const j = await L.nat("taxa/autocomplete", {q, per_page: 30, is_active: "true"});
      const ts = j.results.filter(t => ["species", "subspecies", "variety", "form"].includes(t.rank));
      if(me !== token) return;
      head.innerHTML = `Matching “${esc(q)}” <span class="n">${ts.length}</span>`;
      box.innerHTML = ts.length ? `<div class="grid">${ts.map(t => F?.byId[t.id] ? L.speciesTile(F.byId[t.id]) : L.liveTile(L.taxonCard(t))).join("")}</div>` : `<p class="muted">Nothing found.</p>`;
      L.fillPhotos(box);
    } catch(e){
      if(me === token) box.innerHTML = `<p class="muted">Couldn't reach iNaturalist just now. <button type="button" class="linkish" id="retry">Try again</button></p>`;
    }
  };
  $("browse").addEventListener("click", e => { if(e.target.id === "retry") draw(); });
  window.addEventListener("hashchange", () => { $("q").value = state().q; draw(); });
  let t; $("q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { const v = e.target.value.trim(); setState({g: "all", q: v.length > 1 ? v : ""}); draw(); }, 350); });
  draw();
}

/* ---------- a group's own page (living/?g=birds): what it is, when and where to look, its classics, what's out now,
   its kinds, and its species most recorded first, a page at a time ---------- */
const MOST = 24;
async function groupPage(F, key){
  const g = L.group(key), top = g.top, sub = g.k !== top.k;
  const D = (await L.data.json("groups.json").catch(() => null))?.groups || {}, words = D[g.k] || {}, parent = D[top.k] || {};
  document.title = `${g.name} — Lookout`;
  const taxa = g.taxa || "";
  /* the picture: its first classic, or (for a kind) the kind itself */
  const heroId = words.ids?.[0] || (taxa ? taxa.split(",")[0] : null);
  const ht = heroId ? await L.nat("taxa/" + heroId).then(j => j.results?.[0]).catch(() => null) : null;
  let photo = ht && L.taxonCard(ht).photo;
  /* the wildflowers are the pack: its most-seen flower with a photo */
  const packTop = g.pack && F ? [...F.list].sort((a, b) => b.obs - a.obs).find(x => x.photos?.length) : null;
  if(packTop) photo = packTop.photos[0];
  const kinds = top.sub && !sub ? top.sub : [];
  main.innerHTML = `<section class="hero">${photo ? `<div class="frame" data-hide-broken><a href="${packTop ? L.speciesHref(packTop) : L.speciesHref(ht)}"><img src="${L.photoSrc(photo, "large")}"${packTop ? ` data-fallback="${L.thumb(packTop)}"` : ""} alt=""></a>${L.photoCredit(photo)}</div>` : ""}
      <p class="eyebrow"><a href="./" class="crumb">Living things</a>${sub ? ` · <a href="?g=${top.k}" class="crumb">${esc(top.name)}</a>` : ""}</p>
      <h1>${esc(g.name)}</h1>${words.hook ? `<p class="sub-line">${esc(words.hook)}</p>` : ""}</section>
    <div class="split"><div>
      ${(words.intro || []).length ? `<div class="about">${words.intro.map(p => `<p>${esc(p)}</p>`).join("")}</div>` : ""}
      ${words.look ? `<h2 class="side-h" style="margin-top:28px">When and where to look</h2><p>${esc(words.look)}</p>` : ""}
      <dl class="facts" style="margin-top:24px"><dt hidden>Recorded here</dt><dd hidden id="g-species"></dd><dt hidden>Sightings</dt><dd hidden id="g-sightings"></dd><dt hidden>Busiest months</dt><dd hidden id="g-months"></dd></dl>
    </div><div>${top.k === "tidepools" && !sub ? `<div id="tides" hidden></div>` : taxa ? `<div id="range" hidden><h2 class="side-h">Where it's recorded</h2><div class="mapbox tall" id="g-map"></div><p class="legend"><span><i class="grid-key"></i>Research-grade sightings on iNaturalist</span><span><i></i>Your places</span></p></div>` : ""}</div></div>
    ${top.k === "tidepools" && !sub ? `<section class="section" id="spots" hidden><h2>Where to go</h2><div class="split"><div class="mapbox" id="spot-map"></div><div class="spots-box"><ul class="around spots"></ul></div></div></section>` : ""}
    <section class="section" id="classics" hidden><h2>Northwest classics</h2><div class="row"></div></section>
    <section class="section" id="g-now" hidden><h2>Out in ${MONTH}</h2><div class="row"></div></section>
    ${kinds.length ? `<section class="section"><h2>Kinds of ${esc(g.name.toLowerCase())}</h2><div class="cards" id="kinds">${kinds.map(k => `<a class="card" href="?g=${k.k}" data-k="${k.k}"><div class="pic"><span class="ph">${L.initials(k.name)}</span></div><h3>${esc(k.name)}</h3>${D[k.k]?.hook ? `<p>${esc(D[k.k].hook)}</p>` : ""}</a>`).join("")}</div></section>` : ""}
    ${taxa ? `<section class="section" id="kinds-sec" hidden><h2>${kinds.length ? "Families" : `Kinds of ${esc(g.name.toLowerCase())}`} <span class="n"></span></h2><div class="cards"></div></section>` : ""}
    ${top.k === "tidepools" && !sub ? `<section class="section" id="care" hidden><h2>Looking without harming</h2><ul class="around"></ul></section>` : ""}
    <section class="section" id="most"><h2 id="most-h">Most recorded</h2>
      ${g.pack ? "" : `<div class="filters"><input type="search" id="gq" placeholder="Find ${esc(g.name.toLowerCase())}" aria-label="Find ${esc(g.name.toLowerCase())}"></div>`}<div id="list"></div></section>`;

  /* the numbers, each appearing once it's known */
  const fact = (id, html) => { const el = $(id); if(!el || !html) return; el.innerHTML = html; el.hidden = false; el.previousElementSibling.hidden = false; };
  if(taxa){
    L.nat("observations/species_counts", {place_id: L.PNW, taxon_id: taxa, quality_grade: "research", per_page: 0}).then(j => fact("g-species", `${L.num(j.total_results)} species in the Pacific Northwest`)).catch(() => {});
    L.nat("observations", {place_id: L.PNW, taxon_id: taxa, verifiable: "true", per_page: 0}).then(j => fact("g-sightings", `${L.num(j.total_results)} <a class="small" href="https://www.inaturalist.org/observations?taxon_ids=${taxa}&place_id=${L.PNW}" target="_blank" rel="noopener">see them ↗</a>`)).catch(() => {});
    L.nat("observations/histogram", {place_id: L.PNW, taxon_id: taxa, interval: "month_of_year", verifiable: "true"}).then(j => {
      const h = Object.values(j.results?.month_of_year || {}), topN = Math.max(...h); if(!topN) return;
      const shade = h.map(v => v / topN), months = shade.map((v, i) => v > .75 ? i + 1 : 0).filter(Boolean);
      fact("g-months", monthBar([], L.month(), shade) + esc(L.bloomText(months)));
    }).catch(() => {});
    if($("g-map") && L.rangeMap && navigator.onLine !== false){ $("range").hidden = false; L.data.places().then(P => P.list).catch(() => []).then(pl => L.rangeMap($("g-map"), taxa, pl)); }
  }
  /* the classics, in the order they're written */
  if(words.ids?.length) L.nat("taxa/" + words.ids.join(",")).then(j => {
    const by = Object.fromEntries(j.results.map(t => [t.id, t]));
    const tiles = words.ids.map(i => by[i]).filter(Boolean).map(t => F?.byId[t.id] ? L.speciesTile(F.byId[t.id]) : L.liveTile(L.taxonCard(t)));
    if(!tiles.length) return;
    const sec = $("classics"); sec.querySelector(".row").innerHTML = tiles.join(""); sec.hidden = false; L.fillPhotos(sec);
  }).catch(() => {});
  /* out this month */
  if(taxa) counts({month: L.month(), taxon_id: taxa, per_page: 30}).then(l => {
    if(l.length < 4) return;
    const sec = $("g-now"); sec.querySelector(".row").innerHTML = l.map(x => tileOf(F, x, `${L.num(x.count)} ${x.count === 1 ? "sighting" : "sightings"}`)).join(""); sec.hidden = false; L.fillPhotos(sec);
  }).catch(() => {});
  /* each kind's card gets a picture of the kind */
  if(kinds.length){
    const ids = kinds.map(k => (k.taxa || "").split(",")[0]).filter(Boolean);
    L.nat("taxa/" + ids.join(",")).then(j => {
      const by = Object.fromEntries(j.results.map(t => [String(t.id), L.taxonCard(t).photo]));
      for(const k of kinds){ const p = by[(k.taxa || "").split(",")[0]], c = main.querySelector(`#kinds [data-k="${k.k}"] .pic`);
        if(p && c) c.innerHTML = `<img src="${L.inat(p, "medium")}" alt="" loading="lazy" title="Photo © ${esc(p.by)} · ${esc(p.lic)}">`; }
      /* a kind whose own picture isn't openly licensed: its most-recorded species' instead */
      for(const k of kinds){ const c = main.querySelector(`#kinds [data-k="${k.k}"] .pic`); if(!c || c.querySelector("img") || !k.taxa) continue;
        counts({taxon_id: k.taxa, per_page: 5}).then(l => { const p = l.find(x => x.t.photo)?.t.photo; if(p) c.innerHTML = `<img src="${L.inat(p, "medium")}" alt="" loading="lazy" title="Photo © ${esc(p.by)} · ${esc(p.lic)}">`; }).catch(() => {}); }
    }).catch(() => {});
    /* the wildflowers are the pack: their card uses one of its thumbnails */
    const fl = main.querySelector('#kinds [data-k="flowers"] .pic'), s0 = F?.list?.[0];
    if(fl && s0) fl.innerHTML = `<img src="${L.thumb(s0)}" alt="" loading="lazy">`;
  }
  if(g.pack && F) packSeason(F);
  if(top.k === "tidepools" && !sub) tidePools().catch(() => {});
  if(taxa) showKinds($("kinds-sec"), taxa, "family");

  /* most recorded, a page at a time; the search looks only within the group */
  if(g.pack) return flowerGrid(F, $("list"), $("most-h"));
  let page = 1, q = "", token = 0;
  const draw = async (more = false) => {
    const me = ++token, box = $("list"), head = $("most-h");
    if(!more){ page = 1; box.innerHTML = `<p class="status muted">Asking iNaturalist…</p>`; }
    try {
      let tiles, total;
      if(q){
        const j = await L.nat("taxa/autocomplete", {q, per_page: 30, is_active: "true", ...(taxa ? {taxon_id: taxa} : {})});
        const ts = j.results.filter(t => ["species", "subspecies", "variety", "form"].includes(t.rank));
        tiles = ts.map(t => F?.byId[t.id] ? L.speciesTile(F.byId[t.id]) : L.liveTile(L.taxonCard(t))); total = ts.length;
        if(me !== token) return;
        head.innerHTML = `Matching “${esc(q)}” <span class="n">${total}</span>`;
      } else {
        const j = await L.nat("observations/species_counts", {place_id: L.PNW, quality_grade: "research", per_page: MOST, page, ...(taxa ? {taxon_id: taxa} : {})});
        if(me !== token) return;
        total = j.total_results;
        tiles = j.results.map(x => F?.byId[x.taxon.id] ? L.speciesTile(F.byId[x.taxon.id]) : L.liveTile(L.taxonCard(x.taxon)));
        head.innerHTML = `Most recorded <span class="n">${L.num(Math.min(page * MOST, total))} of ${L.num(total)}</span>`;
      }
      if(!more) box.innerHTML = `<div class="grid" id="grid"></div><p id="more-p" style="margin-top:22px" hidden><button type="button" class="btn ghost" id="more">Show ${MOST} more</button></p>`;
      $("grid").insertAdjacentHTML("beforeend", tiles.join(""));
      if(!$("grid").children.length) box.innerHTML = `<p class="muted">Nothing found.</p>`;
      $("more-p") && ($("more-p").hidden = !!q || page * MOST >= total);
      L.fillPhotos(box);
    } catch(e){
      if(me === token) box.innerHTML = `<p class="muted">Couldn't reach iNaturalist just now. <button type="button" class="linkish" id="retry">Try again</button></p>`;
    }
  };
  $("most").addEventListener("click", e => { if(e.target.id === "more"){ page++; draw(true); } if(e.target.id === "retry") draw(); });
  let t; $("gq")?.addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { const v = e.target.value.trim(); q = v.length > 1 ? v : ""; draw(); }, 350); });
  draw();
}

/* the wildflowers page, from the saved pack (so it works with no signal): how many bloom in each month, and what's in
   bloom now, or (in the off season) what comes up first */
function packSeason(F){
  const m = L.month(), per = L.MON.map((_, i) => F.list.filter(s => s.bloom?.includes(i + 1)).length), most = Math.max(...per);
  const fact = (id, html) => { const el = $(id); if(!el) return; el.innerHTML = html; el.hidden = false; el.previousElementSibling.hidden = false; el.previousElementSibling.textContent = id === "g-species" ? "In the key" : el.previousElementSibling.textContent; };
  fact("g-species", `${F.list.length} species`);
  fact("g-months", monthBar([], m, per.map(n => n / most)) + esc(L.bloomText(per.map((n, i) => n > most * .6 ? i + 1 : 0).filter(Boolean))));
  let mm = m, title = `In bloom in ${MONTH}`;
  if(per[m - 1] < 4){ for(let k = 1; k < 12; k++){ const x = (m - 1 + k) % 12 + 1; if(per[x - 1] >= 4){ mm = x; title = `Coming up in ${L.MONTHS[x - 1]}`; break; } } }
  const l = F.list.filter(s => s.bloom?.includes(mm)).sort((a, b) => b.obs - a.obs).slice(0, 30);
  const sec = $("g-now"); if(!sec || l.length < 4) return;
  sec.querySelector("h2").textContent = title;
  sec.querySelector(".row").innerHTML = l.map(s => L.speciesTile(s, `<span class="note">${esc(L.bloomText(s.bloom))}</span>`)).join("");
  sec.hidden = false;
}

/* ---------- tide pools: the month's low tides at a NOAA station, the spots on a map, and how to look without harm ---------- */
const NOAA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const clock = d => d.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"}).toLowerCase().replace(" ", " ");
async function tidePools(){
  const T = await L.data.json("tidepools.json").catch(() => null); if(!T) return;
  /* care */
  const care = $("care"); if(care && T.care?.length){ care.querySelector("ul").innerHTML = T.care.map(c => `<li>${esc(c)}</li>`).join(""); care.hidden = false; }
  /* the spots */
  const spots = $("spots"), Lf = window.L;
  const pick = st => { setStation(st); $("tides")?.scrollIntoView({behavior: "smooth", block: "start"}); };
  if(spots && T.spots?.length){
    const station = id => T.stations.find(s => s.id === id)?.name;
    spots.querySelector("ul").innerHTML = T.spots.map((p, i) => `<li data-i="${i}"><b>${esc(p.name)}</b> <span>${esc(p.where)}</span><br><span>${esc(p.note)}</span>${p.station ? `<br><button type="button" class="linkish small" data-st="${p.station}">Low tides here (${esc(station(p.station))})</button>` : ""}</li>`).join("");
    spots.addEventListener("click", e => { const b = e.target.closest("[data-st]"); if(b) pick(b.dataset.st); });
    /* the list scrolls beside the map; its bottom edge fades while there's more */
    const sb = spots.querySelector(".spots-box"), mark = () => sb.classList.toggle("more-down", sb.scrollTop < sb.scrollHeight - sb.clientHeight - 4);
    sb.addEventListener("scroll", mark, {passive: true}); new ResizeObserver(mark).observe(sb);
    spots.hidden = false;
    if(Lf && navigator.onLine !== false){
      const m = Lf.map("spot-map", {scrollWheelZoom: false});
      Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 13, crossOrigin: "anonymous", className: "base-tiles",
        attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`}).addTo(m);
      const pts = T.spots.map(p => {
        Lf.marker([p.lat, p.lon], {title: p.name, icon: Lf.divIcon({className: "", html: `<span class="pin"></span>`, iconSize: [14, 14]})}).addTo(m)
          .bindPopup(`<span class="pop"><b>${esc(p.name)}</b><span>${esc(p.where)}</span></span>`);
        return [p.lat, p.lon]; });
      const fit = () => { m.invalidateSize(); m.fitBounds(pts, {padding: [20, 20]}); };
      fit(); new ResizeObserver(fit).observe($("spot-map"));
    } else $("spot-map").hidden = true;
  }
  /* the low tides */
  const box = $("tides"); if(!box || navigator.onLine === false) return;
  const saved = L.store.get("lookout-tide-station", "9442396");
  box.innerHTML = `<h2 class="side-h">Low tides, the next four weeks</h2>
    <div class="filters"><label>Tides at <select id="station">${T.stations.map(s => `<option value="${s.id}"${s.id === saved ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label></div>
    <ul class="around tides" id="tide-list"></ul><p class="credit">Predictions from <a href="https://tidesandcurrents.noaa.gov/" target="_blank" rel="noopener">NOAA</a>, in feet above the average lowest tide (MLLW); below zero is a minus tide. Times are local.</p>`;
  async function setStation(id){
    $("station").value = id; L.store.set("lookout-tide-station", id);
    const list = $("tide-list"); list.innerHTML = `<li class="muted">Asking NOAA…</li>`;
    try {
      const j = await fetch(`${NOAA}?product=predictions&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json&application=lookout&station=${id}&begin_date=${ymd(new Date())}&range=${28 * 24}`, {signal: AbortSignal.timeout(15000)}).then(r => r.json());
      const lows = (j.predictions || []).filter(p => p.type === "L").map(p => ({d: new Date(p.t.replace(" ", "T")), v: +p.v}));
      /* the lowest in daylight (7 am to 7:30 pm), lowest first; then in date order */
      const day = lows.filter(x => { const h = x.d.getHours() + x.d.getMinutes() / 60; return h >= 7 && h <= 19.5; });
      const best = day.filter(x => x.v < .5).sort((a, b) => a.v - b.v).slice(0, 8).sort((a, b) => a.d - b.d);
      if(!best.length){
        const low = day.sort((a, b) => a.v - b.v).slice(0, 4).sort((a, b) => a.d - b.d);
        list.innerHTML = low.length ? `<li class="muted">No minus tides in daylight these four weeks; these are the lowest.</li>` + low.map(row).join("") : `<li class="muted">No predictions just now.</li>`;
      } else list.innerHTML = best.map(row).join("");
    } catch(e){ list.innerHTML = `<li class="muted">Couldn't reach NOAA just now.</li>`; }
    box.hidden = false;
  }
  const row = x => `<li><span><b>${x.d.toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"})}</b>, ${clock(x.d)}</span><span class="ft">${x.v < 0 ? "−" : ""}${Math.abs(x.v).toFixed(1)} ft</span></li>`;
  $("station").addEventListener("change", e => setStation(e.target.value));
  box.hidden = false;
  setStation(saved);
}

/* ---------- Foraging and the harvest (living/?f=foraging): wild food by the month, the look-alikes that can kill,
   shellfish safety, and the market's and the garden's year (data/foraging.json) ---------- */
const KIND_ORDER = ["berries", "greens", "mushrooms", "nuts", "shore"];
async function taxaById(ids){
  const out = {}, u = [...new Set(ids.filter(Boolean))];
  for(let i = 0; i < u.length; i += 30) try { (await L.nat("taxa/" + u.slice(i, i + 30).join(","))).results.forEach(t => out[t.id] = t); } catch(e){}
  return out;
}
async function foragingPage(F){
  const D = await L.data.json("foraging.json").catch(() => null);
  if(!D){ main.innerHTML = `<h1>Foraging</h1><p class="muted">The foraging guide didn't load.</p>`; return; }
  document.title = "Foraging and the harvest — Lookout";
  const m = L.month(), T = navigator.onLine === false ? {} : await taxaById([...D.wild.flatMap(w => [w.id, w.dangerId]), ...D.deadly.map(d => d.id)]);
  const card = id => T[id] ? L.taxonCard(T[id]) : null;
  /* the picture: the first thing in season now that has an open photo */
  const now = D.wild.filter(w => w.months.includes(m));
  const lead = [...now.filter(w => w.kind === "mushrooms"), ...now.filter(w => w.kind === "berries"), ...now, ...D.wild].map(w => card(w.id)).find(c => c?.photo);
  const inMonth = (list, mm) => list.filter(x => x.months.includes(mm)).map(x => x.name);
  const bullets = (l, none) => l.length ? `<ul class="bullets">${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${esc(none)}.</p>`;
  main.innerHTML = `<section class="hero">${lead ? `<div class="frame" data-hide-broken><a href="${L.speciesHref(lead)}"><img src="${L.inat(lead.photo, "large")}" alt="${esc(lead.common || lead.sci)}"></a>${L.photoCredit(lead.photo)}</div>` : ""}
      <p class="eyebrow"><a href="./" class="crumb">Living things</a></p><h1>Foraging and the harvest</h1><p class="sub-line">${esc(D.hook)}</p></section>
    <div class="split"><div><div class="about">${D.intro.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <h2 class="side-h" style="margin-top:28px">First, the rules</h2><ul class="around rules">${D.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
      <div><h2 class="side-h">At the market in ${MONTH}</h2>${bullets(inMonth(D.harvest, m), "Little fresh; stored apples, squash and roots")}
        <p class="muted small">The main crops of the region's farms, not every one.</p>
        <h2 class="side-h" style="margin-top:28px">Sow or plant now</h2>${bullets(inMonth(D.sow, m), "Nothing outdoors yet west of the Cascades; plan, and order seed")}
        <p class="muted small">For gardens west of the Cascades; a month or so later east of the mountains and up high.</p></div></div>
    <section class="section" id="wild"><h2><span>Wild food in <span id="wild-m">${MONTH}</span></span></h2>
      <div class="chips" id="months" style="margin:0 0 18px">${L.MON.map((n, i) => `<button type="button" class="chip" data-m="${i + 1}" aria-pressed="${i + 1 === m}">${n}</button>`).join("")}</div><div id="wild-list"></div></section>
    <section class="section" id="doubles" hidden><h2>The dangerous doubles</h2><p class="muted small sec-sub">Each pair grows in the same places. The first is good to eat; the second can make you very sick, or kill.</p><div class="doubles"></div></section>
    <section class="section" id="deadly" hidden><h2>The deadly ones</h2><div class="cards"></div></section>
    <section class="section"><h2>Shellfish</h2><p>Clams, mussels and oysters can carry toxins from algal blooms that cooking doesn't destroy, and a beach that was fine last week can close today. Check before every trip:</p>
      <ul class="around">${D.shellfish.map(x => `<li><a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a></li>`).join("")}</ul></section>
    <div class="split section"><div><h2 class="side-h">The year at the market</h2><dl class="facts">${D.harvest.map(x => `<dt>${esc(x.name)}</dt><dd>${monthBar(x.months, m)}</dd>`).join("")}</dl></div>
      <div><h2 class="side-h">When to sow</h2><dl class="facts">${D.sow.map(x => `<dt>${esc(x.name)}</dt><dd>${monthBar(x.months, m)}</dd>`).join("")}</dl></div></div>`;

  /* wild food for a month, kind by kind */
  const tile = (w, extra = "") => { const c = card(w.id); if(!c) return "";
    return F?.byId[c.id] ? L.speciesTile(F.byId[c.id], extra) : L.liveTile(c, extra); };
  const drawWild = mm => {
    $("wild-m").textContent = L.MONTHS[mm - 1];
    const l = D.wild.filter(w => w.months.includes(mm));
    $("wild-list").innerHTML = l.length ? KIND_ORDER.map(k => { const ks = l.filter(w => w.kind === k); if(!ks.length) return "";
      return `<h3 class="kind-h">${esc(D.groups[k])}</h3><div class="row">${ks.map(w => tile(w, `<span class="note">${esc(L.bloomText(w.months))}${w.danger ? " · has a dangerous look-alike, below" : ""}</span>`)).join("")}</div>`; }).join("")
      : `<p class="muted">Little to pick wild in ${L.MONTHS[mm - 1]}. Try another month.</p>`;
    L.fillPhotos($("wild-list"));
  };
  $("months").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if(!b) return;
    $("months").querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === b)); drawWild(+b.dataset.m); });
  drawWild(m);
  /* the doubles: each edible with the dangerous plant or mushroom it's taken for */
  const pairs = D.wild.filter(w => w.danger && card(w.id) && card(w.dangerId));
  if(pairs.length){
    const nm = id => { const c = card(id); return c.common || c.sci; };
    $("doubles").querySelector(".doubles").innerHTML = pairs.map(w => `<div class="double"><h3>${esc(nm(w.id))} or ${esc(nm(w.dangerId))}?</h3>
      <div class="two">${tile(w, `<span class="note">Edible</span>`)}${tile({id: w.dangerId}, `<span class="note danger">Dangerous</span>`)}</div><p class="small">${esc(w.dangerNote)}</p></div>`).join("");
    $("doubles").hidden = false; L.fillPhotos($("doubles"));
  }
  /* the deadly */
  const dl = D.deadly.filter(d => card(d.id));
  if(dl.length){
    $("deadly").querySelector(".cards").innerHTML = dl.map(d => { const c = card(d.id), p = c.photo;
      return `<a class="card" href="${L.speciesHref(c)}"><div class="pic">${p ? `<img src="${L.inat(p, "medium")}" alt="" loading="lazy" title="Photo © ${esc(p.by)} · ${esc(p.lic)}">` : `<span class="ph">${L.initials(c.common || c.sci)}</span>`}</div><h3>${esc(c.common || c.sci)}</h3><p>${esc(d.note)}</p></a>`; }).join("");
    $("deadly").hidden = false;
  }
}

/* ---------- Near you (living/?f=near): a map of what people have photographed around you lately, the latest
   sightings, what's around you by kind (tiles that open), the best bets this month, and rare finds. Your location is
   kept on this device a few hours, shared with the key's "Use my location". ---------- */
const HABITATS = [
  ["water", "In the water", "47178,47273,47549,47534,85493,48824,47113,47429,47811,48220,57774,50863", "fish"],
  ["birds", "Birds", "3", "birds"],
  ["plants", "Trees and flowers", "47126", "plants"],
  ["fungi", "Mushrooms and lichens", "47170", "fungi"],
  ["bugs", "Bugs and spiders", "47158,47119", "insects"],
  ["mammals", "Mammals", "40151", "mammals"],
  ["herps", "Frogs, snakes and lizards", "20978,26036", "amphibians"],
  ["snails", "Slugs and snails", "47114", "snails"]];
const ago = d => { const n = Math.round((Date.now() - new Date(d)) / 864e5); return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 14 ? `${n} days ago` : `${Math.round(n / 7)} weeks ago`; };
/* photographs as round pins on a map (Near you, Whales): at most max, one per species unless many is set; a pin landing
   on another is nudged aside so both can be tapped. Each opens to the photo, what it is, when and who. Returns the points. */
function photoPins(map, F, obs, {max = 40, many = false} = {}){
  const Lf = window.L, pinned = [], ids = new Set(), taken = new Map(), pts = [];
  for(const x of obs){ if((!many && ids.has(x.t.id)) || pinned.length >= max) continue; ids.add(x.t.id); pinned.push(x); }
  for(const x of pinned){ let [lng, lat] = x.o.geojson.coordinates; const name = x.t.common || x.t.sci;
    const cell = `${lat.toFixed(3)},${lng.toFixed(3)}`, n = taken.get(cell) || 0; taken.set(cell, n + 1);
    if(n){ const a = n * 2.4; lat += Math.sin(a) * .0012 * Math.ceil(n / 6); lng += Math.cos(a) * .0018 * Math.ceil(n / 6); }
    pts.push([lat, lng]);
    Lf.marker([lat, lng], {title: name, icon: Lf.divIcon({className: "", html: `<span class="photo-pin"><img src="${L.inat(x.p, "square")}" alt=""></span>`, iconSize: [36, 36]})}).addTo(map)
      .bindPopup(`<a class="pop near-pop" href="${L.speciesHref(F?.byId[x.t.id] || x.t)}"><img src="${L.inat(x.p, "small")}" alt=""><b>${esc(name)}</b><span>${esc(ago(x.o.observed_on))}${x.o.place_guess ? ` · ${esc(String(x.o.place_guess).split(",")[0])}` : ""}${x.o.user?.login ? ` · ${esc(x.o.user.login)}` : ""}</span></a><span class="credit">© ${esc(x.p.by)} · ${esc(x.p.lic)}</span>`, {maxWidth: 220});
  }
  return pts;
}
/* recent observations with open-licensed photos, in the shape the pins and rows use */
const recentObs = j => j.results.map(o => ({o, p: L.openPhoto(o.photos?.[0]), t: o.taxon && L.taxonCard(o.taxon)})).filter(x => x.p && x.t && x.o.geojson);

async function nearPage(F){
  document.title = "Near you — Lookout";
  let r = String(L.store.get("lookout-near-km", 10)), map = null;
  main.innerHTML = `<section class="hero"><p class="eyebrow"><a href="./" class="crumb">Living things</a></p><h1>Near you</h1>
      <p class="sub-line" id="where-line">What people have found around where you're standing</p>
      <div class="filters" style="margin:16px 0 0"><div class="chips" id="radius" role="group" aria-label="How far">${[["2", "Within 2 km"], ["10", "10 km"], ["25", "25 km"]].map(([v, l]) => `<button type="button" class="chip" data-r="${v}" aria-pressed="${v === r}">${l}</button>`).join("")}</div>
      <button type="button" class="btn ghost" id="locate">Use my location</button><span class="muted small" id="where-note"></span></div></section>
    <div id="near-body" hidden>
      <section class="section" id="n-map-sec"><h2>Found lately <span class="n" id="n-map-n"></span></h2><p class="muted small sec-sub">Photographs people have shared from around here in the last month. Tap one.</p><div class="mapbox near-map" id="n-map"></div></section>
      <section class="section" id="n-recent" hidden><h2>Just seen</h2><div class="row"></div></section>
      <section class="section" id="n-hab" hidden><h2>Around you</h2><p class="muted small sec-sub">Everything ever recorded here, by kind. Open one.</p><div class="kinds" id="hab-tiles"></div><div id="hab-open"></div></section>
      <section class="section" id="n-best" hidden><h2>Best bets this ${L.MONTHS[L.month() - 1]}</h2><p class="muted small sec-sub">Seen most around here this month in past years: your best chance of finding them.</p><div class="cards"></div></section>
      <section class="section" id="n-rare" hidden><h2>Rare finds <span class="aside"><button type="button" class="linkish" id="reshuffle">Show me others</button></span></h2><p class="muted small sec-sub">Recorded here only once or twice.</p><div class="row"></div></section>
      <section class="section" id="n-places" hidden><h2>Your places nearby</h2><div class="cards"></div></section>
    </div>`;
  const here = () => { const h = L.store.get("lookout-near", null); return h && Date.now() - h.t < 6 * 36e5 ? h : null; };
  const sightings = n => `${L.num(n)} ${n === 1 ? "sighting" : "sightings"}`;
  let token = 0;
  const show = async () => {
    const h = here(); if(!h) return;
    const me = ++token, where = {lat: h.lat, lng: h.lon, radius: r};
    $("locate").textContent = "Update my location"; $("where-note").textContent = ""; $("near-body").hidden = false;
    /* the place's name */
    L.nat("places/nearby", {nelat: h.lat + .001, nelng: h.lon + .001, swlat: h.lat - .001, swlng: h.lon - .001, per_page: 20}).then(j => {
      const c = (j.results?.community || []).sort((a, b) => (a.bbox_area || 1) - (b.bbox_area || 1))[0], st = (j.results?.standard || []).sort((a, b) => (a.bbox_area || 1) - (b.bbox_area || 1))[0];
      const name = c && c.bbox_area < .05 ? c.name.trim() : st ? `${st.name}${st.admin_level === 20 ? " County" : ""}` : "";
      if(name && me === token) $("where-line").textContent = `Around ${name}`;
    }).catch(() => {});

    /* the map and the latest sightings: observations with photographs in the last month */
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    L.nat("observations", {...where, d1: since, photos: "true", photo_license: L.LICENSES, order_by: "observed_on", per_page: 80, verifiable: "true"}).then(j => {
      if(me !== token) return;
      const obs = j.results.map(o => ({o, p: L.openPhoto(o.photos?.[0]), t: o.taxon && L.taxonCard(o.taxon)})).filter(x => x.p && x.t && x.o.geojson);
      $("n-map-n").textContent = obs.length ? `${new Set(obs.map(x => x.t.id)).size} species in the last month` : "";
      const Lf = window.L;
      if(Lf){
        if(map) map.remove();
        map = Lf.map("n-map", {scrollWheelZoom: false}).setView([h.lat, h.lon], 12);
        Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 17, className: "base-tiles", attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · sightings © <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a> observers`}).addTo(map);
        const ring = Lf.circle([h.lat, h.lon], {radius: +r * 1000, color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d5c43", weight: 1.5, fill: false, dashArray: "4 6"}).addTo(map);
        Lf.marker([h.lat, h.lon], {icon: Lf.divIcon({className: "", html: `<span class="you-dot"></span>`, iconSize: [16, 16]}), title: "You"}).addTo(map);
        photoPins(map, F, obs);
        map.fitBounds(ring.getBounds(), {padding: [10, 10]});
      }
      /* the latest, one per species */
      const seen = new Set(), latest = obs.filter(x => !seen.has(x.t.id) && seen.add(x.t.id)).slice(0, 24);
      if(latest.length >= 3){ const sec = $("n-recent");
        sec.querySelector(".row").innerHTML = latest.map(x => `<a class="sp" href="${L.speciesHref(F?.byId[x.t.id] || x.t)}" title="Photo © ${esc(x.p.by)} · ${esc(x.p.lic)}"><div class="pic"><img src="${L.inat(x.p, "small")}" alt="" loading="lazy"></div><b>${esc(x.t.common || x.t.sci)}</b><i>${esc(x.t.sci)}</i><span class="note">${esc(ago(x.o.observed_on))}${x.o.user?.login ? ` · ${esc(x.o.user.login)}` : ""}</span></a>`).join("");
        sec.hidden = false; }
    }).catch(() => { $("n-map-sec").hidden = true; });

    /* around you, by kind: a mosaic tile each, which opens to its species */
    const rows = await Promise.all(HABITATS.map(([k, name, taxa, g]) => L.nat("observations/species_counts", {...where, taxon_id: taxa, verifiable: "true", per_page: 24})
      .then(j => ({k, name, g, taxa, total: j.total_results, l: j.results.filter(x => ["species", "subspecies", "variety"].includes(x.taxon.rank)).map(x => ({t: L.taxonCard(x.taxon), count: x.count}))})).catch(() => null)));
    if(me !== token) return;
    const habs = rows.filter(x => x && x.l.length >= 2);
    if(habs.length){
      const sec = $("n-hab"), open = $("hab-open");
      $("hab-tiles").innerHTML = habs.map(x => `<button type="button" class="kind" data-hab="${x.k}"><div class="pics">${x.l.filter(y => y.t.photo).slice(0, 4).map(y => `<img src="${L.inat(y.t.photo, "small")}" alt="" loading="lazy">`).join("")}</div><b>${esc(x.name)}</b><i>${L.num(x.total)} species</i></button>`).join("");
      $("hab-tiles").onclick = e => { const b = e.target.closest("[data-hab]"); if(!b) return;
        const x = habs.find(y => y.k === b.dataset.hab), was = b.getAttribute("aria-expanded") === "true";
        $("hab-tiles").querySelectorAll(".kind").forEach(k => k.setAttribute("aria-expanded", "false"));
        if(was){ open.innerHTML = ""; return; }
        b.setAttribute("aria-expanded", "true");
        open.innerHTML = `<h3 class="kind-h" style="margin-top:28px">${esc(x.name)} <span class="muted small">${L.num(x.total)} species, the most recorded first</span>
          <a class="small" style="margin-left:10px" href="${L.ROOT}key/#key=here&g=${x.g}&at=${h.lat},${h.lon}&r=${r === "2" ? "1" : r === "25" ? "25" : "5"}&when=year">Name one in the key →</a></h3>
          <div class="row">${x.l.map(y => tileOf(F, y, sightings(y.count))).join("")}</div>`;
        L.fillPhotos(open); open.scrollIntoView({behavior: "smooth", block: "nearest"}); };
      sec.hidden = false;
    }

    /* best bets this month: the most seen around here in this month of the year */
    counts({...where, month: L.month(), per_page: 12}).then(l => {
      if(me !== token || l.length < 4) return;
      const sec = $("n-best");
      sec.querySelector(".cards").innerHTML = l.filter(x => x.t.photo).slice(0, 8).map(x => `<a class="card" href="${L.speciesHref(F?.byId[x.t.id] || x.t)}"><div class="pic"><img src="${L.inat(x.t.photo, "medium")}" alt="" loading="lazy" title="Photo © ${esc(x.t.photo.by)} · ${esc(x.t.photo.lic)}"></div><h3>${esc(x.t.common || x.t.sci)}</h3><p>${sightings(x.count)} here in ${L.MONTHS[L.month() - 1]}s</p></a>`).join("");
      sec.hidden = false;
    }).catch(() => {});

    /* rare finds: recorded here only once or twice */
    counts({...where, per_page: 500, verifiable: "true", quality_grade: "research"}).then(l => {
      if(me !== token) return;
      const rare = l.filter(x => x.count <= 2 && x.t.photo); if(rare.length < 4) return;
      const sec = $("n-rare"), draw = () => { sec.querySelector(".row").innerHTML = L.shuffle(rare, Math.random).slice(0, 12).map(x => tileOf(F, x, x.count === 1 ? "Recorded once here" : "Recorded twice here")).join(""); };
      draw(); $("reshuffle").onclick = draw; sec.hidden = false;
    }).catch(() => {});

    /* your places within 50 km, nearest first */
    const P = await L.data.places().catch(() => null);
    const near = (P?.list || []).map(p => ({p, d: L.km({lat: h.lat, lon: h.lon}, {lat: p.pin.lat, lon: p.pin.lon})})).filter(x => x.d <= 50).sort((a, b) => a.d - b.d).slice(0, 4);
    const pl = $("n-places"); pl.hidden = !near.length;
    if(near.length){ pl.querySelector(".cards").innerHTML = near.map(x => L.placeCard(x.p, P.region[x.p.region])).join(""); L.ownPhotos(pl); }
  };
  const locate = () => {
    if(!navigator.geolocation){ $("where-note").textContent = " This browser can't share a location."; return; }
    $("where-note").textContent = " Finding you…";
    navigator.geolocation.getCurrentPosition(pos => {
      L.store.set("lookout-near", {lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), t: Date.now()}); show();
    }, () => { $("where-note").textContent = " Your browser didn't share a location. Allow it for this site to see what's around you."; }, {timeout: 15000, maximumAge: 600000});
  };
  $("locate").addEventListener("click", locate);
  $("radius").addEventListener("click", e => { const b = e.target.closest("[data-r]"); if(!b) return; r = b.dataset.r; L.store.set("lookout-near-km", +r);
    $("radius").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b)); $("hab-open").innerHTML = ""; show(); });
  if(navigator.onLine === false){ $("where-note").textContent = " Near you needs a connection to iNaturalist."; return; }
  if(here()) show(); else locate();
}

/* ---------- Salmon runs (living/?f=salmon): who's in the rivers this month, the six fish and their months, where to
   watch them, what people have seen lately, and how to watch without harm (data/salmon.json) ---------- */
async function salmonPage(F){
  const D = await L.data.json("salmon.json").catch(() => null);
  if(!D){ main.innerHTML = `<h1>Salmon runs</h1><p class="muted">The salmon guide didn't load.</p>`; return; }
  document.title = "Salmon runs — Lookout";
  const m = L.month(), odd = new Date().getFullYear() % 2 === 1;
  const here = f => f.river.includes(m) && !(f.odd && !odd);
  const T = navigator.onLine === false ? {} : await taxaById(D.fish.map(f => f.id));
  const photo = id => T[id] ? L.taxonCard(T[id]).photo : null;
  /* the picture: a fish spawning now, in its spawning colours (coho and sockeye first: their photos show them red) */
  const order = ["Coho", "Sockeye", "Chum", "Chinook", "Steelhead", "Pink"], byOrder = l => [...l].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const lead = [...byOrder(D.fish.filter(f => f.spawn.includes(m) && here(f))), ...byOrder(D.fish)].map(f => ({f, p: photo(f.id)})).find(x => x.p);
  const running = D.fish.filter(here), spawning = running.filter(f => f.spawn.includes(m));
  const nowSpots = D.spots.filter(sp => sp.months.includes(m));
  main.innerHTML = `<section class="hero">${lead ? `<div class="frame" data-hide-broken><a href="${L.speciesHref({id: lead.f.id})}"><img src="${L.inat(lead.p, "large")}" alt="${esc(lead.f.name)} salmon"></a>${L.photoCredit(lead.p)}</div>` : ""}
      <p class="eyebrow"><a href="./" class="crumb">Living things</a> · <a href="?g=fish" class="crumb">Fish</a></p><h1>Salmon runs</h1><p class="sub-line">${esc(D.hook)}</p></section>
    <div class="split"><div class="about">${D.intro.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <div><h2 class="side-h">In the rivers in ${MONTH}</h2>${running.length ? `<ul class="bullets" style="columns:1">${running.map(f => `<li><b>${esc(f.name)}</b>${f.spawn.includes(m) ? ", spawning now" : ", coming home"}</li>`).join("")}</ul>` : `<p>Few runs in ${MONTH}.</p>`}
        ${D.fish.some(f => f.odd) && !odd ? `<p class="muted small">Pink salmon return in odd-numbered years: next in ${new Date().getFullYear() + 1}.</p>` : ""}
        ${nowSpots.length ? `<h2 class="side-h" style="margin-top:24px">Where to watch now</h2><ul class="bullets" style="columns:1">${nowSpots.map(sp => `<li>${esc(sp.name)} <span class="muted small">${esc(sp.fish)}</span></li>`).join("")}</ul>` : ""}</div></div>
    <section class="section"><h2>Six fish, coming home</h2><p class="muted small sec-sub">Shaded months are when each is in the rivers; the outlined month is now. Each river runs a little earlier or later.</p>
      <div class="cards">${D.fish.map(f => { const p = photo(f.id);
        return `<a class="card" href="${L.speciesHref({id: f.id})}"><div class="pic">${p ? `<img src="${L.inat(p, "medium")}" alt="" loading="lazy" title="Photo © ${esc(p.by)} · ${esc(p.lic)}">` : `<span class="ph">${L.initials(f.name)}</span>`}${here(f) ? `<span class="badge">${f.spawn.includes(m) ? "Spawning now" : "In the rivers"}</span>` : ""}</div>
          <h3>${esc(f.name)} <span class="muted small">${esc(f.aka)}</span></h3>${monthBar(f.river, m)}<p>Spawns ${esc(L.bloomText(f.spawn))}${f.odd ? ", odd years" : ""}. ${esc(f.note)}</p></a>`; }).join("")}</div></section>
    <section class="section" id="spots"><h2>Where to watch them</h2><div class="split"><div class="mapbox" id="spot-map"></div><div class="spots-box"><ul class="around spots">${D.spots.map(sp => `<li><b>${esc(sp.name)}</b> <span>${esc(sp.where)}</span>${sp.months.includes(m) ? ` <span class="now-tag">Now</span>` : ""}<br><span>${esc(sp.fish)}, ${esc(L.bloomText(sp.months))}. ${esc(sp.note)}</span></li>`).join("")}</ul></div></div></section>
    <section class="section" id="s-recent" hidden><h2>Seen in the rivers lately</h2><p class="muted small sec-sub">Salmon and steelhead photographed in Washington, Oregon and British Columbia in the last month.</p><div class="row"></div></section>
    <section class="section"><h2>Watching without harm</h2><ul class="around">${D.care.map(c => `<li>${esc(c)}</li>`).join("")}</ul></section>`;
  /* the map: every spot, those running now filled in */
  const Lf = window.L;
  if(Lf && navigator.onLine !== false){
    const mp = Lf.map("spot-map", {scrollWheelZoom: false});
    Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 13, className: "base-tiles", attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`}).addTo(mp);
    const pts = D.spots.map(sp => { Lf.marker([sp.lat, sp.lon], {title: sp.name, icon: Lf.divIcon({className: "", html: `<span class="pin${sp.months.includes(m) ? " done" : ""}"></span>`, iconSize: [14, 14]})}).addTo(mp)
      .bindPopup(`<span class="pop"><b>${esc(sp.name)}</b><span>${esc(sp.fish)}, ${esc(L.bloomText(sp.months))}</span></span>`); return [sp.lat, sp.lon]; });
    const fit = () => { mp.invalidateSize(); mp.fitBounds(pts, {padding: [20, 20]}); }; fit(); new ResizeObserver(fit).observe($("spot-map"));
    const sb = main.querySelector(".spots-box"), mark = () => sb.classList.toggle("more-down", sb.scrollTop < sb.scrollHeight - sb.clientHeight - 4);
    sb.addEventListener("scroll", mark, {passive: true}); new ResizeObserver(mark).observe(sb);
  } else $("spot-map").hidden = true;
  /* seen lately: photographs of salmon and steelhead from the last month, one per photo-taker and place */
  if(navigator.onLine !== false){
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    L.nat("observations", {taxon_id: D.fish.map(f => f.id).join(","), place_id: L.PNW, d1: since, photos: "true", photo_license: L.LICENSES, order_by: "observed_on", per_page: 30, verifiable: "true"}).then(j => {
      const l = j.results.map(o => ({o, p: L.openPhoto(o.photos?.[0]), t: o.taxon && L.taxonCard(o.taxon)})).filter(x => x.p && x.t).slice(0, 18);
      if(l.length < 3) return;
      const town = w => String(w || "").split(",").map(x => x.trim()).filter(x => x && !/\d/.test(x) && !/^(USA?|United States|Canada|CA)$/.test(x)).slice(-2).join(", ");
      const sec = $("s-recent"); sec.querySelector(".row").innerHTML = l.map(x => `<a class="sp" href="${L.speciesHref(x.t)}" title="Photo © ${esc(x.p.by)} · ${esc(x.p.lic)}"><div class="pic"><img src="${L.inat(x.p, "small")}" alt="" loading="lazy"></div><b>${esc(x.t.common || x.t.sci)}</b><span class="note">${esc([ago(x.o.observed_on), town(x.o.place_guess)].filter(Boolean).join(" · "))}</span></a>`).join("");
      sec.hidden = false;
    }).catch(() => {});
  }
}

/* ---------- Whales (living/?f=whales): who's around this month, the seven, a map of the last month's sightings,
   where to watch from shore, and how to watch without harm (data/whales.json) ---------- */
async function whalesPage(F){
  const D = await L.data.json("whales.json").catch(() => null);
  if(!D){ main.innerHTML = `<h1>Whales</h1><p class="muted">The whale guide didn't load.</p>`; return; }
  document.title = "Whales — Lookout";
  const m = L.month(), T = navigator.onLine === false ? {} : await taxaById(D.whales.map(w => w.id));
  const photo = id => T[id] ? L.taxonCard(T[id]).photo : null;
  const now = D.whales.filter(w => w.months.includes(m)), nowSpots = D.spots.filter(sp => sp.months.includes(m));
  const lead = [41566, 41521, 41478].map(id => ({id, p: photo(id)})).find(x => x.p);
  main.innerHTML = `<section class="hero">${lead ? `<div class="frame" data-hide-broken><a href="${L.speciesHref({id: lead.id})}"><img src="${L.inat(lead.p, "large")}" alt=""></a>${L.photoCredit(lead.p)}</div>` : ""}
      <p class="eyebrow"><a href="./" class="crumb">Living things</a> · <a href="?g=mammals" class="crumb">Mammals</a></p><h1>Whales</h1><p class="sub-line">${esc(D.hook)}</p></section>
    <div class="split"><div class="about">${D.intro.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <div><h2 class="side-h">Around in ${MONTH}</h2><ul class="bullets" style="columns:1">${now.map(w => `<li>${esc(w.name)}</li>`).join("")}</ul>
        ${nowSpots.length ? `<h2 class="side-h" style="margin-top:24px">Where to watch now</h2><ul class="bullets" style="columns:1">${nowSpots.map(sp => `<li>${esc(sp.name)} <span class="muted small">${esc(sp.who)}</span></li>`).join("")}</ul>` : ""}
        <h2 class="side-h" style="margin-top:24px">Listen live</h2><p class="small"><a href="${esc(D.listen.href)}" target="_blank" rel="noopener">${esc(D.listen.name)} ↗</a> · ${esc(D.listen.text)}</p></div></div>
    <section class="section" id="w-map-sec" hidden><h2>Seen lately <span class="n" id="w-map-n"></span></h2><p class="muted small sec-sub">Whales, dolphins and porpoises photographed in Washington, Oregon and British Columbia in the last month. Tap one.</p><div class="mapbox near-map" id="w-map"></div></section>
    <section class="section"><h2>Who you might see</h2><p class="muted small sec-sub">Shaded months are the best for each; the outlined month is now.</p>
      <div class="cards">${D.whales.map(w => { const p = photo(w.id);
        return `<a class="card" href="${L.speciesHref({id: w.id})}"><div class="pic">${p ? `<img src="${L.inat(p, "medium")}" alt="" loading="lazy" title="Photo © ${esc(p.by)} · ${esc(p.lic)}">` : `<span class="ph">${L.initials(w.name)}</span>`}${w.months.includes(m) ? `<span class="badge">Around now</span>` : ""}</div>
          <h3>${esc(w.name)}</h3>${monthBar(w.months, m)}<p>${esc(w.note)}</p></a>`; }).join("")}</div></section>
    <section class="section" id="spots"><h2>Where to watch from shore</h2><div class="split"><div class="mapbox" id="spot-map"></div><div class="spots-box"><ul class="around spots">${D.spots.map(sp => `<li><b>${esc(sp.name)}</b> <span>${esc(sp.where)}</span>${sp.months.includes(m) ? ` <span class="now-tag">Now</span>` : ""}<br><span>${esc(sp.who)}, ${esc(L.bloomText(sp.months))}. ${esc(sp.note)}</span></li>`).join("")}</ul></div></div></section>
    <section class="section"><h2>Watching without harm</h2><ul class="around">${D.care.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      <ul class="around" style="margin-top:14px">${D.links.map(x => `<li><a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a></li>`).join("")}</ul></section>`;
  const Lf = window.L; if(!Lf || navigator.onLine === false){ $("spot-map").hidden = true; return; }
  /* the shore spots, those good now filled in */
  const mp = Lf.map("spot-map", {scrollWheelZoom: false});
  Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 13, className: "base-tiles", attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`}).addTo(mp);
  const pts = D.spots.map(sp => { Lf.marker([sp.lat, sp.lon], {title: sp.name, icon: Lf.divIcon({className: "", html: `<span class="pin${sp.months.includes(m) ? " done" : ""}"></span>`, iconSize: [14, 14]})}).addTo(mp)
    .bindPopup(`<span class="pop"><b>${esc(sp.name)}</b><span>${esc(sp.who)}, ${esc(L.bloomText(sp.months))}</span></span>`); return [sp.lat, sp.lon]; });
  const fit = () => { mp.invalidateSize(); mp.fitBounds(pts, {padding: [20, 20]}); }; fit(); new ResizeObserver(fit).observe($("spot-map"));
  const sb = main.querySelector(".spots-box"), mark = () => sb.classList.toggle("more-down", sb.scrollTop < sb.scrollHeight - sb.clientHeight - 4);
  sb.addEventListener("scroll", mark, {passive: true}); new ResizeObserver(mark).observe(sb);
  /* the last month's sightings as photo pins: every whale, dolphin and porpoise (152871, the cetaceans) */
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  L.nat("observations", {taxon_id: "152871", place_id: L.PNW, d1: since, photos: "true", photo_license: L.LICENSES, order_by: "observed_on", per_page: 80, verifiable: "true"}).then(j => {
    const obs = recentObs(j); if(obs.length < 2) return;
    const sec = $("w-map-sec"); sec.hidden = false;
    $("w-map-n").textContent = `${obs.length} in the last month`;
    const wm = Lf.map("w-map", {scrollWheelZoom: false}).setView([48, -123.5], 6);
    Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 13, className: "base-tiles", attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · sightings © <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a> observers`}).addTo(wm);
    const wp = photoPins(wm, F, obs, {max: 60, many: true});
    if(wp.length) wm.fitBounds(wp, {padding: [24, 24], maxZoom: 10});
  }).catch(() => {});
}

/* ---------- Explore: a card for each group, in place of one long wall ---------- */
async function explore(F){
  const D = (await L.data.json("groups.json").catch(() => null))?.groups || {};
  /* four features in a row, then twelve groups, four by four; worms and slime moulds in a line below */
  const LINE = ["worms", "slime"], groups = L.GROUPS.filter(g => g.k !== "all" && !LINE.includes(g.k));
  $("explore-cards").innerHTML = `<a class="card" href="?f=near" data-k="near"><div class="pic"><span class="ph">Ne</span><span class="badge">Near you</span></div><h3>Near you</h3><p>What's been recorded around where you're standing, this week, this month and ever</p></a><a class="card" href="?f=foraging" data-k="foraging"><div class="pic"><span class="ph">Fo</span><span class="badge">In season</span></div><h3>Foraging and the harvest</h3><p>Berries, greens and mushrooms by the month, and the look-alikes that can kill</p></a><a class="card" href="?f=salmon" data-k="salmon"><div class="pic"><span class="ph">Sa</span><span class="badge">Running now</span></div><h3>Salmon runs</h3><p>When the five salmon come home, and where to watch them</p></a><a class="card" href="?f=whales" data-k="whales"><div class="pic"><span class="ph">Wh</span></div><h3>Whales</h3><p>Orcas, humpbacks and gray whales, and where to watch from shore</p></a>`;
  $("group-cards").innerHTML = groups.map(g => `<a class="card" href="?g=${g.k}" data-k="${g.k}"><div class="pic"><span class="ph">${L.initials(g.name)}</span>${g.k === "tidepools" ? `<span class="badge">Low tides</span>` : ""}</div>
    <h3>${esc(g.name)}</h3>${D[g.k]?.hook ? `<p>${esc(D[g.k].hook)}</p>` : ""}</a>`).join("");
  $("group-line").innerHTML = "Also: " + LINE.map(k => `<a href="?g=${k}">${esc(L.group(k).name)}</a>`).join(" · ");
  /* whales' card: a humpback */
  L.nat("taxa/41566").then(j => { const p = L.taxonCard(j.results[0]).photo, c = main.querySelector('[data-k="whales"] .pic');
    if(p && c) c.querySelector(".ph")?.replaceWith(Object.assign(document.createElement("img"), {src: L.inat(p, "medium"), alt: "", loading: "lazy", title: `Photo © ${p.by} · ${p.lic}`})); }).catch(() => {});
  /* each group card's picture: its first classic */
  /* salmon's card: a spawning coho (Fish has the sockeye) */
  L.nat("taxa/53692").then(j => { const p = L.taxonCard(j.results[0]).photo, c = main.querySelector('[data-k="salmon"] .pic');
    if(p && c) c.querySelector(".ph")?.replaceWith(Object.assign(document.createElement("img"), {src: L.inat(p, "medium"), alt: "", loading: "lazy", title: `Photo © ${p.by} · ${p.lic}`})); }).catch(() => {});
  /* near you's card: the most-seen species this week, if the week is known in this browser */
  const wk = L.store.get("lookout-kept-week", null)?.v?.find(x => x.t.photo)?.t.photo, nc = main.querySelector('[data-k="near"] .pic');
  if(wk && nc) nc.querySelector(".ph")?.replaceWith(Object.assign(document.createElement("img"), {src: L.inat(wk, "medium"), alt: "", loading: "lazy", title: `Photo © ${wk.by} · ${wk.lic}`}));
  /* foraging's card: the salmonberry, the first wild fruit of the year (not a mushroom: Fungi has the chanterelle) */
  L.data.json("foraging.json").then(Fo => { const w = Fo.wild.find(x => x.sci === "Rubus spectabilis") || Fo.wild.find(x => x.kind === "berries");
    return w?.id && L.nat("taxa/" + w.id); }).then(j => { const p = j && L.taxonCard(j.results[0]).photo, c = main.querySelector('[data-k="foraging"] .pic');
    if(p && c) c.querySelector(".ph")?.replaceWith(Object.assign(document.createElement("img"), {src: L.inat(p, "medium"), alt: "", loading: "lazy", title: `Photo © ${p.by} · ${p.lic}`})); }).catch(() => {});
  const ids = groups.map(g => D[g.k]?.ids?.[0]).filter(Boolean);
  if(ids.length && navigator.onLine !== false) L.nat("taxa/" + ids.join(",")).then(j => {
    const by = Object.fromEntries(j.results.map(t => [t.id, L.taxonCard(t).photo]));
    for(const g of groups){ const p = by[D[g.k]?.ids?.[0]], c = main.querySelector(`[data-k="${g.k}"] .pic`);
      if(p && c) c.querySelector(".ph")?.replaceWith(Object.assign(document.createElement("img"), {src: L.inat(p, "medium"), alt: "", loading: "lazy", title: `Photo © ${p.by} · ${p.lic}`})); }
  }).catch(() => {});
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
  const gk = new URLSearchParams(location.search).get("g") || (!id && new URLSearchParams(location.hash.slice(1)).get("g"));
  if(gk && L.group(gk).k === gk && gk !== "all"){
    if(location.hash) history.replaceState(null, "", location.pathname + "?g=" + gk);
    return groupPage(F, gk);
  }
  if(new URLSearchParams(location.search).get("f") === "foraging") return foragingPage(F);
  if(new URLSearchParams(location.search).get("f") === "near") return nearPage(F);
  if(new URLSearchParams(location.search).get("f") === "salmon") return salmonPage(F);
  if(new URLSearchParams(location.search).get("f") === "whales") return whalesPage(F);
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
