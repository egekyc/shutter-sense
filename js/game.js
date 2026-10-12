(function () {
  "use strict";

  const Cam = window.Camera;
  const ROUND_SIZE = 5;
  const KEYS = ["aperture", "shutter", "iso"];
  const DIALS = [
    { key: "aperture", label: "Aperture", sub: "f-stop · background blur", start: 5.6 },
    { key: "shutter", label: "Shutter speed", sub: "motion blur", start: 1 / 125 },
    { key: "iso", label: "ISO", sub: "grain", start: 400 },
  ];

  const LEVELS = {
    beginner: { label: "Beginner", zeroAt: 4, hint: "scene" },
    intermediate: { label: "Intermediate", zeroAt: 3, hint: "button-light" },
    expert: { label: "Expert", zeroAt: 2.5, hint: "button-lens" },
  };

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const store = {
    get(k) {
      try {
        return localStorage.getItem("shutter-sense:" + k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("shutter-sense:" + k, v);
      } catch (e) {
        /* private mode etc. */
      }
    },
  };

  const state = {
    level: null,
    rounds: [],
    index: 0,
    score: 0,
    guess: {},
    results: [],
    used: new Set(),
  };

  const photosFor = (level) => (window.PHOTOS || []).filter((p) => p.level === level);

  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
    window.scrollTo(0, 0);
  }

  function refreshMenu() {
    document.querySelectorAll("[data-best]").forEach((n) => {
      const best = store.get("best2:" + n.dataset.best);
      n.textContent = best ? `Best: ${best} / ${ROUND_SIZE * 300}` : "Not played yet";
    });
    document.querySelectorAll("[data-count]").forEach((n) => {
      n.textContent = photosFor(n.dataset.count).length;
    });
  }

  const dialEls = {};

  function buildDials() {
    const wrap = $("dials");
    for (const d of DIALS) {
      const scale = Cam.SCALE[d.key];
      const row = el("div", "dial");
      const head = el("div", "dial-head");
      const lab = el("label", "dial-label");
      lab.htmlFor = "dial-" + d.key;
      lab.append(el("span", null, d.label), el("small", null, d.sub));
      const val = el("output", "dial-value");
      head.append(lab, val);

      const ctl = el("div", "dial-ctl");
      const minus = el("button", "step", "−");
      minus.type = "button";
      minus.setAttribute("aria-label", d.label + " down");
      const plus = el("button", "step", "+");
      plus.type = "button";
      plus.setAttribute("aria-label", d.label + " up");
      const range = el("input");
      range.type = "range";
      range.id = "dial-" + d.key;
      range.min = 0;
      range.max = scale.length - 1;
      range.step = 1;
      ctl.append(minus, range, plus);

      const ends = el("div", "dial-ends");
      ends.append(el("span", null, Cam.FORMAT[d.key](scale[0])), el("span", null, Cam.FORMAT[d.key](scale[scale.length - 1])));

      row.append(head, ctl, ends);
      wrap.append(row);

      const set = (i) => {
        i = Math.max(0, Math.min(scale.length - 1, i));
        range.value = i;
        state.guess[d.key] = scale[i];
        val.textContent = Cam.FORMAT[d.key](scale[i]);
        range.style.setProperty("--pct", (i / (scale.length - 1)) * 100 + "%");
      };
      range.addEventListener("input", () => set(+range.value));
      minus.addEventListener("click", () => set(+range.value - 1));
      plus.addEventListener("click", () => set(+range.value + 1));
      dialEls[d.key] = { reset: () => set(Cam.nearestIndex(scale, d.start)) };
    }
  }


  function nextPhoto(level) {
    const all = photosFor(level);
    let pool = all.filter((p) => !state.used.has(p.id));
    if (!pool.length) {
      all.forEach((p) => state.used.delete(p.id));
      pool = all;
    }
    const p = pool[Math.floor(Math.random() * pool.length)];
    if (p) state.used.add(p.id);
    return p;
  }

  function start(level) {
    state.level = level;
    state.rounds = [];
    for (let i = 0; i < ROUND_SIZE; i++) {
      const photo = nextPhoto(level);
      if (photo) state.rounds.push({ photo });
    }
    state.index = 0;
    state.score = 0;
    state.results = [];
    if (!state.rounds.length) {
      alert("No photos available for this level yet.");
      return;
    }
    $("level-label").textContent = LEVELS[level].label;
    show("screen-game");
    loadRound();
  }

  function lensText(p) {
    return [p.camera, p.focalLength ? Math.round(p.focalLength) + " mm" : null].filter(Boolean).join(" · ");
  }

  function lightText(p) {
    const parts = [p.scene, "Light: " + Cam.lightLevel(Cam.ev100(p.aperture, p.shutter, p.iso))];
    if (p.shutter >= 0.25) parts.push("camera on a tripod");
    return parts.filter(Boolean).join(" · ");
  }

  function loadRound() {
    const round = state.rounds[state.index];
    const p = round.photo;
    const mode = LEVELS[state.level].hint;
    $("round-label").textContent = `${state.index + 1} / ${state.rounds.length}`;
    $("score").textContent = state.score;
    $("guess-panel").hidden = false;
    $("reveal-panel").hidden = true;
    KEYS.forEach((k) => dialEls[k].reset());

    const img = $("photo");
    const chip = $("scene-chip");
    const hintBtn = $("btn-hint");
    img.hidden = true;
    $("loader").hidden = false;

    if (mode === "scene") {
      chip.textContent = "💡 " + lightText(p);
      hintBtn.hidden = true;
    } else {
      const hint = mode === "button-light" ? lightText(p) : lensText(p);
      chip.textContent = "📷 What settings were used?";
      hintBtn.textContent = mode === "button-light" ? "Show hint" : "Show lens info";
      hintBtn.hidden = !hint;
      hintBtn.onclick = () => {
        chip.textContent = "💡 " + hint;
        hintBtn.hidden = true;
      };
    }

    img.onload = () => {
      $("loader").hidden = true;
      img.hidden = false;
    };
    let retried = false;
    img.onerror = () => {
      if (state.rounds[state.index] !== round) return;
      // Wikimedia sometimes throttles a request: retry once, then swap in a different photo.
      if (!retried) {
        retried = true;
        setTimeout(() => {
          if (state.rounds[state.index] === round) img.src = p.image + (p.image.includes("?") ? "&" : "?") + "retry=1";
        }, 800);
        return;
      }
      const replacement = nextPhoto(state.level);
      if (replacement && replacement.id !== p.id) {
        state.rounds[state.index] = { photo: replacement };
        loadRound();
      } else {
        $("loader").hidden = true;
        chip.textContent = "⚠️ Photo failed to load. Check your connection.";
      }
    };
    img.alt = "Photo to guess";
    img.src = p.image;
  }

  function sourceLink(p, text) {
    const a = el("a", null, text);
    a.href = p.source;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function lockIn() {
    const round = state.rounds[state.index];
    const p = round.photo;
    const zeroAt = LEVELS[state.level].zeroAt;
    const res = { photo: p, rows: [], total: 0 };
    for (const k of KEYS) {
      const g = state.guess[k];
      const stops = Cam.stopsOff(k, g, p[k]);
      const pts = Cam.points(stops, zeroAt);
      res.rows.push({ key: k, guess: g, actual: p[k], stops, pts });
      res.total += pts;
    }
    state.score += res.total;
    state.results.push(res);
    $("score").textContent = state.score;

    const box = $("results");
    box.replaceChildren();
    const head = el("div", "res-row res-head");
    head.append(el("span"), el("span", null, "You"), el("span", null, "Actual"), el("span", null, "Points"));
    box.append(head);
    for (const r of res.rows) {
      const row = el("div", "res-row");
      const name = DIALS.find((d) => d.key === r.key).label;
      const pts = el("span", "res-pts");
      const bar = el("i");
      bar.style.setProperty("--w", r.pts + "%");
      bar.dataset.tier = r.pts >= 90 ? "great" : r.pts >= 50 ? "ok" : "bad";
      pts.append(el("b", null, "+" + r.pts), bar);
      const actualCell = el("span", "res-actual");
      actualCell.append(el("b", null, Cam.FORMAT[r.key](r.actual)), el("small", null, Cam.fmtStops(r.stops)));
      row.append(el("span", "res-name", name), el("span", "res-guess", Cam.FORMAT[r.key](r.guess)), actualCell, pts);
      box.append(row);
    }
    const tot = el("div", "res-total");
    tot.append(el("span", null, "This photo"), el("b", null, res.total + " / 300"));
    box.append(tot);

    const tips = $("tips");
    tips.replaceChildren();
    for (const t of Cam.explain(p)) tips.append(el("li", "tip tip-" + t.key, t.text));
    const lens = lensText(p);
    if (lens) tips.append(el("li", "tip", "Shot on " + lens + "."));

    const credit = $("credit");
    credit.replaceChildren();
    credit.append(el("b", null, p.title), el("span", null, `by ${p.author}${p.license ? " · " + p.license : ""}`));
    if (p.source) credit.append(sourceLink(p, "View source ↗"));
    if (p.mine) credit.append(el("span", null, "📸 One of my own photos"));
    credit.hidden = false;

    $("btn-hint").hidden = true;
    $("guess-panel").hidden = true;
    $("reveal-panel").hidden = false;
    $("btn-next").textContent = state.index + 1 < state.rounds.length ? "Next photo" : "See results";
    $("reveal-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function next() {
    state.index++;
    if (state.index < state.rounds.length) loadRound();
    else summary();
  }

  const RANKS = [
    [0.85, "Master of Light"],
    [0.7, "Pro Shooter"],
    [0.5, "Enthusiast"],
    [0.3, "Hobbyist"],
    [0, "Still on Auto mode"],
  ];

  function summary() {
    const max = state.rounds.length * 300;
    $("sum-points").textContent = state.score;
    $("sum-max").textContent = max;
    $("sum-rank").textContent = RANKS.find(([t]) => state.score / max >= t)[1];
    const prev = +(store.get("best2:" + state.level) || 0);
    const isBest = state.score > prev;
    if (isBest) store.set("best2:" + state.level, state.score);
    $("sum-best").hidden = !isBest;

    const list = $("sum-list");
    list.replaceChildren();
    for (const r of state.results) {
      const p = r.photo;
      const li = el("li", "sum-item");
      const th = el("img");
      th.src = p.image;
      th.alt = "";
      th.loading = "lazy";
      th.referrerPolicy = "no-referrer";
      const txt = el("div", "sum-txt");
      txt.append(el("b", null, p.title), el("span", null, `${Cam.fmtAperture(p.aperture)} · ${Cam.fmtShutter(p.shutter)} · ${Cam.fmtIso(p.iso)}`));
      if (p.source) txt.append(sourceLink(p, "Source ↗"));
      li.append(th, txt, el("span", "sum-pts", r.total));
      list.append(li);
    }
    show("screen-summary");
  }

  function toggleZoom() {
    const f = $("frame");
    const on = !f.classList.contains("zoomed");
    f.classList.toggle("zoomed", on);
    document.body.classList.toggle("no-scroll", on);
  }

  buildDials();
  refreshMenu();
  document.querySelectorAll("button.level-card").forEach((b) => b.addEventListener("click", () => start(b.dataset.level)));
  $("btn-lock").addEventListener("click", lockIn);
  $("btn-next").addEventListener("click", next);
  $("btn-again").addEventListener("click", () => start(state.level));
  $("btn-home").addEventListener("click", () => {
    refreshMenu();
    show("screen-home");
  });
  $("btn-quit").addEventListener("click", () => {
    if (state.results.length && !confirm("Leave this round? Your progress will be lost.")) return;
    refreshMenu();
    show("screen-home");
  });
  $("frame").addEventListener("click", toggleZoom);
  $("frame").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleZoom();
    }
    if (e.key === "Escape" && $("frame").classList.contains("zoomed")) toggleZoom();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
  }
})();
