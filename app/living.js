/* Lookout — Living things: the field guide (living/) and each species (living/?id=<slug>).
   A species opens with its photographs, then its names, when it flowers and how high, what it looks like,
   where on your list to see it, and its relatives in the guide. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
const id = new URLSearchParams(location.search).get("id");
document.body.insertAdjacentHTML("beforeend", L.footer());

const PETALS = {"3": "three", "4": "four", "5": "five", "6": "six", many: "many", daisy: "a daisy-like head", irregular: "irregular (pea, orchid or lipped)", tiny: "tiny, in clusters"};
const LEAF = {linear: "grass-like", lance: "lance-shaped", oval: "oval", heart: "heart-shaped or round", lobed: "lobed", three: "in threes", palmate: "fanned like fingers", pinnate: "feathery or fern-like", none: "no green leaves"};
const ARR = {basal: "from the base", alt: "alternate", opp: "opposite", whorl: "whorled", none: ""};
const HAB = {forest: "forest", meadow: "meadows", rocky: "rocks and talus", wet: "wet ground", dry: "dry open slopes", alpine: "near or above treeline"};
const list = (codes, names) => codes.map(c => names[c]).filter(Boolean).join(", ");

/* ---------- where on the list to see it ---------- */
function whereToSee(s, P){
  const out = [];
  for(const p of P.list){
    const months = Object.entries(p.seen || {}).filter(([, ids]) => ids.includes(s.id)).map(([m]) => +m).sort((a, b) => a - b);
    if(months.length){ out.push({p, score: 10 + months.length, why: `Recorded near the trailhead in ${months.map(m => L.MON[m - 1]).join(", ")}`}); continue; }
    if(!s.regions?.includes(p.region) || !s.elev || p.high_ft == null) continue;
    const lo = Math.max(0, p.high_ft - (p.gain_ft || 0)), hi = p.high_ft;
    if(hi < s.elev[0] - 300 || lo > s.elev[1] + 300) continue;
    const season = s.bloom?.some(m => L.inSeason(p, m));
    if(!season) continue;
    out.push({p, score: 1 + (p.books?.length || 0) / 10, why: `In its range here: ${L.num(s.elev[0])}–${L.feet(s.elev[1])}, flowering ${L.bloomText(s.bloom.filter(m => L.inSeason(p, m)))}`});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

async function speciesPage(F, s){
  const P = await L.data.places().catch(() => null);
  document.title = `${s.common || s.sci} — Lookout`;
  const m = L.month(), ph = s.photos || [];
  const where = P ? whereToSee(s, P) : [];
  const genus = s.sci.split(" ")[0];
  const kin = F.list.filter(x => x.id !== s.id && x.sci.startsWith(genus + " "));
  const fam = kin.length < 3 ? F.list.filter(x => x.id !== s.id && x.family === s.family && !kin.includes(x)).slice(0, 10 - kin.length) : [];
  const facts = [
    ["Flowers", s.bloom?.length ? `<div class="months">${L.MON.map((n, i) => `<span class="${s.bloom.includes(i + 1) ? "on" : ""}${i + 1 === m ? " now" : ""}" title="${L.MONTHS[i]}">${n[0]}</span>`).join("")}</div>${esc(L.bloomText(s.bloom))}` : ""],
    ["Elevation", s.elev ? `${L.num(s.elev[0])}–${L.feet(s.elev[1])}` : ""],
    ["Colour", s.colour?.length ? s.colour.map(c => `${L.sw(c)}${esc(L.COLOUR[c]?.[0] || c)}`).join(" &nbsp; ") : ""],
    ["Petals", list(s.petals, PETALS)],
    ["Leaves", [list(s.leaf, LEAF), list(s.arr, ARR)].filter(Boolean).join("; ")],
    ["Habitat", list(s.habitat, HAB)],
    ["Regions", P && s.regions?.length ? s.regions.map(r => esc(P.region[r]?.name || r)).join(", ") : ""],
    ["Family", esc(L.familyName(s.family))],
    ["Pojar", s.pojar ? `p. ${esc(s.pojar)}` : ""]
  ].filter(x => x[1]);
  main.innerHTML = `<section class="hero">${ph.length ? `<div class="frame" id="big"><img src="${L.inat(ph[0], "large")}" data-fallback="${L.thumb(s)}" alt="${esc(s.common || s.sci)}" crossorigin="anonymous">${L.inatCredit(ph[0])}</div>
      ${ph.length > 1 ? `<div class="strip">${ph.map((p, i) => `<button type="button" data-i="${i}" aria-current="${!i}" aria-label="Photo ${i + 1}"><img src="${L.inat(p, "small")}" alt="" loading="lazy" crossorigin="anonymous"></button>`).join("")}</div>` : ""}` : ""}
      <p class="eyebrow">${esc(s.family)}${L.blooming(s, m) ? " · In bloom now" : ""}</p><h1>${esc(s.common || s.sci)}</h1>
      <p class="sub-line"><i class="sci">${esc(s.sci)}</i>${s.pojar ? ` · Pojar p. ${esc(s.pojar)}` : ""}</p></section>
    <div class="split"><div><dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      ${s.summary ? `<div class="about" style="margin-top:24px"><p>${esc(s.summary)}</p><p class="credit">From ${s.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(s.wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a>` : "Wikipedia"}, CC BY-SA</p></div>` : ""}
      <p style="margin-top:18px"><a href="${L.inatTaxon(s.id)}" target="_blank" rel="noopener">Sightings on iNaturalist ↗</a></p></div>
      <div>${where.length ? `<h2 style="font:400 26px var(--display);margin:0 0 14px">Where to see it</h2><ul class="where">${where.map(({p, why}) => `<li><a href="${L.placeHref(p.id)}">${p.photo
        ? `<img src="${esc(L.sized(p.photo.src, 240))}" alt="" loading="lazy" crossorigin="anonymous">` : `<span class="ph"></span>`}<span><b>${esc(p.name)}</b><span>${esc(why)}</span></span></a></li>`).join("")}</ul>` : ""}</div></div>`
    + L.section(kin.length ? `Other ${esc(genus)} in the guide` : "Relatives in the guide", [...kin, ...fam].length ? `<div class="row">${[...kin, ...fam].map(x => L.speciesTile(x)).join("")}</div>` : "")
    + `<p><a href="${L.ROOT}key/">Not sure? Try the key →</a></p>`;
  main.querySelector(".strip")?.addEventListener("click", e => {
    const b = e.target.closest("[data-i]"); if(!b) return;
    const p = ph[+b.dataset.i];
    $("big").innerHTML = `<img src="${L.inat(p, "large")}" alt="${esc(s.common || s.sci)}" crossorigin="anonymous">${L.inatCredit(p)}`;
    main.querySelectorAll(".strip button").forEach(x => x.setAttribute("aria-current", x === b));
  });
}

/* ---------- the guide ---------- */
function guidePage(F){
  const m = L.month(), r = L.rng("living " + L.today());
  const now = F.list.filter(s => L.blooming(s, m));
  const pool = (now.length ? now : F.list).filter(s => s.photos?.length);
  const pick = pool[Math.floor(r() * pool.length)];
  const families = [...new Set(F.list.map(s => s.family))].sort();
  const colours = Object.keys(L.COLOUR).filter(c => F.list.some(s => s.colour.includes(c)));
  main.innerHTML = (pick ? `<section class="hero"><div class="frame"><a href="${L.speciesHref(pick)}"><img src="${L.inat(pick.photos[0], "large")}" data-fallback="${L.thumb(pick)}" alt="${esc(pick.common || pick.sci)}" crossorigin="anonymous"></a>${L.inatCredit(pick.photos[0])}</div>
      <h1>Living things</h1><p class="sub-line">Cascades wildflowers · ${F.list.length} species · <a href="${L.speciesHref(pick)}">${esc(pick.common || pick.sci)}</a> above</p></section>` : `<h1>Living things</h1>`)
    + L.section(`In bloom in ${L.MONTHS[m - 1]}`, now.length ? `<div class="row">${now.sort((a, b) => b.obs - a.obs).map(s => L.speciesTile(s)).join("")}</div>` : "", {n: now.length})
    + L.section("Wildflowers", `<div class="filters"><input type="search" id="q" placeholder="Name" aria-label="Find by name">
        <div class="chips" id="colours">${colours.map(c => `<button type="button" class="chip" aria-pressed="false" data-c="${c}">${L.sw(c)}${esc(L.COLOUR[c][0])}</button>`).join("")}</div>
        <label>Family <select id="fam"><option value="">All</option>${families.map(f => `<option>${esc(f)}</option>`).join("")}</select></label>
        <label>Sort <select id="sort"><option value="obs">Most seen</option><option value="name">Name</option><option value="sci">Scientific name</option></select></label></div>
        <div class="grid" id="all"></div><p style="margin-top:22px"><a href="${L.ROOT}key/">Name a flower with the key →</a></p>`, {n: `<span id="shown">${F.list.length}</span>`});
  const draw = () => {
    const q = $("q").value.trim().toLowerCase(), fam = $("fam").value, sort = $("sort").value;
    const cs = [...$("colours").querySelectorAll("[aria-pressed=true]")].map(b => b.dataset.c);
    const by = {obs: (a, b) => b.obs - a.obs, name: (a, b) => (a.common || a.sci).localeCompare(b.common || b.sci), sci: (a, b) => a.sci.localeCompare(b.sci)}[sort];
    const list = F.list.filter(s => (!q || `${s.common} ${s.sci} ${s.family}`.toLowerCase().includes(q)) && (!fam || s.family === fam) && (!cs.length || cs.some(c => s.colour.includes(c)))).sort(by);
    $("all").innerHTML = list.map(s => L.speciesTile(s)).join("") || `<p class="muted">Nothing by that name.</p>`;
    $("shown").textContent = list.length;
  };
  $("q").addEventListener("input", draw); $("fam").addEventListener("change", draw); $("sort").addEventListener("change", draw);
  $("colours").addEventListener("click", e => { const b = e.target.closest(".chip"); if(!b) return; b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); draw(); });
  draw();
}

L.data.flowers().then(F => {
  if(!id) return guidePage(F);
  const s = F.bySlug[id] || F.byId[id];
  if(!s){ main.innerHTML = `<h1>Not in the guide yet</h1><p><a href="./">All wildflowers</a></p>`; return; }
  return speciesPage(F, s);
}).catch(e => { main.innerHTML = `<p class="muted">Couldn't load the field guide (${esc(e.message)}).</p>`; });
}
