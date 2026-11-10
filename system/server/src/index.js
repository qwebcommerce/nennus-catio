import "./loadEnv.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";
import { hasPublicImageBaseConfigured } from "./lib/productImageUrl.js";

const port = Number(process.env.PORT) || 4000;
const isVercel = Boolean(process.env.VERCEL);
const clientIndex = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist/index.html"
);
const servingClient =
  process.env.SERVE_CLIENT === "true" ||
  process.env.SERVE_CLIENT === "1" ||
  fs.existsSync(clientIndex);

export default app;

if (!isVercel) {
  app.listen(port, () => {
    console.log(`API: http://localhost:${port}`);
    console.log(`Health: http://localhost:${port}/api/health`);
    if (servingClient) {
      console.log(`App (UI+API on one port): http://localhost:${port}`);
    } else {
      console.log(`Dev UI (Vite): http://localhost:5173  — use: npm run dev (from system/)`);
    }
    if (hasPublicImageBaseConfigured()) {
      console.log(
        "[صور] PUBLIC_IMAGE_BASE_URL / SUPABASE_PUBLIC_IMAGE_PREFIX: مضبوط (مسارات نسبية تُكمَّل)"
      );
    } else {
      console.log(
        "[صور] لا توجد بادئة صور في .env — ضع PUBLIC_IMAGE_BASE_URL إن كانت الصور مسارات نسبية فقط"
      );
    }
  });
}
