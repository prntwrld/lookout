/* Lookout — shared by every page: the header, the theme, the data packs, your log, and the offline worker.
   Load it as the first thing inside <body>; it writes the header in place, so there is no flash.

   Everything the pages need from outside the page goes through three small doors, so a native shell
   (Capacitor, or a SwiftUI app reading the same JSON) can swap any of them without touching the pages:
     Lookout.data   — the JSON packs in data/ (fetch, relative to the site root)
     Lookout.store  — small settings and your log (localStorage)
     Lookout.photos — your own photos (IndexedDB) */
{
const ROOT = new URL("..", document.currentScript.src).href;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $ = id => document.getElementById(id);
const here = document.body.dataset.page || "home";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MON = MONTHS.map(m => m.slice(0, 3));

/* ---------- the header ---------- */
const NAV = [["places", "Places"], ["living", "Living things"], ["key", "Key"]];
document.currentScript.insertAdjacentHTML("afterend", `<header class="top wrap">
  <a class="mark" href="${ROOT}"${here === "home" ? ` aria-current="page"` : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 20 9 8l4 6 3-4 6 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17" cy="5" r="1.8" fill="currentColor"/></svg>Lookout</a>
  <nav aria-label="Sections">${NAV.map(([id, name]) => `<a href="${ROOT}${id}/"${id === here ? ` aria-current="page"` : ""}>${name}</a>`).join("")}</nav>
  <button class="theme" id="theme" type="button" aria-label="Switch between light and dark"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>
</header>`);

/* ---------- the theme: light or dark, remembered ---------- */
const theme = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.addEventListener("click", e => {
  if(!e.target.closest("#theme")) return;
  const next = theme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("lookout-theme", next);
  document.dispatchEvent(new CustomEvent("lookout-theme", {detail: next}));
});

/* ---------- small storage that never breaks the page ---------- */
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } }
};

/* ---------- the data packs ---------- */
const cache = {};
const getJSON = name => cache[name] ||= fetch(ROOT + "data/" + name).then(r => { if(!r.ok) throw new Error(name + " " + r.status); return r.json(); });
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : "";
const opt = name => getJSON(name).catch(() => null);
const data = {
  json: getJSON,
  /* places with what the tools found for them, your books and the regions */
  async places(){
    const [p, extra, books, regions] = await Promise.all([getJSON("places.json"), opt("places-extra.json"), opt("books.json"), getJSON("regions.json")]);
    const ex = extra?.places || {};
    const list = p.places.map(x => ({...x, ...(ex[x.id] || {}), pin: ex[x.id]?.trailhead || {lat: x.lat, lon: x.lon}}));
    return {list, byId: Object.fromEntries(list.map(x => [x.id, x])), books: books?.books || [], regions: regions.regions,
      region: Object.fromEntries(regions.regions.map(r => [r.id, r])),
      taxa: Object.fromEntries(Object.entries(extra?.taxa || {}).map(([k, t]) => [k, {...t, common: cap(t.common)}]))};
  },
  /* the wildflower pack, joined to the hand-written traits and Pojar pages */
  async flowers(){
    const [f, t, pj] = await Promise.all([getJSON("flowers.json"), opt("flower-traits.json"), opt("pojar.json")]);
    const traits = t?.traits || {}, pages = pj?.pages || {};
    const list = f.species.map(s => {
      const parts = (traits[s.sci] || "").split("|").map(x => x.trim().split(/\s+/).filter(Boolean));
      const [colour = [], petals = [], leaf = [], arr = [], habitat = []] = parts;
      return {...s, common: cap(s.common), colour, petals, leaf, arr, habitat, pojar: String(pages[s.sci] || "").trim()};
    });
    return {list, bySlug: Object.fromEntries(list.map(s => [s.slug, s])), byId: Object.fromEntries(list.map(s => [s.id, s])), codes: t?.codes || {}};
  },
  /* any other trait pack (birds, …): <name>.json joined to <name minus s>-traits.json, whose codes.slots names each column */
  async pack(name, traitsFile){
    const [f, t] = await Promise.all([getJSON(name + ".json"), opt(traitsFile)]);
    const traits = t?.traits || {}, slots = t?.codes?.slots || [];
    const list = f.species.map(s => {
      const parts = (traits[s.sci] || "").split("|").map(x => x.trim().split(/\s+/).filter(Boolean));
      return {...s, common: cap(s.common), ...Object.fromEntries(slots.map((k, i) => [k, parts[i] || []]))};
    });
    return {list, bySlug: Object.fromEntries(list.map(s => [s.slug, s])), byId: Object.fromEntries(list.map(s => [s.id, s])), codes: t?.codes || {}};
  },
  birds(){ return data.pack("birds", "bird-traits.json"); }
};

/* ---------- pictures ---------- */
const inat = (p, size = "medium") => `https://inaturalist-open-data.s3.amazonaws.com/photos/${p.id}/${size}.${p.ext}`;
const thumb = s => `${ROOT}data/thumbs/${s.id}.jpg`;
/* a remote picture falls back to the offline thumbnail when it can't load (no network) */
document.addEventListener("error", e => {
  const img = e.target;
  if(img.tagName !== "IMG") return;
  if(img.dataset.fallback && img.src !== img.dataset.fallback){ img.src = img.dataset.fallback; return; }
  const box = img.closest("[data-hide-broken]"); if(box) box.hidden = true; else img.classList.add("broken");
}, true);
const credit = (by, lic, href) => `<span class="credit">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">` : ""}© ${esc(by)}${href ? "</a>" : ""} · ${esc(lic)}</span>`;
const inatCredit = p => credit(p.by, p.lic, `https://www.inaturalist.org/photos/${p.id}`);

/* ---------- iNaturalist, live ----------
   Living things reaches every species recorded in the Pacific Northwest (Washington, Oregon and British Columbia,
   as in Myriad's Field Guide). Answers are kept for the visit so going back and forth asks nothing twice. */
const NAT = "https://api.inaturalist.org/v1/", PNW = "46,10,7085";
const natCache = new Map();
const fetchJSON = async (url, tries = 2) => {
  const r = await fetch(url, {signal: AbortSignal.timeout(15000)});
  if(r.status === 429 && tries > 1){ await new Promise(ok => setTimeout(ok, 1500)); return fetchJSON(url, tries - 1); }
  if(!r.ok) throw new Error("iNaturalist " + r.status);
  return r.json();
};
const nat = (path, params = {}) => {
  const url = NAT + path + (Object.keys(params).length ? "?" + new URLSearchParams(params) : "");
  if(!natCache.has(url)) natCache.set(url, fetchJSON(url).catch(e => { natCache.delete(url); throw e; }));
  return natCache.get(url);
};
/* only CC0 and CC BY photos are shown, each credited */
const OPEN = {"cc0": "CC0", "cc-by": "CC BY"};
const openPhoto = p => {
  const lic = OPEN[(p?.license_code || "").toLowerCase()], m = /photos\/(\d+)\/[a-z]+\.(\w+)/i.exec(p?.url || p?.medium_url || "");
  if(!lic || !m) return null;
  const by = String(p.attribution || "").replace(/^\(c\)\s*/, "").split(/, (some|no) rights/)[0].trim();
  return {id: +m[1], ext: m[2], by: /^no rights/i.test(by) || !by ? "an iNaturalist observer" : by, lic};
};
/* a live taxon in the shape the pages use */
const taxonCard = t => ({id: t.id, sci: t.name, common: cap(t.preferred_common_name || ""), rank: t.rank, group: t.iconic_taxon_name || "",
  photo: [t.default_photo, ...(t.taxon_photos || []).map(x => x.photo)].map(openPhoto).find(Boolean) || null});
/* an open photo for each taxon that lacks one: first iNaturalist's own picks (30 taxa a request), then, one at a
   time and gently, the region's best-voted open-licensed observation */
const photoMemo = new Map();
let photoQueue = Promise.resolve();
async function openPhotos(ids){
  const need = [...new Set(ids)].filter(id => !photoMemo.has(id));
  for(let i = 0; i < need.length; i += 30){
    const batch = need.slice(i, i + 30);
    try { const j = await nat("taxa/" + batch.join(",")); for(const t of j.results) photoMemo.set(t.id, taxonCard(t).photo); } catch(e){}
  }
  return Object.fromEntries(ids.map(id => [id, photoMemo.get(id) || null]));
}
const obsPhoto = id => photoQueue = photoQueue.then(async () => {
  if(photoMemo.get(id)) return photoMemo.get(id);
  await new Promise(ok => setTimeout(ok, 450));
  try {
    const j = await nat("observations", {taxon_id: id, photo_license: "cc0,cc-by", quality_grade: "research", order_by: "votes", per_page: 3, place_id: PNW});
    const p = j.results.flatMap(o => o.photos || []).map(openPhoto).find(Boolean) || null;
    photoMemo.set(id, p); return p;
  } catch(e){ return null; }
});

/* ---------- links ---------- */
const placeHref = id => `${ROOT}places/?id=${encodeURIComponent(id)}`;
/* a species in the wildflower pack goes by its name; any other species by its iNaturalist number */
const speciesHref = s => `${ROOT}living/?id=${encodeURIComponent(s.slug || s.id)}`;
const inatTaxon = id => `https://www.inaturalist.org/taxa/${id}`;

/* ---------- seasons ---------- */
const month = () => new Date().getMonth() + 1;
const inRange = (m, [a, b]) => a <= b ? m >= a && m <= b : m >= a || m <= b;
const inSeason = (p, m = month()) => Array.isArray(p.season) && inRange(m, p.season);
const seasonText = s => Array.isArray(s) ? (s[0] === s[1] ? MONTHS[s[0] - 1] : `${MON[s[0] - 1]}\u2060–\u2060${MON[s[1] - 1]}`) : "";
const blooming = (s, m = month()) => (s.bloom || []).includes(m);
const bloomText = b => {
  if(!b?.length) return "";
  /* runs of months: [5,6,7,9] -> May–Jul, Sep */
  const runs = []; let start = b[0], prev = b[0];
  for(const m of [...b.slice(1), 99]){ if(m !== prev + 1){ runs.push(start === prev ? MON[start - 1] : `${MON[start - 1]}\u2060–\u2060${MON[prev - 1]}`); start = m; } prev = m; }
  return runs.join(", ");
};

/* ---------- numbers ---------- */
const num = n => Number(n).toLocaleString("en-US");
const miles = n => n == null ? "" : `${Number(n).toLocaleString("en-US", {maximumFractionDigits: 1})}\u00a0mi`;
const feet = n => n == null ? "" : `${num(n)}\u00a0ft`;
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const KIND = {"hike": "Hike", "lookout": "Fire lookout", "hot-spring": "Hot spring", "ghost-town": "Ghost town", "viewpoint": "Viewpoint"};

/* ---------- the same pick for everyone today (as in Myriad's discover.js) ---------- */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const hash = s => { let h = 2166136261; for(const c of String(s)){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => { let a = typeof seed === "number" ? seed : hash(seed); return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const shuffle = (list, r) => { const a = [...list]; for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- your photos: IndexedDB, one per place ---------- */
const DB = "lookout", PHOTOS = "photos";
let dbp = null;
const db = () => dbp ||= new Promise((ok, no) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(PHOTOS);
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, no) => {
  const t = d.transaction(PHOTOS, mode), req = fn(t.objectStore(PHOTOS)); t.oncomplete = () => ok(req?.result); t.onerror = () => no(t.error); }); };
const photos = {
  get: id => tx("readonly", s => s.get(id)).catch(() => null),          /* a data: URL, or undefined */
  set: (id, url) => tx("readwrite", s => s.put(url, id)),
  del: id => tx("readwrite", s => s.delete(id)).catch(() => {}),
  all: () => tx("readonly", s => s.getAllKeys()).then(async keys => Object.fromEntries(await Promise.all(keys.map(async k => [k, await photos.get(k)])))).catch(() => ({}))
};
/* shrink a picked photo to at most 1600px on its long side, as a JPEG data: URL */
const shrink = (file, max = 1600) => new Promise((ok, no) => {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", .82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); no(new Error("not a picture")); };
  img.src = url;
});

/* ---------- your log: what you've done, when, and a note ---------- */
const LOG = "lookout-log";
const log = {
  all: () => store.get(LOG, {}),                                      /* {placeId: {date, note, photo: true?}} */
  get: id => log.all()[id] || null,
  set(id, entry){ const a = log.all(); a[id] = {...entry, at: Date.now()}; store.set(LOG, a); document.dispatchEvent(new CustomEvent("lookout-log")); },
  async remove(id){ const a = log.all(); delete a[id]; store.set(LOG, a); await photos.del(id); document.dispatchEvent(new CustomEvent("lookout-log")); },
  /* everything, photos included, as one JSON file */
  async export(){
    const pics = await photos.all();
    const blob = new Blob([JSON.stringify({lookout: 1, exported: new Date().toISOString(), log: log.all(), photos: pics}, null, 1)], {type: "application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lookout-${today()}.json`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  /* merge a file made by export(): an entry in the file replaces the same place's entry here */
  async import(file){
    const j = JSON.parse(await file.text());
    if(!j || typeof j.log !== "object") throw new Error("That isn't a Lookout file.");
    const a = log.all();
    for(const [id, e] of Object.entries(j.log)) if(e && typeof e === "object") a[id] = {date: String(e.date || ""), note: String(e.note || ""), photo: !!e.photo, at: e.at || Date.now()};
    store.set(LOG, a);
    for(const [id, url] of Object.entries(j.photos || {})) if(typeof url === "string" && url.startsWith("data:image/")) await photos.set(id, url);
    document.dispatchEvent(new CustomEvent("lookout-log"));
    return Object.keys(j.log).length;
  }
};

/* ---------- offline ---------- */
if("serviceWorker" in navigator && location.protocol !== "file:"){
  window.addEventListener("load", () => navigator.serviceWorker.register(ROOT + "sw.js").catch(() => {}));
}

/* ---------- shared pieces of pages ---------- */
/* a Wikimedia picture at another width (their thumbnails are named "<width>px-<file>") */
const sized = (src, w) => String(src || "").replace(/\/(\d+)px-([^/]+)$/, `/${w}px-$2`);
const initials = s => esc(String(s || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join(""));
const placeCard = (p, region) => {
  const done = log.get(p.id);
  return `<a class="card" href="${placeHref(p.id)}" data-place="${esc(p.id)}"><div class="pic">${p.photo
    ? `<img src="${esc(sized(p.photo.src, 500))}" alt="" loading="lazy" crossorigin="anonymous">` : `<span class="ph">${initials(p.name)}</span>`}
    ${done ? `<span class="tick" title="Done ${esc(done.date)}" aria-label="Done">✓</span>` : ""}<span class="badge">${esc(KIND[p.kind] || p.kind)}</span></div>
    <h3>${esc(p.name)}</h3><p>${[region?.name, p.distance_mi != null && miles(p.distance_mi), p.gain_ft != null && `${num(p.gain_ft)}\u00a0ft\u00a0gain`].filter(Boolean).map(esc).join(" · ")}</p></a>`;
};
/* once your own photos are known, they replace the stock picture on cards of places you've done */
const ownPhotos = async root => {
  for(const a of (root || document).querySelectorAll("[data-place]")){
    if(!log.get(a.dataset.place)?.photo) continue;
    const url = await photos.get(a.dataset.place), pic = a.querySelector(".pic");
    if(!url || !pic) continue;
    pic.querySelector("img, .ph")?.remove(); pic.insertAdjacentHTML("afterbegin", `<img src="${url}" alt="">`);
  }
};
/* a species as a square tile; local thumbnails, so it works offline */
const speciesTile = (s, extra = "") => `<a class="sp" href="${speciesHref(s)}"><div class="pic"><img src="${thumb(s)}" alt="" loading="lazy"></div>
  <b>${esc(s.common || s.sci)}</b><i>${esc(s.sci)}</i>${extra}</a>`;
/* a live species (any taxon from iNaturalist) as a square tile; its photo may arrive later (fillPhotos) */
const liveTile = (t, extra = "") => `<a class="sp" href="${speciesHref(t)}" data-tid="${t.id}"><div class="pic">${t.photo
  ? `<img src="${inat(t.photo, "small")}" alt="" loading="lazy" crossorigin="anonymous">` : `<span class="ph">${initials(t.common || t.sci)}</span>`}</div>
  <b>${esc(t.common || t.sci)}</b><i>${esc(t.sci)}</i>${extra}</a>`;
/* give every live tile under root an open-licensed photo where one exists; tiles left without one keep their initials */
async function fillPhotos(root){
  const tiles = [...root.querySelectorAll("[data-tid]")].filter(a => !a.querySelector("img"));
  if(!tiles.length) return;
  const put = (a, p) => { if(!p || a.querySelector("img")) return; a.querySelector(".pic").innerHTML = `<img src="${inat(p, "small")}" alt="" loading="lazy" crossorigin="anonymous">`; };
  const got = await openPhotos(tiles.map(a => +a.dataset.tid));
  const left = [];
  for(const a of tiles){ const p = got[+a.dataset.tid]; p ? put(a, p) : left.push(a); }
  /* the rest, one by one, only as they come into view */
  const io = new IntersectionObserver(es => es.forEach(e => { if(!e.isIntersecting) return; io.unobserve(e.target);
    obsPhoto(+e.target.dataset.tid).then(p => put(e.target, p)); }), {rootMargin: "200px"});
  left.forEach(a => io.observe(a));
}
/* a section that only appears if it has something in it */
const section = (title, body, {id = "", aside = "", n = ""} = {}) => body ? `<section class="section"${id ? ` id="${id}"` : ""}>
  <h2>${title}${n !== "" ? ` <span class="n">${n}</span>` : ""}${aside ? `<span class="aside">${aside}</span>` : ""}</h2>${body}</section>` : "";
const toast = msg => { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); };
const footer = () => `<footer class="wrap"><span>Photos: <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a> observers (CC0, CC BY) and <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a></span>
  <span>Maps: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></span>
  <span>Text from <a href="https://en.wikipedia.org" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA</span><span id="offline-state"></span></footer>`;
const FAMILY = {Asteraceae:"aster family",Liliaceae:"lily family",Fabaceae:"pea family",Rosaceae:"rose family",Ranunculaceae:"buttercup family",Ericaceae:"heath family",
  Apiaceae:"carrot family",Saxifragaceae:"saxifrage family",Plantaginaceae:"plantain family",Brassicaceae:"mustard family",Orobanchaceae:"broomrape family",
  Polemoniaceae:"phlox family",Polygonaceae:"buckwheat family",Onagraceae:"evening primrose family",Orchidaceae:"orchid family",Caryophyllaceae:"pink family",
  Montiaceae:"miner's lettuce family",Phrymaceae:"lopseed family",Violaceae:"violet family",Lamiaceae:"mint family",Caprifoliaceae:"honeysuckle family",
  Campanulaceae:"bellflower family",Primulaceae:"primrose family",Melanthiaceae:"bunchflower family",Asparagaceae:"asparagus family",Gentianaceae:"gentian family",
  Crassulaceae:"stonecrop family",Amaryllidaceae:"onion family",Santalaceae:"sandalwood family",Rubiaceae:"madder family",Papaveraceae:"poppy family",
  Iridaceae:"iris family",Berberidaceae:"barberry family",Apocynaceae:"dogbane family",Boraginaceae:"borage family",Cornaceae:"dogwood family",
  Cucurbitaceae:"gourd family",Droseraceae:"sundew family",Hypericaceae:"St John's wort family",Linaceae:"flax family",Menyanthaceae:"buckbean family",
  Nymphaeaceae:"water lily family",Oxalidaceae:"wood sorrel family",Paeoniaceae:"peony family",Aristolochiaceae:"birthwort family",Araceae:"arum family",
  Tofieldiaceae:"false asphodel family",Geraniaceae:"geranium family",Malvaceae:"mallow family",Convolvulaceae:"morning glory family",Solanaceae:"nightshade family",
  Lentibulariaceae:"bladderwort family",Euphorbiaceae:"spurge family",Loasaceae:"blazing star family",Limnanthaceae:"meadowfoam family",Scrophulariaceae:"figwort family"};
const familyName = f => FAMILY[f] ? `${f}, the ${FAMILY[f]}` : f;
const COLOUR = {w:["white","#f3f2ec"], y:["yellow","#e8c43a"], o:["orange","#e48a3a"], r:["red","#c8402f"], p:["pink","#e08aa8"], v:["purple","#8a5bb0"], b:["blue","#5a7fd0"], g:["green or brown","#7f8a52"]};
const sw = c => `<i class="sw" style="background:${COLOUR[c]?.[1] || "#999"}"></i>`;

/* tell the offline state quietly in the footer once the worker has the packs */
navigator.serviceWorker?.addEventListener("message", e => {
  if(e.data?.type === "pack-ready"){ const el = $("offline-state"); if(el) el.textContent = `Saved for offline · ${e.data.count} species`; store.set("lookout-offline", e.data.count); }
});
document.addEventListener("DOMContentLoaded", () => { const n = store.get("lookout-offline", 0), el = $("offline-state"); if(el && n) el.textContent = `Saved for offline · ${n} species`; });

window.Lookout = {ROOT, esc, $, MONTHS, MON, store, data, inat, thumb, credit, inatCredit, placeHref, speciesHref, inatTaxon,
  month, inRange, inSeason, seasonText, blooming, bloomText, num, miles, feet, km, KIND, today, hash, rng, shuffle, photos, shrink, log, theme,
  sized, initials, placeCard, ownPhotos, speciesTile, section, toast, footer, familyName, COLOUR, sw,
  NAT, PNW, nat, openPhoto, taxonCard, openPhotos, obsPhoto, liveTile, fillPhotos, cap};
}
