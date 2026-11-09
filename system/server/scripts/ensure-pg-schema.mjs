import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const raw = fs.readFileSync(schemaPath, "utf8");

if (/provider\s*=\s*"sqlite"/i.test(raw)) {
  console.error(
    "[ensure-pg-schema] prisma/schema.prisma ما زال sqlite — غيّره إلى postgresql وادفع الكود ثم أعد النشر."
  );
  process.exit(1);
}

if (!/provider\s*=\s*"postgresql"/i.test(raw)) {
  console.error("[ensure-pg-schema] provider غير معروف في schema.prisma");
  process.exit(1);
}

console.log("[ensure-pg-schema] OK — datasource هو postgresql");
