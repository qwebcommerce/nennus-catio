import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../../context/LanguageContext.jsx";

const linkStyle = ({ isActive }) => ({
  padding: "10px 14px",
  textDecoration: "none",
  fontWeight: 700,
  color: isActive ? "var(--accent)" : "var(--muted)",
  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
});

export default function HrLayout() {
  const { t } = useI18n();
  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ marginTop: 0 }}>{t("hr.title")}</h1>
      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <NavLink to="/hr/employees" style={linkStyle} end>
          {t("hr.navEmployees")}
        </NavLink>
        <NavLink to="/hr/payroll" style={linkStyle}>
          {t("hr.navPayroll")}
        </NavLink>
        <NavLink to="/hr/loans" style={linkStyle}>
          {t("hr.navLoans")}
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
