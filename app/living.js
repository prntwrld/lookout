/* Lookout — Living things: every plant and animal recorded in the Pacific Northwest (living/), and each species
   (living/?id=<iNaturalist number>, or ?id=<name> for the wildflower pack).
   The list and most species pages come live from iNaturalist. The 300 Cascades wildflowers in data/ add their
   flowering months, elevations and the key's traits, and keep working with no signal. */
{
const L = window.Lookout, {esc, $} = L;
const main = $("main");
const id = new URLSearchParams(location.search).get("id");
document.body.insertAdjacentHTML("beforeend", L.footer());

const GROUPS = [["all", "Everything"], ["Aves", "Birds"], ["Mammalia", "Mammals"], ["Plantae", "Plants"], ["flowers", "Wildflowers"], ["Fungi", "Fungi"],
  ["Insecta", "Insects"], ["Amphibia", "Amphibians"], ["Reptilia", "Reptiles"], ["Actinopterygii", "Fish"], ["Mollusca", "Molluscs"], ["Arachnida", "Spiders"]];
const ONE = {Aves: "Bird", Mammalia: "Mammal", Plantae: "Plant", Fungi: "Fungus", Insecta: "Insect", Amphibia: "Amphibian", Reptilia: "Reptile",
  Actinopterygii: "Fish", Mollusca: "Mollusc", Arachnida: "Arachnid", Animalia: "Animal", Chromista: "Seaweed or kelp", Protozoa: "Slime mould"};
const PETALS = {"3": "three", "4": "four", "5": "five", "6": "six", many: "many", daisy: "a daisy-like head", irregular: "irregular (pea, orchid or lipped)", tiny: "tiny, in clusters"};
const LEAF = {linear: "grass-like", lance: "lance-shaped", oval: "oval", heart: "heart-shaped or round", lobed: "lobed", three: "in threes", palmate: "fanned like fingers", pinnate: "feathery or fern-like", none: "no green leaves"};
const ARR = {basal: "from the base", alt: "alternate", opp: "opposite", whorl: "whorled", none: ""};
const HAB = {forest: "forest", meadow: "meadows", rocky: "rocks and talus", wet: "wet ground", dry: "dry open slopes", alpine: "near or above treeline"};
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
    s.summary ||= shorten(plain(t.wikipedia_summary));
    s.wiki ||= wikiTitle(t.wikipedia_url);
    if(!pack){
      const seen = new Set(), add = p => { if(p && !seen.has(p.id) && s.photos.length < 5){ seen.add(p.id); s.photos.push(p); } };
      (t.taxon_photos || []).forEach(x => add(L.openPhoto(x.photo)));
      if(s.photos.length < 3){
        try { const j = await L.nat("observations", {taxon_id: t.id, photo_license: "cc0,cc-by", quality_grade: "research", order_by: "votes", per_page: 12, place_id: L.PNW});
          j.results.forEach(o => add(L.openPhoto(o.photos?.[0]))); } catch(e){}
      }
    }
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

async function speciesPage(F, s){
  const P = await L.data.places().catch(() => null);
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
    ["Family", s.family ? esc(L.familyName(s.family)) : ""],
    ["Sightings", `<span id="sightings"></span>`],
    ["Pojar", s.pojar ? `p. ${esc(s.pojar)}` : ""]
  ].filter(x => x[1]);
  const kind = ONE[s.group] || "";
  main.innerHTML = `<section class="hero">${ph.length ? `<div class="frame" data-hide-broken id="big"><img src="${L.inat(ph[0], "large")}"${s.pack ? ` data-fallback="${L.thumb(s)}"` : ""} alt="${esc(s.common || s.sci)}" crossorigin="anonymous">${L.inatCredit(ph[0])}</div>
      ${ph.length > 1 ? `<div class="strip">${ph.map((p, i) => `<button type="button" data-i="${i}" aria-current="${!i}" aria-label="Photo ${i + 1}"><img src="${L.inat(p, "small")}" alt="" loading="lazy" crossorigin="anonymous"></button>`).join("")}</div>` : ""}` : ""}
      <p class="eyebrow">${esc([kind, s.family].filter(Boolean).join(" · "))}${s.pack && L.blooming(s, m) ? " · In bloom now" : ""}</p><h1>${esc(s.common || s.sci)}</h1>
      <p class="sub-line"><i class="sci">${esc(s.sci)}</i>${s.pojar ? ` · Pojar p. ${esc(s.pojar)}` : ""}</p></section>
    <div class="split"><div><dl class="facts">${facts.map(([k, v]) => `<dt${/id="/.test(v) ? " hidden" : ""}>${k}</dt><dd${/id="/.test(v) ? " hidden" : ""}>${v}</dd>`).join("")}</dl>
      ${s.summary ? `<div class="about" style="margin-top:24px"><p>${esc(s.summary)}</p><p class="credit">From ${s.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(s.wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener">Wikipedia</a>` : "Wikipedia"}, CC BY-SA</p></div>` : ""}
      <p style="margin-top:18px"><a href="${L.inatTaxon(s.id)}" target="_blank" rel="noopener">On iNaturalist ↗</a>${s.pack ? ` &nbsp;·&nbsp; <a href="${L.ROOT}key/">Name a flower with the key</a>` : ""}</p></div>
      <div>${where.length ? `<h2 style="font:400 26px var(--display);margin:0 0 14px">Where to see it</h2><ul class="where">${where.map(({p, why}) => `<li><a href="${L.placeHref(p.id)}">${p.photo
        ? `<img src="${esc(L.sized(p.photo.src, 330))}" alt="" loading="lazy" crossorigin="anonymous">` : `<span class="ph"></span>`}<span><b>${esc(p.name)}</b><span>${esc(why)}</span></span></a></li>`).join("")}</ul>` : ""}</div></div>
    <section class="section" id="range" hidden><h2>Where it's been seen</h2><div class="mapbox" id="rangemap"></div><p class="legend"><span><i class="grid-key"></i>Research-grade sightings</span><span><i></i>Your places</span></p></section>
    <section class="section" id="rel" hidden><h2>Relatives</h2><div class="row"></div></section>`;
  main.querySelector(".strip")?.addEventListener("click", e => {
    const b = e.target.closest("[data-i]"); if(!b) return;
    const p = ph[+b.dataset.i];
    $("big").innerHTML = `<img src="${L.inat(p, "large")}" alt="${esc(s.common || s.sci)}" crossorigin="anonymous">${L.inatCredit(p)}`;
    main.querySelectorAll(".strip button").forEach(x => x.setAttribute("aria-current", x === b));
  });
  const show = el => { el.hidden = false; el.previousElementSibling?.removeAttribute("hidden"); };

  /* the live parts, each appearing only if it finds something */
  if(L.rangeMap && navigator.onLine !== false){ $("range").hidden = false; L.rangeMap($("rangemap"), s.id, P?.list || []); }
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

/* ---------- the guide ---------- */
const state = () => { const h = new URLSearchParams(location.hash.slice(1)); return {g: h.get("g") || "all", when: h.get("when") || "month", q: h.get("q") || ""}; };
const setState = st => { const h = new URLSearchParams(); if(st.g !== "all") h.set("g", st.g); if(st.when !== "month") h.set("when", st.when); if(st.q) h.set("q", st.q);
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

async function guidePage(F){
  const r = L.rng("living " + L.today()), st = state();
  const pick = await heroPick(F, r);
  main.innerHTML = (pick ? `<section class="hero"><div class="frame" data-hide-broken><a href="${pick.href}"><img src="${L.inat(pick.photo, "large")}"${pick.fb ? ` data-fallback="${pick.fb}"` : ""} alt="${esc(pick.name)}" crossorigin="anonymous"></a>${L.inatCredit(pick.photo)}</div>` : `<section class="hero">`)
    + `<h1>Living things</h1><p class="sub-line">Plants and animals of the Pacific Northwest${pick ? ` · <a href="${pick.href}">${esc(pick.name)}</a> above` : ""}</p></section>
    <div class="filters" style="margin-top:30px"><div class="chips" id="groups">${GROUPS.map(([k, n]) => `<button type="button" class="chip" data-g="${k}" aria-pressed="${k === st.g}">${n}</button>`).join("")}</div></div>
    <div class="filters"><input type="search" id="q" placeholder="Find any species" aria-label="Find any species" value="${esc(st.q)}">
      <div class="chips" id="when">${[["month", `Seen in ${L.MONTHS[L.month() - 1]}`], ["year", "All year"]].map(([k, n]) => `<button type="button" class="chip" data-w="${k}" aria-pressed="${k === st.when}">${n}</button>`).join("")}</div></div>
    <section class="section" style="margin-top:20px"><h2 id="list-h"></h2><div id="list"></div></section>`;
  let page = 1, token = 0;
  const draw = async (more = false) => {
    const s = state(), me = ++token, box = $("list"), head = $("list-h");
    $("when").hidden = s.g === "flowers" || !!s.q;
    main.querySelectorAll("#groups .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.g === s.g && !s.q));
    if(s.g === "flowers" && !s.q) return flowerGrid(F, box, head);
    if(!more){ page = 1; box.innerHTML = `<p class="status muted">Asking iNaturalist…</p>`; }
    try {
      let tiles, total;
      if(s.q){
        const j = await L.nat("taxa/autocomplete", {q: s.q, per_page: 30, is_active: "true"});
        const ts = j.results.filter(t => ["species", "subspecies", "variety", "form"].includes(t.rank));
        tiles = ts.map(t => F?.byId[t.id] ? L.speciesTile(F.byId[t.id]) : L.liveTile(L.taxonCard(t))); total = ts.length;
        if(me !== token) return;
        head.innerHTML = `Matching “${esc(s.q)}” <span class="n">${total}</span>`;
      } else {
        const params = {place_id: L.PNW, quality_grade: "research", per_page: 48, page, ...(s.g !== "all" ? {iconic_taxa: s.g} : {}), ...(s.when === "month" ? {month: L.month()} : {})};
        const j = await L.nat("observations/species_counts", params);
        if(me !== token) return;
        total = j.total_results;
        tiles = j.results.map(x => F?.byId[x.taxon.id] ? L.speciesTile(F.byId[x.taxon.id]) : L.liveTile(L.taxonCard(x.taxon)));
        const g = GROUPS.find(x => x[0] === s.g)[1];
        head.innerHTML = `${s.g === "all" ? "Everything" : g}${s.when === "month" ? ` seen in ${L.MONTHS[L.month() - 1]}` : ""} <span class="n">${L.num(total)} species</span>`;
      }
      if(!more) box.innerHTML = `<div class="grid" id="grid"></div><p id="more-p" style="margin-top:22px" hidden><button type="button" class="btn ghost" id="more">More</button></p>`;
      $("grid").insertAdjacentHTML("beforeend", tiles.join("") || "");
      if(!$("grid").children.length) box.innerHTML = `<p class="muted">Nothing found.</p>`;
      $("more-p") && ($("more-p").hidden = !!s.q || page * 48 >= total);
      L.fillPhotos(box);
    } catch(e){
      if(me !== token) return;
      box.innerHTML = `<p class="muted">Couldn't reach iNaturalist just now. <button type="button" class="linkish" id="retry">Try again</button></p>`;
      if(F) box.insertAdjacentHTML("beforeend", `<p class="muted">The wildflowers are saved here: <button type="button" class="linkish" data-g="flowers">show them</button>.</p>`);
    }
  };
  const go = patch => { setState({...state(), ...patch}); draw(); };
  main.addEventListener("click", e => {
    const g = e.target.closest("[data-g]"); if(g) return go({g: g.dataset.g, q: ""}), $("q").value = "";
    const w = e.target.closest("[data-w]"); if(w){ main.querySelectorAll("#when .chip").forEach(b => b.setAttribute("aria-pressed", b === w)); return go({when: w.dataset.w}); }
    if(e.target.id === "more"){ page++; draw(true); }
    if(e.target.id === "retry") draw();
  });
  window.addEventListener("hashchange", () => { $("q").value = state().q; draw(); });
  let t; $("q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => go({q: e.target.value.trim().length > 1 ? e.target.value.trim() : ""}), 350); });
  draw();
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
  if(!id) return guidePage(F);
  const s = await loadSpecies(id, F);
  if(!s){ main.innerHTML = `<h1>Not found</h1><p><a href="./">Living things</a></p>`; return; }
  return speciesPage(F, s);
}).catch(e => { main.innerHTML = `<p class="muted">Couldn't load the field guide (${esc(e.message)}).</p>`; });
}
