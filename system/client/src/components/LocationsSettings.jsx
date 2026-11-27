import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useBranchContext } from "../context/BranchContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { apiErrorMessage } from "../utils/apiError.js";

/**
 * Settings → Locations: Arabic and English names of every location and the one main location
 * (showroom / store). Each save sends the location's version (NFR-13); a stale copy reloads it.
 * Adding, deactivating and deleting locations stays on the Locations screen (link).
 */
export default function LocationsSettings() {
  const { t, locale } = useI18n();
  const { showToast } = useToast();
  const { reloadBranches } = useBranchContext();
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    const list = await api("/api/branches");
    const items = Array.isArray(list) ? list : [];
    setRows(items);
    setDrafts(Object.fromEntries(items.map((b) => [b.id, { name: b.name || "", nameEn: b.nameEn || "" }])));
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const failed = async (err) => {
    showToast(isStaleEdit(err) ? editErrorMessage(err, t) : apiErrorMessage(err, t), "error");
    if (isStaleEdit(err)) await load().catch(() => {});
  };

  const saveNames = async (b) => {
    const draft = drafts[b.id] || {};
    if (!draft.name?.trim()) {
      showToast(t("branches.nameRequired"), "error");
      return;
    }
    setBusyId(b.id);
    try {
      await api(`/api/branches/${b.id}`, {
        method: "PATCH",
        body: { name: draft.name.trim(), nameEn: draft.nameEn.trim() || null, version: b.version },
      });
      await load();
      await reloadBranches?.();
      showToast(t("shop.saved"), "success");
    } catch (err) {
      await failed(err);
    } finally {
      setBusyId("");
    }
  };

  const makeMain = async (b) => {
    setBusyId(b.id);
    try {
      await api(`/api/branches/${b.id}/main`, { method: "POST", body: { version: b.version } });
      await load();
      await reloadBranches?.();
      showToast(t("branches.mainSaved"), "success");
    } catch (err) {
      await failed(err);
    } finally {
      setBusyId("");
    }
  };

  const dirty = (b) => {
    const d = drafts[b.id];
    return d && (d.name !== (b.name || "") || d.nameEn !== (b.nameEn || ""));
  };

  return (
    <section className="settings-card settings-locations" aria-labelledby="settings-locations-heading">
      <h2 id="settings-locations-heading">{t("settings.locations")}</h2>
      <p>{t("settings.locationsHint")}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((b) => (
          <div key={b.id} className="settings-location-row" data-branch={b.id} style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 14 }}>
                {(locale === "en" ? b.nameEn || b.name : b.name) || b.id}
                <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {t(`branches.kind.${b.kind || "SHOP"}`)}</span>
                {b.isActive === false ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {t("setup.inactive")}</span> : null}
              </strong>
              <label className="settings-check" style={{ margin: 0 }} title={b.kind === "VAN" ? t("branches.mainNoVan") : undefined}>
                <input
                  type="radio"
                  name="main-location"
                  checked={Boolean(b.isMain)}
                  disabled={busyId !== "" || b.kind === "VAN" || b.isActive === false}
                  onChange={() => makeMain(b)}
                />
                <span>{t("branches.mainBadge")}</span>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <label style={fieldStyle}>
                <span>{t("branches.nameAr")}</span>
                <input
                  dir="rtl"
                  value={drafts[b.id]?.name ?? ""}
                  onChange={(e) => setDrafts((all) => ({ ...all, [b.id]: { ...all[b.id], name: e.target.value } }))}
                  maxLength={120}
                />
              </label>
              <label style={fieldStyle}>
                <span>{t("branches.nameEn")}</span>
                <input
                  dir="ltr"
                  value={drafts[b.id]?.nameEn ?? ""}
                  onChange={(e) => setDrafts((all) => ({ ...all, [b.id]: { ...all[b.id], nameEn: e.target.value } }))}
                  maxLength={120}
                />
              </label>
            </div>
            <div>
              <button
                type="button"
                className="btn-touch"
                disabled={!dirty(b) || busyId !== ""}
                onClick={() => saveNames(b)}
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 12 }}>
        <Link to="/branches">{t("settings.manageLocations")}</Link>
      </p>
    </section>
  );
}

const rowStyle = { display: "grid", gap: 8, padding: 10, border: "1px solid var(--border)", borderRadius: 12, minWidth: 0 };
const fieldStyle = { display: "grid", gap: 4, fontSize: 13, minWidth: 0 };
