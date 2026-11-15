import React, { useEffect, useState } from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client.js";
import { useToast } from "../context/ToastContext.jsx";
import PrintSettings from "./PrintSettings.jsx";
import TaxSettingsPanel from "../components/TaxSettingsPanel.jsx";
import { LanguageSwitcher } from "../components/LanguageSwitcher.jsx";
import { useBranchContext } from "../context/BranchContext.jsx";

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
  const { branches } = useBranchContext();
  const [websiteBranchId, setWebsiteBranchId] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [homeVisitFee, setHomeVisitFee] = useState("0");
  const [profile, setProfile] = useState({ phone: "", publicEmail: "", publicAddress: "", hoursText: "", hoursTextEn: "", notifyEmail: "", alertOrder: true, alertBooking: true, alertRelocation: true, alertLowStock: false });

  useEffect(() => {
    setAssociatePay(user?.associateCanAcceptPayment !== false);
  }, [user?.associateCanAcceptPayment]);

  useEffect(() => {
    if (!isAdmin && !isManager) return undefined;
    let cancelled = false;
    api("/api/org-settings")
      .then((s) => {
        if (!cancelled) {
          setAssociatePay(s?.associateCanAcceptPayment !== false);
          setWebsiteBranchId(s?.websiteBranchId || "");
          setWhatsappNumber(s?.whatsappNumber || "");
          setHomeVisitFee(s?.homeVisitFee != null ? String(s.homeVisitFee) : "0");
          setProfile({
            phone: s?.phone || "",
            publicEmail: s?.publicEmail || "",
            publicAddress: s?.publicAddress || "",
            hoursText: s?.hoursText || "",
            hoursTextEn: s?.hoursTextEn || "",
            notifyEmail: s?.notifyEmail || "",
            alertOrder: s?.alertOrder !== false,
            alertBooking: s?.alertBooking !== false,
            alertRelocation: s?.alertRelocation !== false,
            alertLowStock: s?.alertLowStock === true,
          });
        }
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

      {isAdmin ? (
        <section className="settings-card">
          <h2>{t("settings.websiteLocation")}</h2>
          <p>{t("settings.websiteLocationHint")}</p>
          <select
            value={websiteBranchId}
            onChange={async (e) => {
              const next = e.target.value;
              setWebsiteBranchId(next);
              try {
                const saved = await api("/api/org-settings", { method: "PATCH", body: { websiteBranchId: next || null } });
                setWebsiteBranchId(saved.websiteBranchId || "");
                showToast(t("common.save"), "success");
              } catch (err) {
                showToast(err.message, "error");
              }
            }}
          >
            <option value="">{t("shop.noLocation")}</option>
            {branches.filter((b) => b.isActive !== false && b.kind !== "VAN").map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <label>
            <span>{t("shop.whatsapp")}</span>
            <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="97433130153" />
          </label>
          <label>
            <span>{t("shop.homeFee")}</span>
            <input type="number" min="0" step="0.01" value={homeVisitFee} onChange={(e) => setHomeVisitFee(e.target.value)} />
          </label>
          {["phone", "publicEmail", "publicAddress", "hoursText", "hoursTextEn", "notifyEmail"].map((key) => (
            <label key={key}>
              <span>{t(`shop.${key}`)}</span>
              <input value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} />
            </label>
          ))}
          {["alertOrder", "alertBooking", "alertRelocation", "alertLowStock"].map((key) => (
            <label key={key}>
              <input type="checkbox" checked={Boolean(profile[key])} onChange={(e) => setProfile({ ...profile, [key]: e.target.checked })} />
              <span>{t(`shop.${key}`)}</span>
            </label>
          ))}
          <button
            type="button"
            className="btn-touch"
            onClick={async () => {
              try {
                const saved = await api("/api/org-settings", {
                  method: "PATCH",
                  body: { whatsappNumber, homeVisitFee: Number(homeVisitFee), ...profile },
                });
                setWhatsappNumber(saved.whatsappNumber || "");
                setHomeVisitFee(String(saved.homeVisitFee ?? 0));
                showToast(t("common.save"), "success");
              } catch (err) {
                showToast(err.message, "error");
              }
            }}
          >
            {t("common.save")}
          </button>
        </section>
      ) : null}

      <TaxSettingsPanel />

      <section className="settings-print" aria-label={t("nav.printSettings")}>
        <PrintSettings />
      </section>
    </div>
  );
}
