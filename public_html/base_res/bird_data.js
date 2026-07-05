// ── Shared bird base data loader ────────────────────────────────────────
// The bird base dataset never changes, so it is cached in localStorage
// after the first fetch. Every Data Explorer page can call BirdData.load()
// and will get the cached copy instead of hitting the service again.
(function () {
    const CACHE_KEY = "sowi:bird_base_data:v1";

    function serviceUrl(path) {
        const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
        return (local ? "http://localhost:3000" : "") + path;
    }

    async function load() {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) return JSON.parse(cached);
        } catch {
            // ignore unreadable cache, fall through to fetch
        }

        const res = await fetch(serviceUrl("/service/api/get_bird_base_data"));
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        const rows = await res.json();
        const data = Array.isArray(rows) ? rows : [];

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
            // storage full or unavailable — caching is best-effort
        }

        return data;
    }

    window.BirdData = { load, serviceUrl };
})();
