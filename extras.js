/* extras.js
   1. Ambient sounds (Cozy card + reader panel). Everything is synthesised in the browser, so there are no audio files.
   2. Scheduled surprises from Kimchi (sealed letter on the day they unlock).
   3. "Add to home screen" card + service worker registration.
   Loads after the main script, so it can use api(), getToken() and toast() from index.html. */
(() => {
"use strict";

const $ = id => document.getElementById(id);
const store = {
  get(k, f) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const say = m => { try { if (typeof toast === "function") toast(m); } catch (e) {} };
const clamp = v => { v = Number(v); return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0; };

/* ===================================================================
   1. AMBIENT SOUNDS
   =================================================================== */
const SOUNDS = [
  { id: "rain",  name: "Rain",           icon: "🌧️" },
  { id: "fire",  name: "Crackling fire", icon: "🔥" },
  { id: "clock", name: "Ticking clock",  icon: "🕰️" },
  { id: "hum",   name: "Cathedral hum",  icon: "⛪" }
];
const DEFAULT_VOL = { rain: .55, fire: .5, clock: .45, hum: .45 };
const TRIM = { rain: .9, fire: .9, clock: 1.5, hum: .5 };      // loudness balance between the four
const WET  = { rain: .10, fire: .06, clock: .12, hum: .9 };    // how much room/cathedral echo each one gets
const PRESETS = [
  { id: "rainy", label: "Rainy night",   mix: { rain: .6, hum: .2 } },
  { id: "fire",  label: "By the fire",   mix: { fire: .6, clock: .25, rain: .15 } },
  { id: "nave",  label: "Old cathedral", mix: { hum: .6, rain: .2, fire: .15 } }
];

const saved = store.get("layaAmbient_v1", null) || {};
const state = {
  master: saved.master == null ? .8 : clamp(saved.master),
  vol: Object.assign({}, DEFAULT_VOL, saved.vol || {}),
  on: { rain: false, fire: false, clock: false, hum: false },
  sleepAt: 0, sleepMin: 0
};
const persist = () => store.set("layaAmbient_v1", { master: state.master, vol: state.vol });
const lvl = id => Math.pow(clamp(state.vol[id]), 1.6) * TRIM[id];
const anyOn = () => SOUNDS.some(s => state.on[s.id]);

let ctx = null, master = null, reverb = null, white = null, brown = null;
const live = {};

function makeNoise(seconds, brownish) {
  // Generates a little extra and cross-fades it onto the start, so the loop has no click.
  const sr = ctx.sampleRate, N = Math.floor(sr * seconds), F = Math.floor(sr * .25);
  const x = new Float32Array(N + F);
  let last = 0, peak = 0;
  for (let i = 0; i < x.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brownish) { last = (last + .02 * w) / 1.02; x[i] = last; } else x[i] = w;
    peak = Math.max(peak, Math.abs(x[i]));
  }
  const buf = ctx.createBuffer(1, N, sr), y = buf.getChannelData(0), k = (brownish ? .9 : 1) / (peak || 1);
  for (let i = 0; i < N; i++) y[i] = (i < F ? x[i] * (i / F) + x[N + i] * (1 - i / F) : x[i]) * k;
  return buf;
}
function makeImpulse(seconds, decay) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += .35 * ((Math.random() * 2 - 1) - lp);               // darker tail, like stone
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function ensure() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  // Let sound play even when an iPhone's silent switch is on (iOS 17+; ignored elsewhere).
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
  master = ctx.createGain(); master.gain.value = state.master;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14; limiter.knee.value = 18; limiter.ratio.value = 6; limiter.attack.value = .01; limiter.release.value = .3;
  master.connect(limiter); limiter.connect(ctx.destination);
  reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(3.4, 2.6); reverb.connect(master);
  white = makeNoise(6, false); brown = makeNoise(8, true);
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

const bq = (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; return n; };
const gn = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
const pan = p => { if (!ctx.createStereoPanner) return null; const n = ctx.createStereoPanner(); n.pan.value = p; return n; };
const loopSrc = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * (buf.duration - .5)); return s; };
const lfo = (param, rate, depth) => { const o = ctx.createOscillator(); o.frequency.value = rate; const g = gn(depth); o.connect(g); g.connect(param); o.start(); return o; };
const toOut = (node, k, p) => { const pn = p == null ? null : pan(p); if (pn) { node.connect(pn); pn.connect(k.out); } else node.connect(k.out); };

const BUILD = {
  rain(k) {
    const a = loopSrc(white), hp = bq("highpass", 700), lp = bq("lowpass", 8000), ga = gn(.5);
    a.connect(hp); hp.connect(lp); lp.connect(ga); ga.connect(k.out);
    const b = loopSrc(brown), bb = bq("bandpass", 420, .5), gb = gn(1.1);
    b.connect(bb); bb.connect(gb); gb.connect(k.out);
    const c = loopSrc(white), bc = bq("bandpass", 3200, .8), gc = gn(.22);
    c.connect(bc); bc.connect(gc); gc.connect(k.out);
    k.srcs.push(a, b, c, lfo(gc.gain, .17, .1), lfo(ga.gain, .07, .08));
    // drops tapping a window
    const drop = () => {
      if (k.dead) return;
      const t = ctx.currentTime + .01, o = ctx.createOscillator(), e = gn(0);
      o.type = "sine";
      o.frequency.setValueAtTime(1400 + Math.random() * 2800, t);
      o.frequency.exponentialRampToValueAtTime(600 + Math.random() * 500, t + .06);
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(.04 + Math.random() * .05, t + .003);
      e.gain.exponentialRampToValueAtTime(.0001, t + .07 + Math.random() * .06);
      o.connect(e); toOut(e, k, Math.random() * 1.6 - .8);
      o.start(t); o.stop(t + .2);
      k.timers.drop = setTimeout(drop, 90 + Math.random() * 700);
    };
    drop();
  },

  fire(k) {
    const r = loopSrc(brown), lp = bq("lowpass", 380), gr = gn(1.4);
    r.connect(lp); lp.connect(gr); gr.connect(k.out);
    const h = loopSrc(white), hp = bq("highpass", 3500), lp2 = bq("lowpass", 9000), gh = gn(.03);
    h.connect(hp); hp.connect(lp2); lp2.connect(gh); gh.connect(k.out);
    k.srcs.push(r, h, lfo(gr.gain, .23, .35), lfo(gh.gain, .4, .015));
    const pop = big => {
      const t = ctx.currentTime + .005, s = ctx.createBufferSource(); s.buffer = white;
      const f = big ? 300 + Math.random() * 700 : 900 + Math.random() * 3800;
      const bp = bq("bandpass", f, big ? 1.2 : 2 + Math.random() * 3), e = gn(0);
      const peak = big ? .45 + Math.random() * .35 : Math.pow(Math.random(), 2.2) * .55 + .03;
      const dur = big ? .05 + Math.random() * .07 : .008 + Math.random() * .03;
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(peak, t + .0015);
      e.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(bp); bp.connect(e); toOut(e, k, Math.random() * 1.2 - .6);
      s.start(t, Math.random() * (white.duration - .3), dur + .05);
    };
    const tick = () => {
      if (k.dead) return;
      const n = Math.random() < .18 ? 2 + Math.floor(Math.random() * 4) : 1;
      for (let i = 0; i < n; i++) setTimeout(() => { if (!k.dead) pop(Math.random() < .07); }, i * (15 + Math.random() * 50));
      k.timers.fire = setTimeout(tick, 40 + Math.random() * Math.random() * 900 + (Math.random() < .15 ? 600 : 0));
    };
    tick();
  },

  clock(k) {
    let next = ctx.currentTime + .15, hi = false;
    const click = (t, high) => {
      const s = ctx.createBufferSource(); s.buffer = white;
      const bp = bq("bandpass", high ? 2900 : 2100, 3), e = gn(0);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(high ? .8 : .65, t + .001); e.gain.exponentialRampToValueAtTime(.0001, t + .03);
      s.connect(bp); bp.connect(e); e.connect(k.out); s.start(t, Math.random() * (white.duration - .2), .05);
      const o = ctx.createOscillator(), oe = gn(0);
      o.type = "sine"; o.frequency.value = high ? 1320 : 990;
      oe.gain.setValueAtTime(0, t); oe.gain.linearRampToValueAtTime(.2, t + .001); oe.gain.exponentialRampToValueAtTime(.0001, t + .06);
      o.connect(oe); oe.connect(k.out); o.start(t); o.stop(t + .08);
      const w = ctx.createOscillator(), we = gn(0);          // the wooden "thock" of the case
      w.type = "sine"; w.frequency.value = high ? 190 : 150;
      we.gain.setValueAtTime(0, t); we.gain.linearRampToValueAtTime(.16, t + .002); we.gain.exponentialRampToValueAtTime(.0001, t + .11);
      w.connect(we); we.connect(k.out); w.start(t); w.stop(t + .14);
    };
    const sched = () => { while (next < ctx.currentTime + 3) { click(next, hi); hi = !hi; next += 1; } };
    sched();
    k.timers.clock = setInterval(sched, 1000);
  },

  hum(k) {
    // Open fifths on D, each voice doubled and slightly detuned so it slowly beats and breathes.
    const base = 73.42;
    [[1, .5], [1.5, .4], [2, .3], [3, .15], [4, .07]].forEach(([ratio, gv]) => {
      [-6, 6].forEach(cents => {
        const o = ctx.createOscillator(); o.type = ratio >= 3 ? "triangle" : "sine";
        o.frequency.value = base * ratio; o.detune.value = cents + (Math.random() * 4 - 2);
        const g = gn(gv * .5); o.connect(g); g.connect(k.out); o.start();
        k.srcs.push(o, lfo(g.gain, .03 + Math.random() * .07, gv * .2));
      });
    });
    // a faint choir-like pad: sawtooth through two vowel-ish filters
    [146.84, 220.0].forEach(f => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = Math.random() * 8 - 4;
      const f1 = bq("bandpass", 650, 6), f2 = bq("bandpass", 1080, 8), pg = gn(.035);
      o.connect(f1); o.connect(f2); f1.connect(pg); f2.connect(pg); pg.connect(k.out); o.start();
      k.srcs.push(o, lfo(pg.gain, .06, .015));
    });
    // stone-room air
    const air = loopSrc(brown), al = bq("lowpass", 220), ag = gn(.5);
    air.connect(al); al.connect(ag); ag.connect(k.out); k.srcs.push(air);
    // a distant bell, now and then
    const bell = () => {
      if (k.dead) return;
      const t = ctx.currentTime + .05, f0 = 196;
      const bg = gn(.1), bl = bq("lowpass", 1500); bg.connect(bl); bl.connect(k.out);
      [[.5, .45, 9], [1, 1, 7], [1.2, .55, 6], [1.5, .4, 5], [2, .5, 4], [2.5, .22, 3], [3, .15, 2.4]].forEach(([r, a, d]) => {
        const o = ctx.createOscillator(), e = gn(0);
        o.type = "sine"; o.frequency.value = f0 * r * (1 + (Math.random() - .5) * .003);
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(a, t + .006); e.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(e); e.connect(bg); o.start(t); o.stop(t + d + .1);
      });
      k.timers.bell = setTimeout(bell, 45000 + Math.random() * 50000);
    };
    k.timers.bell = setTimeout(bell, 8000 + Math.random() * 10000);
  }
};

function startSound(id) {
  if (!ensure() || live[id]) return !!ctx;
  const out = gn(0); out.connect(master);
  const send = gn(WET[id]); out.connect(send); send.connect(reverb);
  const k = { out, srcs: [], timers: {}, dead: false };
  BUILD[id](k);
  const t = ctx.currentTime;
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(lvl(id), t + 1.2);
  live[id] = k;
  return true;
}
function stopSound(id, fast) {
  const k = live[id]; if (!k) return;
  delete live[id]; k.dead = true;
  const t = ctx.currentTime, d = fast ? .15 : .9;
  k.out.gain.cancelScheduledValues(t);
  k.out.gain.setValueAtTime(k.out.gain.value, t);
  k.out.gain.linearRampToValueAtTime(0, t + d);
  Object.values(k.timers).forEach(h => { clearTimeout(h); clearInterval(h); });
  setTimeout(() => { k.srcs.forEach(s => { try { s.stop(); } catch (e) {} }); try { k.out.disconnect(); } catch (e) {} }, d * 1000 + 150);
}
function setLevel(id) {
  const k = live[id]; if (!k) return;
  k.out.gain.cancelScheduledValues(ctx.currentTime);
  k.out.gain.setTargetAtTime(lvl(id), ctx.currentTime, .08);
}

/* ---- controls shared by every UI ---- */
const subs = [];
const emit = () => { subs.forEach(fn => fn()); };

function turnOn(id) {
  if (!startSound(id)) { say("This browser can't play sound"); return false; }
  state.on[id] = true; return true;
}
function toggle(id) {
  if (state.on[id]) { state.on[id] = false; stopSound(id); }
  else {
    if (state.vol[id] < .03) state.vol[id] = DEFAULT_VOL[id];
    if (!turnOn(id)) return;
  }
  persist(); emit();
}
function setVol(id, v) {
  state.vol[id] = clamp(v);
  if (state.vol[id] === 0) { state.on[id] = false; stopSound(id); }
  else if (!state.on[id]) { if (!turnOn(id)) return; }
  else setLevel(id);
  persist(); emit();
}
function setMaster(v) {
  state.master = clamp(v);
  if (master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(state.master, ctx.currentTime, .05); }
  persist(); emit();
}
function stopAll(fast) {
  SOUNDS.forEach(s => { state.on[s.id] = false; stopSound(s.id, fast); });
  clearSleep(); emit();
}
function applyPreset(p) {
  ensure();
  SOUNDS.forEach(s => {
    const v = p.mix[s.id] || 0;
    if (v > 0) { state.vol[s.id] = v; if (state.on[s.id]) setLevel(s.id); else turnOn(s.id); }
    else { state.on[s.id] = false; stopSound(s.id); }
  });
  persist(); emit();
}

/* ---- sleep timer: fades everything out ---- */
let sleepT = null, sleepTick = null;
function clearSleep() { clearTimeout(sleepT); clearInterval(sleepTick); sleepT = sleepTick = null; state.sleepAt = 0; state.sleepMin = 0; }
function setSleep(min) {
  clearSleep();
  if (!min) { emit(); return; }
  state.sleepAt = Date.now() + min * 60000; state.sleepMin = min;
  sleepT = setTimeout(() => {
    if (master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.linearRampToValueAtTime(0, ctx.currentTime + 20); }
    setTimeout(() => { stopAll(true); if (master) master.gain.setValueAtTime(state.master, ctx.currentTime); }, 20500);
  }, min * 60000 - 20000);
  sleepTick = setInterval(emit, 30000);
  emit();
}

/* ---- UI (the same control set is mounted in the Cozy card and the book reader) ---- */
function mount(root) {
  root.classList.add("amb");
  root.innerHTML =
    '<div class="amb-presets" role="group" aria-label="Quick mixes">' +
      PRESETS.map(p => '<button class="smallbtn" type="button" data-preset="' + p.id + '">' + p.label + '</button>').join("") +
    '</div>' +
    '<div class="amb-rows">' +
      SOUNDS.map(s =>
        '<div class="amb-row" data-s="' + s.id + '">' +
          '<button class="amb-toggle" type="button" aria-pressed="false" aria-label="' + s.name + ' on or off">' + s.icon + '</button>' +
          '<div class="amb-main"><div class="amb-label"><span>' + s.name + '</span><span class="amb-pct"></span></div>' +
          '<input type="range" min="0" max="100" step="1" aria-label="' + s.name + ' volume"></div>' +
        '</div>').join("") +
    '</div>' +
    '<div class="amb-foot">' +
      '<label class="amb-master"><span>Overall</span><input type="range" min="0" max="100" step="1" data-master aria-label="Overall volume"></label>' +
      '<label class="amb-sleep"><span>Fade out</span><select aria-label="Sleep timer">' +
        '<option value="0">Off</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 hour</option><option value="90">90 min</option>' +
      '</select></label>' +
      '<button class="smallbtn amb-stop" type="button">Stop all</button>' +
    '</div>' +
    '<div class="status amb-note"></div>';

  const rows = {};
  root.querySelectorAll(".amb-row").forEach(r => { rows[r.dataset.s] = r; });
  const mSlider = root.querySelector("[data-master]"), sel = root.querySelector("select"), stopBtn = root.querySelector(".amb-stop"), note = root.querySelector(".amb-note");

  const drag = el => {
    el.addEventListener("pointerdown", () => { el.dataset.drag = "1"; });
    ["pointerup", "pointercancel", "change", "blur"].forEach(t => el.addEventListener(t, () => { delete el.dataset.drag; }));
  };
  SOUNDS.forEach(s => {
    const row = rows[s.id], sl = row.querySelector("input");
    drag(sl);
    row.querySelector(".amb-toggle").addEventListener("click", () => toggle(s.id));
    sl.addEventListener("input", () => setVol(s.id, sl.value / 100));
  });
  drag(mSlider);
  mSlider.addEventListener("input", () => setMaster(mSlider.value / 100));
  sel.addEventListener("change", () => { ensure(); setSleep(Number(sel.value)); });
  stopBtn.addEventListener("click", () => stopAll(false));
  root.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => applyPreset(PRESETS.find(p => p.id === b.dataset.preset))));

  subs.push(() => {
    SOUNDS.forEach(s => {
      const row = rows[s.id], sl = row.querySelector("input"), on = state.on[s.id];
      row.classList.toggle("on", on);
      row.querySelector(".amb-toggle").setAttribute("aria-pressed", String(on));
      if (!sl.dataset.drag) sl.value = Math.round(state.vol[s.id] * 100);
      row.querySelector(".amb-pct").textContent = on ? Math.round(state.vol[s.id] * 100) + "%" : "off";
    });
    if (!mSlider.dataset.drag) mSlider.value = Math.round(state.master * 100);
    stopBtn.hidden = !anyOn();
    if (state.sleepAt) {
      const m = Math.max(1, Math.ceil((state.sleepAt - Date.now()) / 60000));
      note.textContent = "Fading out in about " + m + " min.";
    } else {
      note.textContent = anyOn() ? "" : "Tap an icon to start. Sounds keep playing while you move around the site.";
    }
    if (document.activeElement !== sel) sel.value = String(state.sleepMin || 0);
  });
}

function initAmbient() {
  const m = $("ambientMount");
  if (m) mount(m);

  // A 🔊 button inside the book reader, with the same controls in a small panel.
  const reader = $("reader"), closeBtn = $("readerClose");
  if (reader && closeBtn) {
    const btn = document.createElement("button");
    btn.className = "smallbtn"; btn.id = "readerSound"; btn.type = "button";
    btn.setAttribute("aria-label", "Reading sounds"); btn.setAttribute("aria-expanded", "false");
    btn.textContent = "🔊";
    closeBtn.before(btn);

    const panel = document.createElement("div");
    panel.className = "apanel"; panel.hidden = true;
    panel.setAttribute("role", "group"); panel.setAttribute("aria-label", "Reading sounds");
    panel.innerHTML = '<div class="apanel-head"><strong>Reading sounds</strong><button class="smallbtn" type="button" aria-label="Close sounds">✕</button></div><div class="apanel-body"></div>';
    reader.appendChild(panel);
    mount(panel.querySelector(".apanel-body"));

    const setOpen = open => { panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.classList.toggle("active", open); };
    btn.addEventListener("click", () => setOpen(panel.hidden));
    panel.querySelector(".apanel-head button").addEventListener("click", () => setOpen(false));
    document.addEventListener("pointerdown", e => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
    // The reader flips pages with the arrow keys and closes on Escape; inside this panel those keys belong to the sliders.
    panel.addEventListener("keydown", e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.stopPropagation(); });
    // Escape closes the sound panel first (capture phase, so the reader doesn't also close the book).
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); e.stopPropagation(); }
    }, true);
    new MutationObserver(() => { if (reader.hidden) setOpen(false); }).observe(reader, { attributes: true, attributeFilter: ["hidden"] });
    subs.push(() => btn.classList.toggle("playing", anyOn()));
  }

  // Sound stops when she signs out or the site locks.
  const gate = $("loginGate");
  if (gate) new MutationObserver(() => { if (gate.classList.contains("show") && anyOn()) stopAll(true); }).observe(gate, { attributes: true, attributeFilter: ["class"] });

  emit();
}

/* ===================================================================
   2. SCHEDULED SURPRISES
   =================================================================== */
const localDay = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const prettyDate = s => { try { return new Date(s + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return s; } };

let surprises = [], overlay = null, overlayOpen = false, waiting = false, lastLoad = 0;

function buildOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "sup"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "A surprise from Kimchi");
  overlay.innerHTML =
    '<div class="sup-card">' +
      '<div class="sup-sealed">' +
        '<div class="sup-orn">☾ ✦ ♡ ✦ ☽</div>' +
        '<h2 class="sup-head">Kimchi left you something</h2>' +
        '<p class="sup-sub"></p>' +
        '<button class="sup-seal" type="button" aria-label="Break the seal and open the letter">♡</button>' +
        '<p class="sup-hint">tap the seal</p>' +
      '</div>' +
      '<div class="sup-letterbox" hidden>' +
        '<div class="sup-orn">✦ ♡ ☾ ♡ ✦</div>' +
        '<h2 class="sup-head sup-title"></h2>' +
        '<div class="sup-date"></div>' +
        '<div class="sup-letter" tabindex="0"></div>' +
        '<div class="sup-sign">kimchi loves you ♡</div>' +
        '<button class="action sup-close" type="button">Keep this ♡</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.querySelector(".sup-letterbox").hidden) closeOverlay(); });
  overlay.querySelector(".sup-close").addEventListener("click", closeOverlay);
  return overlay;
}

let current = null;
function showLetter(s) {
  const o = overlay;
  o.querySelector(".sup-sealed").hidden = true;
  const box = o.querySelector(".sup-letterbox"); box.hidden = false;
  o.querySelector(".sup-title").textContent = s.title || "A surprise for you";
  o.querySelector(".sup-date").textContent = prettyDate(s.date);
  const letter = o.querySelector(".sup-letter");
  letter.textContent = s.text;
  letter.classList.toggle("short", String(s.text).length < 180);
  letter.scrollTop = 0;
  setTimeout(() => o.querySelector(".sup-close").focus({ preventScroll: true }), 700);
}

function present(s, replay) {
  const o = buildOverlay();
  current = s; overlayOpen = true;
  const sealed = o.querySelector(".sup-sealed"), seal = o.querySelector(".sup-seal");
  seal.classList.remove("break");
  if (replay || s.opened) {
    sealed.hidden = true; showLetter(s);
  } else {
    o.querySelector(".sup-letterbox").hidden = true; sealed.hidden = false;
    o.querySelector(".sup-head").textContent = s.title ? s.title : "Kimchi left you something";
    o.querySelector(".sup-sub").textContent = s.title ? "Kimchi left you something" : "";
    seal.onclick = () => {
      seal.onclick = null; seal.classList.add("break");
      setTimeout(() => showLetter(s), 520);
      markOpened(s);
    };
    setTimeout(() => seal.focus({ preventScroll: true }), 400);
  }
  o.hidden = false;
  requestAnimationFrame(() => o.classList.add("show"));
}

function closeOverlay() {
  if (!overlay) return;
  overlay.classList.remove("show");
  overlayOpen = false;
  setTimeout(() => { if (!overlayOpen) overlay.hidden = true; }, 600);
  setTimeout(queueSurprise, 800);
}

async function markOpened(s) {
  if (s.opened) return;
  try {
    const r = await api("/surprise-open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) });
    if (r.ok) { s.opened = Date.now(); renderKept(); }
  } catch (e) {}
}

function renderKept() {
  const card = $("surpriseCard"), list = $("surpriseList");
  if (!card || !list) return;
  const kept = surprises.filter(s => s.opened);
  card.hidden = !kept.length;
  list.replaceChildren();
  kept.slice().reverse().forEach(s => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "smallbtn sup-kept";
    const t = document.createElement("strong"); t.textContent = s.title || "A surprise for you";
    const d = document.createElement("span"); d.textContent = prettyDate(s.date);
    b.append(t, d);
    b.addEventListener("click", () => present(s, true));
    list.appendChild(b);
  });
}

// She should see it after she has signed in and tapped through the welcome screen, never underneath them.
function ready() {
  const gate = $("loginGate"), veil = $("welcomeVeil");
  return typeof getToken === "function" && !!getToken() &&
    !(gate && gate.classList.contains("show")) &&
    !(veil && (!veil.classList.contains("dismissed") || getComputedStyle(veil).visibility !== "hidden"));   // wait for the welcome screen to finish fading
}
function queueSurprise() {
  if (waiting || overlayOpen) return;
  const next = surprises.find(s => !s.opened);
  if (!next) return;
  waiting = true;
  const poll = setInterval(() => {
    if (!ready()) return;
    clearInterval(poll); waiting = false;
    if (!overlayOpen && !next.opened) present(next, false);
  }, 400);
}

async function loadSurprises() {
  if (typeof api !== "function" || typeof getToken !== "function" || !getToken()) return;
  lastLoad = Date.now();
  try {
    const r = await api("/surprise?day=" + localDay(), { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    surprises = Array.isArray(d.surprises) ? d.surprises : [];
    renderKept(); queueSurprise();
  } catch (e) {}
}

/* ===================================================================
   3. INSTALL CARD + SERVICE WORKER
   =================================================================== */
function initInstall() {
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  const card = $("installCard"), body = $("installBody");
  if (!card || !body) return;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  let deferred = null, cycle = false;
  try { cycle = sessionStorage.getItem("layaPeriod") === "1" || localStorage.getItem("layaPeriod") === "1"; } catch (e) {}

  function render() {
    body.replaceChildren();
    const p = document.createElement("p"); body.appendChild(p);
    if (deferred) {
      p.textContent = "Put this on your home screen. It opens full screen, with no browser bar.";
      const b = document.createElement("button"); b.className = "action"; b.type = "button"; b.textContent = "Add to home screen";
      b.addEventListener("click", async () => {
        try { deferred.prompt(); await deferred.userChoice; } catch (e) {}
        deferred = null; render();
      });
      body.appendChild(b);
    } else if (ios) {
      p.textContent = "In Safari, tap the Share button, then Add to Home Screen. It opens full screen, with no browser bar.";
      if (cycle) {
        const w = document.createElement("p"); w.className = "fine";
        w.textContent = "Cycle tracker note: the home screen app starts with its own empty storage on iPhone. Before you add it, open Cycle and tap Export backup. Then open the app and tap Import backup.";
        body.appendChild(w);
      }
    } else if (android) {
      p.textContent = "In Chrome, open the ⋮ menu and choose Install app (or Add to Home screen). It opens full screen, with no browser bar.";
    } else { card.hidden = true; return; }
    card.hidden = false;
  }
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; render(); });
  window.addEventListener("appinstalled", () => { card.hidden = true; say("Added to your home screen ♡"); });
  render();
}

/* iPhones can leave audio suspended (after a call, or when a slider was the first touch). Any tap wakes it. */
["pointerup", "touchend", "click", "keydown"].forEach(t =>
  document.addEventListener(t, () => { if (ctx && ctx.state !== "running") ctx.resume().catch(() => {}); }, { passive: true }));

/* ---- go ---- */
initAmbient();
initInstall();
loadSurprises();
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastLoad > 30 * 60000) loadSurprises(); });
// If she signs in without a reload, pick the surprise up as soon as the gate closes.
const gateEl = $("loginGate");
if (gateEl) new MutationObserver(() => { if (!gateEl.classList.contains("show") && !surprises.length && Date.now() - lastLoad > 3000) loadSurprises(); }).observe(gateEl, { attributes: true, attributeFilter: ["class"] });

window.layaAmbient = { stopAll, state };
})();
