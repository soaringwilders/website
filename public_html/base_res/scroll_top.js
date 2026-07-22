// ── Floating "scroll to top" button (shared across Avian Data Explorer pages) ──
(function () {
    const SHOW_AFTER_PX = 400;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("scroll-top-btn");
        if (!btn) return;

        let ticking = false;
        function update() {
            ticking = false;
            btn.classList.toggle("is-visible", window.scrollY > SHOW_AFTER_PX);
        }
        window.addEventListener(
            "scroll",
            () => {
                if (!ticking) {
                    ticking = true;
                    requestAnimationFrame(update);
                }
            },
            { passive: true },
        );

        btn.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });

        update();
    });
})();
