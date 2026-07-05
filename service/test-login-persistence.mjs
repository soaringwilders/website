/**
 * Playwright headed test — login persistence via HttpOnly refresh cookie
 *
 * Steps:
 *  1. Open browser -> http://localhost:3000/service (should land on login page)
 *  2. Log in as nabeel / LeeBan
 *  3. Verify spark_saver page shows "Nabeel"
 *  4. Close browser
 *  5. Open a NEW browser (same persistent profile, so cookie survives on disk)
 *  6. Navigate to http://localhost:3000/service
 *  7. Verify already logged in as nabeel (spark page rendered, no login prompt)
 */

import { chromium } from "playwright";
import path from "path";
import os from "os";
import fs from "fs";

const BASE = "http://localhost:3000";
const USER_DATA_DIR = path.join(os.tmpdir(), "pw-soaring-wild-profile");

// Clean slate each run
if (fs.existsSync(USER_DATA_DIR)) fs.rmSync(USER_DATA_DIR, { recursive: true });

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

async function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Step 1-4: first browser session ──────────────────────────────────────────

log("=== SESSION 1: opening browser ===");
const ctx1 = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  slowMo: 400,
  viewport: { width: 430, height: 812 },
  args: ["--window-size=500,900"],
});

const page1 = await ctx1.newPage();

log("Navigating to /service …");
await page1.goto(`${BASE}/service`);
await page1.waitForLoadState("networkidle");

const url1 = page1.url();
log(`Landed on: ${url1}`);
if (!url1.includes("/service/login") && !url1.includes("/service/")) {
  throw new Error(`Unexpected URL: ${url1}`);
}

// Should be on login page
log("Filling login form …");
await page1.fill("#username", "nabeel");
await page1.fill("#password", "LeeBan");

log("Submitting …");
// click and wait for any navigation away from the login page
const [response] = await Promise.all([
  page1.waitForNavigation({ timeout: 15_000, waitUntil: "networkidle" }),
  page1.click("#btn"),
]);
log(`Navigated to: ${page1.url()} (status: ${response?.status()})`);

// If somehow still on login (e.g. error shown), fail early
if (page1.url().includes("/login") || page1.url() === `${BASE}/service/`) {
  const errText = await page1.textContent("#error").catch(() => "");
  throw new Error(`Login failed or still on login page. Error: "${errText}"`);
}

// Verify "Nabeel" is shown
await page1.waitForSelector("#sparkName", { timeout: 8_000 });
const sparkName = await page1.textContent("#sparkName");
log(`sparkName element text: "${sparkName}"`);
if (sparkName !== "Nabeel") {
  throw new Error(`Expected "Nabeel", got "${sparkName}"`);
}
log("✓ spark page shows Nabeel");

// Let the user see the page for a moment
await pause(2000);

log("=== SESSION 1: closing browser ===");
await ctx1.close();
await pause(1500); // brief pause so the user can see it close

// ── Step 5-7: second browser session — cookie should still be there ───────────

log("=== SESSION 2: opening NEW browser (same profile dir) ===");
const ctx2 = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  slowMo: 400,
  viewport: { width: 430, height: 812 },
  args: ["--window-size=500,900"],
});

const page2 = await ctx2.newPage();

log("Navigating to /service (login page should auto-redirect via refresh cookie) …");
await page2.goto(`${BASE}/service`);
// login.html fires /auth/refresh immediately; on success it redirects to /service/spark/
// which then runs APP.init() → _silentRefresh() → shows the app.
await page2.waitForURL(`${BASE}/service/spark/`, { timeout: 10_000 });
await page2.waitForLoadState("networkidle");
await pause(1500); // let APP.init() finish

const finalUrl = page2.url();
log(`Final URL: ${finalUrl}`);

if (finalUrl.includes("/login")) {
  throw new Error("FAIL: redirected to login — cookie did not persist!");
}

// Verify sparkName shows nabeel
await page2.waitForSelector("#sparkName", { timeout: 8_000 });
const sparkName2 = await page2.textContent("#sparkName");
log(`sparkName element text: "${sparkName2}"`);
if (sparkName2 !== "Nabeel") {
  throw new Error(`Expected "Nabeel" on second session, got "${sparkName2}"`);
}
log("✓ SESSION 2: user Nabeel is already logged in — cookie persisted!");

await pause(3000); // let the user see the result

await ctx2.close();

log("=== ALL CHECKS PASSED ===");
