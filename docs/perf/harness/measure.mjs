import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/root/.npm/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright");
const [label, cpuS, outBase, mode = "perf", url = "http://localhost:4173/"] = process.argv.slice(2);
const cpu = Number(cpuS);
const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const net = [];
await p.route("https://api.nemosdream.cloud/**", async (route) => {
  const req = route.request();
  const h = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: h });
  const headers = { ...req.headers() }; delete headers.origin; delete headers.referer;
  const r = await route.fetch({ headers });
  await route.fulfill({ response: r, headers: { ...r.headers(), ...h } });
});
await p.addInitScript((mode) => {
  window.__rec = { frames: [], marks: [], long: [], commits: [] };
  const R = window.__rec;
  const now = () => performance.now();
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => R.long.push({ t: e.startTime, d: e.duration }))).observe({ type: "longtask", buffered: true }); } catch {}
  let last = 0; const loop = (t) => { if (last) R.frames.push([t, t - last]); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) if (n.nodeType === 1) for (const c of ["offense-overlay", "inning-overlay"]) if (n.classList?.contains(c) || n.querySelector?.("." + c)) R.marks.push({ k: c + ":in", t: now() });
      for (const n of m.removedNodes) if (n.nodeType === 1) for (const c of ["offense-overlay", "inning-overlay"]) if (n.classList?.contains(c)) R.marks.push({ k: c + ":out", t: now() });
    }
  }).observe(document, { childList: true, subtree: true });
  if (mode === "count") {
    const hook = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
      onCommitFiberRoot(id, root) {
        let n = 0; const names = {};
        const nm = (f) => f.type?.displayName || f.type?.name || f.type?.type?.name || f.type?.render?.name || "anon";
        const isFn = (f) => [0, 11, 14, 15].includes(f.tag);
        const countAll = (f) => { while (f) { if (isFn(f)) { n++; names[nm(f)] = (names[nm(f)] || 0) + 1; } if (f.child) countAll(f.child); f = f.sibling; } };
        const walk = (f) => {
          for (; f; f = f.sibling) {
            const prev = f.alternate;
            if (!prev) { if (isFn(f)) { n++; names[nm(f)] = (names[nm(f)] || 0) + 1; } countAll(f.child); continue; }
            if (isFn(f) && (f.flags & 1)) { n++; names[nm(f)] = (names[nm(f)] || 0) + 1; }
            if (f.child !== prev.child) walk(f.child);
          }
        };
        walk(root.current.child); R.commits.push({ t: now(), n, names });
      } };
    Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", { value: hook, configurable: true });
  }
}, mode);
p.on("response", (r) => { if (/api\.nemosdream|fonts\.g|pretendard|\.woff/.test(r.url())) net.push({ url: r.url().replace(/^https:\/\/[^/]+/, "").slice(0, 80), t: Date.now() }); });
await p.goto(url); await p.waitForSelector("text=시뮬레이션 시작");
await p.click("button:has-text('한화')"); await p.waitForTimeout(500);
await p.click("button:has-text('KT'):not(:has-text('시뮬'))"); await p.waitForTimeout(1500);
await p.click("button:has-text('2025.04.25')"); await p.waitForTimeout(300);
await p.click("button:has-text('7회')"); await p.waitForTimeout(300);
await p.click("button:has-text('시뮬레이션 시작')");
await p.waitForSelector("button:has-text('현재 투수 유지')"); await p.waitForTimeout(3000); // opening overlay + settle
const cdp = await ctx.newCDPSession(p);
if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
console.log("in game");
const traceFile = `${outBase}.trace.json`;
if (mode === "perf") await b.startTracing(p, { path: traceFile, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "blink.user_timing", "disabled-by-default-v8.cpu_profiler", "loading", "latencyInfo"] });
const t0 = await p.evaluate(() => { performance.mark("calib"); return performance.now(); });
await p.evaluate(() => { window.__rec.frames.length = 0; window.__rec.marks.length = 0; window.__rec.commits.length = 0; });
let cycles = 0, guard = 0;
while (cycles < 2 && guard++ < 60 && !p.url().includes('/result')) {
  if (false) { console.log("loop", guard, cycles, await p.evaluate(() => [...document.querySelectorAll('button')].map(b=>b.innerText.trim()+(b.disabled?'(d)':'')).filter(t=>/유지|투입|되돌|진행/.test(t)).join('|'))); await p.screenshot({path:'loop.png'}); }
  const stay = p.locator("button:has-text('현재 투수 유지')");
  if (await stay.isEnabled().catch(() => false)) { await stay.click(); await p.waitForTimeout(400); continue; }
  // locked: wait for the whole half sequence to end
  const sawOff = await p.waitForSelector(".offense-overlay", { timeout: 4000 }).then(() => true).catch(() => false);
  if (sawOff) {
    await p.waitForSelector(".offense-overlay", { state: "detached", timeout: 15000 });
    await p.waitForSelector(".inning-overlay", { timeout: 3000 }).catch(() => {});
    await p.waitForSelector(".inning-overlay", { state: "detached", timeout: 5000 }).catch(() => {});
    cycles++; await p.waitForTimeout(1500);
  } else await p.waitForTimeout(300);
}
if (mode === "perf") await b.stopTracing();
const rec = await p.evaluate(() => window.__rec);
fs.writeFileSync(`${outBase}.rec.json`, JSON.stringify({ label, cpu, t0, ...rec, net }));
console.log(label, "cycles", cycles, "frames", rec.frames.length, "marks", rec.marks.map((m) => m.k + "@" + Math.round(m.t)).join(" "));
await b.close();
