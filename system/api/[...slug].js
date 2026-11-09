/** CommonJS (see api/package.json) + dynamic import() لتجنب ERR_REQUIRE_ESM */
let app;

function ensureApiPrefix(req) {
  const fix = (u) => {
    if (!u || typeof u !== "string") return u;
    if (u.startsWith("/api")) return u;
    if (u === "/" || u === "") return "/api/";
    return "/api" + (u.startsWith("/") ? u : "/" + u);
  };
  if (req.url) req.url = fix(req.url);
  if (req.originalUrl) req.originalUrl = fix(req.originalUrl);
}

async function getApp() {
  if (!app) {
    await import("../server/src/loadEnv.js");
    const mod = await import("../server/src/app.js");
    app = mod.default;
  }
  return app;
}

module.exports = async (req, res) => {
  try {
    ensureApiPrefix(req);
    const expressApp = await getApp();
    return expressApp(req, res);
  } catch (e) {
    console.error("[api]", e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: e?.message || "خطأ في الخادم",
          code: e?.code,
        })
      );
    }
  }
};
