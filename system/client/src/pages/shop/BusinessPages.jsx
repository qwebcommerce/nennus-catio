import React, { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../context/LanguageContext.jsx";

function useBusiness() {
  const [business, setBusiness] = useState(null);
  useEffect(() => {
    api("/api/shop/meta").then((meta) => setBusiness(meta.business || null)).catch(() => setBusiness(null));
  }, []);
  return business;
}

export function ShopAbout() {
  const { t, locale } = useI18n();
  const business = useBusiness();
  return (
    <div className="nc-shell" style={{ padding: "28px 0 48px", display: "grid", gap: 10 }}>
      <h1>{business?.name || t("shop.about")}</h1>
      <p>{locale === "en" ? business?.hoursEn || business?.hours : business?.hours}</p>
      <p>{business?.address}</p>
    </div>
  );
}

export function ShopContact() {
  const { t } = useI18n();
  const business = useBusiness();
  const digits = String(business?.whatsapp || "").replace(/[^\d]/g, "");
  return (
    <div className="nc-shell" style={{ padding: "28px 0 48px", display: "grid", gap: 8 }}>
      <h1>{t("shop.contact")}</h1>
      {business?.phone ? <div>{business.phone}</div> : null}
      {business?.email ? <a href={`mailto:${business.email}`}>{business.email}</a> : null}
      {business?.address ? <div>{business.address}</div> : null}
      {digits ? <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">{t("shop.whatsapp")}</a> : null}
    </div>
  );
}
