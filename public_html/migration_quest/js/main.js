/* Migration Quest — boot + flow orchestration.
 * Flow: Title -> Migration Map (roster) -> Journey Brief (per bird) -> Flight
 * -> Stopover -> ... -> Arrival/Report. Only cfg.species (the playable
 * roster entry) can actually fly; explore-only birds stop at the Brief.
 */
(function () {
  "use strict";
  const cfg = FLYWAY.config;
  const state = FLYWAY.state;
  const ui = FLYWAY.ui;

  const RESCUE_PER_LEG = 3;
  const canvas = document.getElementById("world");

  let engine, warg;
  let mode = "title";
  let raf = 0,
    last = 0;

  const run = { legIndex: 0, rescueCharges: 0, started: cfg.species.flockSize + 1 };
  let allBirdRows = null; // cached BirdData rows, looked up per roster entry on demand
  let briefEntry = cfg.species;

  function findBirdRow(commonName) {
    if (!allBirdRows || !commonName) return null;
    const target = commonName.trim().toLowerCase();
    return allBirdRows.find((r) => (r.COMMON_NAME || "").trim().toLowerCase() === target) || null;
  }

  // ── conservation facts for the Migration Report ──────────────────────
  const FACTS = {
    turbines:
      "Poorly sited turbines and unmarked power lines kill large numbers of birds each year — but radar-triggered curtailment, pausing blades on peak passage nights, cuts collisions dramatically.",
    light:
      "On peak nights a single lit tower can pull down thousands of migrants. Cities that run “Lights Out” programs have sharply reduced window-strike deaths.",
    glass:
      "Glass kills up to a billion birds a year in the U.S. alone. Patterned, bird-safe glass makes the invisible barrier visible and prevents most strikes.",
  };
  const EXHAUSTION_FACT =
    "Ruby-throated Hummingbirds roughly double their body weight in fat before crossing the Gulf of Mexico. Without enough reserves — from a late start, a headwind, or a poor feeding season — there is nowhere to land and no margin for error.";

  function safetyMap() {
    const m = {};
    Object.keys(cfg.hazards).forEach((h) => (m[h] = state.routeSafety(h)));
    return m;
  }
  function avgSafetyPct() {
    const ks = Object.keys(cfg.hazards);
    const s = ks.reduce((a, h) => a + state.routeSafety(h), 0) / ks.length;
    return Math.round(s * 100);
  }

  // ── flow ─────────────────────────────────────────────────────────────
  function toTitle() {
    mode = "title";
    engine.pause();
    ui.refreshStanding();
    ui.show("screen-title", false);
  }

  function toMap() {
    mode = "map";
    engine.pause();
    FLYWAY.map.reset();
    ui.show("screen-map", false);
  }

  function toBrief(entry) {
    mode = "brief";
    briefEntry = entry;
    engine.pause();
    ui.renderBrief(entry, findBirdRow(entry.commonName));
    ui.show("screen-brief", false);
  }

  function beginRun() {
    if (!briefEntry || !briefEntry.playable) return;
    run.legIndex = 0;
    startLeg(0, undefined);
  }

  function startLeg(i, members) {
    run.legIndex = i;
    const leg = cfg.flyway.legs[i];
    run.rescueCharges = leg.noRescue ? 0 : RESCUE_PER_LEG;
    engine.setLeg(leg, safetyMap(), members);
    mode = "flight";
    ui.hideAllScreens(true);
    engine.resume();
    ui.toast("Leg " + (i + 1) + " · " + leg.title, "");
  }

  function nextLegHyperfuelNote() {
    const next = cfg.flyway.legs[run.legIndex + 1];
    return next && next.hyperfuelNote ? " <b>" + next.hyperfuelNote + "</b>" : "";
  }

  function stopoverSummary() {
    const survivors = engine.flockCount;
    return (
      "<b>" +
      survivors +
      "</b> of " +
      run.started +
      " birds set down to rest. Fat reserves are refilled for the next leg. " +
      "The hazards you just crossed can be made <b>permanently safe</b> — that is the steward's work." +
      nextLegHyperfuelNote()
    );
  }

  function onLegComplete() {
    engine.pause();
    mode = "stopover";
    const leg = cfg.flyway.legs[run.legIndex];
    const isLast = run.legIndex >= cfg.flyway.legs.length - 1;

    ui.renderStopover(
      leg,
      run.legIndex,
      isLast,
      stopoverSummary(),
      function onAdvance(hid) {
        const res = state.advanceCampaign(hid);
        ui.refreshStanding();
        if (res.completedNow)
          ui.toast(cfg.hazards[hid].campaign.reward, "teal");
        else ui.toast("Campaign advanced — the route is safer.", "teal");
        // re-render to reflect new progress
        onLegCompleteRerender(leg, isLast);
      },
      function onContinue() {
        if (isLast) return doArrival();
        startLeg(run.legIndex + 1, engine.memberCount);
      }
    );
  }
  // helper to rebuild the stopover panel after advancing (keeps closures simple)
  function onLegCompleteRerender(leg, isLast) {
    ui.renderStopover(
      leg,
      run.legIndex,
      isLast,
      stopoverSummary(),
      function onAdvance(hid) {
        const res = state.advanceCampaign(hid);
        ui.refreshStanding();
        if (res.completedNow) ui.toast(cfg.hazards[hid].campaign.reward, "teal");
        else ui.toast("Campaign advanced — the route is safer.", "teal");
        onLegCompleteRerender(leg, isLast);
      },
      function onContinue() {
        if (isLast) return doArrival();
        startLeg(run.legIndex + 1, engine.memberCount);
      }
    );
  }

  function onFlockLost() {
    engine.pause();
    mode = "report";
    const leg = cfg.flyway.legs[run.legIndex];
    const primary = leg.hazards[0];
    let cause, fact;
    if (primary) {
      cause =
        "The last of the flock was lost to <b>" +
        cfg.hazards[primary].name.toLowerCase() +
        "</b>. A single migration can fail — but the work you have already done to make this route safe does not vanish with it.";
      fact = FACTS[primary];
    } else {
      cause =
        "The last of the flock ran out of fat reserves over open water — <b>exhaustion</b>, with nowhere to land. " +
        "A single migration can fail — but the work you have already done to make this route safe does not vanish with it.";
      fact = EXHAUSTION_FACT;
    }
    ui.renderReport({
      legTitle: leg.title,
      cause: cause,
      fact: fact,
      survived: 0,
      started: run.started,
      safePct: avgSafetyPct(),
    });
  }

  function doArrival() {
    mode = "arrival";
    engine.pause();
    ui.renderArrival({
      summary:
        "Down the whole flyway and across the open water, your flock reached the wintering coast. " +
        "Every campaign you finished will still be standing when the next flock comes through.",
      survived: engine.flockCount,
      started: run.started,
      safePct: avgSafetyPct(),
    });
    ui.refreshStanding();
  }

  // ── Warg set-piece ───────────────────────────────────────────────────
  let wargCaptionTimer = 0;
  function enterWarg() {
    mode = "warg";
    engine.pause();
    const overlay = document.getElementById("warg-overlay");
    overlay.classList.remove("hidden");
    let ci = 0;
    ui.setWargCaption(warg.captions[0]);
    clearInterval(wargCaptionTimer);
    wargCaptionTimer = setInterval(() => {
      ci = Math.min(ci + 1, warg.captions.length - 1);
      ui.setWargCaption(warg.captions[ci]);
    }, 4200);
    warg.start();
  }
  function exitWarg() {
    clearInterval(wargCaptionTimer);
    document.getElementById("warg-overlay").classList.add("hidden");
    ui.toast("Heading held — the flock flies true.", "teal");
    mode = "flight";
    engine.resume();
  }

  // ── input ────────────────────────────────────────────────────────────
  function onPointerMove(e) {
    if (mode !== "flight") return;
    engine.setTargetY(e.clientY);
  }
  function onKeyDown(e) {
    if (mode === "flight") {
      if (e.code === "Space") {
        e.preventDefault();
        const leg = cfg.flyway.legs[run.legIndex];
        if (leg.noRescue) {
          ui.toast("No rescue over open water — nowhere to land.", "");
        } else if (run.rescueCharges > 0 && engine.activateRescue()) {
          run.rescueCharges--;
          ui.toast("Rescue — time slows.", "");
        } else if (run.rescueCharges <= 0) {
          ui.toast("No rescues left this leg.", "");
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        engine.nudge(-34);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        engine.nudge(34);
      }
    }
  }

  // ── main loop ────────────────────────────────────────────────────────
  function loop(now) {
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;
    engine.update(dt);
    engine.render();
    if (mode === "flight") {
      ui.updateHUD(engine, cfg.flyway.legs[run.legIndex], run.rescueCharges);
      ui.showRescueHint(engine.rescuableNear && run.rescueCharges > 0 && !engine.slowmo);
    }
    raf = requestAnimationFrame(loop);
  }

  // ── boot ─────────────────────────────────────────────────────────────
  function wireButtons() {
    document.getElementById("btn-begin").onclick = toMap;
    document.getElementById("btn-how").onclick = () =>
      document.getElementById("how-overlay").classList.remove("hidden");
    document.getElementById("btn-how-close").onclick = () =>
      document.getElementById("how-overlay").classList.add("hidden");
    document.getElementById("btn-map-back").onclick = toTitle;
    document.getElementById("btn-brief-back").onclick = toMap;
    document.getElementById("btn-start").onclick = beginRun;
    document.getElementById("btn-retry").onclick = beginRun;
    document.getElementById("btn-report-title").onclick = toTitle;
    document.getElementById("btn-again").onclick = beginRun;
    document.getElementById("btn-arrival-title").onclick = toTitle;
  }

  function boot() {
    engine = FLYWAY.createWorld(canvas, {
      onWarg: enterWarg,
      onLegComplete: onLegComplete,
      onFlockLost: onFlockLost,
    });
    const wargCanvas = document.getElementById("warg-canvas");
    warg = FLYWAY.createWarg(wargCanvas, null, exitWarg);

    // idle atmospheric backdrop behind the menus
    engine.setLeg(cfg.flyway.legs[0], safetyMap());
    engine.pause();

    FLYWAY.map.render({
      svg: document.getElementById("americas-map"),
      callout: document.getElementById("map-callout"),
      roster: cfg.roster,
      onSelect: toBrief,
    });

    ui.refreshStanding();
    ui.show("screen-title", false);

    wireButtons();
    window.addEventListener("resize", () => engine.resize());
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);

    last = performance.now();
    raf = requestAnimationFrame(loop);

    // dev shortcuts: ?goto=map|brief|flight|night|dawn|warg|stopover|arrival
    const goto = new URLSearchParams(location.search).get("goto");
    const briefId = new URLSearchParams(location.search).get("briefid");
    if (goto === "map") toMap();
    else if (goto === "brief" || briefId) {
      const entry = briefId ? cfg.roster.find((r) => r.id === briefId) : cfg.species;
      toBrief(entry || cfg.species);
    }
    else if (goto === "night" || goto === "gulf") {
      run.legIndex = 1;
      startLeg(1, undefined);
    } else if (goto === "dawn") {
      run.legIndex = 2;
      startLeg(2, undefined);
    } else if (goto === "flight") beginRun();
    else if (goto === "warg") {
      beginRun();
      setTimeout(enterWarg, 400);
    } else if (goto === "stopover") {
      beginRun();
      setTimeout(onLegComplete, 400);
    } else if (goto === "arrival") {
      beginRun();
      setTimeout(doArrival, 400);
    }
    // dev shortcut: ?maphover=<rosterId> opens the Map and focuses a marker,
    // simulating hover/select for QA screenshots.
    const mapHover = new URLSearchParams(location.search).get("maphover");
    if (mapHover) {
      toMap();
      setTimeout(() => {
        const node = document.querySelector('.map-marker[data-bird="' + mapHover + '"]');
        if (node) node.focus();
      }, 150);
    }
    const haz = new URLSearchParams(location.search).get("hazard");
    if (haz && mode === "flight") {
      haz.split(",").forEach((h, i) => engine.debugSpawn(h.trim(), 0.5 + i * 0.28));
      engine.render();
    }

    // load the real species rows for field-guide fact cards (best-effort,
    // cached across the whole roster so the Brief works for any bird)
    if (window.BirdData) {
      BirdData.load()
        .then((rows) => {
          allBirdRows = rows;
          if (mode === "brief") ui.renderBrief(briefEntry, findBirdRow(briefEntry.commonName));
        })
        .catch(() => {
          allBirdRows = [];
        });
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
