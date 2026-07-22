// ── Shared hover-tooltip behaviour ──────────────────────────────────────
// Positioning/lifecycle extracted from the traits_constellation glyph
// tooltip (the most complete version — it clamps to the viewport, not
// just flips, so it never runs off-screen near the top/left edge).
// Content templates stay page-specific; this only standardizes the
// show/move/hide + pad/flip/clamp mechanics that were copy-pasted across
// every Data Explorer page's tooltip.
(function () {
    // Resolve this script's own folder so image paths work no matter how
    // deeply nested the consuming page is (root pages, wild_tracks_studio/, etc).
    const BASE_RES_URL = document.currentScript
        ? document.currentScript.src.replace(/hover_tooltip\.js(\?.*)?$/, "")
        : "base_res/";

    function esc(s) {
        return String(s ?? "").replace(/[&<>"]/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    // Creates (or adopts an existing) tooltip element and returns its
    // show/move/hide/bind controls. `id` should match a `<div id="…" hidden>`
    // already in the page markup so page-specific CSS keeps working unchanged;
    // if none exists one is created and appended to <body>.
    function create(id) {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            document.body.appendChild(el);
        }
        el.hidden = true;

        function move(evt) {
            if (el.hidden) return;
            const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
            let x = evt.clientX + pad, y = evt.clientY + pad;
            if (x + w > window.innerWidth) x = evt.clientX - w - pad;
            if (y + h > window.innerHeight) y = evt.clientY - h - pad;
            // Clamp — flipping alone isn't enough near the top/left edge,
            // where the flipped position can still land off-screen.
            x = Math.max(pad, Math.min(x, window.innerWidth - w - pad));
            y = Math.max(pad, Math.min(y, window.innerHeight - h - pad));
            el.style.left = x + "px";
            el.style.top = y + "px";
        }

        function show(html, evt) {
            el.innerHTML = html;
            el.hidden = false;
            move(evt);
        }

        function hide() {
            el.hidden = true;
        }

        // Convenience wiring for the common case: hover a target element,
        // render tooltip HTML from whatever data it's associated with, and
        // optionally open something on click.
        function bind(target, render, onClick) {
            target.addEventListener("mouseenter", e => show(render(e), e));
            target.addEventListener("mousemove", move);
            target.addEventListener("mouseleave", hide);
            if (onClick) target.addEventListener("click", e => { hide(); onClick(e); });
        }

        return { el, show, move, hide, bind };
    }

    function birdImgSrc(row) {
        return (row.GENUS && row.SPECIES)
            ? `${BASE_RES_URL}img/birds/${row.GENUS}_${row.SPECIES}.jpg`
            : `${BASE_RES_URL}img/birds/_generic.jpg`;
    }

    // Minimal "image + common name" factoid, for pages that hover a bird
    // name inside a chart/table without showing the full trait card.
    function birdMiniHTML(row) {
        return `<img class="ht-mini-img" src="${esc(birdImgSrc(row))}" alt="" ` +
            `onerror="this.onerror=null;this.src='${esc(BASE_RES_URL)}img/birds/_generic.jpg'">` +
            `<div class="ht-mini-name">${esc(row.COMMON_NAME || "—")}</div>`;
    }

    window.HoverTooltip = { create, esc, birdImgSrc, birdMiniHTML };
})();
