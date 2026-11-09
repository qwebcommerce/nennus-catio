/**
 * Generates PWA + favicon PNGs from the owner-dashboard Icodo mark.
 * Source: public/icodo-icon-dark.png (same asset as AppLayout sidebar).
 * Run: npm run icons
 */
import { copyFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourcePath = join(root, "public", "icodo-icon-dark.png");

if (!existsSync(sourcePath)) {
  console.error("Missing", sourcePath);
  process.exit(1);
}

const source = sharp(sourcePath).ensureAlpha();

for (const size of [192, 512]) {
  const out = join(root, "public", `pwa-${size}.png`);
  await source.clone().resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } }).png({ compressionLevel: 9 }).toFile(out);
  console.log("Wrote", out);
}

const favicon48 = join(root, "public", "favicon-48.png");
await source.clone().resize(48, 48, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } }).png({ compressionLevel: 9 }).toFile(favicon48);
console.log("Wrote", favicon48);

const apple = join(root, "public", "apple-touch-icon.png");
await source.clone().resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } }).png({ compressionLevel: 9 }).toFile(apple);
console.log("Wrote", apple);

copyFileSync(join(root, "public", "pwa-192.png"), join(root, "public", "favicon.png"));
console.log("Wrote public/favicon.png (copy of 192px)");

// Keep .ico in sync for older browsers (48px PNG packed as single-size ico via sharp-compatible png copy).
copyFileSync(favicon48, join(root, "public", "favicon.ico"));
console.log("Wrote public/favicon.ico (48px)");
