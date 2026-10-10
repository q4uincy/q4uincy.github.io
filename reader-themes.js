/* reader-themes.js: (1) page themes, fonts and spacing for the book reader, (2) endless live facts from Wikipedia.
   Choices are remembered in this browser. */
(() => {
  const reader = document.getElementById("reader");
  const tools = document.querySelector(".reader-tools");
  const closeBtn = document.getElementById("readerClose");
  if (!reader || !tools || !closeBtn) return;

  const KEY = "layaReaderPrefs";
  const THEMES = [["parchment","Parchment","#efe3d2"],["light","Light","#fbfaf7"],["sepia","Sepia","#f1e4c8"],["dusk","Dusk","#2a1f33"],["night","Night","#121014"],["black","Black","#000000"]];
  const FONTS = [["classic","Classic"],["book","Book"],["clean","Clean"]];
  const GAPS = [["tight","Tight","1.45"],["normal","Normal","1.65"],["roomy","Roomy","1.9"]];
  let p = { theme: "parchment", font: "classic", gap: "normal" };
  try { Object.assign(p, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) {}

  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "smallbtn"; toggle.id = "readerStyle";
  toggle.textContent = "Aa"; toggle.setAttribute("aria-label", "Reading style"); toggle.setAttribute("aria-expanded", "false");
  tools.insertBefore(toggle, closeBtn);

  const panel = document.createElement("div");
  panel.className = "rpanel"; panel.hidden = true;
  reader.appendChild(panel);

  const row = label => {
    const r = document.createElement("div"); r.className = "rrow";
    const s = document.createElement("span"); s.textContent = label;
    r.appendChild(s); panel.appendChild(r); return r;
  };
  const themeRow = row("Page"), fontRow = row("Font"), gapRow = row("Spacing");
  const sw = {}, fb = {}, gb = {};

  THEMES.forEach(([id, name, color]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "rsw"; b.style.background = color; b.title = name; b.setAttribute("aria-label", name);
    b.addEventListener("click", () => { p.theme = id; apply(); });
    themeRow.appendChild(b); sw[id] = b;
  });
  FONTS.forEach(([id, name]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "smallbtn"; b.textContent = name;
    b.addEventListener("click", () => { p.font = id; apply(); });
    fontRow.appendChild(b); fb[id] = b;
  });
  GAPS.forEach(([id, name]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "smallbtn"; b.textContent = name;
    b.addEventListener("click", () => { p.gap = id; apply(); });
    gapRow.appendChild(b); gb[id] = b;
  });

  function apply() {
    if (!sw[p.theme]) p.theme = "parchment";
    if (!fb[p.font]) p.font = "classic";
    if (!gb[p.gap]) p.gap = "normal";
    reader.dataset.rtheme = p.theme;
    reader.dataset.rfont = p.font;
    reader.style.setProperty("--rlh", GAPS.find(g => g[0] === p.gap)[2]);
    Object.keys(sw).forEach(k => sw[k].classList.toggle("on", k === p.theme));
    Object.keys(fb).forEach(k => fb[k].classList.toggle("active", k === p.font));
    Object.keys(gb).forEach(k => gb[k].classList.toggle("active", k === p.gap));
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
    // the reader re-flows its pages on resize, so this keeps your place
    if (!reader.hidden) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  const setOpen = open => { panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", e => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  new MutationObserver(() => { if (reader.hidden) setOpen(false); }).observe(reader, { attributes: true, attributeFilter: ["hidden"] });

  apply();
})();

/* ===== Endless facts: live from Wikipedia, with your built-in lists as a backup ===== */
(() => {
  if (typeof window.nextRandomFact !== "function" || typeof window.nextGothicFact !== "function") return;
  const origRandom = window.nextRandomFact, origGothic = window.nextGothicFact;
  const $ = id => document.getElementById(id);
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  async function jget(url) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: c.signal });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const clean = s => String(s || "").replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
  function sentences(t, max) {
    const m = t.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [t];
    let out = "";
    for (const s of m) { if (out && (out + s).length > max) break; out += s; }
    return out.trim();
  }
  const wikiUrl = title => "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(title).replace(/ /g, "_"));

  /* A feed keeps a few facts ready, never repeats one (remembered in this browser), and refills in the background */
  function makeFeed(storeKey, fetcher) {
    const q = [];
    let busy = false, seen = [];
    try { seen = JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch (_) {}
    const seenSet = new Set(seen);
    async function refill() {
      if (busy || q.length >= 6) return;
      busy = true;
      try {
        for (let i = 0; i < 3 && q.length < 6; i++) {
          for (const it of await fetcher()) {
            if (it.text && !seenSet.has(it.id)) { seenSet.add(it.id); seen.push(it.id); q.push(it); }
          }
        }
        seen = seen.slice(-600);
        try { localStorage.setItem(storeKey, JSON.stringify(seen)); } catch (_) {}
      } catch (_) {} finally { busy = false; }
    }
    return { take() { const it = q.shift() || null; refill(); return it; }, warm: refill };
  }

  const general = makeFeed("layaLiveFacts_general", async () => {
    if (Math.random() < .55) {
      const m = Math.floor(Math.random() * 12), d = 1 + Math.floor(Math.random() * 28);
      const j = await jget("https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/" + String(m + 1).padStart(2, "0") + "/" + String(d).padStart(2, "0"));
      return shuffle((j.events || []).filter(e => e.text && e.text.length > 40 && e.text.length < 260)).slice(0, 4).map(e => ({
        id: "ev:" + e.year + ":" + e.text.slice(0, 40),
        text: "On " + MONTHS[m] + " " + d + ", " + (e.year < 1 ? Math.abs(e.year) + " BC" : e.year) + ": " + clean(e.text),
        url: e.pages && e.pages[0] && e.pages[0].content_urls && e.pages[0].content_urls.desktop && e.pages[0].content_urls.desktop.page
      }));
    }
    const rows = await Promise.all([1, 2, 3, 4, 5, 6].map(() => jget("https://en.wikipedia.org/api/rest_v1/page/random/summary").catch(() => null)));
    return rows.filter(j => j && j.type === "standard" && j.thumbnail && j.extract && j.extract.length > 80 && !/may refer to/i.test(j.extract)).map(j => ({
      id: "pg:" + j.title, text: sentences(clean(j.extract), 240), url: j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page
    }));
  });

  const TERMS = ["Gothic architecture","Gothic cathedral","Gothic Revival","Gothic fiction","medieval castle","ruined abbey","historic cemetery","vampire folklore","gargoyle","stained glass","medieval cathedral","haunted castle","ossuary catacombs","Romanticism ruins","medieval monastery","rose window","flying buttress","gothic horror novel","Victorian cemetery","mausoleum"];
  const gothic = makeFeed("layaLiveFacts_gothic", async () => {
    const off = 20 * Math.floor(Math.random() * 8);
    const j = await jget("https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=20&gsroffset=" + off + "&gsrsearch=" + encodeURIComponent(pick(TERMS)) + "&prop=extracts&exintro=1&explaintext=1&exsentences=2&exlimit=20");
    return shuffle(Object.values((j.query && j.query.pages) || {})).filter(p => p.extract && p.extract.length > 60 && !/may refer to/i.test(p.extract) && !/^List of/i.test(p.title)).slice(0, 5).map(p => ({
      id: p.title, text: sentences(clean(p.extract), 260), url: wikiUrl(p.title)
    }));
  });

  const COUNT = "layaLiveFactCount";
  const bump = () => { let n = 0; try { n = Number(localStorage.getItem(COUNT)) || 0; } catch (_) {} n++; try { localStorage.setItem(COUNT, String(n)); } catch (_) {} return n; };
  let lastRandom = null, lastGothic = null, lastNum = 0;

  /* The page asks these two functions for its next fact, so swapping them makes every fact card endless */
  window.nextRandomFact = () => {
    const it = general.take(); lastRandom = it;
    if (!it) return origRandom();
    lastNum = bump(); return { text: it.text, number: lastNum, total: lastNum, restarted: false };
  };
  window.nextGothicFact = () => {
    const it = gothic.take(); lastGothic = it;
    if (!it) return origGothic();
    lastNum = bump(); return { text: it.text, number: lastNum, total: lastNum, restarted: false };
  };

  const src = (parent, before) => {
    const a = document.createElement("a");
    a.className = "smallbtn"; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "Source ↗";
    a.style.cssText = "display:none;text-decoration:none;margin-top:8px;width:fit-content";
    parent.insertBefore(a, before || null); return a;
  };
  const factBtn = $("factBtn"), factStatus = $("factStatus");
  if (factBtn && factStatus) {
    const a = src(factStatus.parentNode, factStatus.nextSibling);
    factBtn.addEventListener("click", () => {
      if (lastRandom) { factStatus.textContent = "Live fact · from Wikipedia · endless ✦"; if (lastRandom.url) { a.href = lastRandom.url; a.style.display = "inline-block"; } else a.style.display = "none"; }
      else a.style.display = "none";
    });
  }
  const gBtn = $("gothicHistoryAnotherFact"), gLabel = $("gothicFactLabel");
  if (gBtn && gLabel) {
    const a = src(gBtn.parentNode, null);
    gBtn.addEventListener("click", () => {
      if (lastGothic) { gLabel.textContent = "✦ LIVE FACT · endless"; if (lastGothic.url) { a.href = lastGothic.url; a.style.display = "inline-block"; } else a.style.display = "none"; }
      else a.style.display = "none";
    });
  }

  general.warm(); gothic.warm();
})();
