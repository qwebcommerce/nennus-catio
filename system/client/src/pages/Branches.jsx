import React, { useEffect, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useBranchContext } from "../context/BranchContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { apiErrorMessage } from "../utils/apiError.js";
import { EmptyState } from "../components/EmptyState.jsx";
import { LOCATION_KINDS } from "../lib/locationKinds.js";

export default function Branches() {
  const { t, locale } = useI18n();
  const { refreshUser } = useAuth();
  const { reloadBranches, activeBranchId, setActiveBranchId } = useBranchContext();
  const { showToast } = useToast();
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState("SHOP");
  const [busy, setBusy] = useState(false);
  const [editBranch, setEditBranch] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", nameEn: "", address: "", kind: "SHOP", isActive: true });
  const [editBusy, setEditBusy] = useState(false);

  const load = async () => {
    const data = await api("/api/branches");
    setList(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/branches", { method: "POST", body: { name, nameEn, address, kind } });
      setName("");
      setNameEn("");
      setAddress("");
      setKind("SHOP");
      await load();
      await reloadBranches();
      await refreshUser?.();
      showToast(t("branches.toastCreated"), "success");
    } catch (err) {
      showToast(apiErrorMessage(err, t, "branches.createFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (b) => {
    setEditBranch(b);
    setEditForm({
      name: b.name || "",
      nameEn: b.nameEn || "",
      address: b.address || "",
      kind: b.kind || "SHOP",
      isActive: b.isActive !== false,
    });
  };

  const closeEdit = () => {
    if (editBusy) return;
    setEditBranch(null);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editBranch) return;
    const nextName = editForm.name.trim();
    if (!nextName) {
      showToast(t("branches.nameRequired"), "error");
      return;
    }
    setEditBusy(true);
    try {
      await api(`/api/branches/${editBranch.id}`, {
        method: "PATCH",
        body: {
          name: nextName,
          nameEn: editForm.nameEn.trim() || null,
          address: editForm.address.trim() || null,
          kind: editForm.kind || "SHOP",
          isActive: editForm.isActive !== false,
          version: editBranch.version,
        },
      });
      setEditBranch(null);
      await load();
      await reloadBranches();
      showToast(t("branches.toastUpdated"), "success");
    } catch (err) {
      if (isStaleEdit(err)) {
        // NFR-13: someone else saved this location first — reload it into the form.
        showToast(editErrorMessage(err, t), "error");
        const data = await api("/api/branches").catch(() => null);
        if (Array.isArray(data)) {
          setList(data);
          const fresh = data.find((x) => x.id === editBranch.id);
          if (fresh) openEdit(fresh);
          else setEditBranch(null);
        }
      } else {
        showToast(apiErrorMessage(err, t), "error");
      }
    } finally {
      setEditBusy(false);
    }
  };

  /** Exactly one main location (the showroom / store); the server clears the previous one. */
  const makeMain = async (b) => {
    try {
      await api(`/api/branches/${b.id}/main`, { method: "POST", body: { version: b.version } });
      await load();
      await reloadBranches();
      showToast(t("branches.mainSaved"), "success");
    } catch (err) {
      showToast(isStaleEdit(err) ? editErrorMessage(err, t) : apiErrorMessage(err, t), "error");
      await load();
    }
  };

  const removeBranch = async (b) => {
    const label = branchDisplayName(b, locale);
    if (!confirm(t("branches.confirmDelete", { name: label }))) return;
    if (!confirm(t("branches.confirmDeleteAgain", { name: label }))) return;
    try {
      await api(`/api/branches/${b.id}`, { method: "DELETE" });
      if (activeBranchId === b.id) {
        setActiveBranchId?.("");
      }
      await load();
      await reloadBranches();
      await refreshUser?.();
      showToast(t("branches.toastDeleted"), "success");
    } catch (err) {
      showToast(apiErrorMessage(err, t), "error");
    }
  };

  return (
    <div className="branches-page">
      <header className="branches-page__header">
        <div>
          <h1 className="branches-page__title">{t("branches.title")}</h1>
        </div>
      </header>

      <form className="card branches-create" onSubmit={add}>
        <strong className="branches-create__label">{t("branches.new")}</strong>
        <div className="branches-create__grid">
          <label className="branches-field">
            <span>{t("branches.name")}</span>
            <input
              required
              dir="rtl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="branches-field">
            <span>{t("branches.nameEn")}</span>
            <input
              dir="ltr"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="branches-field">
            <span>{t("branches.kind")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
              {LOCATION_KINDS.map((k) => (
                <option key={k} value={k}>{t(`branches.kind.${k}`)}</option>
              ))}
            </select>
          </label>
          <label className="branches-field">
            <span>{t("branches.address")}</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
              placeholder={t("branches.address")}
            />
          </label>
        </div>
        <button type="submit" className="btn-touch branches-create__submit" disabled={busy}>
          {t("common.add")}
        </button>
      </form>

      <div className="branches-list">
        {list.length === 0 ? (
          <EmptyState title={t("branches.empty")} hint={t("branches.emptyHint")} />
        ) : (
          list.map((b, index) => {
            return (
              <article key={b.id} className="branch-card" data-branch={b.id}>
                <div className="branch-card__top">
                  <div className="branch-card__identity">
                    <span className="branch-card__index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h2 className="branch-card__name">
                        {branchDisplayName(b, locale)}
                        {b.isMain ? <span className="branch-card__main" style={mainPill}>{t("branches.mainBadge")}</span> : null}
                      </h2>
                      <p className="branch-card__address">
                        {t(`branches.kind.${b.kind || "SHOP"}`)}
                        {" · "}
                        {b.address?.trim() ? b.address : t("branches.noAddress")}
                        {b.isActive === false ? ` · ${t("setup.inactive")}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="branch-card__aside">
                    <div className="branch-card__actions">
                      {!b.isMain && b.kind !== "VAN" && b.isActive !== false ? (
                        <button type="button" className="btn-touch branch-card__main-btn" style={{ background: "var(--surface2)" }} onClick={() => makeMain(b)}>
                          {t("branches.makeMain")}
                        </button>
                      ) : null}
                      <button type="button" className="btn-touch branch-card__edit" onClick={() => openEdit(b)}>
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="btn-touch branch-card__delete"
                        disabled={list.length <= 1 || b.isMain}
                        title={b.isMain ? t("branches.cannotDeleteMain") : list.length <= 1 ? t("branches.cannotDeleteLast") : undefined}
                        onClick={() => removeBranch(b)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {editBranch ? (
        <div
          role="dialog"
          aria-modal="true"
          className="branch-edit-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
        >
          <form className="card branch-edit-modal" onSubmit={saveEdit} onClick={(e) => e.stopPropagation()}>
            <div className="branch-edit-modal__head">
              <h3 style={{ margin: 0 }}>{t("branches.editTitle")}</h3>
              <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={closeEdit} disabled={editBusy}>
                {t("common.close")}
              </button>
            </div>
            <label className="branches-field">
              <span>{t("branches.name")}</span>
              <input
                required
                dir="rtl"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                disabled={editBusy}
              />
            </label>
            <label className="branches-field">
              <span>{t("branches.nameEn")}</span>
              <input
                dir="ltr"
                value={editForm.nameEn}
                onChange={(e) => setEditForm((f) => ({ ...f, nameEn: e.target.value }))}
                disabled={editBusy}
              />
            </label>
            <label className="branches-field">
              <span>{t("branches.kind")}</span>
              <select
                value={editForm.kind || "SHOP"}
                onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value }))}
                disabled={editBusy}
              >
              {LOCATION_KINDS.map((k) => (
                <option key={k} value={k}>{t(`branches.kind.${k}`)}</option>
              ))}
              </select>
            </label>
            <label className="branches-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={editForm.isActive !== false}
                onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                disabled={editBusy}
              />
              <span>{t("branches.active")}</span>
            </label>
            <label className="branches-field">
              <span>{t("branches.address")}</span>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                disabled={editBusy}
              />
            </label>
            <div className="branch-edit-modal__actions">
              <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={closeEdit} disabled={editBusy}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} disabled={editBusy}>
                {editBusy ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

const mainPill = {
  display: "inline-block",
  marginInlineStart: 8,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  verticalAlign: "middle",
  background: "color-mix(in srgb, var(--accent) 15%, var(--surface2))",
  color: "var(--text)",
};
