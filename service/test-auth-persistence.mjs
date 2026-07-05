import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/service';
const SPARK = 'http://localhost:3000/service/spark/';
const USERNAME = 'nabeel';
const PASSWORD = 'LeeBan';

// ── Step 1: Open browser, navigate to /service ────────────────────────────
console.log('\n── STEP 1: Open browser → http://localhost:3000/service ──');
const browser1 = await chromium.launch({ headless: false, slowMo: 600 });
const ctx1 = await browser1.newContext();
const page1 = await ctx1.newPage();

await page1.goto(BASE);
console.log('  URL:', page1.url());

// ── Step 2: Log in as nabeel / LeeBan ────────────────────────────────────
console.log('\n── STEP 2: Log in with nabeel / LeeBan ──');
await page1.fill('#username', USERNAME);
await page1.fill('#password', PASSWORD);
await page1.click('button[type=submit]');

await page1.waitForURL('**/service/spark/', { timeout: 8000 });
await page1.waitForSelector('#sparkName', { timeout: 5000 });

const displayedName = await page1.textContent('#sparkName');
console.log('  URL after login:', page1.url());
console.log('  Displayed name:', displayedName);
console.log('  ✓ nabeel logged in:', displayedName.toLowerCase() === USERNAME);

// Pause so you can see the logged-in state
await page1.waitForTimeout(2500);

// Save cookies BEFORE closing the browser
const savedCookies = await ctx1.cookies();
const refreshCookie = savedCookies.find(c => c.name === 'refresh_token');
console.log('\n  Refresh cookie present:', !!refreshCookie);
console.log('  Cookie httpOnly:', refreshCookie?.httpOnly);
console.log('  Cookie expires (days):', refreshCookie
  ? Math.round((refreshCookie.expires - Date.now() / 1000) / 86400) + ' days'
  : 'n/a');

// ── Step 3: Close the browser ─────────────────────────────────────────────
console.log('\n── STEP 3: Closing browser ──');
await browser1.close();
console.log('  Browser closed.');

await new Promise(r => setTimeout(r, 1500));

// ── Step 4: Reopen browser, inject saved cookies, navigate to /service ────
console.log('\n── STEP 4: Reopen browser (with saved cookies) → /service/spark/ ──');
const browser2 = await chromium.launch({ headless: false, slowMo: 600 });
const ctx2 = await browser2.newContext();

// Simulate the browser remembering cookies across restarts
await ctx2.addCookies(savedCookies);

const page2 = await ctx2.newPage();

// Navigate straight to the spark page — spark_saver.html calls _silentRefresh()
// on load; if the cookie is valid it stays logged in, otherwise redirects to /service/login
await page2.goto(SPARK);

try {
  // If silent refresh succeeds, the page stays on /spark/ and renders the app
  await page2.waitForSelector('#sparkName', { timeout: 7000 });
  const displayedName2 = await page2.textContent('#sparkName');
  console.log('  URL:', page2.url());
  console.log('  Displayed name:', displayedName2);
  console.log('  ✓ Session persisted — nabeel still logged in:', displayedName2.toLowerCase() === USERNAME);
} catch {
  console.log('  URL after navigation:', page2.url());
  console.log('  ✗ Session did NOT persist — redirected to login');
}

await page2.waitForTimeout(3000);
await browser2.close();
console.log('\nDone.');
