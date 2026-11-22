/* Lookout — Trips: your trips (trips/) and one trip (trips/?id=…).
   A trip is a name, its dates and its regions (any of data/regions.json's, seas and lakes too). Its page has the
   days, each with its stops in order and the miles between them; one map of the stops and of what's left to add;
   and the ideas: your places in season, what you've saved, salmon, whale and tide-pool spots in season, farmers
   markets open on your days (from OpenStreetMap's opening hours), lighthouses, farm stands and ferries, and what's
   out that month. Trips are kept on this device (Lookout.trips) and go out with Places → Your log → Export. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
const id = new URLSearchParams(location.search).get("id");
document.body.insertAdjacentHTML("beforeend", L.footer());

const GROUP_NAME = {water: "Waters", coast: "Coast and islands", lowlands: "Lowlands and valleys", mountains: "Mountains", dry: "The dry side"};
const DAY_COLOUR = ["#2d5c43", "#c8402f", "#2f6db0", "#d98a1c", "#7b52ab", "#23948f", "#8a5f3c", "#cf5d86"];
const MAX_DAYS = 21;

/* ---------- dates ---------- */
const at = s => new Date(s + "T12:00");
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = at(s); d.setDate(d.getDate() + n); return iso(d); };
const daysOf = t => { const out = []; for(let d = t.start; d <= t.end && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d); return out; };
const dayName = s => at(s).toLocaleDateString("en-US", {weekday: "long", month: "long", day: "numeric"});
const short = s => at(s).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"});
const range = t => {
  const a = at(t.start), b = at(t.end), md = d => d.toLocaleDateString("en-US", {month: "long", day: "numeric"});
  const y = a.getFullYear() !== new Date().getFullYear() || b.getFullYear() !== a.getFullYear() ? `, ${b.getFullYear()}` : "";
  if(t.start === t.end) return md(a) + y;
  return (a.getMonth() === b.getMonth() ? `${md(a)}–${b.getDate()}` : `${md(a)} – ${md(b)}`) + y;
};
const monthsOf = t => [...new Set(daysOf(t).map(d => at(d).getMonth() + 1))];

/* ---------- OpenStreetMap opening hours, the common forms: "Sa 09:00-13:00", "May-Oct: Sa 9:00-14:00; We 15:00-19:00", "Mo-Fr 10:00-18:00; Su off".
   openOn(hours, "2026-06-06") → {open: true, time: "9–1"}, {open: false}, or null when it can't tell. Later rules override earlier ones, as in OSM. */
const MO = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"], WD = ["su","mo","tu","we","th","fr","sa"];
const hhmm = s => { const [h, m] = s.split(":").map(Number); const ap = h >= 12 ? "pm" : "am", h12 = h % 12 || 12; return m ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}`; };
function openOn(hours, date){
  if(!hours) return null;
  const h = String(hours).trim();
  if(/^24\/7$/.test(h)) return {open: true, time: "all day"};
  const d = at(date), mo = d.getMonth() + 1, wd = d.getDay();
  let res = null, understood = false;
  /* "Sa 09:00-15:00, Su 10:00-15:00": a comma after a time starts another rule, under the same months */
  const rules = h.split(/\s*;\s*/).flatMap(r => r.split(/(?<=\d:\d{2})\s*,\s*(?=[A-Za-z])/).map((x, i) => ({x, more: i > 0})));
  let lastMonths = null;
  for(let {x: rule, more} of rules){
    rule = rule.trim().replace(/^"[^"]*"\s*/, ""); if(!rule) continue;
    let months = more ? lastMonths : null, days = null, nth = false;
    /* months, maybe with dates: "May-Oct", "Apr 15-Oct 31", "Jun,Aug" */
    const mm = /^((?:[A-Za-z]{3}(?:\s+\d{1,2})?(?:\s*-\s*[A-Za-z]{3}(?:\s+\d{1,2})?)?\s*,?\s*)+)(?::|\s)\s*/.exec(rule);
    if(mm && MO.includes(mm[1].trim().slice(0, 3).toLowerCase())){
      months = new Set();
      for(const part of mm[1].split(",")){
        const [a, b] = part.split("-").map(x => MO.indexOf(x.trim().slice(0, 3).toLowerCase()) + 1);
        if(!a) continue;
        if(!b) months.add(a); else for(let m = a; ; m = m % 12 + 1){ months.add(m); if(m === b) break; }
      }
      rule = rule.slice(mm[0].length);
    }
    if(!more) lastMonths = months;
    /* weekdays: "Mo-Fr", "Sa,Su", "Sa[1,3]" (some weeks) */
    const dm = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\[[^\]]*\])?(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)/i.exec(rule);
    if(dm){
      days = new Set();
      for(const part of dm[1].split(",")){
        if(/\[/.test(part)) nth = true;
        const [a, b] = part.replace(/\[[^\]]*\]/, "").split("-").map(x => WD.indexOf(x.trim().toLowerCase()));
        if(a < 0) continue;
        if(b == null || b < 0) days.add(a); else for(let x = a; ; x = (x + 1) % 7){ days.add(x); if(x === b) break; }
      }
      rule = rule.slice(dm[0].length).trim();
    }
    if(!months && !days) continue;
    const off = /^(off|closed)\b/i.test(rule), tm = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(rule);
    if(!off && !tm && rule && !/^\s*$/.test(rule)) continue;   /* something we don't read */
    understood = true;
    if((months && !months.has(mo)) || (days && !days.has(wd))) continue;
    res = off ? {open: false} : {open: true, time: tm ? `${hhmm(tm[1])}–${hhmm(tm[2])}` : "", some: nth};
  }
  return res || (understood ? {open: false} : null);
}

/* ---------- tides: the lowest daylight low on each day at a NOAA station ---------- */
const NOAA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const TIDES = {};
const clock = d => d.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"}).toLowerCase().replace(/\s/g, "");
function tides(station, t){
  const key = `${station} ${t.start} ${t.end}`;
  return TIDES[key] ||= fetch(`${NOAA}?product=predictions&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json&application=lookout&station=${station}&begin_date=${t.start.replace(/-/g, "")}&range=${daysOf(t).length * 24}`,
    {signal: AbortSignal.timeout(15000)}).then(r => r.json()).then(j => {
      const by = {};
      for(const p of j.predictions || []){
        if(p.type !== "L") continue;
        const d = new Date(p.t.replace(" ", "T")), h = d.getHours() + d.getMinutes() / 60, k = iso(d);
        if(h < 6.5 || h > 20) continue;
        if(!by[k] || +p.v < by[k].v) by[k] = {v: +p.v, t: clock(d)};
      }
      return by;
    }).catch(() => ({}));
}
const ft = v => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} ft`;

/* ---------- everything a stop can be: one of your places, a seed, or a salmon, whale or tide-pool spot ---------- */
let D = null;   /* {P, seeds, salmon, whales, pools, names} */
async function loadAll(){
  const [P, S, salmon, whales, pools] = await Promise.all([L.data.places(), L.data.seeds(), L.data.json("salmon.json").catch(() => null),
    L.data.json("whales.json").catch(() => null), L.data.json("tidepools.json").catch(() => null)]);
  return {P, seeds: Object.fromEntries((S?.seeds || []).map(s => [s.id, s])), salmon, whales, pools,
    names: Object.fromEntries(P.regions.map(r => [r.id, r.name]))};
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function item(ref){
  const i = ref.indexOf(":"), t = ref.slice(0, i), k = ref.slice(i + 1);
  if(t === "place"){ const p = D.P.byId[k]; if(!p) return null;
    return {ref, t, name: p.name, kind: L.KIND[p.kind] || p.kind, lat: p.pin.lat, lon: p.pin.lon, href: L.placeHref(p.id), colour: "var(--accent)", season: p.season,
      sub: [p.distance_mi != null && L.miles(p.distance_mi), p.gain_ft != null && `${L.num(p.gain_ft)} ft gain`, p.season && L.seasonText(p.season)].filter(Boolean).join(" · "), done: !!L.log.get(p.id)}; }
  if(t === "seed"){ const s = D.seeds[k] || L.saved.all()[k]; if(!s) return null;
    return {ref, t, name: s.name, kind: L.KIND[s.kind] || s.kind, seedKind: s.kind, lat: s.lat, lon: s.lon, colour: L.SEED_COLOUR?.[s.kind] || "#777", hours: s.hours, web: s.web,
      osm: `https://www.openstreetmap.org/${{n: "node", w: "way", r: "relation"}[k[4]]}/${k.slice(5)}`}; }
  const spots = {salmon: D.salmon?.spots, whale: D.whales?.spots, pool: D.pools?.spots}[t];
  const s = spots?.find(x => slug(x.name) === k); if(!s) return null;
  const kind = {salmon: "Salmon run", whale: "Whale watching", pool: "Tide pools"}[t];
  return {ref, t, name: s.name, kind, lat: s.lat, lon: s.lon, colour: {salmon: "#c8402f", whale: "#2f6db0", pool: "#23948f"}[t], months: s.months, station: s.station,
    sub: [s.where, s.fish || s.who].filter(Boolean).join(" · "), note: s.note, href: {salmon: "../living/?f=salmon", whale: "../living/?f=whales", pool: "../living/?g=tidepools"}[t]};
}
const inArea = (t, x) => t.regions.some(r => { const g = D.P.region[r]; if(!g) return false; const [s, w, n, e] = g.bbox; return x.lat >= s && x.lat <= n && x.lon >= w && x.lon <= e; });
const areaBox = t => { const bs = t.regions.map(r => D.P.region[r]?.bbox).filter(Boolean); if(!bs.length) return null;
  return [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))]; };
const mi = km => `${L.num(Math.round(km * 0.621))} mi`;

/* ---------- the list of trips, and the form to start one ---------- */
function regionPicker(selected = []){
  const groups = Object.keys(GROUP_NAME).map(g => [g, D.P.regions.filter(r => r.kind === g)]).filter(([, rs]) => rs.length);
  return `<div class="trip-regions" id="t-regions">${groups.map(([g, rs]) => `<div><b>${GROUP_NAME[g]}</b><div class="chips">${rs.map(r =>
    `<button type="button" class="chip${selected.includes(r.id) ? " on" : ""}" data-r="${r.id}" aria-pressed="${selected.includes(r.id)}">${esc(r.name)}</button>`).join("")}</div></div>`).join("")}</div>`;
}
const tripForm = (t, editing) => `<form class="trip-form" id="trip-form">
  <label>Name<input name="name" required maxlength="80" value="${esc(t.name)}" placeholder="Olympic Peninsula loop"></label>
  <div class="two"><label>From<input type="date" name="start" required value="${esc(t.start)}"></label><label>To<input type="date" name="end" required value="${esc(t.end)}"></label></div>
  <p class="muted small" style="margin:14px 0 6px">Where: pick one or more. Ideas come from inside them.</p>
  ${regionPicker(t.regions)}
  <div class="acts"><button class="btn" type="submit">${editing ? "Save" : "Start the trip"}</button>${editing ? `<button class="linkish" type="button" id="t-cancel">Cancel</button><button class="linkish danger" type="button" id="t-delete">Delete this trip</button>` : ""}</div></form>`;
function wireForm(t, done){
  const f = $("trip-form"), regions = new Set(t.regions);
  $("t-regions").addEventListener("click", e => { const b = e.target.closest("[data-r]"); if(!b) return;
    regions.has(b.dataset.r) ? regions.delete(b.dataset.r) : regions.add(b.dataset.r);
    b.classList.toggle("on", regions.has(b.dataset.r)); b.setAttribute("aria-pressed", regions.has(b.dataset.r)); });
  f.start.addEventListener("change", () => { if(f.end.value < f.start.value) f.end.value = addDays(f.start.value, 2); });
  f.addEventListener("submit", e => {
    e.preventDefault();
    if(!regions.size){ L.toast("Pick at least one region"); return; }
    let end = f.end.value < f.start.value ? f.start.value : f.end.value;
    if(daysOf({start: f.start.value, end}).length >= MAX_DAYS) end = addDays(f.start.value, MAX_DAYS - 1);
    done({...t, name: f.name.value.trim() || "A trip", start: f.start.value, end, regions: [...regions]});
  });
}

function listPage(){
  document.title = "Trips — Lookout";
  const all = Object.entries(L.trips.all()).map(([id, t]) => ({id, ...t})).sort((a, b) => a.start.localeCompare(b.start));
  const now = L.today(), coming = all.filter(t => t.end >= now), past = all.filter(t => t.end < now).reverse();
  const card = t => `<a class="trip-card" href="?id=${encodeURIComponent(t.id)}"><b>${esc(t.name)}</b><span>${esc(range(t))} · ${daysOf(t).length} ${daysOf(t).length === 1 ? "day" : "days"}</span>
    <span>${esc(t.regions.map(r => D.names[r] || r).join(", "))}</span><span>${t.stops.length} ${t.stops.length === 1 ? "stop" : "stops"}${t.stops.some(s => !s.day) ? `, ${t.stops.filter(s => !s.day).length} not placed yet` : ""}</span></a>`;
  const start = addDays(now, ((6 - at(now).getDay()) + 7) % 7 || 7);   /* next Saturday */
  main.innerHTML = `<section class="hero"><h1>Trips</h1><p class="sub-line">Pick the dates and where, and the trip gathers what's in season there: your places, the markets open on your days, the low tides, the salmon and whales, and the lighthouses.</p></section>`
    + L.section("Coming up", coming.length ? `<div class="trip-cards">${coming.map(card).join("")}</div>` : "", {n: coming.length})
    + L.section("Plan a trip", tripForm({name: "", start, end: addDays(start, 2), regions: []}, false), {id: "new"})
    + L.section("Been", past.length ? `<div class="trip-cards">${past.map(card).join("")}</div>` : "", {n: past.length});
  wireForm({stops: [], note: ""}, t => {
    const id = "t" + Date.now().toString(36);
    L.trips.set(id, {...t, made: Date.now()});
    location.href = "?id=" + id;
  });
}

/* ---------- one trip ---------- */
let MAP = null, LAYER = null, LIVE = {};
function tripPage(tid){
  const t = L.trips.get(tid);
  if(!t){ main.innerHTML = `<h1>No such trip</h1><p><a href="./">Your trips</a></p>`; return; }
  document.title = `${t.name} — Lookout`;
  const days = daysOf(t), months = monthsOf(t);
  const stops = t.stops.map(s => ({...s, it: item(s.ref)})).filter(s => s.it);
  const onTrip = new Set(t.stops.map(s => s.ref));

  /* the ideas, by what they are */
  const ideas = [];
  const push = (group, list) => { const l = list.filter(Boolean).filter(x => !onTrip.has(x.ref) && inArea(t, x)); if(l.length) ideas.push([group, l]); };
  const placeIdeas = D.P.list.map(p => item("place:" + p.id)).filter(Boolean);
  const fits = x => !x.season || months.some(m => L.inRange(m, x.season));
  push("From your list, in season", placeIdeas.filter(fits).sort((a, b) => a.done - b.done || a.name.localeCompare(b.name)));
  push("Saved from the map", Object.keys(L.saved.all()).map(k => item("seed:" + k)));
  const spot = (t2, list) => (list || []).map(s => item(`${t2}:${slug(s.name)}`)).filter(x => x && (!x.months || months.some(m => x.months.includes(m))));
  push("Salmon, whales and tide pools", [...spot("salmon", D.salmon?.spots), ...spot("whale", D.whales?.spots), ...spot("pool", D.pools?.spots)]);
  const seedsOf = k => Object.values(D.seeds).filter(s => s.kind === k && !L.saved.has(s.id)).map(s => item("seed:" + s.id));
  /* markets: open on one of your days first, then the ones whose hours aren't known; never the ones known to be shut all trip */
  const markets = seedsOf("market").map(x => { const o = days.map(d => [d, openOn(x.hours, d)]); x.openDays = o.filter(([, r]) => r?.open).map(([d, r]) => [d, r]);
    x.known = o.some(([, r]) => r); return x; }).filter(x => x.openDays.length || !x.known).sort((a, b) => b.openDays.length - a.openDays.length || a.name.localeCompare(b.name));
  push("Farmers markets", markets);
  push("Lighthouses", seedsOf("lighthouse").sort((a, b) => a.name.localeCompare(b.name)));
  push("Farm stands", seedsOf("farm").sort((a, b) => a.name.localeCompare(b.name)));
  for(const k of ["hot-spring", "waterfall", "campground", "camera-obscura"]) push(L.KIND[k] + "s", seedsOf(k).sort((a, b) => a.name.localeCompare(b.name)));
  push("Ferries", seedsOf("ferry").sort((a, b) => a.name.localeCompare(b.name)));

  /* a stop on a given day: what that day means for it */
  const dayNote = (x, d) => {
    if(x.seedKind === "market" || (x.hours && x.t === "seed")){ const o = openOn(x.hours, d);
      return o == null ? (x.hours ? `Hours: ${esc(x.hours)}` : "") : o.open ? `<span class="ok">Open ${esc(o.time)}${o.some ? " (some weeks)" : ""}</span>` : `<span class="warn">Closed on ${esc(short(d).split(",")[0])}</span>`; }
    if(x.t === "pool" && x.station) return `<span class="tide" data-station="${x.station}" data-day="${d}"></span>`;
    if(x.season && !L.inRange(at(d).getMonth() + 1, x.season)) return `<span class="warn">Out of season (${esc(L.seasonText(x.season))})</span>`;
    return "";
  };
  const stopRow = (s, i, list, d) => {
    const x = s.it, prev = list[i - 1]?.it, hop = prev ? mi(L.km(prev, x)) : "";
    return `<li data-ref="${esc(s.ref)}">${d ? `<span class="n" style="background:${DAY_COLOUR[(s.day - 1) % DAY_COLOUR.length]}">${i + 1}</span>` : `<i class="dot" style="background:${x.colour}"></i>`}
      <span class="what">${x.href ? `<a href="${esc(x.href)}">${esc(x.name)}</a>` : `<button type="button" class="linkish" data-show="${esc(s.ref)}">${esc(x.name)}</button>`}
      <small>${[esc(x.kind), hop && `${hop} from ${esc(prev.name)}`, d && dayNote(x, d)].filter(Boolean).join(" · ")}</small></span>
      <span class="ctl"><select data-day aria-label="Day for ${esc(x.name)}"><option value="0"${!s.day ? " selected" : ""}>Not placed</option>${days.map((dd, k) => `<option value="${k + 1}"${s.day === k + 1 ? " selected" : ""}>Day ${k + 1}, ${esc(short(dd))}</option>`).join("")}</select>
      ${d ? `<button type="button" class="ic" data-move="-1" aria-label="Earlier"${i ? "" : " disabled"}>↑</button><button type="button" class="ic" data-move="1" aria-label="Later"${i < list.length - 1 ? "" : " disabled"}>↓</button>` : ""}
      <button type="button" class="ic" data-remove aria-label="Take ${esc(x.name)} off the trip">×</button></span></li>`;
  };
  const dayBlock = (d, k) => {
    const list = stops.filter(s => s.day === k + 1), total = list.reduce((a, s, i) => a + (i ? L.km(list[i - 1].it, s.it) : 0), 0);
    return `<div class="day"><h3><span class="swatch" style="background:${DAY_COLOUR[k % DAY_COLOUR.length]}"></span>Day ${k + 1} <span class="muted">${esc(dayName(d))}</span>${list.length > 1 ? `<span class="muted small total">${mi(total)} as the crow flies</span>` : ""}</h3>
      ${list.length ? `<ol class="stops">${list.map((s, i) => stopRow(s, i, list, d)).join("")}</ol>` : `<p class="muted small">Nothing yet. Add from the ideas below, then pick this day.</p>`}</div>`;
  };
  const unplaced = stops.filter(s => !s.day || s.day > days.length);
  const ideaRow = x => {
    const extra = x.openDays?.length ? `<span class="ok">Open ${x.openDays.map(([d, r]) => `${esc(short(d).split(",")[0])}${r.time ? " " + esc(r.time) : ""}`).join(", ")}</span>`
      : x.seedKind === "market" ? "Hours not listed" : x.sub ? esc(x.sub) : x.hours ? esc(x.hours) : "";
    return `<li><i class="dot" style="background:${x.colour}"></i><span class="what">${x.href ? `<a href="${esc(x.href)}">${esc(x.name)}</a>` : `<button type="button" class="linkish" data-show="${esc(x.ref)}">${esc(x.name)}</button>`}
      <small>${[esc(x.kind), extra, x.done ? "done" : "", x.t === "pool" && x.station ? `<span class="tide-best" data-station="${x.station}"></span>` : ""].filter(Boolean).join(" · ")}</small></span>
      <button type="button" class="chip" data-add="${esc(x.ref)}">Add</button></li>`;
  };
  const CAP = 40;
  main.innerHTML = `<section class="hero"><p class="eyebrow">Trip · ${days.length} ${days.length === 1 ? "day" : "days"}</p><h1>${esc(t.name)}</h1>
      <p class="sub-line">${esc(range(t))} · ${esc(t.regions.map(r => D.names[r] || r).join(", "))}</p>
      <p class="trip-acts"><button type="button" class="linkish" id="t-edit">Change the dates or where</button> · <a href="./">All trips</a></p><div id="t-editbox"></div></section>`
    + `<div class="trip-grid"><div>`
    + L.section("The days", days.map(dayBlock).join("")
        + (unplaced.length ? `<div class="day"><h3>Not placed yet <span class="muted">${unplaced.length}</span></h3><ol class="stops loose">${unplaced.map((s, i) => stopRow(s, i, unplaced, null)).join("")}</ol></div>` : ""), {id: "days"})
    + `</div><div class="trip-side">${L.section("The map", `<div class="mapbox trip-map" id="trip-map"></div><p class="legend"><span><i></i>Stops, numbered by day</span><span><i class="idea"></i>Ideas: tap one to add it</span></p>`)}</div></div>`
    + L.section("Ideas", ideas.length ? ideas.map(([g, l]) => `<h3 class="seed-h">${esc(g)} <span class="muted">${l.length}</span></h3><ul class="seed-list">${l.slice(0, CAP).map(ideaRow).join("")}</ul>${l.length > CAP ? `<p class="muted small">And ${l.length - CAP} more on the map.</p>` : ""}`).join("")
        : `<p class="muted">Nothing seeded in ${esc(t.regions.map(r => D.names[r]).join(", "))} yet. Pick more regions, or save places from the map on Places.</p>`, {id: "ideas"})
    + `<section class="section" id="out"${LIVE.out ? "" : " hidden"}><h2>Out in ${esc(months.map(m => L.MONTHS[m - 1]).join(" and "))}<span class="aside"><a id="out-link" target="_blank" rel="noopener">On iNaturalist ↗</a></span></h2><p class="muted small lede">The most-recorded plants and animals in these regions in ${months.length > 1 ? "those months" : "that month"}, from iNaturalist.</p><div class="row" id="out-row">${LIVE.out || ""}</div></section>`;

  /* the map: numbered stops, faint ideas */
  const Lf = window.L;
  if(Lf){
    MAP?.remove();
    MAP = Lf.map($("trip-map"), {scrollWheelZoom: false, preferCanvas: true, zoomSnap: .25});
    Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 17, crossOrigin: "anonymous",
      attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`}).addTo(MAP);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d5c43";
    for(const r of t.regions){ const g = D.P.region[r]; if(g) Lf.rectangle([[g.bbox[0], g.bbox[1]], [g.bbox[2], g.bbox[3]]], {color: accent, weight: 1, dashArray: "4 5", fill: false, interactive: false}).addTo(MAP); }
    const pop = (x, on) => `<div class="pop seed-pop"><b>${esc(x.name)}</b><span>${esc(x.kind)}${x.hours ? ` · ${esc(x.hours)}` : ""}</span>
      <span class="links">${x.href ? `<a href="${esc(x.href)}">Open ↗</a>` : ""}${x.web ? `<a href="${esc(x.web)}" target="_blank" rel="noopener">Website ↗</a>` : ""}${x.osm ? `<a href="${esc(x.osm)}" target="_blank" rel="noopener">Map ↗</a>` : ""}</span>
      ${on ? "" : `<button type="button" class="btn" data-add="${esc(x.ref)}">Add to the trip</button>`}</div>`;
    for(const [, l] of ideas) for(const x of l) Lf.circleMarker([x.lat, x.lon], {radius: 5, color: "#fff", weight: 1, fillColor: x.colour.startsWith("var") ? accent : x.colour, fillOpacity: .5}).bindPopup(pop(x, false), {maxWidth: 260}).addTo(MAP);
    const pts = [];
    for(const s of stops){
      const k = s.day && s.day <= days.length ? s.day : 0, list = stops.filter(o => o.day === s.day), n = list.indexOf(s) + 1;
      const icon = Lf.divIcon({className: "", iconSize: [24, 24], iconAnchor: [12, 12], html: `<span class="trip-pin" style="background:${k ? DAY_COLOUR[(k - 1) % DAY_COLOUR.length] : "#777"}">${k ? n : "?"}</span>`});
      Lf.marker([s.it.lat, s.it.lon], {icon, title: s.it.name, zIndexOffset: 1000}).bindPopup(pop(s.it, true), {maxWidth: 260}).addTo(MAP);
      pts.push([s.it.lat, s.it.lon]);
    }
    /* each day's route, in order, as a thin line */
    days.forEach((d, k) => { const l = stops.filter(s => s.day === k + 1); if(l.length > 1) Lf.polyline(l.map(s => [s.it.lat, s.it.lon]), {color: DAY_COLOUR[k % DAY_COLOUR.length], weight: 2.5, opacity: .8, interactive: false}).addTo(MAP); });
    const box = areaBox(t);
    if(pts.length > 1) MAP.fitBounds(pts, {padding: [30, 30], maxZoom: 12});
    else if(box) MAP.fitBounds([[box[0], box[1]], [box[2], box[3]]], {padding: [8, 8]});
    else MAP.setView([47.5, -122], 7);
    new ResizeObserver(() => MAP.invalidateSize()).observe($("trip-map"));
    $("trip-map").addEventListener("click", e => { const b = e.target.closest("[data-add]"); if(b) add(b.dataset.add); });
  }

  /* the tides at tide-pool stops and ideas */
  const stations = new Set([...document.querySelectorAll("[data-station]")].map(el => el.dataset.station));
  for(const st of stations) tides(st, t).then(by => {
    for(const el of document.querySelectorAll(`.tide[data-station="${st}"]`)){ const x = by[el.dataset.day]; el.textContent = x ? `Lowest daylight tide ${ft(x.v)} at ${x.t}` : ""; if(x && x.v < 0) el.classList.add("ok"); }
    const best = Object.entries(by).sort((a, b) => a[1].v - b[1].v)[0];
    for(const el of document.querySelectorAll(`.tide-best[data-station="${st}"]`)) el.textContent = best ? `best low ${ft(best[1].v)}, ${short(best[0]).split(",")[0]} ${best[1].t}` : "";
  });

  /* what's out: live, once per page */
  const box = areaBox(t);
  if(box && !LIVE.out && !LIVE.asked){
    LIVE.asked = true;
    const q = {swlat: box[0], swlng: box[1], nelat: box[2], nelng: box[3], month: months.join(","), verifiable: "true", per_page: 24};
    L.nat("observations/species_counts", q).then(j => {
      const tiles = (j.results || []).filter(x => ["species", "subspecies", "variety"].includes(x.taxon.rank)).slice(0, 18).map(x => L.liveTile(L.taxonCard(x.taxon)));
      if(!tiles.length) return;
      LIVE.out = tiles.join(""); LIVE.link = `https://www.inaturalist.org/observations?swlat=${box[0]}&swlng=${box[1]}&nelat=${box[2]}&nelng=${box[3]}&month=${months.join(",")}&view=species`;
      const sec = $("out"); if(!sec) return;
      $("out-row").innerHTML = LIVE.out; $("out-link").href = LIVE.link; sec.hidden = false; L.fillPhotos(sec);
    }).catch(() => {});
  } else if(LIVE.out){ $("out-link").href = LIVE.link; L.fillPhotos($("out")); }

  /* changes */
  const save = next => { L.trips.set(tid, next); keepScroll(() => tripPage(tid)); };
  function add(ref){ if(L.trips.add(tid, ref)){ L.toast(`Added: ${item(ref)?.name || "it"}`); keepScroll(() => tripPage(tid)); } }
  main.onclick = e => {
    const a = e.target.closest("[data-add]"); if(a && !a.closest("#trip-map")){ add(a.dataset.add); return; }
    const show = e.target.closest("[data-show]");
    if(show && MAP){ const x = item(show.dataset.show); if(x){ MAP.setView([x.lat, x.lon], 12); $("trip-map").scrollIntoView({behavior: "smooth", block: "center"});
      MAP.eachLayer(k => { const p = k.getLatLng?.(); if(p && p.lat === x.lat && p.lng === x.lon && k.getPopup?.()) k.openPopup(); }); } return; }
    const li = e.target.closest("li[data-ref]"); if(!li) return;
    const ref = li.dataset.ref, cur = L.trips.get(tid);
    if(e.target.closest("[data-remove]")){ cur.stops = cur.stops.filter(s => s.ref !== ref); return save(cur); }
    const mv = e.target.closest("[data-move]");
    if(mv){
      const me = cur.stops.find(s => s.ref === ref), same = cur.stops.filter(s => s.day === me.day), j = same.indexOf(me) + +mv.dataset.move;
      if(j < 0 || j >= same.length) return;
      const a2 = cur.stops.indexOf(me), b2 = cur.stops.indexOf(same[j]); [cur.stops[a2], cur.stops[b2]] = [cur.stops[b2], cur.stops[a2]];
      return save(cur);
    }
  };
  main.onchange = e => {
    const sel = e.target.closest("select[data-day]"); if(!sel) return;
    const ref = sel.closest("li[data-ref]").dataset.ref, cur = L.trips.get(tid), me = cur.stops.find(s => s.ref === ref);
    /* moving to a day puts it at the end of that day */
    cur.stops = cur.stops.filter(s => s !== me); me.day = +sel.value; cur.stops.push(me); save(cur);
  };
  $("t-edit").addEventListener("click", () => {
    const box2 = $("t-editbox"); if(box2.innerHTML){ box2.innerHTML = ""; return; }
    box2.innerHTML = tripForm(L.trips.get(tid), true);
    wireForm(L.trips.get(tid), next => { LIVE = {}; const n = daysOf(next).length; next.stops = next.stops.map(s => s.day > n ? {...s, day: 0} : s); L.trips.set(tid, next); tripPage(tid); });
    $("t-cancel").addEventListener("click", () => box2.innerHTML = "");
    $("t-delete").addEventListener("click", () => { if(confirm(`Delete ${t.name}?`)){ L.trips.remove(tid); location.href = "./"; } });
  });
}
const keepScroll = fn => { const y = scrollY; fn(); scrollTo(0, y); };

loadAll().then(d => { D = d; id ? tripPage(id) : listPage(); })
  .catch(e => { main.innerHTML = `<p class="muted">Couldn't load the trips (${esc(e.message)}).</p>`; });

window.Lookout.openOn = openOn;   /* for the checks */
}
