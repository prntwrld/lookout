/* Lookout — Me: everything that's yours, kept on this device. Your progress on the list and by region, what's in
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

async function render(){
  const P = await L.data.places();
  const draw = () => {
    const n = Object.keys(L.saved.all()).length;
    main.innerHTML = `<section class="hero"><h1>Me</h1><p class="sub-line">Yours, and kept on this device: what you've done, what's next, your trips and what you've saved. Export takes it all with you.</p></section>`
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
}
render().catch(e => { main.innerHTML = `<p class="muted">Couldn't load your things (${esc(e.message)}).</p>`; });
}
