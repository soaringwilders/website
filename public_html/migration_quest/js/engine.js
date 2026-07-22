/* Flyway — Flight Mode world: canvas simulation + rendering.
 * main.js owns the RAF loop and calls update(dt) / render() each frame,
 * so it can pause the sim while Steward / Warg overlays are open.
 */
window.FLYWAY = window.FLYWAY || {};

FLYWAY.createWorld = function (canvas, callbacks) {
  "use strict";
  const cfg = FLYWAY.config;
  const cb = callbacks || {};
  const ctx = canvas.getContext("2d");

  // ── tuning ──────────────────────────────────────────────────────────
  const BASE_SPEED = 168; // world px / s
  const LEAD_X_FRAC = 0.28;
  const RESCUE_SLOWMO = 0.3;
  const RESCUE_DURATION = 2.6; // real seconds

  const rnd = (a, b) => a + Math.random() * (b - a);

  // ── world state ─────────────────────────────────────────────────────
  const W = {
    dpr: 1,
    w: 0,
    h: 0,
    groundY: 0,
    t: 0,
    dist: 0,
    speed: BASE_SPEED,
    timeScale: 1,
    rescueTimer: 0,
    paused: true,
    finished: false,
    leg: null,
    sky: null,
    safety: {}, // hazardId -> 0..1
    stamina: 100,
    starveTimer: 0,
    birds: [],
    hazards: [],
    particles: [],
    stars: [],
    clouds: [],
    hills: [],
    mountains: [],
    waves: [],
    nextHazardDist: 0,
    hazardQueue: [],
    wargFired: false,
    leadTargetY: 0,
    flash: 0,
    flashColor: "255,90,80",
  };

  // ── setup ───────────────────────────────────────────────────────────
  function resize() {
    W.dpr = Math.min(window.devicePixelRatio || 1, 2);
    W.w = canvas.clientWidth;
    W.h = canvas.clientHeight;
    canvas.width = Math.round(W.w * W.dpr);
    canvas.height = Math.round(W.h * W.dpr);
    ctx.setTransform(W.dpr, 0, 0, W.dpr, 0, 0);
    W.groundY = W.h * 0.82;
    if (W.leadTargetY === 0) W.leadTargetY = W.h * 0.4;
  }

  function buildBackdrop() {
    // stars
    W.stars = [];
    const nStars = W.sky.star > 0 ? 130 : 0;
    for (let i = 0; i < nStars; i++) {
      W.stars.push({
        x: Math.random(),
        y: Math.random() * 0.7,
        r: rnd(0.4, 1.6),
        tw: rnd(0, Math.PI * 2),
        sp: rnd(0.6, 2.2),
      });
    }
    // parallax mountains (far) + hills (mid)
    W.mountains = ridge(6, 0.55, 0.9);
    W.hills = ridge(9, 0.62, 0.7);
    // clouds
    W.clouds = [];
    const nClouds = W.leg.time === "night" ? 5 : 8;
    for (let i = 0; i < nClouds; i++) {
      W.clouds.push({
        wx: rnd(0, 2600),
        y: rnd(0.08, 0.42),
        s: rnd(0.6, 1.5),
        sp: rnd(0.12, 0.26),
        a: rnd(0.05, 0.22),
      });
    }
    // sea waves (night crossing)
    W.waves = [];
    if (W.sky.sea) {
      for (let i = 0; i < 26; i++)
        W.waves.push({ x: Math.random(), y: rnd(0.84, 0.99), s: rnd(0.4, 1) });
    }
  }

  function ridge(seedN, base, height) {
    const pts = [];
    let y = base;
    for (let i = 0; i <= seedN; i++) {
      pts.push(y);
      y += rnd(-0.06, 0.06) * height;
      y = Math.max(base - 0.12, Math.min(base + 0.06, y));
    }
    return pts;
  }

  function buildFlock(count) {
    W.birds = [];
    const leadX = W.w * LEAD_X_FRAC;
    const leadY = W.h * 0.4;
    W.leadTargetY = leadY;
    // lead
    W.birds.push({
      lead: true,
      x: leadX,
      y: leadY,
      vy: 0,
      phase: 0,
      slot: { dx: 0, dy: 0 },
      size: 1.35,
      alive: true,
    });
    // members in a loose V behind the lead (survivors carry across legs)
    const n = count == null ? cfg.species.flockSize : count;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const rank = Math.floor(i / 2) + 1;
      const slot = { dx: -rank * 34 - rnd(-6, 6), dy: side * rank * 20 + rnd(-6, 6) };
      W.birds.push({
        lead: false,
        x: leadX + slot.dx,
        y: leadY + slot.dy,
        vy: 0,
        phase: rnd(0, Math.PI * 2),
        slot,
        noise: rnd(0, 100),
        size: rnd(0.85, 1.05),
        alive: true,
      });
    }
  }

  function scheduleHazards() {
    W.hazardQueue = [];
    const types = W.leg.hazards || [];
    if (!types.length) return;
    const startPad = 900;
    const endPad = 700;
    const span = W.leg.length - startPad - endPad;
    // space hazards evenly with jitter, cycling through the leg's types
    const count = Math.max(3, Math.round(span / 1350));
    for (let i = 0; i < count; i++) {
      const at = startPad + (span * (i + 0.5)) / count + rnd(-140, 140);
      const type = types[i % types.length];
      W.hazardQueue.push({ wx: at, type });
    }
    W.hazardQueue.sort((a, b) => a.wx - b.wx);
  }

  function setLeg(leg, safetyMap, startMembers) {
    W.leg = leg;
    W.sky = cfg.skies[leg.time] || cfg.skies.day;
    W.safety = safetyMap || {};
    W.dist = 0;
    W.t = 0;
    W.timeScale = 1;
    W.rescueTimer = 0;
    W.finished = false;
    W.wargFired = false;
    W.stamina = cfg.species.fatCapacity;
    W.starveTimer = 0;
    W.particles = [];
    W.hazards = [];
    W.flash = 0;
    resize();
    buildBackdrop();
    buildFlock(startMembers);
    scheduleHazards();
  }

  // ── flock accessors ─────────────────────────────────────────────────
  const members = () => W.birds.filter((b) => !b.lead && b.alive);
  function memberCount() {
    return members().length;
  }
  function flockCount() {
    return W.birds.filter((b) => b.alive).length;
  }

  function loseBird(bird, atX, atY) {
    bird.alive = false;
    featherBurst(atX, atY);
    W.flash = Math.min(1, W.flash + 0.5);
    if (cb.onBirdLost) cb.onBirdLost(memberCount());
  }

  // remove the alive member nearest to (x,y); protects the controllable lead
  function loseNearestMember(x, y) {
    let best = null,
      bd = Infinity;
    for (const b of W.birds) {
      if (b.lead || !b.alive) continue;
      const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) loseBird(best, best.x, best.y);
    return best;
  }

  // ── particles ───────────────────────────────────────────────────────
  function featherBurst(x, y) {
    for (let i = 0; i < 9; i++) {
      W.particles.push({
        kind: "feather",
        x,
        y,
        vx: rnd(-40, 30),
        vy: rnd(-50, 20),
        life: rnd(0.7, 1.4),
        age: 0,
        rot: rnd(0, 6.28),
        vr: rnd(-4, 4),
        col: cfg.species.accent,
      });
    }
  }
  function spawnMote(x, y, col) {
    W.particles.push({
      kind: "mote",
      x,
      y,
      vx: rnd(-6, 6),
      vy: rnd(-26, -10),
      life: rnd(1.2, 2.4),
      age: 0,
      r: rnd(1, 2.6),
      col,
    });
  }

  // ── Rescue ──────────────────────────────────────────────────────────
  // Shield the nearest un-passed hazard ahead. Returns true if one was
  // shielded (so the caller may spend a charge).
  function activateRescue() {
    let target = null,
      td = Infinity;
    for (const hz of W.hazards) {
      const sx = hz.wx - W.dist;
      if (hz.shielded) continue;
      if (sx > W.w * (LEAD_X_FRAC - 0.02) && sx < W.w + 200) {
        if (sx < td) {
          td = sx;
          target = hz;
        }
      }
    }
    if (!target) return false;
    target.shielded = true;
    W.rescueTimer = RESCUE_DURATION;
    return true;
  }
  function rescueActive() {
    return W.rescueTimer > 0;
  }

  // ── hazards ─────────────────────────────────────────────────────────
  function spawnHazard(entry) {
    const type = entry.type;
    const safe = (W.safety[type] || 0) >= 1;
    const hz = { type, wx: entry.wx, shielded: false, safe, struck: new Set() };
    if (type === "turbines") {
      hz.towers = [];
      const n = 3;
      for (let i = 0; i < n; i++) {
        hz.towers.push({
          dx: i * 150,
          th: rnd(0.34, 0.46), // tower height frac of h
          spin: rnd(0, 6.28),
          rate: rnd(1.1, 1.7) * (Math.random() < 0.5 ? 1 : -1),
        });
      }
    } else if (type === "glass") {
      hz.bw = rnd(90, 150);
      hz.bh = rnd(0.42, 0.6); // height frac
      hz.hue = rnd(200, 220);
    } else if (type === "light") {
      hz.rad = rnd(230, 320);
      hz.trapY = 0.6; // birds below this frac (of h) inside span get caught
      hz.win = [];
      for (let i = 0; i < 26; i++)
        hz.win.push({ dx: rnd(-120, 120), dy: rnd(0, 90), on: Math.random() < 0.7 });
    }
    W.hazards.push(hz);
  }

  function collideHazard(hz) {
    if (hz.safe || hz.shielded) return;
    const sx = hz.wx - W.dist;
    if (hz.type === "turbines") {
      for (const tw of hz.towers) {
        const hubX = sx + tw.dx;
        const hubY = W.groundY - tw.th * W.h;
        const R = 46;
        for (const b of W.birds) {
          if (!b.alive || hz.struck.has(b)) continue;
          const dx = b.x - hubX,
            dy = b.y - hubY;
          if (dx * dx + dy * dy < (R + 8) * (R + 8)) {
            hz.struck.add(b);
            if (b.lead) loseNearestMember(hubX, hubY);
            else loseBird(b, b.x, b.y);
          }
        }
      }
    } else if (hz.type === "glass") {
      const bx = sx,
        bw = hz.bw,
        topY = W.groundY - hz.bh * W.h;
      for (const b of W.birds) {
        if (!b.alive || hz.struck.has(b)) continue;
        if (b.x > bx - 6 && b.x < bx + bw + 6 && b.y > topY) {
          hz.struck.add(b);
          if (b.lead) loseNearestMember(b.x, topY + 10);
          else loseBird(b, b.x, b.y);
        }
      }
    } else if (hz.type === "light") {
      const trapY = hz.trapY * W.h;
      const half = hz.rad;
      if (sx > -half && sx < W.w + half) {
        for (const b of W.birds) {
          if (!b.alive || hz.struck.has(b)) continue;
          if (Math.abs(b.x - sx) < half * 0.55 && b.y > trapY) {
            hz.struck.add(b);
            if (b.lead) loseNearestMember(b.x, b.y);
            else loseBird(b, b.x, b.y);
          }
        }
      }
    }
  }

  // ── update ──────────────────────────────────────────────────────────
  function setTargetY(y) {
    W.leadTargetY = Math.max(W.h * 0.08, Math.min(W.groundY - 20, y));
  }
  function nudge(dy) {
    setTargetY(W.leadTargetY + dy);
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    // rescue slow-mo ramp
    if (W.rescueTimer > 0) {
      W.rescueTimer -= dt;
      W.timeScale += (RESCUE_SLOWMO - W.timeScale) * Math.min(1, dt * 8);
    } else {
      W.timeScale += (1 - W.timeScale) * Math.min(1, dt * 6);
    }
    const eff = dt * W.timeScale;
    W.t += eff;
    W.flash = Math.max(0, W.flash - dt * 1.8);

    if (W.paused || W.finished) {
      // keep flock breathing gently even when paused
      updateBirds(dt * 0.4, false);
      updateParticles(eff);
      return;
    }

    W.dist += W.speed * eff;

    // stamina drain (faster at night / near light dome; legs like an
    // inescapable open-water crossing can raise this further via fatDrainMult)
    let drain = (2.4 + (W.leg.time === "night" ? 1.1 : 0)) * (W.leg.fatDrainMult || 1);
    W.stamina = Math.max(0, W.stamina - drain * eff);
    if (W.stamina <= 0) {
      W.starveTimer += eff;
      if (W.starveTimer > 3.2 && memberCount() > 0) {
        W.starveTimer = 0;
        loseNearestMember(W.birds[0].x, W.birds[0].y);
      }
    }

    // spawn scheduled hazards as they approach from the right
    while (W.hazardQueue.length && W.hazardQueue[0].wx - W.dist < W.w + 260) {
      spawnHazard(W.hazardQueue.shift());
    }
    // update + collide + cull hazards
    for (const hz of W.hazards) {
      if (hz.type === "turbines")
        for (const tw of hz.towers) tw.spin += tw.rate * eff;
      collideHazard(hz);
    }
    W.hazards = W.hazards.filter((hz) => hz.wx - W.dist > -360);

    updateBirds(dt, true);
    updateParticles(eff);

    // light-pollution ambient motes
    if (W.leg.time === "night" && Math.random() < 0.4) {
      for (const hz of W.hazards)
        if (hz.type === "light" && !hz.safe) {
          const sx = hz.wx - W.dist;
          if (sx > 0 && sx < W.w)
            spawnMote(sx + rnd(-80, 80), W.groundY - rnd(0, 60), W.sky.cityGlow || "#e9a94a");
        }
    }

    // Warg set-piece trigger (once)
    if (
      W.leg.warg &&
      !W.wargFired &&
      W.dist / W.leg.length >= (W.leg.wargAt || 0.4)
    ) {
      W.wargFired = true;
      if (cb.onWarg) cb.onWarg();
    }

    // game over
    if (memberCount() <= 0 && cb.onFlockLost) {
      W.finished = true;
      cb.onFlockLost();
      return;
    }
    // leg complete
    if (W.dist >= W.leg.length) {
      W.finished = true;
      if (cb.onLegComplete) cb.onLegComplete();
    }
  }

  function updateBirds(dt, steer) {
    const lead = W.birds[0];
    // lead follows target with smoothing
    const k = 8 * cfg.species.agility;
    lead.vy += ((W.leadTargetY - lead.y) * k - lead.vy * 6) * dt;
    lead.y += lead.vy * dt;
    lead.x = W.w * LEAD_X_FRAC;
    lead.phase += dt * (6 + Math.min(4, Math.abs(lead.vy) * 0.02));
    // members seek slots relative to lead, with life-like drift
    for (const b of W.birds) {
      if (b.lead || !b.alive) continue;
      const nx = Math.sin(W.t * 1.3 + b.noise) * 6;
      const ny = Math.cos(W.t * 1.7 + b.noise) * 7;
      const tx = lead.x + b.slot.dx + nx;
      const ty = lead.y + b.slot.dy + ny;
      b.x += (tx - b.x) * Math.min(1, dt * 4);
      b.y += (ty - b.y) * Math.min(1, dt * 4);
      b.phase += dt * (7 + b.size);
    }
  }

  function updateParticles(dt) {
    for (const p of W.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "feather") {
        p.vy += 60 * dt;
        p.rot += p.vr * dt;
      }
    }
    W.particles = W.particles.filter((p) => p.age < p.life);
  }

  // ── rendering ───────────────────────────────────────────────────────
  function lerpStops(stops) {
    const g = ctx.createLinearGradient(0, 0, 0, W.groundY);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }

  function render() {
    const { w, h } = W;
    ctx.clearRect(0, 0, w, h);
    // sky
    ctx.fillStyle = lerpStops(W.sky.sky);
    ctx.fillRect(0, 0, w, W.groundY + 2);

    drawCelestial();
    drawStars();
    drawClouds();
    drawMountains();
    drawHills();
    drawGround();
    drawHazardsBack();
    drawFlock();
    drawParticles();
    drawRescueVignette();
    drawFlash();
  }

  function drawCelestial() {
    const body = W.sky.sun || W.sky.moon;
    if (!body) return;
    const x = body.x * W.w,
      y = body.y * W.h;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, body.r * 4);
    glow.addColorStop(0, hexA(body.glow, 0.5));
    glow.addColorStop(1, hexA(body.glow, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, body.r * 4, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(x, y, body.r, 0, 6.2832);
    ctx.fill();
  }

  function drawStars() {
    if (!W.stars.length) return;
    const a = W.sky.star;
    for (const s of W.stars) {
      const tw = 0.5 + 0.5 * Math.sin(W.t * s.sp + s.tw);
      ctx.globalAlpha = a * (0.3 + 0.7 * tw);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x * W.w, s.y * W.groundY, s.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawClouds() {
    for (const c of W.clouds) {
      const sx = mod(c.wx - W.dist * c.sp, W.w + 500) - 250;
      const y = c.y * W.h;
      ctx.globalAlpha = c.a;
      ctx.fillStyle = W.leg.time === "night" ? "#8794c0" : "#ffffff";
      blob(sx, y, 120 * c.s, 34 * c.s);
    }
    ctx.globalAlpha = 1;
  }

  function blob(x, y, rw, rh) {
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, 0, 0, 6.2832);
    ctx.ellipse(x + rw * 0.6, y + rh * 0.2, rw * 0.6, rh * 0.7, 0, 0, 6.2832);
    ctx.ellipse(x - rw * 0.6, y + rh * 0.2, rw * 0.55, rh * 0.65, 0, 0, 6.2832);
    ctx.fill();
  }

  function drawMountains() {
    drawRidge(W.mountains, W.dist * 0.06, W.sky.land[0], 0.55);
  }
  function drawHills() {
    drawRidge(W.hills, W.dist * 0.12, W.sky.land[1] || W.sky.land[0], 0.72);
  }
  function drawRidge(pts, offset, color, alpha) {
    const seg = W.w / (pts.length - 1);
    const ox = mod(offset, seg);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-ox - seg, W.groundY);
    for (let i = 0; i < pts.length; i++)
      ctx.lineTo(i * seg - ox, pts[i] * W.h);
    ctx.lineTo(W.w + seg, W.groundY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, W.groundY, 0, W.h);
    if (W.sky.sea) {
      g.addColorStop(0, W.sky.sea[0]);
      g.addColorStop(1, W.sky.sea[1]);
    } else {
      g.addColorStop(0, W.sky.land[0]);
      g.addColorStop(1, shade(W.sky.land[0], -18));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, W.groundY, W.w, W.h - W.groundY);
    // waves
    if (W.sky.sea) {
      ctx.strokeStyle = hexA("#9fb4e8", 0.16);
      ctx.lineWidth = 1.4;
      for (const wv of W.waves) {
        const x = mod(wv.x * W.w - W.dist * 0.25 * wv.s, W.w + 40) - 20;
        const y = wv.y * W.h;
        ctx.beginPath();
        ctx.moveTo(x - 14, y);
        ctx.quadraticCurveTo(x, y - 3, x + 14, y);
        ctx.stroke();
      }
    }
  }

  // hazards drawn as scenery behind the flock
  function drawHazardsBack() {
    for (const hz of W.hazards) {
      const sx = hz.wx - W.dist;
      if (sx < -360 || sx > W.w + 360) continue;
      if (hz.type === "turbines") drawTurbines(hz, sx);
      else if (hz.type === "glass") drawGlass(hz, sx);
      else if (hz.type === "light") drawLight(hz, sx);
    }
  }

  function drawTurbines(hz, sx) {
    for (const tw of hz.towers) {
      const x = sx + tw.dx;
      const hubY = W.groundY - tw.th * W.h;
      // tower
      ctx.fillStyle = W.leg.time === "night" ? "#20293f" : "#e7edf2";
      ctx.beginPath();
      ctx.moveTo(x - 5, W.groundY);
      ctx.lineTo(x - 2, hubY);
      ctx.lineTo(x + 2, hubY);
      ctx.lineTo(x + 5, W.groundY);
      ctx.fill();
      // blades
      ctx.save();
      ctx.translate(x, hubY);
      const stopped = hz.safe;
      ctx.rotate(stopped ? 0.5 : tw.spin);
      ctx.strokeStyle = W.leg.time === "night" ? "#2c3652" : "#f4f8fb";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      for (let b = 0; b < 3; b++) {
        ctx.rotate(2.094);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -50);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#8a97a6";
      ctx.beginPath();
      ctx.arc(x, hubY, 5, 0, 6.2832);
      ctx.fill();
      // danger arc (blade sweep) if active
      if (!hz.safe && !hz.shielded) {
        ctx.strokeStyle = hexA("255,90,80", 0.28);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(x, hubY, 50, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (hz.safe) {
        drawSafeBadge(x, hubY - 66, "⏸");
      } else if (hz.shielded) {
        drawShimmer(x, hubY, 58);
      }
    }
  }

  function drawGlass(hz, sx) {
    const topY = W.groundY - hz.bh * W.h;
    const g = ctx.createLinearGradient(sx, topY, sx + hz.bw, W.groundY);
    if (W.leg.time === "night") {
      g.addColorStop(0, "#20304e");
      g.addColorStop(1, "#0f1a30");
    } else {
      g.addColorStop(0, "hsl(" + hz.hue + ",40%,72%)");
      g.addColorStop(0.5, "hsl(" + hz.hue + ",45%,60%)");
      g.addColorStop(1, "hsl(" + hz.hue + ",35%,46%)");
    }
    ctx.fillStyle = g;
    ctx.fillRect(sx, topY, hz.bw, W.groundY - topY);
    // reflective streak
    ctx.strokeStyle = hexA("#ffffff", 0.18);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx + hz.bw * 0.28, topY);
    ctx.lineTo(sx + hz.bw * 0.28 + 22, W.groundY);
    ctx.stroke();
    if (hz.safe) {
      // fritted dot grid -> bird-visible
      ctx.fillStyle = hexA("#ffffff", 0.5);
      for (let yy = topY + 12; yy < W.groundY; yy += 16)
        for (let xx = sx + 10; xx < sx + hz.bw; xx += 16) {
          ctx.beginPath();
          ctx.arc(xx, yy, 1.5, 0, 6.2832);
          ctx.fill();
        }
      drawSafeBadge(sx + hz.bw / 2, topY - 16, "✔");
    } else if (hz.shielded) {
      drawShimmer(sx + hz.bw / 2, topY + 30, hz.bw);
    } else {
      ctx.strokeStyle = hexA("255,90,80", 0.3);
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, topY, hz.bw, W.groundY - topY);
      ctx.setLineDash([]);
    }
  }

  function drawLight(hz, sx) {
    // warm glow dome from the horizon
    const cx = sx,
      cy = W.groundY;
    const intensity = hz.safe ? 0.12 : 0.85;
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, hz.rad);
    grad.addColorStop(0, hexA(W.sky.cityGlow || "#e9a94a", intensity));
    grad.addColorStop(1, hexA(W.sky.cityGlow || "#e9a94a", 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, hz.rad, Math.PI, 0);
    ctx.fill();
    // skyline with lit windows
    ctx.fillStyle = W.leg.time === "night" ? "#0a1122" : "#233";
    const bw = 26;
    for (let i = -3; i <= 3; i++) {
      const bx = cx + i * 30 - bw / 2;
      const bh = 40 + ((i * 7919) % 60);
      ctx.fillRect(bx, W.groundY - bh, bw, bh);
    }
    if (!hz.safe) {
      ctx.fillStyle = hexA("#ffe6a8", 0.9);
      for (const wnd of hz.win)
        if (wnd.on)
          ctx.fillRect(cx + wnd.dx, W.groundY - 20 - wnd.dy, 3, 3);
    }
    if (hz.safe) drawSafeBadge(cx, W.groundY - 120, "🌙");
    else if (hz.shielded) drawShimmer(cx, W.groundY - 40, hz.rad * 0.5);
  }

  function drawSafeBadge(x, y, glyph) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = hexA("#8fe3b0", 0.2);
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8ffe8";
    ctx.fillText(glyph, x, y + 1);
  }
  function drawShimmer(x, y, r) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA("#bfe9ff", 0.35));
    g.addColorStop(1, hexA("#bfe9ff", 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }

  function drawFlock() {
    for (const b of W.birds) {
      if (!b.alive) continue;
      drawBird(b);
    }
  }

  function drawBird(b) {
    const flap = Math.sin(b.phase);
    const wing = 8 * b.size;
    const rise = flap * 5 * b.size;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.lineWidth = b.lead ? 3 : 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = b.lead ? cfg.species.accent : silhouetteColor();
    ctx.beginPath();
    // simple gull / warbler silhouette: two wing strokes meeting at body
    ctx.moveTo(-wing, rise);
    ctx.quadraticCurveTo(-wing * 0.3, -rise * 0.4, 0, 0);
    ctx.quadraticCurveTo(wing * 0.3, -rise * 0.4, wing, rise);
    ctx.stroke();
    if (b.lead) {
      // small warm body dot for the player's bird
      ctx.fillStyle = cfg.species.accent;
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  function silhouetteColor() {
    switch (W.leg.time) {
      case "night":
        return "#c3cce8";
      case "dawn":
        return "#3a2f45";
      default:
        return "#26331f";
    }
  }

  function drawParticles() {
    for (const p of W.particles) {
      const t = 1 - p.age / p.life;
      if (p.kind === "feather") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = t;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 1.6, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = t * 0.7;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRescueVignette() {
    if (W.timeScale > 0.85) return;
    const a = (1 - W.timeScale) * 0.5;
    const g = ctx.createRadialGradient(
      W.w / 2,
      W.h / 2,
      W.h * 0.3,
      W.w / 2,
      W.h / 2,
      W.h * 0.8
    );
    g.addColorStop(0, hexA("#bfe9ff", 0));
    g.addColorStop(1, hexA("#3aa0d6", a));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W.w, W.h);
  }

  function drawFlash() {
    if (W.flash <= 0) return;
    ctx.fillStyle = hexA(W.flashColor, W.flash * 0.35);
    ctx.fillRect(0, 0, W.w, W.h);
  }

  // ── color helpers ───────────────────────────────────────────────────
  function hexA(c, a) {
    if (c.indexOf(",") > -1 && c.indexOf("#") === -1)
      return "rgba(" + c + "," + a + ")";
    const h = c.replace("#", "");
    const n = parseInt(
      h.length === 3
        ? h
            .split("")
            .map((x) => x + x)
            .join("")
        : h,
      16
    );
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function shade(hex, amt) {
    const h = hex.replace("#", "");
    let r = parseInt(h.substr(0, 2), 16) + amt;
    let g = parseInt(h.substr(2, 2), 16) + amt;
    let b = parseInt(h.substr(4, 2), 16) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  const mod = (a, n) => ((a % n) + n) % n;

  // ── public accessors ────────────────────────────────────────────────
  return {
    setLeg,
    update,
    render,
    resize,
    setTargetY,
    nudge,
    activateRescue,
    rescueActive,
    refuel: () => (W.stamina = cfg.species.fatCapacity),
    pause: () => (W.paused = true),
    resume: () => (W.paused = false),
    get progress() {
      return W.leg ? Math.min(1, W.dist / W.leg.length) : 0;
    },
    get stamina() {
      return W.stamina / cfg.species.fatCapacity;
    },
    get flockCount() {
      return flockCount();
    },
    get memberCount() {
      return memberCount();
    },
    get totalBirds() {
      return cfg.species.flockSize + 1;
    },
    get slowmo() {
      return W.timeScale < 0.85;
    },
    get finished() {
      return W.finished;
    },
    debugSpawn(type, frac) {
      spawnHazard({ type, wx: W.dist + (frac == null ? 0.6 : frac) * W.w });
    },
    get rescuableNear() {
      for (const hz of W.hazards) {
        if (hz.shielded || hz.safe) continue;
        const sx = hz.wx - W.dist;
        if (sx > W.w * (LEAD_X_FRAC - 0.02) && sx < W.w * 0.9) return true;
      }
      return false;
    },
  };
};
