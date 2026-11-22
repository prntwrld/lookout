/* Lookout — the front page: the day's sky and season, today's pick (a hike in season or a flower in bloom), where to
   go this month, the map of Cascadia beside your progress, and what you've done lately. Today's pick is the same for everyone today and changes at midnight. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
document.body.insertAdjacentHTML("beforeend", L.footer());

let heroId = null;   /* the place in the big picture, so Where to go doesn't show it twice */
function hero(P, F, r){
  const m = L.month();
  const todo = P.list.filter(p => p.photo && L.inSeason(p) && !L.log.get(p.id));
  const hikes = todo.length ? todo : P.list.filter(p => p.photo && L.inSeason(p));
  const flowers = (F?.list || []).filter(s => s.photos?.length && L.blooming(s, m));
  const useFlower = flowers.length && (!hikes.length || r() < .5);
  if(useFlower){
    const s = flowers[Math.floor(r() * Math.min(flowers.length, 40))], ph = s.photos[0];
    return `<section class="hero"><div class="frame" data-hide-broken><a href="${L.speciesHref(s)}"><img src="${L.photoSrc(ph, "large")}" data-fallback="${L.thumb(s)}" alt="${esc(s.common || s.sci)}" crossorigin="anonymous"></a>${L.photoCredit(ph)}</div>
      <p class="eyebrow">In bloom now</p><h1><a href="${L.speciesHref(s)}" style="color:inherit;text-decoration:none">${esc(s.common || s.sci)}</a></h1>
      <p class="sub-line"><i class="sci">${esc(s.sci)}</i> · ${esc(L.bloomText(s.bloom))}${s.elev ? ` · ${L.num(s.elev[0])}–${L.feet(s.elev[1])}` : ""}</p></section>`;
  }
  const pool = hikes.length ? hikes : P.list.filter(p => p.photo);
  if(!pool.length) return "";
  const p = pool[Math.floor(r() * pool.length)], reg = P.region[p.region];
  heroId = p.id;
  return `<section class="hero"><div class="frame" data-hide-broken><a href="${L.placeHref(p.id)}"><img src="${esc(p.photo.src)}" alt="${esc(p.name)}" crossorigin="anonymous"></a>${L.credit(p.photo.by, p.photo.lic, p.photo.page)}</div>
    <p class="eyebrow">${L.inSeason(p) ? "In season now" : esc(L.KIND[p.kind])} · ${esc(reg?.name || "")}</p>
    <h1><a href="${L.placeHref(p.id)}" style="color:inherit;text-decoration:none">${esc(p.name)}</a></h1>
    <p class="sub-line">${[p.area, p.distance_mi != null && L.miles(p.distance_mi), p.gain_ft != null && `${L.num(p.gain_ft)} ft gain`, L.seasonText(p.season)].filter(Boolean).map(esc).join(" · ")}</p></section>`;
}

/* ---------- the sky and the season: a small panel beside Where to go, worked out for Seattle (app/sky.js) ---------- */
const HERE = {lat: 47.61, lng: -122.33, name: "Seattle", tz: "America/Los_Angeles"};
const SHOWERS = [["Quadrantids", 1, 3], ["Lyrids", 4, 22], ["Eta Aquariids", 5, 5], ["Perseids", 8, 12], ["Orionids", 10, 21],
  ["Leonids", 11, 17], ["Geminids", 12, 13], ["Ursids", 12, 22]];
const POINTS = [[0, "spring equinox", "Spring"], [90, "summer solstice", "Summer"], [180, "autumn equinox", "Autumn"], [270, "winter solstice", "Winter"]];
function almanac(){
  const S = window.Sky; if(!S) return "";
  const now = Date.now(), day = 864e5;
  const fmt = (t, o) => new Intl.DateTimeFormat("en-US", {timeZone: HERE.tz, ...o}).format(t);
  const ymd = t => fmt(t, {year: "numeric", month: "2-digit", day: "2-digit"});
  const hm = t => fmt(t, {hour: "numeric", minute: "2-digit"}).replace(/\s?([AP])M/, (_, x) => x === "A" ? " am" : " pm");
  /* sunrise and sunset: where the Sun's top edge crosses the horizon, found minute by minute through the day */
  const alt = t => { const s = S.sun(t); return S.altAz(s.ra, s.dec, HERE.lat, HERE.lng, t).alt + .833; };
  const riseSet = date => {
    let rise = null, set = null, t = now - 1.5 * day, a = alt(t);
    for(; t < now + 1.5 * day; t += 2 * 60e3){
      const b = alt(t + 2 * 60e3);
      const at = t + 2 * 60e3 * a / (a - b);   /* between the two steps, where the line crosses zero */
      if(ymd(t) === date){ if(a < 0 && b >= 0) rise = at; if(a >= 0 && b < 0) set = at; }
      a = b;
    }
    return {rise, set};
  };
  const today = riseSet(ymd(now)), yday = riseSet(ymd(now - day));
  /* the season: the Sun's right ascension passes 0, 90, 180 and 270 at the equinoxes and solstices */
  const ra = t => S.sun(t).ra, part = x => Math.floor(x / 90);
  let t = now; const q = part(ra(now));
  while(part(ra(t)) === q && t < now + 100 * day) t += day / 4;
  const cal = x => Date.parse(ymd(x).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));   /* calendar days, in Pacific time */
  const next = POINTS[(q + 1) % 4], days = Math.round((cal(t - day / 8) - cal(now)) / day), season = POINTS[q][2];
  /* the Moon, and the bright planets up after dark tonight */
  const m = S.moon(now);
  const dark = S.tonight(HERE.lat, HERE.lng, ["venus", "mars", "jupiter", "saturn"], now);
  const up = ["Venus", "Mars", "Jupiter", "Saturn"].filter((_, i) => dark.things[i]?.up);
  /* a meteor shower peaking within the next month (or the last two days) */
  const yr = +fmt(now, {year: "numeric"});
  const shower = SHOWERS.flatMap(([n, mo, d]) => [yr - 1, yr, yr + 1].map(y => ({n, t: Date.UTC(y, mo - 1, d, 12)})))
    .map(x => ({...x, in: Math.round((x.t - now) / day)})).filter(x => x.in >= -2 && x.in <= 30).sort((a, b) => a.t - b.t)[0];
  const dur = today.rise && today.set ? today.set - today.rise : 0, was = yday.rise && yday.set ? yday.set - yday.rise : 0;
  const mins = Math.round((dur - was) / 60e3);
  const row = (k, v) => v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : "";
  const list = names => names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names.at(-1) : names[0];
  const change = was ? mins ? ` <small>${mins < 0 ? "−" : "+"}${Math.abs(mins)} min</small>` : ` <small>same as yesterday</small>` : "";
  return `<aside class="sky" aria-label="The sky and the season">
    <p class="eyebrow">${esc(fmt(now, {weekday: "long", month: "long", day: "numeric"}))}</p>
    <p class="sky-season">${esc(season)} <small>${days <= 0 ? `the ${next[1]} today` : `${days} ${days === 1 ? "day" : "days"} to the ${next[1]}`}</small></p>
    <dl>${row("Sunrise", today.rise && esc(hm(today.rise)))}${row("Sunset", today.set && esc(hm(today.set)))}
      ${row("Daylight", dur && `${Math.floor(dur / 36e5)} h ${Math.round(dur % 36e5 / 60e3)} min${change}`)}
      ${row("Moon", esc(S.phaseName(m.phase).replace(/ moon$/i, "")))}
      ${row("Tonight", up.length && esc(list(up)))}
      ${row("Meteors", shower && `${esc(shower.n)} <small>${shower.in < 0 ? "just peaked" : shower.in <= 1 ? "peak tonight" : "peak " + esc(fmt(shower.t, {month: "short", day: "numeric"}))}</small>`)}</dl>
    <p class="sky-where">In ${esc(HERE.name)}</p></aside>`;
}

/* ---------- where to go this month: the places in season, then the ones opening next; the sky panel beside ---------- */
function goNow(P, r){
  const m = L.month(), done = L.log.all();
  const now = L.shuffle(P.list.filter(p => L.inSeason(p, m) && p.photo && p.id !== heroId), r).sort((a, b) => !!done[a.id] - !!done[b.id]);
  /* how many months until a place's season opens */
  const wait = p => Array.isArray(p.season) ? (p.season[0] - m + 12) % 12 : 99;
  const soon = P.list.filter(p => !L.inSeason(p, m) && wait(p) < 99).sort((a, b) => wait(a) - wait(b) || a.name.localeCompare(b.name));
  const tile = (p, cls) => `<a href="${L.placeHref(p.id)}" class="${cls}" data-place="${esc(p.id)}"><img src="${esc(L.sized(p.photo.src, cls ? 960 : 500))}" alt="" loading="lazy" crossorigin="anonymous"><span>${esc(p.name)}</span></a>`;
  /* a card; for one opening later, when it opens comes first under its name */
  const card = (p, opens) => L.placeCard(p, P.region[p.region]).replace("</h3><p>", opens ? `</h3><p>Opens in ${esc(L.MONTHS[p.season[0] - 1])} · ` : "</h3><p>");
  const cards = (list, opens) => `<div class="cards">${list.map(p => card(p, opens)).join("")}</div>`;
  let body;
  if(now.length >= 9){
    /* plenty in season: two rows of six, one big tile (four cells) and eight small */
    body = `<div class="wall go">${now.slice(0, 9).map((p, i) => tile(p, i ? "" : "w2")).join("")}</div>`;
  } else {
    /* fewer: the ones in season, then a row of two opening next (two rows when nothing's in season) */
    const next = soon.slice(0, now.length ? 2 : 4);
    body = (now.length ? `<p class="eyebrow go-h">In season now</p>${cards(now)}` : "")
      + (next.length ? `<p class="eyebrow go-h">Opening next</p>${cards(next, true)}` : "");
  }
  return `<div class="go-row"><div>${body}</div>${almanac()}</div>`;
}

function progress(P){
  const done = L.log.all(), n = P.list.filter(p => done[p.id]).length, total = P.list.length;
  const rows = P.regions.map(reg => {
    const here = P.list.filter(p => p.region === reg.id); if(!here.length) return "";
    const k = here.filter(p => done[p.id]).length;
    return `<li><span>${esc(reg.name)}</span><span class="bar"><i style="width:${100 * k / here.length}%"></i></span><span>${k} of ${here.length}</span></li>`;
  }).join("");
  return `<div class="progress"><div><div class="big-n">${n}<small> of ${total}</small></div>
    <div class="bar" style="margin:14px 0 10px"><i style="width:${total ? 100 * n / total : 0}%"></i></div>
    <a href="places/">The whole list →</a></div><ul class="regions">${rows}</ul></div>`;
}

function lately(P){
  const done = L.log.all();
  const list = P.list.filter(p => done[p.id]).sort((a, b) => String(done[b.id].date).localeCompare(String(done[a.id].date))).slice(0, 4);
  return list.length ? `<div class="cards">${list.map(p => L.placeCard(p, P.region[p.region])).join("")}</div>` : "";
}

async function render(){
  const [P, F] = await Promise.all([L.data.places(), L.data.flowers().catch(() => null)]);
  const r = L.rng("home " + L.today());
  const outline = await L.data.json("cascadia.json").catch(() => null);
  main.innerHTML = hero(P, F, r)
    + L.section(`Where to go in ${L.MONTHS[L.month() - 1]}`, goNow(P, r))
    + L.section("Cascadia", `<div class="atlas"><div><div class="mapbox tall" id="map"></div><p class="legend"><span><i></i>To do</span><span><i class="done"></i>Done</span><span class="switches"><button type="button" class="chip" data-borders aria-pressed="false">Borders</button><button type="button" class="chip" data-rivers aria-pressed="false">Rivers in blue</button></span></p></div>
      <div id="progress"><h3 class="atlas-h">Your progress</h3>${progress(P)}</div></div>`, {aside: `<span class="muted">Every river to the Pacific, Copper River to Cape Mendocino</span>`})
    + L.section("Lately", lately(P), {id: "lately"});
  L.map($("map"), P.list, {outline});
  L.ownPhotos(main);
  document.addEventListener("lookout-log", () => {
    $("progress")?.querySelector(".progress")?.replaceWith(Object.assign(document.createElement("div"), {innerHTML: progress(P)}).firstElementChild);
  });
}
render().catch(e => { main.innerHTML = `<p class="muted">Couldn't load the guide's data (${esc(e.message)}).</p>`; });
}
