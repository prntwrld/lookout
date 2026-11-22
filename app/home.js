/* Lookout — the front page: today's pick (a hike in season or a flower in bloom), a wall of photos, the map,
   and your progress. Today's pick is the same for everyone today and changes at midnight. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
document.body.insertAdjacentHTML("beforeend", L.footer());

function hero(P, F, r){
  const m = L.month();
  const todo = P.list.filter(p => p.photo && L.inSeason(p) && !L.log.get(p.id));
  const hikes = todo.length ? todo : P.list.filter(p => p.photo && L.inSeason(p));
  const flowers = (F?.list || []).filter(s => s.photos?.length && L.blooming(s, m));
  const useFlower = flowers.length && (!hikes.length || r() < .5);
  if(useFlower){
    const s = flowers[Math.floor(r() * Math.min(flowers.length, 40))], ph = s.photos[0];
    return `<section class="hero"><div class="frame" data-hide-broken><a href="${L.speciesHref(s)}"><img src="${L.inat(ph, "large")}" data-fallback="${L.thumb(s)}" alt="${esc(s.common || s.sci)}" crossorigin="anonymous"></a>${L.inatCredit(ph)}</div>
      <p class="eyebrow">In bloom now</p><h1><a href="${L.speciesHref(s)}" style="color:inherit;text-decoration:none">${esc(s.common || s.sci)}</a></h1>
      <p class="sub-line"><i class="sci">${esc(s.sci)}</i> · ${esc(L.bloomText(s.bloom))}${s.elev ? ` · ${L.num(s.elev[0])}–${L.feet(s.elev[1])}` : ""}</p></section>`;
  }
  const pool = hikes.length ? hikes : P.list.filter(p => p.photo);
  if(!pool.length) return "";
  const p = pool[Math.floor(r() * pool.length)], reg = P.region[p.region];
  return `<section class="hero"><div class="frame" data-hide-broken><a href="${L.placeHref(p.id)}"><img src="${esc(p.photo.src)}" alt="${esc(p.name)}" crossorigin="anonymous"></a>${L.credit(p.photo.by, p.photo.lic, p.photo.page)}</div>
    <p class="eyebrow">${L.inSeason(p) ? "In season now" : esc(L.KIND[p.kind])} · ${esc(reg?.name || "")}</p>
    <h1><a href="${L.placeHref(p.id)}" style="color:inherit;text-decoration:none">${esc(p.name)}</a></h1>
    <p class="sub-line">${[p.area, p.distance_mi != null && L.miles(p.distance_mi), p.gain_ft != null && `${L.num(p.gain_ft)} ft gain`, L.seasonText(p.season)].filter(Boolean).map(esc).join(" · ")}</p></section>`;
}

/* the wall: places and flowers mixed, flowers in bloom first, one big tile every few */
function wall(P, F, r){
  const m = L.month();
  const places = L.shuffle(P.list.filter(p => p.photo), r).map(p => ({href: L.placeHref(p.id), src: L.sized(p.photo.src, 960), name: p.name}));
  const fl = F?.list.filter(s => s.photos?.length) || [];
  const now = L.shuffle(fl.filter(s => L.blooming(s, m)), r), rest = L.shuffle(fl.filter(s => !L.blooming(s, m)), r);
  const flowers = [...now, ...rest].slice(0, 22).map(s => ({href: L.speciesHref(s), src: L.inat(s.photos[0], "medium"), fb: L.thumb(s), name: s.common || s.sci}));
  const tiles = [];
  while(places.length || flowers.length){
    if(places.length) tiles.push(places.shift());
    for(let k = 0; k < 2 && flowers.length; k++) tiles.push(flowers.shift());
  }
  const cls = i => i % 9 === 0 ? "w2" : i % 9 === 5 ? "h2" : "";
  const cells = i => ({w2: 4, h2: 2}[cls(i)] || 1);
  let list = tiles.slice(0, 30);
  /* trim to whole rows: 6, 4 and 3 columns all divide 12, so the mosaic ends square */
  while(list.length && list.reduce((n, _, i) => n + cells(i), 0) % 12) list = list.slice(0, -1);
  if(!list.length) return "";
  return `<div class="wall">${list.map((t, i) => `<a href="${esc(t.href)}" class="${cls(i)}">
    <img src="${esc(t.src)}"${t.fb ? ` data-fallback="${esc(t.fb)}"` : ""} alt="" loading="lazy" crossorigin="anonymous"><span>${esc(t.name)}</span></a>`).join("")}</div>`;
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
  main.innerHTML = hero(P, F, r)
    + L.section("The wall", wall(P, F, r))
    + L.section("The map", `<div class="mapbox" id="map"></div><p class="legend"><span><i></i>To do</span><span><i class="done"></i>Done</span></p>`)
    + L.section("Your progress", progress(P), {id: "progress"})
    + L.section("Lately", lately(P), {id: "lately"});
  L.map($("map"), P.list);
  L.ownPhotos(main);
  document.addEventListener("lookout-log", () => {
    $("progress")?.querySelector(".progress")?.replaceWith(Object.assign(document.createElement("div"), {innerHTML: progress(P)}).firstElementChild);
  });
}
render().catch(e => { main.innerHTML = `<p class="muted">Couldn't load the guide's data (${esc(e.message)}).</p>`; });
}
