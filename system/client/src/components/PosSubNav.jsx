import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

/** POS area sub-navigation: Till | B2B / Wholesale. Shown only to people who may open B2B. */
export default function PosSubNav() {
  const { t } = useI18n();
  const { can, canModule } = useAuth();
  if (!canModule("b2b", "view")) return null;
  const cls = ({ isActive }) => `pos-subnav__link${isActive ? " is-active" : ""}`;
  return (
    <nav className="pos-subnav" aria-label={t("b2b.posArea")}>
      {can("pos") ? (
        <NavLink to="/pos" end className={cls}>
          {t("b2b.till")}
        </NavLink>
      ) : null}
      <NavLink to="/pos/b2b" className={cls}>
        {t("b2b.title")}
      </NavLink>
    </nav>
  );
}
