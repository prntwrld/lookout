/* Lookout's offline worker.
   - On install it saves the app shell (pages, styles, scripts, fonts, Leaflet, icons) and the data packs
     (data/*.json and the wildflower thumbnails in data/thumbs/), so the key and the guide work with no signal.
   - Pages, scripts and data are fetched fresh when there's a connection (so your edits show up) and come from
     the saved copy only when there's no connection at all.
   - Photos from iNaturalist and Wikimedia, and map tiles, are kept as you see them (up to a limit), so a page
     you've opened before still has its pictures and map offline.
   Bump VERSION when the list of shell files changes. */
const VERSION = "lookout-v13";
const SHELL = VERSION + "-shell", PACK = VERSION + "-pack", IMG = "lookout-img", TILES = "lookout-tiles";
const BASE = new URL("./", self.location).href;
const SHELL_FILES = ["", "places/", "living/", "key/", "style.css", "manifest.webmanifest",
  "app/core.js", "app/sky.js", "app/map.js", "app/home.js", "app/places.js", "app/living.js", "app/sound.js", "app/key.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/leaflet/images/layers.png", "vendor/leaflet/images/marker-icon.png",
  "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/fraunces-latin-wght-normal.woff2", "fonts/fraunces-latin-wght-italic.woff2",
  "fonts/source-serif-4-latin-400-normal.woff2", "fonts/source-serif-4-latin-400-italic.woff2",
  "fonts/source-serif-4-latin-600-normal.woff2", "fonts/source-serif-4-latin-600-italic.woff2",
  "data/places.json", "data/places-extra.json", "data/books.json", "data/regions.json",
  "data/flowers.json", "data/flower-traits.json", "data/pojar.json", "data/birds.json", "data/bird-traits.json", "data/packs.json", "data/cascadia.json", "data/groups.json", "data/tidepools.json", "data/foraging.json", "data/salmon.json", "data/whales.json"];
const REMOTE_IMG = /(^|\.)(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|thumb\.wikimedia\.org)$/;
const LIMIT = {[IMG]: 500, [TILES]: 1500};

/* add what can be fetched; one missing file never spoils the rest */
const addAll = async (name, urls) => {
  const c = await caches.open(name);
  const have = new Set((await c.keys()).map(r => r.url));
  let n = 0;
  await Promise.all(urls.map(async u => {
    const url = new URL(u, BASE).href;
    if(have.has(url) && name === PACK){ n++; return; }
    try { const r = await fetch(url, {cache: "no-cache"}); if(r.ok){ await c.put(url, r); n++; } } catch(e){}
  }));
  return n;
};
/* the wildflower pack: every species' thumbnail, listed in flowers.json */
const savePack = async () => {
  let ids = [];
  let more = [];
  try { more = (await (await fetch(new URL("data/packs.json", BASE), {cache: "no-cache"})).json()).packs.flatMap(p => [`data/packs/${p.id}.json`, `data/traits/${p.id}.json`]); } catch(e){}
  await addAll(SHELL, more);
  /* thumbnails up front for the wildflowers and birds only; the other keys' pictures are kept as you open them */
  for(const f of ["data/flowers.json", "data/birds.json"]){
    try { const r = await fetch(new URL(f, BASE), {cache: "no-cache"}); ids = ids.concat((await r.json()).species.map(s => s.id)); } catch(e){}
  }
  return ids.length ? addAll(PACK, ids.map(id => `data/thumbs/${id}.jpg`)) : 0;
};
const tell = async msg => { for(const c of await self.clients.matchAll({includeUncontrolled: true})) c.postMessage(msg); };

self.addEventListener("install", e => {
  e.waitUntil((async () => { await addAll(SHELL, SHELL_FILES); await savePack(); await self.skipWaiting(); })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for(const k of await caches.keys()) if(k.startsWith("lookout-v") && !k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
    const n = (await (await caches.open(PACK)).keys()).length;
    tell({type: "pack-ready", count: n});
  })());
});
/* a page can ask for the pack again (after the data changes) */
self.addEventListener("message", e => {
  if(e.data === "refresh-pack") e.waitUntil(savePack().then(n => tell({type: "pack-ready", count: n})));
});

const trim = async name => {
  const c = await caches.open(name), keys = await c.keys(), over = keys.length - (LIMIT[name] || 1e9);
  for(let i = 0; i < over; i++) await c.delete(keys[i]);
};
/* a page's address without ?id=…, so every place shares the one saved page */
const pageKey = url => { const u = new URL(url); u.search = ""; u.hash = ""; return u.href; };

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);

  if(url.origin === self.location.origin){
    /* thumbnails, fonts, icons and Leaflet don't change: saved copy first */
    if(/\/(data\/thumbs|fonts|icons|vendor)\//.test(url.pathname)){
      e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(async r => {
        if(r.ok){ const c = await caches.open(url.pathname.includes("/thumbs/") ? PACK : SHELL); c.put(req, r.clone()); }
        return r;
      })));
      return;
    }
    /* pages, scripts, styles and data: fresh when we can, saved when we can't */
    const nav = req.mode === "navigate";
    const key = nav ? pageKey(req.url) : req.url;
    e.respondWith((async () => {
      try {
        /* online, always wait for the network (a slow host must never mean an old page); the saved copy is only for no connection */
        const r = await fetch(req, {cache: "no-cache"});
        if(r.ok){ const c = await caches.open(SHELL); c.put(key, r.clone()); }
        return r;
      } catch(err){
        const hit = await caches.match(key, {ignoreSearch: nav}) || await caches.match(req, {ignoreSearch: true});
        if(hit) return hit;
        if(nav){ const home = await caches.match(BASE); if(home) return home; }
        return new Response("Offline", {status: 503, headers: {"Content-Type": "text/plain"}});
      }
    })());
    return;
  }

  /* photos and map tiles you've seen: saved copy first, kept up to a limit */
  const name = REMOTE_IMG.test(url.hostname) ? IMG : url.hostname === "tile.openstreetmap.org" ? TILES : null;
  if(!name) return;
  e.respondWith((async () => {
    const c = await caches.open(name), hit = await c.match(req);
    if(hit) return hit;
    try {
      const r = await fetch(req);
      if(r.ok || r.type === "opaque"){ await c.put(req, r.clone()); trim(name); }
      return r;
    } catch(err){ return Response.error(); }
  })());
});
