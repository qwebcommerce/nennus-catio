import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useBranchContext } from "../context/BranchContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { apiErrorMessage } from "../utils/apiError.js";
import { EmptyState } from "../components/EmptyState.jsx";
import { Link } from "react-router-dom";

export default function Branches() {
  const { t, locale } = useI18n();
  const { refreshUser } = useAuth();
  const { reloadBranches, maxBranches, plan, activeBranchId, setActiveBranchId } = useBranchContext();
  const { showToast } = useToast();
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [supaEdits, setSupaEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [editBranch, setEditBranch] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", address: "" });
  const [editBusy, setEditBusy] = useState(false);

  const load = async () => {
    const data = await api("/api/branches");
    setList(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    const m = {};
    for (const b of list) {
      m[b.id] = b.supabaseId ?? "";
    }
    setSupaEdits(m);
  }, [list]);

  const atLimit = list.length >= maxBranches;

  const add = async (e) => {
    e.preventDefault();
    if (atLimit) {
      showToast(t("branches.limitReached"), "error");
      return;
    }
    setBusy(true);
    try {
      await api("/api/branches", { method: "POST", body: { name, address } });
      setName("");
      setAddress("");
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
      address: b.address || "",
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
          address: editForm.address.trim() || null,
        },
      });
      setEditBranch(null);
      await load();
      await reloadBranches();
      showToast(t("branches.toastUpdated"), "success");
    } catch (err) {
      showToast(apiErrorMessage(err, t), "error");
    } finally {
      setEditBusy(false);
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

  const saveSupabase = async (id) => {
    const v = supaEdits[id];
    setSavingId(id);
    try {
      await api(`/api/branches/${id}`, {
        method: "PATCH",
        body: { supabaseId: v != null && String(v).trim() ? String(v).trim() : null },
      });
      await load();
      showToast(t("branches.toastSaved"), "success");
    } catch (err) {
      showToast(apiErrorMessage(err, t), "error");
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="branches-page">
      <header className="branches-page__header">
        <div>
          <h1 className="branches-page__title">{t("branches.title")}</h1>
          <p className="branches-page__meta">
            {t("branches.limit", { count: list.length, max: maxBranches })}
            {plan ? <span className="branches-page__plan">{plan}</span> : null}
          </p>
        </div>
      </header>

      <form className="card branches-create" onSubmit={add}>
        <strong className="branches-create__label">{t("branches.new")}</strong>
        {atLimit ? (
          <p className="branches-create__warn">
            {t("branches.limitReached")}{" "}
            <Link to="/plan">{t("nav.plan")}</Link>
          </p>
        ) : null}
        <div className="branches-create__grid">
          <label className="branches-field">
            <span>{t("branches.name")}</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={atLimit || busy}
            />
          </label>
          <label className="branches-field">
            <span>{t("branches.address")}</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={atLimit || busy}
              placeholder={t("branches.address")}
            />
          </label>
        </div>
        <button type="submit" className="btn-touch branches-create__submit" disabled={atLimit || busy}>
          {t("common.add")}
        </button>
      </form>

      <div className="branches-list">
        {list.length === 0 ? (
          <EmptyState title={t("branches.empty")} hint={t("branches.emptyHint")} />
        ) : (
          list.map((b, index) => {
            const linked = Boolean(String(supaEdits[b.id] ?? "").trim() || b.supabaseId);
            return (
              <article key={b.id} className="branch-card">
                <div className="branch-card__top">
                  <div className="branch-card__identity">
                    <span className="branch-card__index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h2 className="branch-card__name">{branchDisplayName(b, locale)}</h2>
                      <p className="branch-card__address">
                        {b.address?.trim() ? b.address : t("branches.noAddress")}
                      </p>
                    </div>
                  </div>
                  <div className="branch-card__aside">
                    <span className={`branch-card__badge${linked ? " branch-card__badge--on" : ""}`}>
                      {linked ? t("branches.linked") : t("branches.unlinked")}
                    </span>
                    <div className="branch-card__actions">
                      <button type="button" className="btn-touch branch-card__edit" onClick={() => openEdit(b)}>
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="btn-touch branch-card__delete"
                        disabled={list.length <= 1}
                        title={list.length <= 1 ? t("branches.cannotDeleteLast") : undefined}
                        onClick={() => removeBranch(b)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="branch-card__sync">
                  <div className="branch-card__sync-copy">
                    <span className="branch-card__sync-title">{t("branches.supabaseId")}</span>
                    <span className="branch-card__sync-hint">{t("branches.supabaseHint")}</span>
                  </div>
                  <div className="branch-card__sync-row">
                    <input
                      className="branch-card__uuid"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={supaEdits[b.id] ?? ""}
                      onChange={(e) => setSupaEdits((prev) => ({ ...prev, [b.id]: e.target.value }))}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="btn-touch branch-card__save"
                      disabled={savingId === b.id}
                      onClick={() => saveSupabase(b.id)}
                    >
                      {savingId === b.id ? t("common.loading") : t("branches.saveSupabase")}
                    </button>
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
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                disabled={editBusy}
              />
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
