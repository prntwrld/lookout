// Lookout's checks, with Playwright: every kind of page at three widths, then offline.
//   node tools/check_site.mjs            (serves the repository itself on a free port)
//   SHOTS=/some/dir node tools/check_site.mjs
// Prints each problem it finds and exits non-zero if there were any.
import {createRequire} from "module";
import {spawn} from "child_process";
import {mkdirSync} from "fs";
import path from "path";
import {fileURLToPath} from "url";
const require = createRequire(import.meta.url);
const {chromium} = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.env.SHOTS || "/tmp/lookout-shots";
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
mkdirSync(SHOTS, {recursive: true});
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {cwd: ROOT, stdio: "ignore"});
await new Promise(ok => setTimeout(ok, 800));

const problems = [];
const flag = (where, what) => { problems.push(`${where}: ${what}`); console.log(`  ✗ ${what}`); };
const WIDTHS = [1366, 880, 390];
const flowers = JSON.parse(await (await fetch(BASE + "data/flowers.json")).text()).species;
const someFlower = flowers[3].slug;
const PAGES = [["home", ""], ["places", "places/"], ["place", "places/?id=maple-pass"], ["place-lookout", "places/?id=hidden-lake"],
  ["living", "living/"], ["living-insects", "living/?g=insects"], ["living-tidepools", "living/?g=tidepools"], ["living-flowers", "living/?g=flowers"], ["living-mammals", "living/?g=mammals"], ["foraging", "living/?f=foraging"], ["species", `living/?id=${someFlower}`], ["species-live", "living/?id=144815"], ["genus", "living/?id=144351"], ["key", "key/"], ["key-answered", "key/#colour=b,v&petals=irregular&leaf=palmate"], ["key-birds", "key/#key=birds&size=m&colour=b"], ["key-insects", "key/#key=here&g=beetles&region=central-cascades&when=year"], ["key-mammals", "key/#key=mammals&tail=bushy"], ["key-here", "key/#key=here&region=olympics&g=tidepools&when=year"]];

/* things that should never wrap onto a second line */
const NOWRAP = [".top nav a", ".mark", ".stats dt", ".stats dd", ".chip", ".btn", ".legend span", ".eyebrow", ".left .count", ".regions li > span:first-child", ".section > h2"];

const browser = await chromium.launch();
for(const w of WIDTHS){
  const ctx = await browser.newContext({viewport: {width: w, height: w > 800 ? 900 : 844}, serviceWorkers: "block"});
  for(const [name, url] of PAGES){
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(e.message));
    page.on("console", m => { if(m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
    console.log(`${name} @ ${w}`);
    await page.goto(BASE + url, {waitUntil: "load"});
    if(url.includes("#")) await page.reload({waitUntil: "load"});
    await page.waitForSelector("main > *", {timeout: 15000}).catch(() => flag(`${name}@${w}`, "nothing rendered"));
    await page.waitForTimeout(url.startsWith("living") ? 6000 : 1800);
    const r = await page.evaluate(({NOWRAP}) => {
      const out = {};
      out.overflow = document.documentElement.scrollWidth - innerWidth;
      out.wide = [...document.querySelectorAll("main *, header *")].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.right > innerWidth + 1 && !el.closest(".row, .leaflet-container, .qs .chips, .credit"); })
        .slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${el.className} (${Math.round(el.getBoundingClientRect().right)}px)`);
      out.empty = [...document.querySelectorAll("section.section")].filter(s => s.offsetParent && [...s.children].filter(c => c.tagName !== "H2").every(c => !c.textContent.trim() && !c.querySelector("img, .leaflet-container, canvas") && !c.classList.contains("mapbox"))).map(s => s.querySelector("h2")?.textContent);
      const lines = el => { const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3; const rect = el.getBoundingClientRect(); return rect.height / lh; };
      out.wrapped = NOWRAP.flatMap(sel => [...document.querySelectorAll(sel)].filter(el => el.offsetParent && el.getClientRects().length && (
        [...el.getClientRects()].length > 1 || (getComputedStyle(el).display !== "inline" && el.textContent.trim().length < 40 && lines(el) > 1.9 && !el.querySelector("svg, i.sw, .c")))).map(el => `${sel}: "${el.textContent.trim().slice(0, 30)}"`)).slice(0, 8);
      out.brokenImgs = [...document.querySelectorAll("main img")].filter(i => i.complete && i.naturalWidth === 0 && i.offsetParent && !i.loading?.includes("lazy")).length;
      out.h1 = document.querySelector("h1")?.textContent;
      return out;
    }, {NOWRAP});
    if(r.overflow > 1) flag(`${name}@${w}`, `page scrolls sideways by ${r.overflow}px; ${r.wide.join(", ")}`);
    if(r.empty.length) flag(`${name}@${w}`, `empty sections: ${r.empty.join(", ")}`);
    if(r.wrapped.length) flag(`${name}@${w}`, `wrapped: ${r.wrapped.join(" | ")}`);
    if(errs.length) flag(`${name}@${w}`, `script errors: ${errs.join(" | ")}`);
    if(!r.h1) flag(`${name}@${w}`, "no heading");
    if(r.brokenImgs) console.log(`  (${r.brokenImgs} pictures didn't load — expected if the sandbox can't reach the photo hosts)`);
    await page.screenshot({path: `${SHOTS}/${name}-${w}.png`, fullPage: name !== "living" && name !== "key"});
    await page.close();
  }
  await ctx.close();
}

/* ---------- offline: load the site, cut the network, check the key and the saved pages ---------- */
console.log("offline");
{
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(BASE, {waitUntil: "load"});
  await page.evaluate(() => navigator.serviceWorker.ready);
  /* wait until the worker has saved the wildflower pack */
  const packed = await page.waitForFunction(async n => {
    const names = await caches.keys(); const pack = names.find(k => k.endsWith("-pack"));
    return pack && (await (await caches.open(pack)).keys()).length >= n;
  }, flowers.length, {timeout: 120000, polling: 1000}).then(() => true).catch(() => false);
  if(!packed) flag("offline", "the wildflower pack wasn't saved within two minutes");
  await page.reload({waitUntil: "load"});
  /* open a place and a species while online, so they're saved */
  await page.goto(BASE + "places/?id=maple-pass", {waitUntil: "load"}); await page.waitForTimeout(4000);
  await page.goto(BASE + `living/?id=${someFlower}`, {waitUntil: "load"}); await page.waitForTimeout(2500);
  await ctx.setOffline(true);
  server.kill();   /* and the server too, to be sure */

  await page.goto(BASE + "key/#key=flowers", {waitUntil: "load"}).catch(e => flag("offline", "key page did not load: " + e.message));
  await page.waitForSelector(".left .count", {timeout: 10000}).catch(() => flag("offline", "the key didn't draw"));
  const before = await page.$eval(".left .count", el => parseInt(el.textContent)).catch(() => -1);
  await page.click('[data-k="month"][aria-pressed="true"]').catch(() => {});   /* clear today's month: November has few flowers */
  await page.click('[data-k="colour"][data-v="y"]');
  await page.click('[data-k="petals"][data-v="5"]');
  await page.waitForTimeout(300);
  const after = await page.$eval(".left .count", el => parseInt(el.textContent));
  const thumbs = await page.$$eval("#hits img", imgs => ({n: imgs.length, ok: imgs.filter(i => i.complete && i.naturalWidth > 0).length}));
  await page.waitForTimeout(800);
  const thumbsOk = await page.$$eval("#hits img", imgs => imgs.slice(0, 12).every(i => i.complete && i.naturalWidth > 0));
  console.log(`  key offline: ${before} at first, ${after} after yellow + 5 petals, ${thumbs.n} photos`);
  if(!(after > 0 && after < flowers.length)) flag("offline", "the key didn't narrow down");
  if(!thumbsOk) flag("offline", "the key's photos didn't load offline");
  await page.screenshot({path: `${SHOTS}/offline-key.png`});

  for(const [name, url, want] of [["place", "places/?id=maple-pass", "Maple Pass Loop"], ["species", `living/?id=${someFlower}`, null], ["home", "", null], ["guide", "living/", "Living things"]]){
    await page.goto(BASE + url, {waitUntil: "load"}).catch(e => flag("offline", `${name} didn't load: ${e.message}`));
    const h1 = await page.waitForSelector("h1", {timeout: 10000}).then(h => h.textContent()).catch(() => null);
    if(!h1 || (want && !h1.includes(want))) flag("offline", `${name}: heading was ${JSON.stringify(h1)}`);
    else console.log(`  ${name} offline: "${h1.trim()}"`);
    if(name === "place"){
      const hero = await page.$eval(".hero img", i => i.naturalWidth).catch(() => 0);
      console.log(`  place hero photo offline: ${hero ? "yes" : "no (not seen online, or no photo host)"}`);
    }
    await page.screenshot({path: `${SHOTS}/offline-${name}.png`});
  }
  if(errs.length) flag("offline", "script errors: " + errs.join(" | "));
  await ctx.close();
}
await browser.close();
server.kill();
console.log(problems.length ? `\n${problems.length} problem(s)` : "\nAll good");
process.exit(problems.length ? 1 : 0);
