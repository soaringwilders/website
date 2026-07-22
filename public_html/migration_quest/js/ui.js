/* Flyway — DOM screens, HUD, Steward panel, reports. */
window.FLYWAY = window.FLYWAY || {};

FLYWAY.ui = (function () {
  "use strict";
  const cfg = FLYWAY.config;
  const state = FLYWAY.state;
  const $ = (id) => document.getElementById(id);

  const el = {};
  [
    "hud",
    "hud-leg-title",
    "hud-leg-sub",
    "hud-progress-fill",
    "hud-progress-icon",
    "hud-flock",
    "hud-stamina",
    "hud-rescues",
    "rescue-hint",
    "title-standing",
    "brief-kicker",
    "species-name",
    "species-tag",
    "species-stats",
    "species-art",
    "route-preview",
    "brief-comingsoon",
    "btn-start",
    "stopover-kicker",
    "stopover-h",
    "stopover-sum",
    "campaign-list",
    "report-h",
    "report-cause",
    "report-fact",
    "report-meta",
    "arrival-sum",
    "arrival-meta",
    "warg-caption",
    "toast",
  ].forEach((id) => (el[id] = $(id)));

  const screens = [
    "screen-title",
    "screen-map",
    "screen-brief",
    "screen-stopover",
    "screen-report",
    "screen-arrival",
  ];

  function show(screenId, withHud) {
    screens.forEach((s) => $(s).classList.toggle("hidden", s !== screenId));
    el.hud.classList.toggle("hidden", !withHud);
    el.hud.setAttribute("aria-hidden", withHud ? "false" : "true");
  }
  function hideAllScreens(withHud) {
    screens.forEach((s) => $(s).classList.add("hidden"));
    el.hud.classList.toggle("hidden", !withHud);
  }

  let toastTimer = 0;
  function toast(msg, cls) {
    el.toast.textContent = msg;
    el.toast.className = "toast" + (cls ? " " + cls : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
  }

  // ── standing (private champion) ──────────────────────────────────────
  function standingText() {
    const r = state.rank();
    const next = state.nextRank();
    const score = state.championScore();
    let s = "Your standing: <b>" + r.name + "</b>";
    if (next)
      s +=
        " · " +
        (next.min - score) +
        " more campaign step" +
        (next.min - score === 1 ? "" : "s") +
        " to " +
        next.name;
    return s;
  }
  function refreshStanding() {
    el["title-standing"].innerHTML = standingText();
  }

  // ── Journey Brief (per roster bird — playable or explore-only) ────────
  function renderBrief(entry, row) {
    el["brief-kicker"].textContent = entry.flywayName + " · Fall passage";
    el["species-art"].innerHTML =
      entry.genus && entry.species
        ? '<img src="../base_res/img/birds/' + entry.genus + "_" + entry.species + '.jpg" alt="" />'
        : "🐦";
    el["species-name"].textContent = entry.commonName;
    el["species-tag"].textContent = entry.tagline;
    el["species-stats"].innerHTML =
      stat("Mode", entry.modeLabel) +
      stat("Distance", entry.distance) +
      (entry.playable ? stat("Flock", entry.flockSize + " birds") : "");

    const guideBtn = $("btn-guide");
    if (row && window.BirdDetail) {
      guideBtn.disabled = false;
      guideBtn.textContent = "Open field guide";
      guideBtn.onclick = () => BirdDetail.open(row);
    } else {
      guideBtn.disabled = true;
      guideBtn.textContent = "Field guide unavailable";
    }

    if (entry.playable) renderRoute();
    else {
      el["route-preview"].innerHTML =
        '<span class="route-node">' +
        (entry.shortName || entry.commonName) +
        '</span><span class="route-arrow">→</span><span class="route-node">' +
        entry.flywayName +
        "</span>";
    }
    el["brief-comingsoon"].classList.toggle("hidden", entry.playable);
    el["btn-start"].classList.toggle("hidden", !entry.playable);
  }
  function stat(label, val) {
    return '<div class="st">' + label + "<b>" + val + "</b></div>";
  }

  function renderRoute() {
    const nodes = ["Breeding grounds"];
    cfg.flyway.legs.forEach((l) => nodes.push(l.title));
    nodes.push("Wintering grounds");
    el["route-preview"].innerHTML = nodes
      .map((n, i) => {
        const node = '<span class="route-node">' + n + "</span>";
        return i < nodes.length - 1 ? node + '<span class="route-arrow">→</span>' : node;
      })
      .join("");
  }

  // ── HUD (called each frame during flight) ────────────────────────────
  function updateHUD(engine, leg, rescueCharges) {
    el["hud-leg-title"].textContent = leg.title;
    el["hud-leg-sub"].textContent = leg.subtitle;
    const pct = engine.progress * 100;
    el["hud-progress-fill"].style.width = pct + "%";
    el["hud-progress-icon"].style.left = pct + "%";
    el["hud-flock"].textContent = engine.flockCount;
    const stam = engine.stamina;
    el["hud-stamina"].style.width = stam * 100 + "%";
    el["hud-stamina"].classList.toggle("low", stam < 0.25);
    // rescue pips
    const total = 3;
    let pips = "";
    for (let i = 0; i < total; i++)
      pips += '<span class="pip' + (i < rescueCharges ? "" : " spent") + '"></span>';
    el["hud-rescues"].innerHTML = pips;
  }
  function showRescueHint(on) {
    el["rescue-hint"].classList.toggle("hidden", !on);
  }

  // ── Stopover / Steward ───────────────────────────────────────────────
  function renderStopover(leg, legIndex, isLast, summary, onAdvance, onContinue) {
    show("screen-stopover", false);
    el["stopover-kicker"].textContent =
      "Stopover · " + (legIndex + 1) + " of " + cfg.flyway.legs.length;
    el["stopover-h"].textContent = "The flock rests — " + leg.title;
    el["stopover-sum"].innerHTML = summary;

    const list = el["campaign-list"];
    list.innerHTML = "";
    const hazardIds = uniq(leg.hazards);
    if (hazardIds.length === 0) {
      list.innerHTML =
        '<div class="no-hazard-note">No fixed hazard here — the ocean has no campaign to run. Rest, and prepare.</div>';
    } else {
      hazardIds.forEach((hid) => list.appendChild(campaignEl(hid, onAdvance)));
    }

    const cont = $("btn-continue");
    cont.textContent = isLast ? "Complete the crossing →" : "Fly on →";
    cont.onclick = onContinue;
  }

  function campaignEl(hazardId, onAdvance) {
    const h = cfg.hazards[hazardId];
    const c = h.campaign;
    const done = state.campaignSteps(hazardId);
    const total = state.campaignTotal(hazardId);
    const complete = done >= total;

    const wrap = document.createElement("div");
    wrap.className = "campaign" + (complete ? " complete" : "");

    let stepsHtml = "";
    c.steps.forEach((st, i) => {
      const cls = i < done ? "done" : i === done ? "current" : "";
      stepsHtml +=
        '<div class="step ' +
        cls +
        '"><div class="step-dot">' +
        (i < done ? "✓" : i + 1) +
        '</div><div class="step-text"><b>' +
        st.label +
        "</b><span>" +
        st.detail +
        "</span></div></div>";
    });

    const action = complete
      ? '<div class="campaign-reward">✓ ' + c.reward + "</div>"
      : '<button class="btn btn-campaign" data-h="' +
        hazardId +
        '">' +
        (done === 0 ? "Start the campaign" : "Advance: " + c.steps[done].label) +
        "</button>";

    wrap.innerHTML =
      '<div class="campaign-title"><span class="campaign-name">' +
      h.icon +
      " " +
      c.name +
      '</span><span class="muted">' +
      done +
      "/" +
      total +
      "</span></div>" +
      '<div class="campaign-goal">' +
      c.goal +
      "</div>" +
      '<div class="steps">' +
      stepsHtml +
      "</div>" +
      action +
      '<div class="route-meter"><div style="width:' +
      (done / total) * 100 +
      '%"></div></div>';

    const btn = wrap.querySelector(".btn-campaign");
    if (btn) btn.onclick = () => onAdvance(hazardId);
    return wrap;
  }

  // ── report / arrival ─────────────────────────────────────────────────
  function renderReport(data) {
    show("screen-report", false);
    el["report-h"].textContent = "The flock scattered on " + data.legTitle;
    el["report-cause"].innerHTML = data.cause;
    el["report-fact"].innerHTML = data.fact;
    el["report-meta"].innerHTML =
      meta("Reached", data.survived + " / " + data.started + " birds") +
      meta("Standing", state.rank().name) +
      meta("Route made safer", data.safePct + "%");
  }
  function renderArrival(data) {
    show("screen-arrival", false);
    el["arrival-sum"].innerHTML = data.summary;
    el["arrival-meta"].innerHTML =
      meta("Arrived", data.survived + " / " + data.started + " birds") +
      meta("Standing", state.rank().name) +
      meta("Route safety", data.safePct + "%");
  }
  function meta(label, val) {
    return '<div class="rm">' + label + "<b>" + val + "</b></div>";
  }

  function setWargCaption(text) {
    el["warg-caption"].style.opacity = 0;
    setTimeout(() => {
      el["warg-caption"].textContent = text;
      el["warg-caption"].style.opacity = 1;
    }, 300);
  }

  return {
    show,
    hideAllScreens,
    toast,
    refreshStanding,
    renderBrief,
    updateHUD,
    showRescueHint,
    renderStopover,
    renderReport,
    renderArrival,
    setWargCaption,
  };

  function uniq(a) {
    return a.filter((x, i) => a.indexOf(x) === i);
  }
})();
