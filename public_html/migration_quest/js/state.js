/* Flyway — persistent meta (localStorage) + per-run state.
 * Persistent: campaign progress, route safety, private Champion standing.
 * Runs restart the flyway on flock loss, but this meta always survives.
 */
window.FLYWAY = window.FLYWAY || {};

FLYWAY.state = (function () {
  "use strict";
  const KEY = "sowi:flyway:v1";
  const cfg = FLYWAY.config;

  function freshMeta() {
    const campaign = {};
    Object.keys(cfg.hazards).forEach((h) => (campaign[h] = 0)); // steps done
    return { campaign, version: 1 };
  }

  let meta = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const base = freshMeta();
        base.campaign = Object.assign(base.campaign, parsed.campaign || {});
        return base;
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
    return freshMeta();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(meta));
    } catch (e) {
      /* best-effort */
    }
  }

  // Campaign steps done for a hazard.
  function campaignSteps(hazardId) {
    return meta.campaign[hazardId] || 0;
  }
  function campaignTotal(hazardId) {
    return cfg.hazards[hazardId].campaign.steps.length;
  }
  function campaignComplete(hazardId) {
    return campaignSteps(hazardId) >= campaignTotal(hazardId);
  }
  // Advance one step; returns { step, done, completedNow }.
  function advanceCampaign(hazardId) {
    const total = campaignTotal(hazardId);
    if (meta.campaign[hazardId] >= total)
      return { step: total, done: true, completedNow: false };
    meta.campaign[hazardId] += 1;
    const done = meta.campaign[hazardId] >= total;
    save();
    return { step: meta.campaign[hazardId], done, completedNow: done };
  }

  // Route safety 0..1 for a hazard = fraction of its campaign completed.
  function routeSafety(hazardId) {
    return campaignSteps(hazardId) / campaignTotal(hazardId);
  }

  // Champion score = total campaign steps completed across all hazards.
  function championScore() {
    return Object.keys(cfg.hazards).reduce(
      (s, h) => s + campaignSteps(h),
      0
    );
  }
  function rank() {
    const score = championScore();
    let r = cfg.ranks[0];
    for (const cand of cfg.ranks) if (score >= cand.min) r = cand;
    return r;
  }
  function nextRank() {
    const score = championScore();
    return cfg.ranks.find((r) => r.min > score) || null;
  }

  function resetAll() {
    meta = freshMeta();
    save();
  }

  return {
    campaignSteps,
    campaignTotal,
    campaignComplete,
    advanceCampaign,
    routeSafety,
    championScore,
    rank,
    nextRank,
    resetAll,
  };
})();
