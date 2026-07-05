const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const mysql = require("mysql2/promise");

const IS_PROD = process.env.NODE_ENV === "production";

if (!IS_PROD) {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
}

const app = express();
const router = express.Router();
const PORT = process.env.PORT || 3000;

if (!IS_PROD) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:60193");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

// Secrets — loaded from env vars if set, otherwise persisted to .secrets.json
// so they survive server restarts (enabling persistent login via the refresh cookie).
const SECRETS_FILE = path.join(__dirname, ".secrets.json");
function loadOrCreateSecrets() {
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_REFRESH_SECRET) {
    return {
      access: process.env.JWT_ACCESS_SECRET,
      refresh: process.env.JWT_REFRESH_SECRET,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(SECRETS_FILE, "utf8"));
  } catch {
    const s = {
      access: crypto.randomBytes(32).toString("hex"),
      refresh: crypto.randomBytes(32).toString("hex"),
    };
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(s));
    return s;
  }
}
const { access: ACCESS_SECRET, refresh: REFRESH_SECRET } =
  loadOrCreateSecrets();

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ── helpers ────────────────────────────────────────────────────────────────

function issueAccessToken(username) {
  return jwt.sign({ username }, ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function issueRefreshToken(username) {
  return jwt.sign({ username }, REFRESH_SECRET, {
    expiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000) + "s",
  });
}

function setRefreshCookie(res, token) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict",
    path: "/service/auth/", // covers both /service/auth/refresh and /service/auth/logout
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict",
    path: "/service/auth/",
  });
}

function getCredentials() {
  const raw = process.env.ADMIN_CREDENTIALS;
  if (!raw)
    // passwd "test"
    return {
      david: "$2a$10$SscKC53yNxpKhFf9OIhflO/lKt3RpeB0H/Zu1XAV4qWmYU9F9qqFe",
      nabeel: "$2a$10$SscKC53yNxpKhFf9OIhflO/lKt3RpeB0H/Zu1XAV4qWmYU9F9qqFe",
    };
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── middleware ─────────────────────────────────────────────────────────────

app.use(express.json());
app.use(cookieParser());
app.use(
  "/service/data",
  express.static(path.join(__dirname, "public", "data")),
);
app.use("/service/res", express.static(path.join(__dirname, "public", "res")));

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(header.slice(7), ACCESS_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// ── auth routes ────────────────────────────────────────────────────────────

// POST /service/auth/login
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  const credentials = getCredentials();
  const hash = credentials[username];
  if (!hash || !(await bcrypt.compare(password, hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = issueAccessToken(username);
  const refreshToken = issueRefreshToken(username);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken });
});

// POST /service/auth/refresh  — browser sends HttpOnly cookie automatically
router.post("/auth/refresh", (req, res) => {
  const token = req.cookies.refresh_token;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  let payload;
  try {
    payload = jwt.verify(token, REFRESH_SECRET);
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  // Rotate: issue new access + refresh tokens
  const newAccessToken = issueAccessToken(payload.username);
  const newRefreshToken = issueRefreshToken(payload.username);
  setRefreshCookie(res, newRefreshToken);
  res.json({ accessToken: newAccessToken });
});

// POST /service/auth/logout
router.post("/auth/logout", (_req, res) => {
  clearRefreshCookie(res);
  res.json({ ok: true });
});

// ── Data file routes ───────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "public", "data");

// GET /service/api/data — list .json files
router.get("/api/data", requireAuth, (_req, res) => {
  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
    res.json({ files });
  } catch {
    res.status(500).json({ error: "Could not list data files" });
  }
});

// GET /service/api/data/:file — read file
router.get("/api/data/:file", requireAuth, (req, res) => {
  const name = req.params.file.replace(/[^a-zA-Z0-9_\-]/g, "");
  const filePath = path.join(DATA_DIR, name + ".json");
  if (!filePath.startsWith(DATA_DIR + path.sep) && filePath !== DATA_DIR)
    return res.status(400).json({ error: "Invalid filename" });
  try {
    res.json(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    res.status(404).json({ error: "File not found or invalid JSON" });
  }
});

// PUT /service/api/data/:file — write full array back to file
router.put("/api/data/:file", requireAuth, (req, res) => {
  const name = req.params.file.replace(/[^a-zA-Z0-9_\-]/g, "");
  const filePath = path.join(DATA_DIR, name + ".json");
  if (!filePath.startsWith(DATA_DIR + path.sep) && filePath !== DATA_DIR)
    return res.status(400).json({ error: "Invalid filename" });
  if (!Array.isArray(req.body))
    return res.status(400).json({ error: "Body must be a JSON array" });
  try {
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not write file" });
  }
});

// ── Birds base data ────────────────────────────────────────────────────────

// The dataset is static, so once loaded it's kept in memory for the life of
// the process instead of re-querying the database on every request.
let birdBaseDataCache = null;

// GET /service/api/get_bird_base_data
router.get("/api/get_bird_base_data", async (_req, res) => {
  if (birdBaseDataCache) return res.json(birdBaseDataCache);

  let conn;
  try {
    conn = await mysql.createConnection({
      host: "localhost",
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
    });
    const [rows] = await conn.execute("SELECT * FROM BIRDS_BASE_DATA");
    birdBaseDataCache = rows;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// ── GAS proxy routes ───────────────────────────────────────────────────────

const GAS_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyGAlU50pEPWoxtirtzTMEyF1aYlJbuPpq9rteXgEtnMO0qhngQrOLvmjKG1gde2UUsig/exec";

// GET /service/api/sparks
router.get("/api/sparks", requireAuth, async (_req, res) => {
  if (!GAS_URL)
    return res
      .status(503)
      .json({ notes: [], categories: [], error: "GAS_URL not configured" });
  try {
    const r = await fetch(GAS_URL + "?op=get_spark_data", {
      redirect: "follow",
    });
    res.json(await r.json());
  } catch {
    res
      .status(502)
      .json({ notes: [], categories: [], error: "Upstream error" });
  }
});

// POST /service/api/sparks  (op: ADD | UPDATE | DELETE)
router.post("/api/sparks", requireAuth, async (req, res) => {
  if (!GAS_URL)
    return res
      .status(503)
      .json({ notes: [], categories: [], error: "GAS_URL not configured" });
  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    res.json(await r.json());
  } catch {
    res
      .status(502)
      .json({ notes: [], categories: [], error: "Upstream error" });
  }
});

// ── page routes ────────────────────────────────────────────────────────────

router.get(["/", "/login"], (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

router.get("/admin/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin_landing.html"));
});

router.get("/data-manager/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "data_manager.html"));
});

router.get("/spark/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "spark_saver.html"));
});

// ── healthcheck ────────────────────────────────────────────────────────────

router.get("/healthcheck", (_req, res) => {
  res.json({ status: "up", time: new Date().toISOString() });
});

// ── mount router ───────────────────────────────────────────────────────────

app.use("/service", router);

// ── start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
