// ── Bird Detail renderer ─────────────────────────────────────────────────
// Shared module. Call BirdDetail.open(row) for modal, or
// BirdDetail.renderPage(row, containerEl) to render into any element.
(function () {
    const HABITAT_LABELS = {
        HABITAT_F:  "Forest",    HABITAT_BM: "Bamboo",     HABITAT_WD: "Woodland",
        HABITAT_SH: "Shrubland", HABITAT_SV: "Savanna",    HABITAT_G:  "Grassland",
        HABITAT_PL: "Plains",    HABITAT_R:  "Rocky areas", HABITAT_D:  "Desert",
        HABITAT_A:  "Artificial", HABITAT_RV: "Riparian",  HABITAT_C:  "Coast",
        HABITAT_W:  "Wetland",   HABITAT_SE: "Open Sea",
    };

    const DIET_ITEMS = [
        { key: "DIET_IN", label: "Invertebrates", color: "#3aa39a" },
        { key: "DIET_FR", label: "Fruit",         color: "#d65a9a" },
        { key: "DIET_NE", label: "Nectar",        color: "#8e5fc7" },
        { key: "DIET_SE", label: "Seed",          color: "#d7b864" },
        { key: "DIET_VE", label: "Vertebrates",   color: "#c0492f" },
        { key: "DIET_FI", label: "Fish",          color: "#3d7bc0" },
        { key: "DIET_SC", label: "Scavenger",     color: "#8a7a66" },
        { key: "DIET_PL", label: "Plants",        color: "#6f9b3f" },
        { key: "DIET_MS", label: "Misc.",         color: "#8d97a3" },
    ];

    const STATUS_COLORS = {
        "EX": "#111111", "EW": "#3a2a2a",
        "CR (PE)": "#7a0d0d", "CR (PEW)": "#7a0d0d", "CR": "#9b1b1b",
        "EN": "#d1582b", "VU": "#e0a52e", "NT": "#b8c24a",
        "LC": "#5aa45a", "DD": "#b8bcc4",
    };
    const STATUS_LABELS = {
        "EX": "Extinct", "EW": "Extinct in the Wild",
        "CR (PE)": "Critically Endangered (Possibly Extinct)",
        "CR (PEW)": "Critically Endangered (Possibly Extinct in Wild)",
        "CR": "Critically Endangered", "EN": "Endangered", "VU": "Vulnerable",
        "NT": "Near-threatened", "LC": "Least Concern", "DD": "Data Deficient",
    };
    const LAT_LABELS = {
        1: "Tropical", 2: "Tropical–Temperate", 3: "Temperate",
        4: "Temperate–Polar", 5: "Tropical–Polar",
    };
    const COOP_LABELS = {
        0: "Solitary breeder", 1: "Cooperative breeder",
        2: "Family member helper", 3: "Occasional help",
    };
    const NEST_TYPE_MAP = {
        BU: "Burrow", CP: "Cup/bowl", CR: "Crevice", CV: "Cavity (tree)",
        DM: "Dome/oven", HC: "Half cup", NO: "No nest", O: "Other bird's nest",
        PL: "Platform", PN: "Pendant/bag", SA: "Saucer", SC: "Scrape",
        SP: "Sphere", M: "Mound",
    };
    const NEST_SBS_MAP = {
        A: "Bamboo", B: "Building", C: "Stump", G: "Ground", K: "Cactus",
        N: "Nest (invertebrate/other)", P: "Pole", R: "Rock",
        S: "Shrub/bush/vine", T: "Tree", W: "Water", Z: "Grass",
    };
    const INCUBATOR_LABELS = { F: "Female", M: "Male", B: "Both" };

    function esc(s) {
        return String(s ?? "").replace(/[&<>"]/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    function num(v) {
        return (v === null || v === undefined || v === "" || isNaN(+v)) ? null : +v;
    }

    function fmt(v, unit) {
        const n = num(v);
        if (n === null) return "—";
        return unit ? n.toLocaleString() + " " + unit : n.toLocaleString();
    }

    function fmtRange(min, max, unit) {
        const a = num(min), b = num(max);
        if (a === null && b === null) return "—";
        if (a === null) return fmt(b, unit);
        if (b === null) return fmt(a, unit);
        if (a === b) return fmt(a, unit);
        return `${a.toLocaleString()}–${b.toLocaleString()}${unit ? " " + unit : ""}`;
    }

    function fmtCodes(val, map) {
        if (!val || val === "null") return "—";
        return val.split(/[,/\s]+/).map(v => v.trim()).filter(Boolean)
            .map(v => map[v] ? `${map[v]} (${v})` : v).join(", ");
    }

    function fmtBool(v) {
        const n = num(v);
        if (n === null) return "—";
        return n ? "Yes" : "No";
    }

    function buildHTML(row) {
        const sci = [row.GENUS, row.SPECIES].filter(Boolean).join(" ");
        const statusColor = STATUS_COLORS[row.RED_LIST] || "#c9cdd4";
        const statusLabel = STATUS_LABELS[row.RED_LIST] || esc(row.RED_LIST) || "";

        const imgSrc = (row.GENUS && row.SPECIES)
            ? `base_res/img/birds/${row.GENUS}_${row.SPECIES}.jpg`
            : "base_res/img/birds/_generic.jpg";

        const dietBars = DIET_ITEMS.map(d => {
            const w = num(row[d.key]) || 0;
            if (!w) return "";
            const pct = Math.min(w / 10 * 100, 100).toFixed(1);
            return `<div class="bd-diet-row">
                <span class="bd-diet-label">${esc(d.label)}</span>
                <div class="bd-diet-bar-wrap"><div class="bd-diet-bar" style="width:${pct}%;background:${d.color}"></div></div>
                <span class="bd-diet-val">${w}</span>
            </div>`;
        }).join("");

        const habPills = Object.entries(HABITAT_LABELS)
            .map(([k, label]) => ({ label, rank: num(row[k]) }))
            .filter(h => h.rank && h.rank > 0)
            .sort((a, b) => a.rank - b.rank)
            .map(h => `<span class="bd-hab-pill"><span class="bd-hab-rank">${h.rank}</span>${esc(h.label)}</span>`)
            .join("");

        const socialTags = [
            [row.SOCIAL_1, "Colonial"], [row.SOCIAL_2, "Social flocks"],
            [row.SOCIAL_3, "Family groups"], [row.SOCIAL_4, "Pairs"],
            [row.SOCIAL_5, "Solitary"], [row.SOCIAL_6, "Lekking"],
        ].filter(([v]) => num(v) === 1)
         .map(([, l]) => `<span class="bd-tag">${l}</span>`).join("");

        const moveTags = [
            [row.MIGRATION, "Migratory"], [row.MIGRATION_ELEV, "Altitudinal"],
            [row.MIGRATION_IRREG, "Irruptive"], [row.MIGRATION_DISP, "Dispersive"],
            [row.MIGRATION_SED, "Sedentary"],
        ].filter(([v]) => num(v) >= 1)
         .map(([, l]) => `<span class="bd-tag">${l}</span>`).join("");

        const coopVal = num(row.COOPERATIVE_BREEDER);
        const coopStr = coopVal !== null ? (COOP_LABELS[coopVal] || String(coopVal)) : "—";
        const incubatorStr = INCUBATOR_LABELS[row.INCUBATOR] || esc(row.INCUBATOR || "—");

        return `
<div class="bd-hero">
  <div class="bd-img-wrap">
    <img class="bd-img"
         src="${esc(imgSrc)}"
         onerror="this.onerror=null;this.src='base_res/img/birds/_generic.jpg'"
         alt="${esc(row.COMMON_NAME || "")}">
  </div>
  <div class="bd-ident">
    <h2 class="bd-common-name">${esc(row.COMMON_NAME || "—")}</h2>
    ${sci ? `<div class="bd-sci-name">${esc(sci)}</div>` : ""}
    <div class="bd-taxon-line">${esc(row.ORDER || "—")} &middot; ${esc(row.FAMILY || "—")}</div>
    <div class="bd-status-row">
      ${row.RED_LIST
        ? `<span class="bd-status-badge" style="background:${statusColor}">${esc(row.RED_LIST)}</span>
           <span class="bd-status-label">${statusLabel}</span>`
        : ""}
    </div>
    ${row.BANDING_CODE
        ? `<div class="bd-band-code">Banding code: <strong>${esc(row.BANDING_CODE)}</strong></div>`
        : ""}
  </div>
</div>

<div class="bd-sections">

  <section class="bd-section">
    <h3 class="bd-section-title">Range &amp; Status</h3>
    <dl class="bd-dl">
      <dt>Realm</dt><dd>${esc(row.REALM || "—")}</dd>
      <dt>Latitudinal range</dt><dd>${LAT_LABELS[num(row.LAT_RANGE)] || esc(row.LAT_RANGE) || "—"}</dd>
      <dt>Restricted range</dt><dd>${num(row.RESTRICTED_RANGE) === 1 ? "Yes (&lt;50,000 km²)" : num(row.RESTRICTED_RANGE) === 0 ? "No" : "—"}</dd>
    </dl>
  </section>

  <section class="bd-section">
    <h3 class="bd-section-title">Body Mass</h3>
    <dl class="bd-dl">
      <dt>Average</dt><dd>${fmt(row.MASS_AVG, "g")}</dd>
      <dt>Male</dt><dd>${fmtRange(row.MASS_MIN_M, row.MASS_MAX_M, "g")}</dd>
      <dt>Female</dt><dd>${fmtRange(row.MASS_MIN_F, row.MASS_MAX_F, "g")}</dd>
      <dt>Unsexed</dt><dd>${fmtRange(row.MASS_MIN, row.MASS_MAX, "g")}</dd>
    </dl>
  </section>

  <section class="bd-section">
    <h3 class="bd-section-title">Habitat</h3>
    <dl class="bd-dl">
      <dt>Primary</dt><dd>${esc(row.HABITAT_PRIMARY || "—")}</dd>
      <dt>Breadth</dt><dd>${row.HABITAT_BREADTH ?? "—"}</dd>
    </dl>
    ${habPills ? `<div class="bd-hab-list">${habPills}</div>` : ""}
  </section>

  <section class="bd-section">
    <h3 class="bd-section-title">Diet</h3>
    <dl class="bd-dl">
      <dt>Primary diet</dt><dd>${esc(row.DIET_PRIMARY || "—")}</dd>
      <dt>Breadth</dt><dd>${row.DIET_BREADTH ?? "—"}</dd>
      <dt>ESI</dt><dd>${num(row.DIET_ESI) !== null ? num(row.DIET_ESI).toFixed(3) : "—"}</dd>
    </dl>
    ${dietBars ? `<div class="bd-diet-bars">${dietBars}</div>` : ""}
    ${row.DIET_MS_DESC ? `<p class="bd-misc-desc"><span class="bd-field-key">Misc. diet:</span> ${esc(row.DIET_MS_DESC)}</p>` : ""}
  </section>

  <section class="bd-section">
    <h3 class="bd-section-title">Social Behavior</h3>
    <div class="bd-tag-group">${socialTags || "<span class=\"bd-empty\">—</span>"}</div>
    <dl class="bd-dl bd-dl--mt">
      <dt>Monogamous</dt><dd>${fmtBool(row.MONOGAMOUS)}</dd>
      <dt>Polygynous</dt><dd>${fmtBool(row.POLYGYNOUS)}</dd>
      <dt>Cooperative breeding</dt><dd>${coopStr}</dd>
    </dl>
  </section>

  <section class="bd-section">
    <h3 class="bd-section-title">Breeding</h3>
    <dl class="bd-dl">
      <dt>Nest type</dt><dd>${fmtCodes(row.NEST_TYPE, NEST_TYPE_MAP)}</dd>
      <dt>Nest substrate</dt><dd>${fmtCodes(row.NEST_SUBSTRATE, NEST_SBS_MAP)}</dd>
      <dt>Broods/year</dt><dd>${fmtRange(row.BROODS_MIN, row.BROODS_MAX)}</dd>
      <dt>Clutch size</dt><dd>${fmtRange(row.CLUTCH_MIN, row.CLUTCH_MAX, "eggs")}</dd>
      <dt>Incubator</dt><dd>${incubatorStr}</dd>
      <dt>Incubation period</dt><dd>${fmtRange(row.INCUBATION_MIN, row.INCUBATION_MAX, "days")}</dd>
      <dt>Fledgling period</dt><dd>${fmtRange(row.FLEDGLING_MIN, row.FLEDGLING_MAX, "days")}</dd>
      <dt>Nest parasite</dt><dd>${fmtBool(row.NEST_PARASITER)}</dd>
      <dt>Parasitized by others</dt><dd>${fmtBool(row.NEST_PARASITEE)}</dd>
      <dt>Breeding success</dt><dd>${fmtRange(row.BREEDING_SUCCESS_MIN, row.BREEDING_SUCCESS_MAX, "%")}</dd>
      <dt>Productivity</dt><dd>${fmtRange(row.PRODUCTIVITY_MIN, row.PRODUCTIVITY_MAX, "young/yr")}</dd>
    </dl>
  </section>

  <section class="bd-section">
    <h3 class="bd-section-title">Movement</h3>
    <div class="bd-tag-group">${moveTags || "<span class=\"bd-empty\">—</span>"}</div>
  </section>

</div>`;
    }

    let modalEl = null;

    function ensureModal() {
        if (modalEl) return;
        modalEl = document.createElement("div");
        modalEl.id = "bd-modal";
        modalEl.className = "bd-overlay";
        modalEl.setAttribute("role", "dialog");
        modalEl.setAttribute("aria-modal", "true");
        modalEl.setAttribute("aria-label", "Bird details");
        modalEl.hidden = true;
        modalEl.innerHTML =
            '<div class="bd-backdrop"></div>' +
            '<div class="bd-panel">' +
              '<button class="bd-close" aria-label="Close details">&times;</button>' +
              '<div class="bd-panel-body" id="bd-panel-body"></div>' +
            "</div>";
        document.body.appendChild(modalEl);

        modalEl.querySelector(".bd-backdrop").addEventListener("click", close);
        modalEl.querySelector(".bd-close").addEventListener("click", close);
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !modalEl.hidden) close();
        });
    }

    function open(row) {
        ensureModal();
        document.getElementById("bd-panel-body").innerHTML = buildHTML(row);
        modalEl.hidden = false;
        document.body.style.overflow = "hidden";
        modalEl.querySelector(".bd-panel").scrollTop = 0;
    }

    function close() {
        if (modalEl) {
            modalEl.hidden = true;
            document.body.style.overflow = "";
        }
    }

    function renderPage(row, container) {
        container.innerHTML = buildHTML(row);
    }

    window.BirdDetail = { open, close, renderPage };
})();
