/* reader-themes.js: page themes, fonts and spacing for the book reader.
   Adds an "Aa" button to the reader toolbar. Choices are remembered in this browser. */
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
