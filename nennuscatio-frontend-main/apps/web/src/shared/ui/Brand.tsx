"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * The Nennus Catio logo (D233): the cat with glasses and bow tie beside the NENNUS CATIO name,
 * cut from the supplied logo (`public/images/brand/`). `light` is the cream version for the
 * navy footer and the admin sidebar. The link is named "Nennus Catio"; the two images are
 * decorative. Each is sized in CSS by its height (`.brand__mark`, `.brand__name`).
 */
export function Brand({
  compact = false,
  light = false,
}: {
  compact?: boolean;
  light?: boolean;
}) {
  const t = useTranslations("Common");
  const tone = light ? "-light" : "";
  return (
    <Link
      href="/"
      className={`brand ${compact ? "brand--compact" : ""}`}
      aria-label={t("brand")}
    >
      <Image
        className="brand__mark"
        src={`/images/brand/nennus-catio-mark${tone}.png`}
        alt=""
        width={53}
        height={60}
        loading="eager"
      />
      <Image
        className="brand__name"
        src={`/images/brand/nennus-catio-wordmark${tone}.png`}
        alt=""
        width={152}
        height={50}
        loading="eager"
      />
    </Link>
  );
}
