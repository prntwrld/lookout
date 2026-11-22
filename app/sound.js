/* Lookout — recordings: Xeno-canto's recordings as hosted on Wikimedia Commons, and iNaturalist observers' own,
   each kept with its recordist and licence, and a player that plays one at a time and can play a list straight
   through. Adapted from Myriad's Field Guide (field-guide/guide.js). Load after core.js; it adds Lookout.sound. */
{
const L = window.Lookout, {esc} = L;
const ext = `target="_blank" rel="noopener"`;
const strip = s => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/* the same open licences as the photos (Commons only hosts free ones, but say so on each track all the same) */
const OPEN_LIC = /^(public domain|pd\b|cc0|cc[ -]by(-sa)?[ -]|cc[ -]by(-sa)?$|cc[ -]by-nc(-sa)?[ -]|cc[ -]by-nc(-sa)?$)/i;
const natLic = code => ({"cc0": "CC0", "cc-by": "CC BY", "cc-by-sa": "CC BY-SA", "cc-by-nc": "CC BY-NC", "cc-by-nc-sa": "CC BY-NC-SA"})[String(code || "").toLowerCase()] || "";
const natBy = a => String(a || "").replace(/^\(c\)\s*/, "").split(/,\s*(some|no|all|certains|aucun|tous|algunos)\b/i)[0].trim() || "an iNaturalist observer";

/* can this recording be played? ask for its first few bytes before showing it; a broken link is left out */
const playCache = {};
const playable = src => playCache[src] ||= new Promise(ok => {
  const a = new Audio(); let done = false;
  const end = v => { if(done) return; done = true; a.removeAttribute("src"); try { a.load(); } catch(e){} ok(v); };
  a.preload = "metadata";
  a.onloadedmetadata = () => end(isFinite(a.duration) && a.duration > 0 ? a.duration : true);
  a.onerror = () => end(false);
  setTimeout(() => end(false), 12000);
  a.src = src;
});

/* recordings of any of these species (scientific names) on Commons, Xeno-canto's first: {name: [track]}.
   (Commons' search takes filetype:audio; Myriad's filemime:audio no longer matches anything, and names joined
   with OR come back for only some of them, so each species is asked on its own.) */
async function commonsSounds(names){
  const out = {}, groups = [];
  for(const n of names) groups.push([n]);
  await Promise.all(groups.map(async ns => {
    const q = `filetype:audio "${ns[0].replace(/"/g, "")}"`;
    const r = await fetch("https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query&generator=search&gsrnamespace=6&gsrlimit=8"
      + "&prop=imageinfo&iiprop=url|mime|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&gsrsearch=" + encodeURIComponent(q), {signal: AbortSignal.timeout(15000)}).catch(() => null);
    if(!r?.ok) return;
    const j = await r.json().catch(() => ({}));
    for(const p of Object.values(j.query?.pages || {})){
      const ii = p.imageinfo?.[0]; if(!ii?.url || !/^audio\/|ogg/.test(ii.mime || "")) continue;
      const lic = strip(ii.extmetadata?.LicenseShortName?.value); if(!OPEN_LIC.test(lic)) continue;
      const t = p.title.replace(/^File:/, "");
      const name = ns.find(n => t.toLowerCase().includes(n.toLowerCase())); if(!name) continue;
      const xc = /\bXC ?(\d{3,8})\b/.exec(t)?.[1] || "";
      (out[name] ||= []).push({src: ii.url.split("?")[0], xc, page: ii.descriptionurl, by: strip(ii.extmetadata?.Artist?.value).slice(0, 60) || "Wikimedia Commons",
        lic, from: xc ? "Xeno-canto" : "Wikimedia Commons"});
    }
  }));
  /* Xeno-canto's first, then the rest; mp3 before ogg and wav (which some browsers can't play) */
  for(const k in out) out[k].sort((a, b) => (!!b.xc - !!a.xc) || (/\.mp3$/i.test(b.src) - /\.mp3$/i.test(a.src)));
  return out;
}
/* iNaturalist observers' open-licensed recordings (any observations query), one per observation */
async function natSounds(params){
  const j = await L.nat("observations", {sounds: "true", quality_grade: "research", order_by: "votes", per_page: 8, ...params});
  return (j.results || []).flatMap(o => (o.sounds || []).filter(s => s.file_url && natLic(s.license_code)).slice(0, 1).map(s => ({src: s.file_url, page: o.uri,
    by: natBy(s.attribution), lic: natLic(s.license_code), from: "iNaturalist", taxon: o.taxon, where: o.place_guess || ""})));
}
/* keep the tracks that will play, in order, at most n (a recording under minDur seconds is a click, not a song) */
async function verified(tracks, n, minDur = 0){
  const some = tracks.slice(0, n * 2), ok = await Promise.all(some.map(t => playable(t.src)));
  return some.filter((t, i) => ok[i] && !(typeof ok[i] === "number" && ok[i] < minDur) && (t.dur = typeof ok[i] === "number" ? ok[i] : 0, true)).slice(0, n);
}

/* ---------- the player: one sound at a time across the page; a list can play straight through ---------- */
const AUDIO = new Audio(); AUDIO.preload = "none";
let current = null;   /* {list, i} */
const PLAY = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>`;
const PAUSE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor"/></svg>`;
const mmss = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "";
/* each track: {src, name, href?, img?, note?, by, lic, from, page, xc?, dur?} */
function trackList(host, tracks, {chain = false} = {}){
  const list = {host, tracks, chain};
  host.innerHTML = `<ol class="tracks">${tracks.map((t, i) => `<li class="track" data-i="${i}">
      <button type="button" class="play" data-play="${i}" aria-label="Play ${esc(t.name || "recording")}">${PLAY}</button>
      <a class="tr-img" href="${esc(t.href || "#")}">${t.img ? `<img src="${esc(t.img)}" alt="" loading="lazy" crossorigin="anonymous">` : ""}</a>
      <div class="tr-text"><span class="tr-name">${t.href ? `<a href="${esc(t.href)}">${esc(t.name)}</a>` : esc(t.name)}</span>
        <span class="tr-meta">${esc([t.note, `© ${t.by}`, t.lic].filter(Boolean).join(" · "))}${t.page ? ` · <a href="${esc(t.xc ? "https://xeno-canto.org/" + t.xc : t.page)}" ${ext}>${esc(t.xc ? "XC" + t.xc : t.from)}</a>` : ""}</span>
        <span class="tr-bar"><i></i></span></div>
      <span class="tr-time">${mmss(t.dur)}</span></li>`).join("")}</ol>`;
  host.addEventListener("click", e => { const b = e.target.closest("[data-play]"); if(b) play(list, +b.dataset.play); });
  return {playAll: () => play(list, 0, true)};
}
function mark(){
  document.querySelectorAll(".track.on").forEach(li => { li.classList.remove("on"); li.querySelector(".play").innerHTML = PLAY; });
  if(!current) return;
  const li = current.list.host.querySelector(`.track[data-i="${current.i}"]`); if(!li) return;
  const b = li.querySelector(".play");
  li.classList.add("on"); b.innerHTML = AUDIO.paused ? PLAY : PAUSE;
  b.setAttribute("aria-label", (AUDIO.paused ? "Play " : "Pause ") + (current.list.tracks[current.i].name || "recording"));
}
function play(list, i, fresh = false){
  if(!fresh && current?.list === list && current.i === i){ AUDIO.paused ? AUDIO.play().catch(() => {}) : AUDIO.pause(); return; }
  const t = list.tracks[i]; if(!t) return;
  current = {list, i}; AUDIO.src = t.src; AUDIO.play().catch(() => {}); mark();
}
AUDIO.addEventListener("play", mark); AUDIO.addEventListener("pause", mark);
AUDIO.addEventListener("timeupdate", () => {
  if(!current) return;
  const bar = current.list.host.querySelector(`.track[data-i="${current.i}"] .tr-bar i`);
  if(bar && AUDIO.duration) bar.style.width = (AUDIO.currentTime / AUDIO.duration * 100) + "%";
});
AUDIO.addEventListener("ended", () => {
  if(!current) return;
  const {list, i} = current;
  const bar = list.host.querySelector(`.track[data-i="${i}"] .tr-bar i`); if(bar) bar.style.width = "0";
  if(list.chain && i + 1 < list.tracks.length) play(list, i + 1, true); else { current = null; mark(); }
});
/* a recording that stops loading partway is skipped (in a list that plays through) */
AUDIO.addEventListener("error", () => { if(current?.list.chain && current.i + 1 < current.list.tracks.length) play(current.list, current.i + 1, true); });

L.sound = {commonsSounds, natSounds, verified, playable, trackList, audio: AUDIO};
}
