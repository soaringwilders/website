// ── Shared species search/typeahead ─────────────────────────────────────
// A small combobox: type a common or scientific name, pick a match from the
// dropdown (mouse or keyboard), get the row back via onSelect. Used by pages
// that need to locate one species among many plotted points (Bubble
// Explorer, Size & Life-History Scaling) instead of hovering blindly.
(function () {
    function esc(s) {
        return String(s ?? "").replace(/[&<>"]/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }
    function norm(s) { return String(s ?? "").toLowerCase(); }

    function matchScore(row, q) {
        const common = norm(row.COMMON_NAME);
        const sci = norm([row.GENUS, row.SPECIES].filter(Boolean).join(" "));
        if (common.startsWith(q)) return 0;
        if (sci.startsWith(q)) return 1;
        if (common.includes(q)) return 2;
        if (sci.includes(q)) return 3;
        return -1;
    }

    // create(opts):
    //   input     - the <input> element
    //   list      - the <ul>/<ol> element to render suggestions into
    //   clearBtn  - optional button that resets the search
    //   getRows   - () => full row array to search (evaluated fresh per keystroke,
    //               so it's safe to wire this up before the dataset has loaded)
    //   onSelect  - (row) => void, called when a suggestion is picked
    //   onClear   - () => void, called when the input is cleared/emptied
    //   maxResults - cap on suggestions shown (default 8)
    function create(opts) {
        const input = opts.input;
        const list = opts.list;
        const getRows = typeof opts.getRows === "function" ? opts.getRows : () => opts.rows || [];
        const maxResults = opts.maxResults || 8;
        let activeIdx = -1;
        let currentMatches = [];

        function closeList() {
            list.hidden = true;
            list.innerHTML = "";
            activeIdx = -1;
            currentMatches = [];
        }

        function updateActive() {
            [...list.children].forEach((li, i) => li.classList.toggle("is-active", i === activeIdx));
            const activeEl = list.children[activeIdx];
            if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
        }

        function renderList(q) {
            currentMatches = getRows()
                .map(row => ({ row, score: matchScore(row, q) }))
                .filter(m => m.score >= 0)
                .sort((a, b) => a.score - b.score || norm(a.row.COMMON_NAME).localeCompare(norm(b.row.COMMON_NAME)))
                .slice(0, maxResults)
                .map(m => m.row);

            if (!currentMatches.length) { closeList(); return; }

            list.innerHTML = currentMatches.map((row, i) => {
                const sci = [row.GENUS, row.SPECIES].filter(Boolean).join(" ");
                return `<li class="sp-search-item" data-idx="${i}">` +
                    `<span class="sp-item-name">${esc(row.COMMON_NAME || "—")}</span>` +
                    (sci ? `<span class="sp-item-sci">${esc(sci)}</span>` : "") +
                    `</li>`;
            }).join("");
            list.hidden = false;
            activeIdx = -1;
            updateActive();
        }

        function select(row) {
            closeList();
            input.value = row.COMMON_NAME || "";
            if (opts.onSelect) opts.onSelect(row);
        }

        function clear() {
            input.value = "";
            closeList();
            if (opts.onClear) opts.onClear();
        }

        input.addEventListener("input", () => {
            const q = norm(input.value.trim());
            if (!q) { closeList(); if (opts.onClear) opts.onClear(); return; }
            renderList(q);
        });

        input.addEventListener("keydown", e => {
            if (list.hidden || !currentMatches.length) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, currentMatches.length - 1);
                updateActive();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, 0);
                updateActive();
            } else if (e.key === "Enter") {
                e.preventDefault();
                const row = currentMatches[activeIdx] ?? currentMatches[0];
                if (row) select(row);
            } else if (e.key === "Escape") {
                closeList();
            }
        });

        // mousedown (not click) fires before the input's blur handler closes
        // the list, so the suggestion is still in the DOM to read from.
        list.addEventListener("mousedown", e => {
            const li = e.target.closest(".sp-search-item");
            if (!li) return;
            e.preventDefault();
            const row = currentMatches[Number(li.dataset.idx)];
            if (row) select(row);
        });

        input.addEventListener("blur", () => setTimeout(closeList, 120));

        if (opts.clearBtn) opts.clearBtn.addEventListener("click", clear);

        return { clear };
    }

    window.SpeciesSearch = { create };
})();
