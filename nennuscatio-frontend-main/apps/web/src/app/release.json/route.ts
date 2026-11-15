/**
 * The release this website was built from (13b): `deploy/release.sh` builds with the commit as
 * `NEXT_PUBLIC_RELEASE`. Open admin tabs compare it with the release they were loaded from. A
 * development build has none. The dot keeps the address outside the language routes (`proxy.ts`).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ release: process.env.NEXT_PUBLIC_RELEASE || null }, { headers: { "Cache-Control": "no-store" } });
}
