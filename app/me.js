/* Lookout — Me: everything that's yours, kept on this device. Your field guide (the species in Lookout's keys, seen
   ones in colour and the rest faded, filled by "Seen it" on species pages and by your iNaturalist sightings, and the
   rivers you've been in), your progress on the list and by region, what's in
   season that you haven't done, Near you, your trips (the list and the form, from app/trips.js), what you've saved
   from Beyond the trail, and your log: what you've done, with the date and your note, and Export / Import. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
document.body.insertAdjacentHTML("beforeend", L.footer());

function progress(P){
  const done = L.log.all(), n = P.list.filter(p => done[p.id]).length, total = P.list.length;
  const rows = P.regions.map(reg => {
    const here = P.list.filter(p => p.region === reg.id); if(!here.length) return "";
    const k = here.filter(p => done[p.id]).length;
    return `<li><span>${esc(reg.name)}</span><span class="bar"><i style="width:${100 * k / here.length}%"></i></span><span>${k} of ${here.length}</span></li>`;
  }).join("");
  return `<div class="progress"><div><div class="big-n">${n}<small> of ${total}</small></div>
    <div class="bar" style="margin:14px 0 10px"><i style="width:${total ? 100 * n / total : 0}%"></i></div>
    <a href="${L.ROOT}places/">The whole list →</a></div><ul class="regions">${rows}</ul></div>`;
}

/* in season this month and not done yet, the most-picked first */
const nextUp = P => P.list.filter(p => L.inSeason(p) && !L.log.get(p.id))
  .sort((a, b) => (b.books?.length || 0) - (a.books?.length || 0) || a.name.localeCompare(b.name)).slice(0, 6);

/* what you've saved from Beyond the trail, by region */
function saved(P){
  const all = Object.entries(L.saved.all()).map(([id, r]) => ({id, ...r}));
  if(!all.length) return "";
  const names = Object.fromEntries(P.regions.map(r => [r.id, r.name])), order = Object.fromEntries(P.regions.map((r, i) => [r.id, i]));
  const by = {};
  for(const s of all) (by[s.region || ""] ||= []).push(s);
  const osm = s => /^osm-[nwr]\d+$/.test(s.id) ? `https://www.openstreetmap.org/${{n: "node", w: "way", r: "relation"}[s.id[4]]}/${s.id.slice(5)}` : "";
  const row = s => { const where = (s.waters || []).map(w => names[w]).filter(Boolean);
    return `<li><i class="dot" style="background:${L.SEED_COLOUR?.[s.kind] || "#777"}"></i><span class="what"><b class="seed-name">${esc(s.name)}</b>
      <small>${esc(L.KIND[s.kind] || s.kind)}${where.length ? ` · ${esc(where.join(", "))}` : ""}${s.hours ? ` · ${esc(s.hours)}` : ""}${osm(s) ? ` · <a href="${osm(s)}" target="_blank" rel="noopener">Map ↗</a>` : ""}${s.web ? ` · <a href="${esc(s.web)}" target="_blank" rel="noopener">Website ↗</a>` : ""}</small></span>
      <button type="button" class="chip on" data-unsave="${esc(s.id)}" aria-pressed="true">Saved</button></li>`; };
  return Object.keys(by).sort((a, b) => (order[a] ?? 999) - (order[b] ?? 999)).map(rg => `<h3 class="seed-h">${esc(names[rg] || "Elsewhere")} <span class="muted">${by[rg].length}</span></h3>
    <ul class="seed-list">${by[rg].sort((a, b) => a.name.localeCompare(b.name)).map(row).join("")}</ul>`).join("");
}

/* what you've done, the latest first, with the date and your note */
function logList(P){
  const done = L.log.all();
  const list = P.list.filter(p => done[p.id]).sort((a, b) => String(done[b.id].date).localeCompare(String(done[a.id].date)));
  return list.length ? `<div class="cards">${list.map(p => L.placeCard(p, P.region[p.region]).replace(/<\/a>$/,
    `<p class="small muted">${esc(done[p.id].date || "")}${done[p.id].note ? ` · ${esc(done[p.id].note)}` : ""}</p></a>`)).join("")}</div>` : `<p class="muted">Nothing yet. Tick a place off on its page and it shows up here, with your date, note and photo.</p>`;
}

/* ---------- your field guide ---------- */
const INAT = "lookout-inat";        /* {user, at, ids: {taxonId: count}, extra: {taxonId: [common, sci, photo]}, dates: {taxonId: [first, last]}, pts: [[lat, lon]]} */
let showAll = false;
const inBasin = (rings, lat, lon) => rings.some(ring => { let hit = false;
  for(let a = 0, b = ring.length - 1; a < ring.length; b = a++){ const [xa, ya] = ring[a], [xb, yb] = ring[b];
    if((ya > lat) !== (yb > lat) && lon < (xb - xa) * (lat - ya) / (yb - ya) + xa) hit = !hit; }
  return hit; });

function guide(P, D, A){
  if(!D) return "";
  const own = L.seen.all(), nat = L.store.get(INAT, null), ids = nat?.ids || {};
  const has = id => own[id] || ids[id];
  const total = D.groups.reduce((a, g) => a + g.s.length, 0);
  const inDex = new Set(D.groups.flatMap(g => g.s.map(r => String(r[0]))));
  const seenN = D.groups.reduce((a, g) => a + g.s.filter(r => has(r[0])).length, 0);
  const mon = d => new Date(d + "T12:00").toLocaleDateString("en-US", {month: "short", year: "numeric"});
  const note = id => own[id] ? `${mon(own[id].last)}${own[id].n > 1 ? ` · ${own[id].n}×` : ""}` : ids[id] ? `${nat.dates?.[id] ? mon(nat.dates[id][1]) : "iNaturalist"}${ids[id] > 1 ? ` · ${ids[id]}×` : ""}` : "Not yet";
  const lastOf = id => own[id]?.last || nat?.dates?.[id]?.[1] || "";
  const tile = r => { const [id, common, sci, slug] = r, on = has(id);
    return `<a class="sp dex-tile${on ? "" : " not"}" href="${L.speciesHref({id, slug})}"><div class="pic"><img src="${L.ROOT}data/thumbs/${id}.jpg" alt="" loading="lazy"></div><b>${esc(common || sci)}</b><span class="note">${esc(note(id))}</span></a>`; };
  /* the groups you've seen most first; all of them on request */
  const groups = D.groups.map(g => ({...g, n: g.s.filter(r => has(r[0])).length})).sort((a, b) => b.n - a.n || D.groups.indexOf(a) - D.groups.indexOf(b));
  const shown = showAll ? groups : groups.slice(0, 4);
  const rows = shown.map(g => { const seenFirst = [...g.s.filter(r => has(r[0])).sort((a, b) => lastOf(b[0]).localeCompare(lastOf(a[0]))), ...g.s.filter(r => !has(r[0]))];
    return `<div class="dex-group"><div class="dex-head"><h3>${esc(g.name)}</h3><span class="bar"><i style="width:${100 * g.n / g.s.length}%"></i></span><span>${g.n} of ${g.s.length}</span></div>
      <div class="row">${seenFirst.map(tile).join("")}</div></div>`; }).join("");
  /* anything else you've seen, beyond the keys */
  const extra = [...Object.entries(own).filter(([id]) => !inDex.has(id)).sort((a, b) => String(b[1].last).localeCompare(String(a[1].last))).map(([id, e]) => [id, [e.name || "", e.sci || "", e.photo || ""]]),
    ...Object.entries(nat?.extra || {}).filter(([id]) => !inDex.has(id) && !own[id])];
  const more = extra.length ? `<div class="dex-group"><div class="dex-head"><h3>Beyond the keys</h3><span>${extra.length} more</span></div>
      <div class="row">${extra.slice(0, 80).map(([id, [common, sci, photo]]) => `<a class="sp dex-tile" href="${L.speciesHref({id})}"><div class="pic">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : `<span class="ph">${esc((common || sci).slice(0, 2))}</span>`}</div><b>${esc(common || sci)}</b><span class="note">${esc(note(id))}</span></a>`).join("")}</div></div>` : "";
  /* the rivers: your places done, the species you've ticked off where you were, and your iNaturalist sightings */
  const done = L.log.all();
  const pts = [...P.list.filter(p => done[p.id]).map(p => [p.pin.lat, p.pin.lon]), ...Object.values(own).filter(e => e.lat != null).map(e => [e.lat, e.lon]), ...(nat?.pts || [])];
  const sheds = (A?.watersheds || []).map(w => ({name: w.name, on: pts.some(([la, lo]) => inBasin(w.rings, la, lo))}));
  const rivers = sheds.length ? `<h3 class="atlas-h">Rivers you've been in <span class="muted small">${sheds.filter(x => x.on).length} of ${sheds.length}</span></h3>
      <div class="chips">${sheds.map(x => `<span class="chip${x.on ? " on" : ""}">${esc(x.name)}</span>`).join("")}</div>
      <p class="muted small">From the places you've done, where you were when you ticked a species off, and your iNaturalist sightings. Find them on the <a href="${L.ROOT}atlas/">Atlas</a>.</p>` : "";
  return `<div class="inat-link"><label class="small" for="inat-user">${nat ? `Your iNaturalist sightings as <b>${esc(nat.user)}</b>, brought in ${esc(L.dateText(nat.at))}.` : "Fill it from your iNaturalist sightings:"}</label>
      <input id="inat-user" placeholder="your iNaturalist username" value="${esc(nat?.user || "")}" autocomplete="off" spellcheck="false"><button class="btn ghost" type="button" id="inat-go">${nat ? "Bring them in again" : "Bring them in"}</button>
      <span class="small muted" id="inat-note">${nat ? "" : `Your public sightings in Washington, Oregon, Idaho and British Columbia. Or tap <b>Seen it</b> on any species page.`}</span></div>
    ${rows}${groups.length > 4 ? `<p><button type="button" class="linkish" id="dex-all">${showAll ? "Show fewer groups" : `Show all ${groups.length} groups`}</button></p>` : ""}${more}${rivers}`;
}

/* your public iNaturalist sightings in the Northwest: every species (and how many times), and where (for the rivers) */
async function fromInat(user){
  const ids = {}, extra = {}, pts = [];
  for(let page = 1; page <= 6; page++){
    const j = await L.nat("observations/species_counts", {user_login: user, place_id: L.PNW, per_page: 500, page});
    for(const x of j.results){ ids[x.taxon.id] = x.count; extra[x.taxon.id] = [x.taxon.preferred_common_name ? L.cap(x.taxon.preferred_common_name) : "", x.taxon.name, x.taxon.default_photo?.square_url || ""]; }
    if(page * 500 >= j.total_results) break;
  }
  /* the sightings themselves (the latest thousand): where, for the rivers, and when, for each species' first and last */
  const dates = {};
  for(let page = 1; page <= 5; page++){
    const j = await L.nat("observations", {user_login: user, place_id: L.PNW, per_page: 200, page, order_by: "observed_on"});
    for(const o of j.results){
      if(o.location){ const [la, lo] = o.location.split(",").map(Number); pts.push([+la.toFixed(2), +lo.toFixed(2)]); }
      const t = o.taxon?.id, d = o.observed_on;
      if(t && d){ const [a, b] = dates[t] || [d, d]; dates[t] = [d < a ? d : a, d > b ? d : b]; }
    }
    if(page * 200 >= j.total_results) break;
  }
  return {user, at: L.today(), ids, extra, dates, pts: [...new Set(pts.map(String))].map(x => x.split(",").map(Number))};
}

async function render(){
  const P = await L.data.places();
  const [D, A] = await Promise.all([L.data.json("dex.json").catch(() => null), L.data.json("atlas.json").catch(() => null)]);
  const draw = () => {
    const n = Object.keys(L.saved.all()).length;
    main.innerHTML = `<section class="hero"><h1>Me</h1><p class="sub-line">Yours, and kept on this device: what you've done, what's next, your trips and what you've saved. Export takes it all with you.</p></section>`
      + L.section("Your field guide", guide(P, D, A), {id: "guide", n: D ? (() => { const own = L.seen.all(), ids = L.store.get(INAT, null)?.ids || {}; const all = D.groups.flatMap(g => g.s); return `${all.filter(r => own[r[0]] || ids[r[0]]).length} of ${L.num(all.length)}`; })() : "", aside: `<span class="muted">Seen in colour, still to find faded</span>`})
      + L.section("Your progress", progress(P), {id: "progress"})
      + L.section(`Next up in ${L.MONTHS[L.month() - 1]}`, nextUp(P).length ? `<div class="cards">${nextUp(P).map(p => L.placeCard(p, P.region[p.region])).join("")}</div>` : "", {aside: `<span class="muted">In season, not done yet</span>`})
      + L.section("Near you", `<p class="lede">What's been seen around where you're standing: a map of the last month's photographs, the latest sightings, the best bets this month, and your places nearby.</p>
          <p><a class="btn" href="?f=near">See what's near you</a></p>`, {id: "near"})
      + `<div id="trips-slot"></div>`
      + L.section("Saved", n ? `<p class="muted small lede">From <a href="${L.ROOT}places/#beyond">Beyond the trail</a> on Places.</p>${saved(P)}` : "", {n, id: "saved"})
      + L.section("Your log", `${logList(P)}<div class="chips log-io"><button class="btn ghost" id="export" type="button">Export</button>
          <label class="btn ghost" style="cursor:pointer">Import<input type="file" id="import" accept="application/json,.json" hidden></label></div>
          <p class="muted small">Export saves your log, your photos, what you've saved and your trips as one file; Import merges such a file back in.</p>`, {id: "log"});
    L.ownPhotos(main);
    L.tripsInto?.($("trips-slot")).then(() => { if(location.hash === "#trips") $("trips")?.scrollIntoView(); });
    if(location.hash === "#guide") $("guide")?.scrollIntoView();
    $("dex-all")?.addEventListener("click", () => { showAll = !showAll; const y = scrollY; draw(); scrollTo(0, y); });
    const go = async () => {
      const user = $("inat-user").value.trim().replace(/^@/, ""); if(!user) { $("inat-user").focus(); return; }
      $("inat-go").disabled = true; $("inat-note").textContent = "Asking iNaturalist…";
      try {
        const r = await fromInat(user);
        if(!Object.keys(r.ids).length){ $("inat-note").textContent = `No public sightings by ${user} in the Northwest. Check the username?`; $("inat-go").disabled = false; return; }
        L.store.set(INAT, r); L.toast(`${Object.keys(r.ids).length} species from ${user}'s sightings`); const y = scrollY; draw(); scrollTo(0, y);
      } catch(e){ $("inat-note").textContent = navigator.onLine === false ? "That needs a connection." : "iNaturalist didn't answer. Try again in a minute."; $("inat-go").disabled = false; }
    };
    $("inat-go")?.addEventListener("click", go);
    $("inat-user")?.addEventListener("keydown", e => { if(e.key === "Enter") go(); });
    $("export").addEventListener("click", () => L.log.export());
    $("import").addEventListener("change", async e => {
      const f = e.target.files[0]; if(!f) return;
      try { const k = await L.log.import(f); L.toast(`Imported ${k} ${k === 1 ? "entry" : "entries"}`); draw(); }
      catch(err){ L.toast(err.message || "Couldn't read that file"); }
    });
  };
  draw();
  main.addEventListener("click", e => {
    const b = e.target.closest("[data-unsave]"); if(!b) return;
    const s = L.saved.all()[b.dataset.unsave]; if(s) L.saved.toggle({id: b.dataset.unsave, ...s});
  });
  document.addEventListener("lookout-saved", () => { const y = scrollY; draw(); scrollTo(0, y); });
  document.addEventListener("lookout-log", () => { const y = scrollY; draw(); scrollTo(0, y); });
  document.addEventListener("lookout-seen", () => { const y = scrollY; draw(); scrollTo(0, y); });
}
render().catch(e => { main.innerHTML = `<p class="muted">Couldn't load your things (${esc(e.message)}).</p>`; });
}
