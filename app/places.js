/* Lookout — Places: the bucket list (places/) and each place (places/?id=…).
   A place opens with its photo (yours, once you've done it), then its numbers, which of your books pick it,
   the box to tick it off, what you might see there this month, the map, what's around it, and the places nearby. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
const id = new URLSearchParams(location.search).get("id");
document.body.insertAdjacentHTML("beforeend", L.footer());

/* ---------- the list ---------- */
function regionBars(P){
  const done = L.log.all();
  return `<ul class="regions">${P.regions.map(reg => {
    const here = P.list.filter(p => p.region === reg.id); if(!here.length) return "";
    const k = here.filter(p => done[p.id]).length;
    return `<li><span>${esc(reg.name)}</span><span class="bar"><i style="width:${100 * k / here.length}%"></i></span><span>${k} of ${here.length}</span></li>`;
  }).join("")}</ul>`;
}

function listPage(P){
  const r = L.rng("places " + L.today()), m = L.month();
  const withPhoto = P.list.filter(p => p.photo);
  const pick = (withPhoto.filter(p => L.inSeason(p)).length ? withPhoto.filter(p => L.inSeason(p)) : withPhoto)[Math.floor(r() * withPhoto.length) % Math.max(1, withPhoto.length)];
  const season = P.list.filter(p => L.inSeason(p, m)).sort((a, b) => !!L.log.get(a.id) - !!L.log.get(b.id));
  const done = L.log.all(), n = P.list.filter(p => done[p.id]).length;
  const kinds = [...new Set(P.list.map(p => p.kind))];
  main.innerHTML = (pick ? `<section class="hero"><div class="frame" data-hide-broken><a href="${L.placeHref(pick.id)}"><img src="${esc(pick.photo.src)}" alt="${esc(pick.name)}" crossorigin="anonymous"></a>${L.credit(pick.photo.by, pick.photo.lic, pick.photo.page)}</div>
      <h1>Places</h1><p class="sub-line">${n} of ${P.list.length} done · <a href="${L.placeHref(pick.id)}">${esc(pick.name)}</a> above</p></section>` : `<h1>Places</h1>`)
    + L.section(`In season in ${L.MONTHS[m - 1]}`, season.length ? `<div class="cards">${season.map(p => L.placeCard(p, P.region[p.region])).join("")}</div>` : "", {n: season.length})
    + L.section("The map", `<div class="mapbox" id="map"></div><p class="legend"><span><i></i>To do</span><span><i class="done"></i>Done</span></p>`)
    + `<div id="saved-slot"></div><div id="beyond-slot"></div>`
    + L.section("By region", regionBars(P), {id: "by-region"})
    + L.section("Everything", `<div class="filters">
        <label>Region <select id="f-region"><option value="">All</option>${P.regions.filter(g => P.list.some(p => p.region === g.id)).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></label>
        <label>Kind <select id="f-kind"><option value="">All</option>${kinds.map(k => `<option value="${k}">${esc(L.KIND[k] || k)}</option>`).join("")}</select></label>
        <label>Show <select id="f-done"><option value="">All</option><option value="todo">To do</option><option value="done">Done</option></select></label>
        <label>Sort <select id="f-sort"><option value="books">Most-picked</option><option value="name">Name</option><option value="short">Shortest</option><option value="gain">Least gain</option><option value="high">Highest</option></select></label>
      </div><div class="cards" id="all"></div>`, {n: P.list.length})
    + L.section("Your log", `<div class="chips"><button class="btn ghost" id="export" type="button">Export</button>
        <label class="btn ghost" style="cursor:pointer">Import<input type="file" id="import" accept="application/json,.json" hidden></label></div>`);
  L.map($("map"), P.list);
  beyond(P);
  const draw = () => {
    const reg = $("f-region").value, kind = $("f-kind").value, show = $("f-done").value, sort = $("f-sort").value, done = L.log.all();
    const by = {books: (a, b) => (b.books?.length || 0) - (a.books?.length || 0) || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name),
      short: (a, b) => (a.distance_mi ?? 99) - (b.distance_mi ?? 99), gain: (a, b) => (a.gain_ft ?? 1e5) - (b.gain_ft ?? 1e5), high: (a, b) => (b.high_ft ?? 0) - (a.high_ft ?? 0)}[sort];
    const list = P.list.filter(p => (!reg || p.region === reg) && (!kind || p.kind === kind) && (!show || (show === "done") === !!done[p.id])).sort(by);
    $("all").innerHTML = list.map(p => L.placeCard(p, P.region[p.region])).join("") || `<p class="muted">Nothing fits all of those.</p>`;
    L.ownPhotos($("all"));
  };
  ["f-region", "f-kind", "f-done", "f-sort"].forEach(k => $(k).addEventListener("change", draw));
  draw(); L.ownPhotos(main);
  $("export").addEventListener("click", () => L.log.export());
  $("import").addEventListener("change", async e => {
    const f = e.target.files[0]; if(!f) return;
    try { const k = await L.log.import(f); L.toast(`Imported ${k} ${k === 1 ? "entry" : "entries"}`); listPage(P); }
    catch(err){ L.toast(err.message || "Couldn't read that file"); }
  });
  document.addEventListener("lookout-log", () => { const el = $("by-region"); if(el) el.querySelector(".regions").outerHTML = regionBars(P); });
}

/* ---------- beyond the trail: the seeds (data/seeds.json) on a map, and the ones you've saved ---------- */
const GROUP_NAME = {water: "Waters", coast: "Coast and islands", lowlands: "Lowlands and valleys", mountains: "Mountains", dry: "The dry side"};
const inBox = (r, s) => { const [a, w, n, e] = r.bbox; return s.lat >= a && s.lat <= n && s.lon >= w && s.lon <= e; };

function savedList(P, names){
  const all = Object.entries(L.saved.all()).map(([id, r]) => ({id, ...r}));
  const slot = $("saved-slot"); if(!slot) return;
  if(!all.length){ slot.innerHTML = ""; return; }
  /* by region, the regions in the order they're listed */
  const order = Object.fromEntries(P.regions.map((r, i) => [r.id, i]));
  const by = {};
  for(const s of all) (by[s.region || ""] ||= []).push(s);
  const rows = Object.keys(by).sort((a, b) => (order[a] ?? 999) - (order[b] ?? 999)).map(rg => `<h3 class="seed-h">${esc(names[rg] || "Elsewhere")} <span class="muted">${by[rg].length}</span></h3>
    <ul class="seed-list">${by[rg].sort((a, b) => a.name.localeCompare(b.name)).map(s => seedRow(s, names, true)).join("")}</ul>`).join("");
  slot.innerHTML = L.section("Saved", `<p class="muted small lede">From the map below, kept on this device (and in your log's Export).</p>${rows}`, {n: all.length, id: "saved"});
}
const seedRow = (s, names, savedOnly) => {
  const on = savedOnly || L.saved.has(s.id), where = (s.waters || []).map(w => names[w]).filter(Boolean);
  return `<li><i class="dot" style="background:${L.SEED_COLOUR[s.kind] || "#777"}"></i><span class="what"><button type="button" class="linkish" data-focus="${esc(s.id)}">${esc(s.name)}</button>
    <small>${esc(L.KIND[s.kind] || s.kind)}${where.length ? ` · ${esc(where.join(", "))}` : ""}${s.hours ? ` · ${esc(s.hours)}` : ""}</small></span>
    <button type="button" class="chip${on ? " on" : ""}" data-save="${esc(s.id)}" aria-pressed="${on}">${on ? "Saved" : "Save"}</button></li>`;
};
let SEEDS = {};
function wireRows(root, M){
  root.addEventListener("click", e => {
    const f = e.target.closest("[data-focus]");
    if(f){ const s = SEEDS[f.dataset.focus] || {id: f.dataset.focus, ...L.saved.all()[f.dataset.focus]}; if(M && s.lat != null) M.focus(s); return; }
    const b = e.target.closest("[data-save]"); if(!b) return;
    const s = SEEDS[b.dataset.save] || {id: b.dataset.save, ...L.saved.all()[b.dataset.save]};
    L.saved.toggle(s);
  });
}

async function beyond(P){
  const [S, outline] = await Promise.all([L.data.seeds(), L.data.json("cascadia.json").catch(() => null)]);
  const names = Object.fromEntries(P.regions.map(r => [r.id, r.name]));
  if(!S?.seeds?.length){ wireRows($("saved-slot"), null); savedList(P, names, null); document.addEventListener("lookout-saved", () => savedList(P, names, null)); return; }
  SEEDS = Object.fromEntries(S.seeds.map(s => [s.id, s]));
  const kinds = Object.keys(S.kinds).filter(k => S.kinds[k].n);
  let on = new Set(L.store.get("lookout-seed-kinds", null) || kinds.filter(k => k !== "campground"));
  const groups = Object.keys(GROUP_NAME).map(g => [g, P.regions.filter(r => r.kind === g && S.seeds.some(s => inBox(r, s)))]).filter(([, rs]) => rs.length);
  $("beyond-slot").innerHTML = L.section("Beyond the trail", `<p class="muted small lede">Lighthouses, farmers markets, farm stands, ferries and more, across British Columbia, Washington, Oregon and Idaho. Tap a dot to save it; what you save is listed above.</p>
    <div class="filters"><label>Where <select id="s-where"><option value="">All of Cascadia</option>${groups.map(([g, rs]) => `<optgroup label="${GROUP_NAME[g]}">${rs.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</optgroup>`).join("")}</select></label></div>
    <div class="chips seed-kinds" id="s-kinds"></div>
    <div class="mapbox seeds-map" id="seedmap"></div>
    <div id="s-list"></div>
    <p class="credit">Places © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, seeded ${esc(S.built || "")}. Something missing? Add it to OpenStreetMap and it comes in with the next seeding.</p>`, {n: S.seeds.length, id: "beyond"});
  const M = L.seedMap($("seedmap"), outline, names);
  const draw = (refit) => {
    const where = P.region[$("s-where").value];
    const here = S.seeds.filter(s => !where || inBox(where, s));
    const count = k => here.filter(s => s.kind === k).length;
    $("s-kinds").innerHTML = kinds.map(k => `<button type="button" class="chip${on.has(k) ? " on" : ""}" data-kind="${k}" aria-pressed="${on.has(k)}"${count(k) ? "" : " disabled"}><i class="dot" style="background:${L.SEED_COLOUR[k] || "#777"}"></i>${esc(S.kinds[k].name)}<span class="c">${L.num(count(k))}</span></button>`).join("");
    const shown = here.filter(s => on.has(s.kind));
    M?.show(shown);
    if(refit && M){ where ? M.fit(where.bbox) : outline && M.fit([outline.bounds[1], outline.bounds[0], outline.bounds[3], outline.bounds[2]]); }
    const list = where ? [...shown].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)) : [];
    $("s-list").innerHTML = !where ? `<p class="muted small">Pick a region, a sea or a lake under Where to list what's in it.</p>`
      : list.length ? `<ul class="seed-list">${list.slice(0, 120).map(s => seedRow(s, names)).join("")}</ul>${list.length > 120 ? `<p class="muted small">And ${list.length - 120} more on the map.</p>` : ""}`
      : `<p class="muted small">Nothing of those kinds here.</p>`;
  };
  $("s-where").addEventListener("change", () => draw(true));
  $("s-kinds").addEventListener("click", e => {
    const b = e.target.closest("[data-kind]"); if(!b) return;
    on.has(b.dataset.kind) ? on.delete(b.dataset.kind) : on.add(b.dataset.kind);
    L.store.set("lookout-seed-kinds", [...on]); draw(false);
  });
  wireRows($("s-list"), M); wireRows($("saved-slot"), M);
  draw(false);
  savedList(P, names, M);
  document.addEventListener("lookout-saved", () => { savedList(P, names, M); if($("s-where").value) draw(false); });
}

/* ---------- one place ---------- */
async function logBox(p){
  const e = L.log.get(p.id), mine = e?.photo ? await L.photos.get(p.id) : null;
  if(e) return `<div class="logbox" id="logbox"><h3>Done</h3>${mine ? `<img class="mine" src="${mine}" alt="Your photo">` : ""}
    <p class="done-line">${esc(new Date(e.date + "T12:00").toLocaleDateString("en-US", {day: "numeric", month: "long", year: "numeric"}))}</p>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ""}
    <div class="acts"><button class="btn ghost" type="button" id="log-edit">Edit</button><button class="linkish" type="button" id="log-undo">Not done after all</button></div></div>`;
  return logForm(p, null);
}
const logForm = (p, e) => `<div class="logbox" id="logbox"><h3>${e ? "Edit" : "Tick it off"}</h3><form id="log-form">
  <label>Date<input type="date" name="date" required value="${esc(e?.date || L.today())}" max="${L.today()}"></label>
  <label>Note<textarea name="note" placeholder="Who with, the weather, what bloomed">${esc(e?.note || "")}</textarea></label>
  <label>Your photo<input type="file" name="photo" accept="image/*"></label>
  <div class="acts"><button class="btn" type="submit">${e ? "Save" : "Done"}</button>${e ? `<button class="linkish" type="button" id="log-cancel">Cancel</button>` : ""}</div></form></div>`;

function wireLog(p, rerender){
  const box = $("logbox"); if(!box) return;
  box.addEventListener("click", async ev => {
    if(ev.target.id === "log-edit"){ box.outerHTML = logForm(p, L.log.get(p.id)); wireLog(p, rerender); }
    if(ev.target.id === "log-cancel") rerender();
    if(ev.target.id === "log-undo" && confirm(`Mark ${p.name} as not done? Your note and photo for it will go.`)){ await L.log.remove(p.id); rerender(); }
  });
  box.querySelector("form")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target), file = f.get("photo"), old = L.log.get(p.id);
    let photo = !!old?.photo;
    if(file && file.size){
      try { await L.photos.set(p.id, await L.shrink(file)); photo = true; } catch(err){ L.toast("Couldn't keep that photo"); }
    }
    L.log.set(p.id, {date: f.get("date"), note: String(f.get("note") || "").trim(), photo});
    L.toast(old ? "Saved" : `${p.name}: done`);
    rerender();
  });
}

/* what's been seen near the trailhead this month: the saved list first, then iNaturalist's latest when there's signal */
function seenRow(p, P, F){
  const ids = p.seen?.[L.month()] || [];
  return ids.map(tid => F?.byId[tid] ? L.speciesTile(F.byId[tid]) : P.taxa[tid] ? L.liveTile({id: tid, ...P.taxa[tid]}) : "").join("");
}
async function liveSeen(p, F){
  const box = $("seen"); if(!box) return;
  try {
    const j = await L.nat("observations/species_counts", {lat: p.pin.lat, lng: p.pin.lon, radius: 3, month: L.month(), verifiable: "true", per_page: 18});
    const tiles = j.results.filter(x => x.count >= 2 && ["species", "subspecies", "variety"].includes(x.taxon.rank))
      .map(x => F?.byId[x.taxon.id] ? L.speciesTile(F.byId[x.taxon.id]) : L.liveTile(L.taxonCard(x.taxon)));
    if(tiles.length){ box.querySelector(".row").innerHTML = tiles.join(""); box.hidden = false; }
  } catch(e){}
  L.fillPhotos(box);
}

async function placePage(P, p){
  const F = await L.data.flowers().catch(() => null);
  const reg = P.region[p.region], e = L.log.get(p.id), mine = e?.photo ? await L.photos.get(p.id) : null;
  document.title = `${p.name} — Lookout`;
  const books = P.books.length ? `<div class="books"><b>In ${p.books?.length || 0} of ${P.books.length} books</b>
    <ul>${P.books.map(b => `<li class="${(p.books || []).includes(b.id) ? "" : "no"}" title="${esc(b.title)}">${esc(b.short || b.title)}</li>`).join("")}</ul></div>` : "";
  const cond = p.wta ? `<a class="cond" href="${esc(p.wta)}" target="_blank" rel="noopener">Current conditions on WTA ↗</a>`
    : p.conditions ? `<a class="cond" href="${esc(p.conditions)}" target="_blank" rel="noopener">Current conditions on ${esc(new URL(p.conditions).hostname.replace(/^www\./, ""))} ↗</a>`
    : `<a class="cond" href="https://www.wta.org/go-outside/hikes?title=${encodeURIComponent(p.name)}" target="_blank" rel="noopener">Look it up on WTA ↗</a>`;
  const about = p.about?.text ? `<div class="about"><p>${esc(p.about.text)}</p><p class="credit">From <a href="${esc(p.about.url)}" target="_blank" rel="noopener">${esc(p.about.title)}</a> on Wikipedia, CC BY-SA</p></div>` : "";
  const around = (p.around || []).length ? `<ul class="around">${p.around.map(a => `<li>${esc(a.name)} <span>· ${esc(a.kind)}${a.ele_ft ? `, ${L.feet(a.ele_ft)}` : ""}</span></li>`).join("")}</ul>` : "";
  const near = P.list.filter(q => q.id !== p.id).map(q => ({q, d: L.km(p.pin, q.pin)})).sort((a, b) => a.d - b.d).slice(0, 4);
  const heroSrc = mine || p.photo?.src;
  const render = async () => {
    main.innerHTML = (heroSrc ? `<section class="hero"><div class="frame" data-hide-broken><img src="${esc(heroSrc)}" alt="${esc(p.name)}"${mine ? "" : ` crossorigin="anonymous"`}>${mine ? `<span class="credit">Your photo</span>` : L.credit(p.photo.by, p.photo.lic, p.photo.page)}</div>` : `<section class="hero">`)
      + `<p class="eyebrow">${esc(L.KIND[p.kind] || p.kind)} · ${esc(reg?.name || "")}</p><h1>${esc(p.name)}</h1><p class="sub-line">${esc(p.area || "")}</p>
      <dl class="stats">${[["Distance", p.distance_mi != null && L.miles(p.distance_mi), "round trip"], ["Gain", p.gain_ft != null && L.feet(p.gain_ft)],
        ["High point", p.high_ft != null && L.feet(p.high_ft)], ["Season", L.seasonText(p.season), L.inSeason(p) ? "now" : ""], ["Pass", p.pass]]
        .filter(x => x[1]).map(([k, v, s]) => `<div${k === "Pass" ? ` class="wide"` : ""}><dt>${k}</dt><dd>${esc(v)}${s ? ` <small>${esc(s)}</small>` : ""}</dd></div>`).join("")}</dl></section>
      <div class="split"><div>${books}${cond}</div><div>${await logBox(p)}</div></div>`
      + `<section class="section" id="seen"${seenRow(p, P, F) ? "" : " hidden"}><h2>You might see here in ${L.MONTHS[L.month() - 1]}<span class="aside"><a href="https://www.inaturalist.org/observations?lat=${p.pin.lat}&lng=${p.pin.lon}&radius=3&month=${L.month()}" target="_blank" rel="noopener">On iNaturalist ↗</a></span></h2><div class="row">${seenRow(p, P, F)}</div></section>`
      + L.section("The map", `<div class="mapbox small" id="map"></div>`)
      + L.section("Around here", around ? around + `<p class="credit">From OpenStreetMap</p>` : "")
      + L.section("About the area", about)
      + L.section("Nearby", `<div class="cards">${near.map(({q, d}) => L.placeCard(q, P.region[q.region]).replace("</p></a>", ` · ${Math.round(d * 0.621)}\u00a0mi\u00a0away</p></a>`)).join("")}</div>`);
    L.map($("map"), P.list, {single: p, around: p.around || []});
    liveSeen(p, F);
    wireLog(p, () => placePage(P, p));
    L.ownPhotos(main);
  };
  await render();
}

L.data.places().then(P => {
  if(!id) return listPage(P);
  const p = P.byId[id];
  if(!p){ main.innerHTML = `<h1>Not on the list</h1><p><a href="./">All places</a></p>`; return; }
  return placePage(P, p);
}).catch(e => { main.innerHTML = `<p class="muted">Couldn't load the places (${esc(e.message)}).</p>`; });
}
