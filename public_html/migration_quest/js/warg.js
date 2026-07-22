/* Flyway — Warg Mode set-piece: the star compass.
 * A focused sensory beat. You slip into the migrant's own navigation —
 * steering by the star compass and Earth's magnetic field — holding a true
 * heading over open water while light pollution from the coast drags at you.
 * Runs its own RAF while active; calls onDone({ success }) when finished.
 */
window.FLYWAY = window.FLYWAY || {};

FLYWAY.createWarg = function (canvas, hud, onDone) {
  "use strict";
  const ctx = canvas.getContext("2d");
  let raf = 0,
    last = 0,
    running = false;
  let W = 0,
    H = 0,
    dpr = 1;

  const state = {
    target: -Math.PI / 2, // "true north / the pole star" heading
    needle: -Math.PI / 2 + 0.9,
    drift: 0,
    align: 0,
    glareDir: 1,
    glare: 0,
    stars: [],
    done: false,
    keys: { left: false, right: false },
    pointerDx: 0,
    t: 0,
  };

  const captions = [
    "You slip behind its eyes. The night sky sharpens into a map.",
    "Night-migrating songbirds steer by a star compass — the sky's slow rotation shows them true north.",
    "They also feel Earth's magnetic field, a second compass beneath the stars — vital with 500 miles of open water and nowhere to land.",
    "Hold your heading against the coastal glare pulling from the side.",
  ];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildStars() {
    state.stars = [];
    for (let i = 0; i < 220; i++)
      state.stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.4 + Math.random() * 1.8,
        tw: Math.random() * 6.28,
        sp: 0.5 + Math.random() * 2,
      });
  }

  function onKey(e, down) {
    if (e.key === "ArrowLeft" || e.key === "a") state.keys.left = down;
    if (e.key === "ArrowRight" || e.key === "d") state.keys.right = down;
  }
  function onMove(e) {
    state.pointerDx += e.movementX || 0;
  }

  function start() {
    resize();
    buildStars();
    state.done = false;
    state.align = 0;
    state.t = 0;
    state.target = -Math.PI / 2;
    state.needle = -Math.PI / 2 + 1.0;
    running = true;
    last = performance.now();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    canvas.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(loop);
  }
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    canvas.removeEventListener("mousemove", onMove);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    render();
    if (state.done) {
      stop();
      if (onDone) onDone({ success: true });
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function update(dt) {
    state.t += dt;
    // slow celestial drift of true heading
    state.target = -Math.PI / 2 + Math.sin(state.t * 0.25) * 0.28;
    // light-pollution glare oscillates and tugs the needle
    state.glare = 0.5 + 0.5 * Math.sin(state.t * 0.7);
    const glarePull = state.glareDir * state.glare * 0.9 * dt;
    // player input
    let input = 0;
    if (state.keys.left) input -= 2.2 * dt;
    if (state.keys.right) input += 2.2 * dt;
    input += state.pointerDx * 0.006;
    state.pointerDx = 0;
    state.needle += input + glarePull;
    // clamp needle to a sane arc
    state.needle = Math.max(-Math.PI - 0.4, Math.min(0.4, state.needle));
    // alignment
    const err = Math.abs(angDiff(state.needle, state.target));
    if (err < 0.18) state.align = Math.min(1, state.align + dt * 0.5);
    else state.align = Math.max(0, state.align - dt * 0.4);
    if (hud) hud(state.align, err < 0.18);
    if (state.align >= 1) state.done = true;
    // caption index
  }

  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 6.2832;
    while (d < -Math.PI) d += 6.2832;
    return d;
  }

  function render() {
    // deep night
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#04060f");
    g.addColorStop(1, "#0a1026");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars
    for (const s of state.stars) {
      const tw = 0.4 + 0.6 * Math.sin(state.t * s.sp + s.tw);
      ctx.globalAlpha = tw;
      ctx.fillStyle = "#dfe8ff";
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const cx = W / 2,
      cy = H * 0.42,
      R = Math.min(W, H) * 0.29;

    // light-pollution glare from the side
    const gx = state.glareDir > 0 ? W : 0;
    const glare = ctx.createRadialGradient(gx, H * 0.75, 0, gx, H * 0.75, W * 0.7);
    glare.addColorStop(0, "rgba(233,169,74," + 0.28 * state.glare + ")");
    glare.addColorStop(1, "rgba(233,169,74,0)");
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, W, H);

    // magnetic-field arcs (subtle)
    ctx.strokeStyle = "rgba(120,180,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * (0.5 + i * 0.28), 0, 6.2832);
      ctx.stroke();
    }

    // compass ring
    ctx.strokeStyle = "rgba(190,210,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.stroke();
    for (let a = 0; a < 6.2832; a += Math.PI / 12) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10));
      ctx.stroke();
    }

    // the pole star / true heading marker
    const tx = cx + Math.cos(state.target) * (R + 24);
    const ty = cy + Math.sin(state.target) * (R + 24);
    const pole = ctx.createRadialGradient(tx, ty, 0, tx, ty, 20);
    pole.addColorStop(0, "rgba(255,255,255,0.95)");
    pole.addColorStop(1, "rgba(150,190,255,0)");
    ctx.fillStyle = pole;
    ctx.beginPath();
    ctx.arc(tx, ty, 20, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = "#fff";
    star(tx, ty, 5, 2, 5);

    // player needle
    const aligned = state.align > 0.001 && Math.abs(angDiff(state.needle, state.target)) < 0.18;
    ctx.strokeStyle = aligned ? "#8fe3b0" : "#f2c14e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(state.needle) * R, cy + Math.sin(state.needle) * R);
    ctx.stroke();
    ctx.fillStyle = aligned ? "#8fe3b0" : "#f2c14e";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, 6.2832);
    ctx.fill();

    // alignment ring fill
    ctx.strokeStyle = "#8fe3b0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12, -Math.PI / 2, -Math.PI / 2 + state.align * 6.2832);
    ctx.stroke();
  }

  function star(x, y, spikes, inner, outer) {
    let rot = -Math.PI / 2;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(x, y - outer);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  return { start, stop, captions, resize };
};
