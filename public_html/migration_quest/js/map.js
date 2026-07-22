/* Migration Quest — Migration Map: real Americas illustration
 * (img/americas_map.png) with the roster's five routes drawn as an SVG
 * overlay in the same pixel space. Each bird is shown as an in-flight photo
 * marker pulled out to open water (roster[].markerAnchor) and tied back to
 * its true route origin by a thin dashed leader line, so the five photos
 * read as "arrayed around" the landmass rather than sitting on top of it.
 * Select-to-highlight interaction: hovering/focusing a bird's marker
 * highlights its route + leader and dims the rest, and shows its fact
 * Callout; a Select action in the Callout hands the bird back to main.js to
 * open its Journey Brief.
 */
window.FLYWAY = window.FLYWAY || {};

FLYWAY.map = (function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["#e0517a", "#e8a33d", "#5fb8e0", "#8f7fe0", "#6bbf6b"];
  const BIRD_IMG_BASE = "img/in_flight/";

  let svg, routesG, markersG, calloutEl, roster, onSelect;
  let activeId = null;
  let selectedId = null;

  // ── Catmull-Rom → cubic Bezier, uniform (tension 1/6) ──────────────────
  function smoothPath(pts, closed) {
    const n = pts.length;
    if (n < 2) return "M " + pts[0][0] + " " + pts[0][1];
    const get = (i) => {
      if (closed) return pts[((i % n) + n) % n];
      return pts[Math.max(0, Math.min(n - 1, i))];
    };
    let d = "M " + pts[0][0] + "," + pts[0][1] + " ";
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C " + c1x + "," + c1y + " " + c2x + "," + c2y + " " + p2[0] + "," + p2[1] + " ";
    }
    if (closed) d += "Z";
    return d;
  }

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function birdImgSrc(r) {
    return BIRD_IMG_BASE + r.genus + "_" + r.species + ".png";
  }

  // Shared hover/focus/select wiring used by both map markers and thumbnails.
  function wireSelectable(node, id, onEnter) {
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("focus", onEnter);
    node.addEventListener("mouseleave", () => setActive(selectedId));
    node.addEventListener("click", () => {
      selectedId = id;
      setActive(id);
    });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectedId = id;
        setActive(id);
      }
    });
  }

  function routeSegments(routeCfg) {
    const pts = routeCfg.points;
    if (!routeCfg.waterSegment) return [{ d: smoothPath(pts, false), dashed: false }];
    const [a, b] = routeCfg.waterSegment;
    const segs = [];
    if (a > 0) segs.push({ d: smoothPath(pts.slice(0, a + 1), false), dashed: false });
    segs.push({ d: smoothPath(pts.slice(a, b + 1), false), dashed: true });
    if (b < pts.length - 1) segs.push({ d: smoothPath(pts.slice(b), false), dashed: false });
    return segs;
  }

  function buildRoutes() {
    routesG.innerHTML = "";
    roster.forEach((r, i) => {
      const color = r.accent || PALETTE[i % PALETTE.length];
      routeSegments(r.route).forEach((seg) => {
        routesG.appendChild(
          el("path", {
            class: "map-route" + (seg.dashed ? " map-route-water" : ""),
            "data-bird": r.id,
            d: seg.d,
            stroke: color,
          })
        );
      });
      if (r.route.stagingIndex != null) {
        const [sx, sy] = r.route.points[r.route.stagingIndex];
        const g = el("g", { class: "map-staging", "data-bird": r.id });
        g.appendChild(el("circle", { cx: sx, cy: sy, r: 10 }));
        const label = el("text", { x: sx, y: sy - 17, "text-anchor": "middle" });
        label.textContent = r.route.stagingLabel || "";
        g.appendChild(label);
        routesG.appendChild(g);
      }
    });
  }

  // Each marker is an in-flight bird photo pulled off-land to an open-water
  // anchor point (r.markerAnchor), tied back to the route's true origin by a
  // thin dashed leader line — reads as "birds arrayed around the map"
  // without the photos overlapping the landmass or each other.
  function buildMarkers() {
    markersG.innerHTML = "";
    roster.forEach((r, i) => {
      const color = r.accent || PALETTE[i % PALETTE.length];
      const anchor = r.markerAnchor || r.origin;
      const size = r.markerSize || { w: 140, h: 140 };
      const g = el("g", {
        class: "map-marker" + (r.playable ? " map-marker-playable" : ""),
        "data-bird": r.id,
        tabindex: "0",
        role: "button",
        "aria-label": r.commonName + (r.playable ? " — playable now" : " — journey coming soon"),
      });
      if (r.markerAnchor) {
        g.appendChild(
          el("path", {
            class: "map-marker-leader",
            d: "M " + r.origin.x + " " + r.origin.y + " L " + anchor.x + " " + anchor.y,
            stroke: color,
          })
        );
        g.appendChild(el("circle", { class: "map-marker-origin", cx: r.origin.x, cy: r.origin.y, r: 6, fill: color }));
      }
      const haloR = Math.max(size.w, size.h) / 2 + 14;
      g.appendChild(el("circle", { class: "map-marker-halo", cx: anchor.x, cy: anchor.y, r: haloR }));
      if (r.playable) {
        g.appendChild(
          el("circle", { class: "map-marker-ring", cx: anchor.x, cy: anchor.y, r: haloR - 6, stroke: color })
        );
      }
      g.appendChild(
        el("image", {
          class: "map-marker-img",
          x: anchor.x - size.w / 2,
          y: anchor.y - size.h / 2,
          width: size.w,
          height: size.h,
          href: birdImgSrc(r),
        })
      );
      const label = el("text", {
        class: "map-marker-label",
        x: anchor.x,
        y: anchor.y + size.h / 2 + 20,
        "text-anchor": "middle",
      });
      label.textContent = r.shortName || r.commonName;
      g.appendChild(label);

      wireSelectable(g, r.id, () => setActive(r.id));
      markersG.appendChild(g);
    });
  }

  function setActive(id) {
    activeId = id;
    updateHighlight();
    renderCallout(id);
  }

  function updateHighlight() {
    const nodes = routesG.querySelectorAll(".map-route, .map-staging");
    nodes.forEach((n) => {
      const on = activeId && n.getAttribute("data-bird") === activeId;
      n.classList.toggle("map-route-active", !!on);
      n.classList.toggle("map-route-dim", !!activeId && !on);
    });
    markersG.querySelectorAll(".map-marker").forEach((m) => {
      const on = activeId && m.getAttribute("data-bird") === activeId;
      m.classList.toggle("map-marker-active", !!on);
      m.classList.toggle("map-marker-dim", !!activeId && !on);
    });
  }

  function renderCallout(id) {
    if (!id) return showEmpty();
    const r = roster.find((x) => x.id === id);
    if (!r) return showEmpty();
    const factsHtml = r.calloutFacts
      .map(
        (f) =>
          '<div class="callout-fact"><b>' + f.title + "</b><span>" + f.text + "</span></div>"
      )
      .join("");
    const badgeCls = r.playable ? "mode-badge mode-badge-playable" : "mode-badge";
    calloutEl.innerHTML =
      '<div class="callout-head">' +
      '<span class="' + badgeCls + '">' + r.modeLabel + "</span>" +
      (r.playable ? '<span class="callout-playable">Playable now</span>' : "") +
      "</div>" +
      '<div class="callout-name">' + r.commonName + "</div>" +
      '<div class="callout-tagline">' + r.tagline + "</div>" +
      '<div class="callout-distance">' + r.flywayName + " · " + r.distance + "</div>" +
      '<div class="callout-facts">' + factsHtml + "</div>" +
      '<button class="btn btn-primary btn-sm callout-select">' +
      (r.playable ? "Fly this journey →" : "Preview this journey →") +
      "</button>";
    const btn = calloutEl.querySelector(".callout-select");
    btn.onclick = () => {
      if (onSelect) onSelect(r);
    };
  }

  function showEmpty() {
    calloutEl.innerHTML =
      '<div class="map-callout-empty">Hover or select a bird on the map to learn its migration story.</div>';
  }

  function render(opts) {
    svg = opts.svg;
    calloutEl = opts.callout;
    roster = opts.roster;
    onSelect = opts.onSelect;
    routesG = svg.querySelector("#map-routes");
    markersG = svg.querySelector("#map-markers");
    buildRoutes();
    buildMarkers();
    activeId = null;
    selectedId = null;
    updateHighlight();
    showEmpty();
  }

  function reset() {
    activeId = null;
    selectedId = null;
    updateHighlight();
    showEmpty();
  }

  return { render, reset };
})();
