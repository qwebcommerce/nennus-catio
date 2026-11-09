/** Delete generated Prisma client then `prisma generate` (from server root). */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const legacyPrismaDir = path.join(serverRoot, "node_modules", ".prisma");
const generatedDir = path.join(serverRoot, "src", "generated", "prisma");

function clearReadonlyWin32(dir) {
  if (process.platform !== "win32" || !fs.existsSync(dir)) return;
  try {
    execSync(`attrib -R "${dir}\\*.*" /S /D`, { stdio: "ignore", shell: true });
  } catch {
    /* ignore */
  }
}

function rmDir(dir, label) {
  if (!fs.existsSync(dir)) return;
  try {
    clearReadonlyWin32(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("[prisma-generate-clean] removed", label, dir);
  } catch (e) {
    console.error(
      `[prisma-generate-clean] تعذر حذف ${label} — أغلق كل عمليات node ونافذة Cursor ثم أعد المحاولة:`,
      e.message
    );
    process.exit(1);
  }
}

rmDir(legacyPrismaDir, "node_modules/.prisma");
rmDir(generatedDir, "src/generated/prisma");

execSync("npm run db:generate", {
  cwd: serverRoot,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
