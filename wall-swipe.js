/* Photo wall viewer with swipe. Loads after index.html's own script and takes over card clicks. */
(function () {
  var grid = document.getElementById("gwGrid");
  if (!grid) return;

  var css = document.createElement("style");
  css.textContent =
    ".gw-box{touch-action:pan-y;user-select:none;-webkit-user-select:none}" +
    ".gw-stage{display:grid;justify-items:center;gap:8px;will-change:transform}" +
    ".gw-count2{font-family:'Courier New',monospace;font-weight:700;font-size:.78rem;letter-spacing:.2em;color:#ffb3d1;text-shadow:0 0 8px #ff5f8f}" +
    ".gw-end{min-height:1.3em;font-family:'Cormorant Garamond',serif;font-style:italic;color:#e5a3ba;font-size:1.05rem;opacity:0;transition:opacity .3s}" +
    ".gw-end.show{opacity:1}" +
    "#wall .gw-fav{position:absolute;top:8px;right:10px;z-index:2;color:#ff7fae;font-size:1rem;text-shadow:0 0 8px #ff5f8f,0 0 2px #000}" +
    ".gw-heart{font-size:1rem}.gw-heart.on{background:rgba(255,95,143,.22);border-color:#ff7fae;color:#fff}" +
    ".gw-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1px solid rgba(217,141,165,.4);background:rgba(20,10,25,.6);color:#fff;font-size:1.5rem;cursor:pointer}" +
    ".gw-nav.l{left:12px}.gw-nav.r{right:12px}" +
    "@media(max-width:640px){.gw-nav{display:none}}" +
    "@keyframes gwBump{0%,100%{transform:translateX(0)}40%{transform:translateX(var(--bump))}}";
  document.head.appendChild(css);

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  /* Favourites: saved in this browser, pinned to the top of the wall with a heart */
  var FKEY = "layaWallFavs_v1";
  function getFavs() { try { var a = JSON.parse(localStorage.getItem(FKEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function setFavs(a) { try { localStorage.setItem(FKEY, JSON.stringify(a)); } catch (e) {} }
  function cardId(c) { var im = c.querySelector("img"); return im ? im.dataset.id : ""; }
  function isFav(c) { return getFavs().indexOf(cardId(c)) > -1; }
  var sorting = false;
  function sortWall() {
    if (sorting) return; sorting = true; obs.disconnect();
    var cards = [].slice.call(grid.querySelectorAll(".gw-card")), favs = getFavs();
    cards.forEach(function (c, n) { if (c.dataset.ord === undefined) c.dataset.ord = n; });
    cards.forEach(function (c) {
      var f = favs.indexOf(cardId(c)) > -1, fr = c.querySelector(".gw-frame"), b = c.querySelector(".gw-fav");
      if (f && !b && fr) fr.appendChild(el("span", "gw-fav", "\u2665"));
      if (!f && b) b.remove();
    });
    cards.sort(function (a, b) { return (isFav(b) - isFav(a)) || (a.dataset.ord - b.dataset.ord); })
      .forEach(function (c) { grid.appendChild(c); });
    var n = favs.filter(function (id) { return cards.some(function (c) { return cardId(c) === id; }); }).length;
    var top = document.getElementById("gwFavNote");
    if (!top) { top = el("p", "fine"); top.id = "gwFavNote"; grid.parentNode.insertBefore(top, grid); }
    top.textContent = n ? "\u2665 " + n + " favourite" + (n === 1 ? "" : "s") + " pinned at the top" : "Tap the heart on a photo to pin it to the top of the wall.";
    sorting = false; obs.observe(grid, { childList: true });
  }
  var obs = new MutationObserver(function () { sortWall(); });
  obs.observe(grid, { childList: true });
  sortWall();

  var cache = {};
  function srcFor(card) {
    var im = card.querySelector("img"), id = im.dataset.id;
    if (cache[id]) return Promise.resolve(cache[id]);
    if (im.src && im.src.indexOf("blob:") === 0) return Promise.resolve(cache[id] = im.src);
    return api("/wall/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id }) })
      .then(function (r) { if (!r.ok) throw 0; return r.blob(); })
      .then(function (b) { return cache[id] = URL.createObjectURL(b); });
  }

  function openViewer(startCard) {
    var cards = [].slice.call(grid.querySelectorAll(".gw-card"));
    var i = Math.max(0, cards.indexOf(startCard));
    var atEnd = false;

    var box = el("div", "gw-box"), stage = el("div", "gw-stage"), lb = el("div", "gw-lb"), im = document.createElement("img");
    var count = el("div", "gw-count2"), cap = el("p", "gw-lb-cap"), by = el("p", "gw-lb-by"), end = el("div", "gw-end");
    var row = el("div", "gw-lb-row"), del = el("button", "smallbtn", "Delete"), hb = el("button", "smallbtn gw-heart"), cl = el("button", "smallbtn", "Close");
    var pv = el("button", "gw-nav l", "\u2039"), nx = el("button", "gw-nav r", "\u203A");
    hb.type = del.type = cl.type = pv.type = nx.type = "button";
    pv.setAttribute("aria-label", "Previous photo"); nx.setAttribute("aria-label", "Next photo");
    lb.appendChild(im); row.append(hb, cl, del);
    stage.append(count, lb, cap, by, end, row);
    box.append(stage, pv, nx);
    document.body.appendChild(box);

    function show(n, dir) {
      i = n; atEnd = false; end.classList.remove("show");
      var c = cards[i], src = c.querySelector(".gw-cap"), who = c.querySelector(".gw-by");
      var text = src && !src.classList.contains("none") ? src.textContent : "";
      paintHeart();
      count.textContent = "\u2726 " + (i + 1) + " / " + cards.length + " \u2726";
      cap.textContent = text; cap.hidden = !text;
      by.textContent = "\u2726 " + (who ? who.textContent : "") + " \u2726";
      im.alt = text || "photo"; im.removeAttribute("src");
      srcFor(c).then(function (u) { if (cards[i] === c) im.src = u; }).catch(function () {});
      if (dir) stage.animate([{ transform: "translateX(" + dir * 60 + "px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 250, easing: "ease-out" });
    }

    function paintHeart() { var f = isFav(cards[i]); hb.classList.toggle("on", f); hb.textContent = f ? "\u2665 Favourite" : "\u2661 Favourite"; hb.setAttribute("aria-pressed", String(f)); }
    hb.onclick = function () {
      var id = cardId(cards[i]), a = getFavs(), k = a.indexOf(id);
      if (k > -1) a.splice(k, 1); else a.push(id);
      setFavs(a); paintHeart();
      var fr = cards[i].querySelector(".gw-frame"), b = fr.querySelector(".gw-fav");
      if (k > -1 && b) b.remove(); else if (k === -1 && !b) fr.appendChild(el("span", "gw-fav", "\u2665"));
    };

    function bump(dir) {
      stage.style.setProperty("--bump", (-dir * 40) + "px");
      stage.style.animation = "none"; void stage.offsetWidth;
      stage.style.animation = "gwBump .35s ease";
    }

    function go(dir) {
      var n = i + dir;
      if (n < 0 || n >= cards.length) {
        if (cards.length < 2) return;
        if (!atEnd) {   // first swipe past the edge: bounce and show the hint
          atEnd = true; bump(dir);
          end.textContent = dir > 0 ? "\u2726 that's the end of the wall \u2014 swipe again to go back to the start \u2726" : "\u2726 that's the first one \u2014 swipe again to jump to the last \u2726";
          end.classList.add("show");
          return;
        }
        n = dir > 0 ? 0 : cards.length - 1;   // second swipe wraps around
      }
      show(n, dir);
    }

    function close() { box.remove(); sortWall(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    document.addEventListener("keydown", onKey, true);

    nx.onclick = function (e) { e.stopPropagation(); go(1); };
    pv.onclick = function (e) { e.stopPropagation(); go(-1); };
    cl.onclick = close;
    box.onclick = function (e) { if (e.target === box || e.target === stage) close(); };

    del.onclick = async function () {
      if (!confirm("Delete this photo?")) return;
      var c = cards[i], id = c.querySelector("img").dataset.id;
      var r = await api("/wall/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id }) });
      if (!r.ok) { by.textContent = "You can only delete your own photos."; return; }
      c.remove(); cards.splice(i, 1);
      var cnt = document.getElementById("gwCount");
      if (cnt) cnt.textContent = "\u2726 " + cards.length + (cards.length === 1 ? " memory" : " memories") + " \u2726";
      if (!cards.length) { close(); return; }
      show(Math.min(i, cards.length - 1), 0);
    };

    /* swipe: the photo follows your finger, then slides to the next one */
    var sx = 0, sy = 0, dx = 0, drag = false, locked = false;
    box.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1 || e.target.closest("button")) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; drag = true; locked = false;
      stage.style.transition = "none";
    }, { passive: true });
    box.addEventListener("touchmove", function (e) {
      if (!drag) return;
      var mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
      if (!locked && Math.abs(my) > Math.abs(mx) && Math.abs(my) > 10) { drag = false; stage.style.transform = ""; return; }
      locked = true; dx = mx;
      var edge = (dx < 0 && i === cards.length - 1) || (dx > 0 && i === 0);
      stage.style.transform = "translateX(" + (edge ? dx * 0.3 : dx) + "px)";
    }, { passive: true });
    box.addEventListener("touchend", function () {
      if (!drag) return; drag = false;
      stage.style.transition = "transform .2s ease"; stage.style.transform = "";
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    show(i, 0);
    cl.focus();
  }

  /* capture phase, so this runs before the card's own old viewer */
  grid.addEventListener("click", function (e) {
    var c = e.target.closest(".gw-card"); if (!c) return;
    e.stopImmediatePropagation(); e.preventDefault(); openViewer(c);
  }, true);
  grid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var c = e.target.closest(".gw-card"); if (!c) return;
    e.stopImmediatePropagation(); e.preventDefault(); openViewer(c);
  }, true);
})();
