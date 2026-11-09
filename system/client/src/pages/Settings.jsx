import React, { useEffect, useState } from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client.js";
import { useToast } from "../context/ToastContext.jsx";
import PrintSettings from "./PrintSettings.jsx";
import TaxSettingsPanel from "../components/TaxSettingsPanel.jsx";
import { LanguageSwitcher } from "../components/LanguageSwitcher.jsx";

const NOTIF_PREF_KEY = "pos-notifications-enabled";

function readNotifPref() {
  try {
    const v = localStorage.getItem(NOTIF_PREF_KEY);
    if (v === null) {
      return typeof Notification !== "undefined" && Notification.permission === "granted";
    }
    return v === "true";
  } catch {
    return false;
  }
}

function SettingRow({ label, hint, control }) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <div className="settings-row-label">{label}</div>
        {hint ? <div className="settings-row-hint">{hint}</div> : null}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { user, isAdmin, isManager, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [notifEnabled, setNotifEnabled] = useState(readNotifPref);
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [associatePay, setAssociatePay] = useState(() => user?.associateCanAcceptPayment !== false);
  const [associatePayBusy, setAssociatePayBusy] = useState(false);

  useEffect(() => {
    setAssociatePay(user?.associateCanAcceptPayment !== false);
  }, [user?.associateCanAcceptPayment]);

  useEffect(() => {
    if (!isAdmin && !isManager) return undefined;
    let cancelled = false;
    api("/api/org-settings")
      .then((s) => {
        if (!cancelled) setAssociatePay(s?.associateCanAcceptPayment !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isManager]);

  const toggleAssociatePayment = async () => {
    const next = !associatePay;
    setAssociatePayBusy(true);
    try {
      const s = await api("/api/org-settings", {
        method: "PATCH",
        body: { associateCanAcceptPayment: next },
      });
      setAssociatePay(s?.associateCanAcceptPayment !== false);
      if (typeof refreshUser === "function") await refreshUser();
      showToast(
        next ? t("settings.associatePayOn") : t("settings.associatePayOff"),
        "success"
      );
    } catch (e) {
      showToast(e.message || t("settings.associatePayFail"), "error");
    } finally {
      setAssociatePayBusy(false);
    }
  };

  const toggleNotifications = async () => {
    if (typeof Notification === "undefined") {
      setNotifPermission("unsupported");
      return;
    }
    if (notifEnabled) {
      setNotifEnabled(false);
      try {
        localStorage.setItem(NOTIF_PREF_KEY, "false");
      } catch {
        /* ignore */
      }
      return;
    }
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
      setNotifPermission(permission);
    } else {
      setNotifPermission(permission);
    }
    const on = permission === "granted";
    setNotifEnabled(on);
    try {
      localStorage.setItem(NOTIF_PREF_KEY, String(on));
    } catch {
      /* ignore */
    }
  };

  const notifHint =
    notifPermission === "unsupported"
      ? t("nav.settings.notificationsUnsupported")
      : notifPermission === "denied"
        ? t("nav.settings.notificationsDenied")
        : notifEnabled
          ? t("nav.settings.notificationsOn")
          : t("nav.settings.notificationsOff");

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>{t("settings.title")}</h1>
        <p>{t("settings.intro")}</p>
      </header>

      <section className="settings-card" aria-labelledby="settings-prefs-heading">
        <h2 id="settings-prefs-heading">{t("settings.preferences")}</h2>

        <SettingRow
          label={t("nav.settings.notifications")}
          hint={notifHint}
          control={
            <button
              type="button"
              className={`settings-switch${notifEnabled ? " is-on" : ""}`}
              role="switch"
              aria-checked={notifEnabled}
              disabled={notifPermission === "unsupported" || notifPermission === "denied"}
              onClick={toggleNotifications}
            >
              <span className="settings-switch-knob" />
            </button>
          }
        />

        <SettingRow
          label={t("nav.settings.theme")}
          hint={theme === "dark" ? t("theme.darkTitle") : t("theme.lightTitle")}
          control={
            <button
              type="button"
              className={`settings-switch${theme === "dark" ? " is-on" : ""}`}
              role="switch"
              aria-checked={theme === "dark"}
              onClick={toggleTheme}
              title={theme === "dark" ? t("theme.lightTitle") : t("theme.darkTitle")}
            >
              <span className="settings-switch-knob" />
            </button>
          }
        />

        <SettingRow
          label={t("nav.settings.language")}
          hint={t("lang.hint")}
          control={<LanguageSwitcher variant="segmented" />}
        />
      </section>

      {isAdmin || isManager ? (
        <section className="settings-card" aria-labelledby="settings-floor-heading">
          <h2 id="settings-floor-heading">{t("settings.floorSales")}</h2>
          <SettingRow
            label={t("settings.associateCanPay")}
            hint={t("settings.associateCanPayHint")}
            control={
              <button
                type="button"
                className={`settings-switch${associatePay ? " is-on" : ""}`}
                role="switch"
                aria-checked={associatePay}
                disabled={associatePayBusy}
                onClick={toggleAssociatePayment}
              >
                <span className="settings-switch-knob" />
              </button>
            }
          />
        </section>
      ) : null}

      <TaxSettingsPanel />

      <section className="settings-print" aria-label={t("nav.printSettings")}>
        <PrintSettings />
      </section>
    </div>
  );
}
