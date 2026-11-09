import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  normKey,
  validateCatalogName,
  validateOptionalLabel,
  validateSkuCode,
} from "../utils/catalogValidate.js";

function labelOf(row, locale) {
  if (!row) return "";
  if (locale === "en" && row.nameEn?.trim()) return row.nameEn.trim();
  return row.name || row.nameEn || "";
}

export default function Categories() {
  const { isManager } = useAuth();
  const { t, locale } = useI18n();
  const { showToast } = useToast();
  const [tab, setTab] = useState("categories");
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [skus, setSkus] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [catForm, setCatForm] = useState({ name: "" });
  const [subForm, setSubForm] = useState({ categoryId: "", name: "" });
  const [skuForm, setSkuForm] = useState({ code: "", name: "", subcategoryId: "" });

  const [editCat, setEditCat] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [editSku, setEditSku] = useState(null);

  const load = async () => {
    const data = await api("/api/catalog");
    setCategories(Array.isArray(data?.categories) ? data.categories : []);
    setSubcategories(Array.isArray(data?.subcategories) ? data.subcategories : []);
    setSkus(Array.isArray(data?.skus) ? data.skus : []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message || "Failed to load"));
  }, []);

  const tabs = useMemo(
    () => [
      { id: "categories", label: t("catalog.tabCategories") },
      { id: "subcategories", label: t("catalog.tabSubcategories") },
      { id: "skus", label: t("catalog.tabSkus") },
    ],
    [t]
  );

  const run = async (fn, successMsg) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      if (successMsg) showToast(successMsg, "success");
    } catch (e) {
      const msg = e.message || "Request failed";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  const addCategory = (e) => {
    e.preventDefault();
    const checked = validateCatalogName(catForm.name, t);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const key = normKey(checked.value);
    if (categories.some((c) => normKey(c.name) === key || (c.nameEn && normKey(c.nameEn) === key))) {
      setError(t("catalog.errCategoryDup"));
      return;
    }
    run(async () => {
      await api("/api/catalog/categories", { method: "POST", body: { name: checked.value } });
      setCatForm({ name: "" });
    }, t("catalog.toastCreated"));
  };

  const saveCategory = (e) => {
    e.preventDefault();
    if (!editCat) return;
    const checked = validateCatalogName(editCat.name, t);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const key = normKey(checked.value);
    if (
      categories.some(
        (c) => c.id !== editCat.id && (normKey(c.name) === key || (c.nameEn && normKey(c.nameEn) === key))
      )
    ) {
      setError(t("catalog.errCategoryDup"));
      return;
    }
    run(async () => {
      await api(`/api/catalog/categories/${editCat.id}`, {
        method: "PATCH",
        body: { name: checked.value },
      });
      setEditCat(null);
    }, t("catalog.toastUpdated"));
  };

  const addSubcategory = (e) => {
    e.preventDefault();
    if (!subForm.categoryId) {
      setError(t("catalog.errPickCategory"));
      return;
    }
    const checked = validateCatalogName(subForm.name, t);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const siblings = subcategories.filter((s) => s.categoryId === subForm.categoryId);
    if (siblings.some((s) => normKey(s.name) === normKey(checked.value))) {
      setError(t("catalog.errSubDup"));
      return;
    }
    run(async () => {
      await api("/api/catalog/subcategories", {
        method: "POST",
        body: { categoryId: subForm.categoryId, name: checked.value },
      });
      setSubForm((f) => ({ ...f, name: "" }));
    }, t("catalog.toastCreated"));
  };

  const saveSubcategory = (e) => {
    e.preventDefault();
    if (!editSub) return;
    if (!editSub.categoryId) {
      setError(t("catalog.errPickCategory"));
      return;
    }
    const checked = validateCatalogName(editSub.name, t);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const siblings = subcategories.filter(
      (s) => s.categoryId === editSub.categoryId && s.id !== editSub.id
    );
    if (siblings.some((s) => normKey(s.name) === normKey(checked.value))) {
      setError(t("catalog.errSubDup"));
      return;
    }
    run(async () => {
      await api(`/api/catalog/subcategories/${editSub.id}`, {
        method: "PATCH",
        body: { categoryId: editSub.categoryId, name: checked.value },
      });
      setEditSub(null);
    }, t("catalog.toastUpdated"));
  };

  const addSku = (e) => {
    e.preventDefault();
    const checked = validateSkuCode(skuForm.code, t);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const label = validateOptionalLabel(skuForm.name, t);
    if (!label.ok) {
      setError(label.error);
      return;
    }
    if (skus.some((s) => s.code.toLowerCase() === checked.value.toLowerCase())) {
      setError(t("catalog.errSkuDup"));
      return;
    }
    if (skuForm.subcategoryId && !subcategories.some((s) => s.id === skuForm.subcategoryId)) {
      setError(t("catalog.errInvalidSub"));
      return;
    }
    run(async () => {
      await api("/api/catalog/skus", {
        method: "POST",
        body: {
          code: checked.value,
          name: label.value,
          subcategoryId: skuForm.subcategoryId || null,
        },
      });
      setSkuForm((f) => ({ ...f, code: "", name: "" }));
    }, t("catalog.toastCreated"));
  };

  const saveSku = (e) => {
    e.preventDefault();
    if (!editSku) return;
    const checked = validateSkuCode(editSku.code, t);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const label = validateOptionalLabel(editSku.name, t);
    if (!label.ok) {
      setError(label.error);
      return;
    }
    if (
      skus.some((s) => s.id !== editSku.id && s.code.toLowerCase() === checked.value.toLowerCase())
    ) {
      setError(t("catalog.errSkuDup"));
      return;
    }
    run(async () => {
      await api(`/api/catalog/skus/${editSku.id}`, {
        method: "PATCH",
        body: {
          code: checked.value,
          name: label.value,
          subcategoryId: editSku.subcategoryId || null,
        },
      });
      setEditSku(null);
    }, t("catalog.toastUpdated"));
  };

  const remove = (kind, id) => {
    if (!confirm(t("catalog.confirmDelete"))) return;
    const path =
      kind === "category"
        ? `/api/catalog/categories/${id}`
        : kind === "subcategory"
          ? `/api/catalog/subcategories/${id}`
          : `/api/catalog/skus/${id}`;
    run(async () => {
      await api(path, { method: "DELETE" });
      if (kind === "category" && editCat?.id === id) setEditCat(null);
      if (kind === "subcategory" && editSub?.id === id) setEditSub(null);
      if (kind === "sku" && editSku?.id === id) setEditSku(null);
    }, t("catalog.toastDeleted"));
  };

  const switchTab = (id) => {
    setTab(id);
    setError("");
    setEditCat(null);
    setEditSub(null);
    setEditSku(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <h1 style={{ margin: 0 }}>{t("catalog.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("catalog.hint")}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => switchTab(tb.id)}
            style={{
              ...tabBtn,
              background: tab === tb.id ? "var(--accent)" : "var(--surface2)",
              color: tab === tb.id ? "#fff" : "var(--text)",
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div> : null}

      {tab === "categories" ? (
        <section className="card" style={{ display: "grid", gap: 14 }}>
          {isManager ? (
            <form onSubmit={addCategory} style={{ display: "grid", gap: 10 }} noValidate>
              <strong>{t("catalog.newCategory")}</strong>
              <input
                style={inp}
                placeholder={t("catalog.name")}
                required
                minLength={2}
                maxLength={80}
                value={catForm.name}
                onChange={(e) => setCatForm({ name: e.target.value })}
              />
              <span style={hint}>{t("catalog.nameRules")}</span>
              <button type="submit" className="btn-touch" disabled={busy} style={{ background: "var(--accent)", color: "#fff", maxWidth: 180 }}>
                {t("common.add")}
              </button>
            </form>
          ) : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {categories.map((c) => (
              <li key={c.id} style={row}>
                {editCat?.id === c.id ? (
                  <form onSubmit={saveCategory} style={{ display: "flex", flexWrap: "wrap", gap: 8, width: "100%", alignItems: "center" }}>
                    <input
                      style={{ ...inp, flex: "1 1 180px" }}
                      value={editCat.name}
                      minLength={2}
                      maxLength={80}
                      onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                      autoFocus
                    />
                    <button type="submit" style={btnSm} disabled={busy}>
                      {t("common.save")}
                    </button>
                    <button type="button" style={{ ...btnSm, background: "var(--surface2)" }} disabled={busy} onClick={() => setEditCat(null)}>
                      {t("common.cancel")}
                    </button>
                  </form>
                ) : (
                  <>
                    <div style={{ fontWeight: 700 }}>{labelOf(c, locale)}</div>
                    {isManager ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={btnSm}
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setEditCat({ id: c.id, name: c.name || "" });
                          }}
                        >
                          {t("common.edit")}
                        </button>
                        <button type="button" style={btnSmDanger} disabled={busy} onClick={() => remove("category", c.id)}>
                          {t("common.delete")}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
            {!categories.length ? <li style={{ color: "var(--muted)" }}>{t("catalog.empty")}</li> : null}
          </ul>
        </section>
      ) : null}

      {tab === "subcategories" ? (
        <section className="card" style={{ display: "grid", gap: 14 }}>
          {isManager ? (
            <form onSubmit={addSubcategory} style={{ display: "grid", gap: 10 }} noValidate>
              <strong>{t("catalog.newSubcategory")}</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                <select
                  style={inp}
                  required
                  value={subForm.categoryId}
                  onChange={(e) => setSubForm({ ...subForm, categoryId: e.target.value })}
                >
                  <option value="">{t("catalog.pickCategory")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {labelOf(c, locale)}
                    </option>
                  ))}
                </select>
                <input
                  style={inp}
                  placeholder={t("catalog.name")}
                  required
                  minLength={2}
                  maxLength={80}
                  value={subForm.name}
                  onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                />
              </div>
              <span style={hint}>{t("catalog.nameRules")}</span>
              <button
                type="submit"
                className="btn-touch"
                disabled={busy || !categories.length}
                style={{ background: "var(--accent)", color: "#fff", maxWidth: 180 }}
              >
                {t("common.add")}
              </button>
              {!categories.length ? <span style={hint}>{t("catalog.needCategoryFirst")}</span> : null}
            </form>
          ) : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {subcategories.map((s) => (
              <li key={s.id} style={row}>
                {editSub?.id === s.id ? (
                  <form onSubmit={saveSubcategory} style={{ display: "grid", gap: 8, width: "100%" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
                      <select
                        style={inp}
                        value={editSub.categoryId}
                        onChange={(e) => setEditSub({ ...editSub, categoryId: e.target.value })}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {labelOf(c, locale)}
                          </option>
                        ))}
                      </select>
                      <input
                        style={inp}
                        value={editSub.name}
                        minLength={2}
                        maxLength={80}
                        onChange={(e) => setEditSub({ ...editSub, name: e.target.value })}
                        autoFocus
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="submit" style={btnSm} disabled={busy}>
                        {t("common.save")}
                      </button>
                      <button type="button" style={{ ...btnSm, background: "var(--surface2)" }} disabled={busy} onClick={() => setEditSub(null)}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <div style={{ fontWeight: 700 }}>{labelOf(s, locale)}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {t("catalog.parentCategory")}: {labelOf(s.category, locale)}
                      </div>
                    </div>
                    {isManager ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={btnSm}
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setEditSub({ id: s.id, name: s.name || "", categoryId: s.categoryId });
                          }}
                        >
                          {t("common.edit")}
                        </button>
                        <button type="button" style={btnSmDanger} disabled={busy} onClick={() => remove("subcategory", s.id)}>
                          {t("common.delete")}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
            {!subcategories.length ? <li style={{ color: "var(--muted)" }}>{t("catalog.empty")}</li> : null}
          </ul>
        </section>
      ) : null}

      {tab === "skus" ? (
        <section className="card" style={{ display: "grid", gap: 14 }}>
          {isManager ? (
            <form onSubmit={addSku} style={{ display: "grid", gap: 10 }} noValidate>
              <strong>{t("catalog.newSku")}</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                <input
                  style={inp}
                  placeholder={t("catalog.skuCode")}
                  required
                  minLength={2}
                  maxLength={40}
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                  title={t("catalog.skuRules")}
                  value={skuForm.code}
                  onChange={(e) => setSkuForm({ ...skuForm, code: e.target.value })}
                />
                <input
                  style={inp}
                  placeholder={t("catalog.skuLabel")}
                  maxLength={80}
                  value={skuForm.name}
                  onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })}
                />
                <select
                  style={inp}
                  value={skuForm.subcategoryId}
                  onChange={(e) => setSkuForm({ ...skuForm, subcategoryId: e.target.value })}
                >
                  <option value="">{t("catalog.anySubcategory")}</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {labelOf(s, locale)} ({labelOf(s.category, locale)})
                    </option>
                  ))}
                </select>
              </div>
              <span style={hint}>{t("catalog.skuRules")}</span>
              <button type="submit" className="btn-touch" disabled={busy} style={{ background: "var(--accent)", color: "#fff", maxWidth: 180 }}>
                {t("common.add")}
              </button>
            </form>
          ) : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {skus.map((s) => (
              <li key={s.id} style={row}>
                {editSku?.id === s.id ? (
                  <form onSubmit={saveSku} style={{ display: "grid", gap: 8, width: "100%" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                      <input
                        style={inp}
                        value={editSku.code}
                        minLength={2}
                        maxLength={40}
                        onChange={(e) => setEditSku({ ...editSku, code: e.target.value })}
                        autoFocus
                      />
                      <input
                        style={inp}
                        value={editSku.name || ""}
                        maxLength={80}
                        placeholder={t("catalog.skuLabel")}
                        onChange={(e) => setEditSku({ ...editSku, name: e.target.value })}
                      />
                      <select
                        style={inp}
                        value={editSku.subcategoryId || ""}
                        onChange={(e) => setEditSku({ ...editSku, subcategoryId: e.target.value })}
                      >
                        <option value="">{t("catalog.anySubcategory")}</option>
                        {subcategories.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {labelOf(sub, locale)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="submit" style={btnSm} disabled={busy}>
                        {t("common.save")}
                      </button>
                      <button type="button" style={{ ...btnSm, background: "var(--surface2)" }} disabled={busy} onClick={() => setEditSku(null)}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <div style={{ fontWeight: 700 }}>{s.code}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {s.name || "—"}
                        {s.subcategory ? ` · ${labelOf(s.subcategory, locale)}` : ""}
                      </div>
                    </div>
                    {isManager ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={btnSm}
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setEditSku({
                              id: s.id,
                              code: s.code || "",
                              name: s.name || "",
                              subcategoryId: s.subcategoryId || "",
                            });
                          }}
                        >
                          {t("common.edit")}
                        </button>
                        <button type="button" style={btnSmDanger} disabled={busy} onClick={() => remove("sku", s.id)}>
                          {t("common.delete")}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
            {!skus.length ? <li style={{ color: "var(--muted)" }}>{t("catalog.empty")}</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const inp = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const hint = { fontSize: 12, color: "var(--muted)" };
const tabBtn = {
  padding: "8px 14px",
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};
const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 0",
  borderBottom: "1px solid var(--border)",
};
const btnSm = {
  padding: "4px 10px",
  minHeight: 28,
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  background: "var(--accent)",
  color: "#fff",
  whiteSpace: "nowrap",
};
const btnSmDanger = {
  ...btnSm,
  background: "var(--danger)",
};
