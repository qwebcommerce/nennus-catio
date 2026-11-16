import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

const emptyForm = () => ({ name: "", phone: "", email: "", notes: "", accountBalance: "", creditApproved: false, creditLimit: "" });

/** Edit-form copy of a customer row; keeps `version` so the save names the copy it was loaded from. */
function editFormOf(c) {
  return {
    ...c,
    accountBalance: Number(c.accountBalance ?? 0).toFixed(2),
    creditLimit: c.creditLimit != null ? String(c.creditLimit) : "",
  };
}

export default function Customers() {
  const { t } = useI18n();
  const { isAdmin, isManager, can } = useAuth();
  const showReceivable = can("receivables");
  const showOpeningBalance = isManager;
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const [recordId, setRecordId] = useState("");
  const [record, setRecord] = useState(null);
  const [petForm, setPetForm] = useState({ name: "", breed: "", ageText: "", notes: "" });

  const load = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    return api(`/api/customers?${params.toString()}`).then(setList);
  };

  useEffect(() => {
    load().catch(() => setList([]));
  }, [q]);

  const create = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const balRaw = String(form.accountBalance ?? "").trim();
      await api("/api/customers", {
        method: "POST",
        body: {
          name: form.name,
          phone: form.phone,
          email: form.email,
          notes: form.notes,
          ...(showOpeningBalance && balRaw !== ""
            ? { accountBalance: Number(balRaw.replace(",", ".")) }
            : {}),
          creditApproved: Boolean(form.creditApproved),
          creditLimit: form.creditLimit === "" ? null : Number(form.creditLimit),
        },
      });
      setForm(emptyForm());
      await load();
      setMsg(t("customers.created"));
    } catch (x) {
      setMsg(x.message || t("customers.saveFailed"));
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setMsg("");
    try {
      const balRaw = String(editing.accountBalance ?? "").trim();
      await api(`/api/customers/${editing.id}`, {
        method: "PATCH",
        body: {
          name: editing.name,
          phone: editing.phone || null,
          email: editing.email || null,
          notes: editing.notes || null,
          accountBalance: Number(String(balRaw).replace(",", ".") || "0"),
          creditApproved: Boolean(editing.creditApproved),
          creditLimit: editing.creditLimit === "" ? null : Number(editing.creditLimit),
          version: editing.version,
        },
      });
      setEditing(null);
      await load();
      setMsg(t("customers.saved"));
    } catch (x) {
      setMsg(isStaleEdit(x) ? editErrorMessage(x, t) : x.message || t("customers.saveFailed"));
      if (isStaleEdit(x)) {
        // NFR-13: someone else saved this customer first — reload it into the form.
        const rows = await api(`/api/customers?${new URLSearchParams(q.trim() ? { q: q.trim() } : {}).toString()}`).catch(() => null);
        if (Array.isArray(rows)) {
          setList(rows);
          const fresh = rows.find((c) => c.id === editing.id);
          setEditing(fresh ? editFormOf(fresh) : null);
        }
      }
    }
  };

  const saveTags = async (e) => {
    e.preventDefault();
    try {
      const saved = await api(`/api/customers/${recordId}`, { method: "PATCH", body: { tags: record.tags || "", version: record.version } });
      setRecord((r) => (r ? { ...r, version: saved.version } : r));
      setMsg(t("customers.saved"));
    } catch (x) {
      setMsg(editErrorMessage(x, t));
      if (isStaleEdit(x)) setRecord(await api(`/api/customers/${recordId}/record`).catch(() => null));
    }
  };

  const del = async (id) => {
    if (!confirm(t("customers.confirmDelete"))) return;
    setMsg("");
    try {
      await api(`/api/customers/${id}`, { method: "DELETE" });
      await load();
      setMsg(t("customers.deleted"));
    } catch (x) {
      setMsg(x.message || t("customers.deleteFailed"));
    }
  };

  const colCount = 5 + (showReceivable ? 1 : 0) + (isManager ? 1 : 0);

  return (
    <div className="customers-page">
      <h1 className="customers-page__title">{t("customers.title")}</h1>

      <div className="card customers-search">
        <input
          placeholder={t("customers.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("customers.search")}
        />
      </div>

      <form className="card customers-form" onSubmit={create}>
        <strong>{t("customers.quickAdd")}</strong>
        <div className="customers-form__grid">
          <input
            placeholder={t("customers.name")}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder={t("customers.phone")}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            placeholder={t("customers.email")}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          {showOpeningBalance ? (
            <input
              placeholder={t("customers.balancePlaceholder")}
              type="number"
              min={0}
              step="0.01"
              value={form.accountBalance}
              onChange={(e) => setForm({ ...form, accountBalance: e.target.value })}
            />
          ) : null}
          <input
            placeholder={t("customers.notes")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <label>
            <input type="checkbox" checked={Boolean(form.creditApproved)} onChange={(e) => setForm({ ...form, creditApproved: e.target.checked })} />
            {t("shop.credit")}
          </label>
          <input
            placeholder={t("shop.creditLimit")}
            value={form.creditLimit}
            onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
          />
        </div>
        <button type="submit" className="btn-touch customers-form__submit">
          {t("common.add")}
        </button>
      </form>

      {msg ? <div className="customers-msg">{msg}</div> : null}

      {isManager ? (
        <section className="card" style={{ display: "grid", gap: 8 }}>
          <strong>{t("shop.pets")}</strong>
          <select
            value={recordId}
            onChange={(e) => {
              const id = e.target.value;
              setRecordId(id);
              if (!id) return setRecord(null);
              api(`/api/customers/${id}/record`).then(setRecord).catch(() => setRecord(null));
            }}
          >
            <option value="">{t("customers.name")}</option>
            {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(record?.pets || []).map((pet) => (
            <div key={pet.id}>{pet.name} · {pet.breed || "—"} · {pet.ageText || "—"}{pet.notes ? ` · ${pet.notes}` : ""}</div>
          ))}
          {(record?.addresses || []).map((row) => <div key={row.id}>{row.line1} {row.area} {row.city}</div>)}
          {(record?.sales || []).map((row) => <div key={row.id}>{row.reference || row.invoiceNumber || row.id.slice(0, 8)} · {row.orderChannel || ""} · {Number(row.total).toFixed(2)}</div>)}
          {(record?.appointments || []).map((row) => <div key={row.id}>{row.reference ? `${row.reference} · ` : ""}{row.service?.name || t("shop.grooming")} · {row.status}</div>)}
          {(record?.relocationRequests || []).map((row) => <div key={row.id}>{row.reference ? `${row.reference} · ` : ""}{row.destination} · {row.status}</div>)}
          {recordId && record ? (
            <form onSubmit={saveTags} style={{ display: "flex", gap: 8 }}>
              <input placeholder={t("shop.tags")} value={record.tags || ""} onChange={(e) => setRecord({ ...record, tags: e.target.value })} />
              <button className="btn-touch" type="submit">{t("common.save")}</button>
            </form>
          ) : null}
          {recordId ? (
            <form
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              onSubmit={async (e) => {
                e.preventDefault();
                await api(`/api/customers/${recordId}/pets`, { method: "POST", body: petForm });
                setPetForm({ name: "", breed: "", ageText: "", notes: "" });
                setRecord(await api(`/api/customers/${recordId}/record`));
              }}
            >
              <input required placeholder={t("shop.petName")} value={petForm.name} onChange={(e) => setPetForm({ ...petForm, name: e.target.value })} />
              <input placeholder={t("shop.breed")} value={petForm.breed} onChange={(e) => setPetForm({ ...petForm, breed: e.target.value })} />
              <input placeholder={t("shop.age")} value={petForm.ageText} onChange={(e) => setPetForm({ ...petForm, ageText: e.target.value })} />
              <input placeholder={t("customers.notes")} value={petForm.notes} onChange={(e) => setPetForm({ ...petForm, notes: e.target.value })} />
              <button className="btn-touch" type="submit">{t("common.add")}</button>
            </form>
          ) : null}
        </section>
      ) : null}

      <div className="card customers-table-wrap">
        <table className="customers-table">
          <thead>
            <tr>
              <th>{t("customers.name")}</th>
              <th>{t("customers.phone")}</th>
              <th>{t("customers.colBalance")}</th>
              <th>{t("customers.email")}</th>
              <th>{t("customers.notes")}</th>
              {showReceivable ? <th>{t("customers.receivable")}</th> : null}
              {isManager ? <th>{t("products.colActions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="customers-table__empty">
                  {t("customers.empty") || "—"}
                </td>
              </tr>
            ) : (
              list.map((c) =>
                editing?.id === c.id ? (
                  <tr key={c.id}>
                    <td>
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editing.phone || ""}
                        onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editing.accountBalance}
                        onChange={(e) => setEditing({ ...editing, accountBalance: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editing.email || ""}
                        onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editing.notes || ""}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                      />
                      <label>
                        <input type="checkbox" checked={Boolean(editing.creditApproved)} onChange={(e) => setEditing({ ...editing, creditApproved: e.target.checked })} />
                        {t("shop.credit")}
                      </label>
                      <input
                        value={editing.creditLimit || ""}
                        onChange={(e) => setEditing({ ...editing, creditLimit: e.target.value })}
                        placeholder={t("shop.creditLimit")}
                      />
                    </td>
                    {showReceivable ? <td>—</td> : null}
                    {isManager ? (
                      <td>
                        <form onSubmit={saveEdit} className="customers-table__btns">
                          <button type="submit" className="btn-touch customers-btn-save">
                            {t("common.save")}
                          </button>
                          <button type="button" className="btn-touch" onClick={() => setEditing(null)}>
                            {t("common.cancel")}
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ) : (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone || "—"}</td>
                    <td className="customers-table__bal">{Number(c.accountBalance ?? 0).toFixed(2)}</td>
                    <td>{c.email || "—"}</td>
                    <td>{c.notes || "—"}</td>
                    {showReceivable ? (
                      <td>
                        <Link to={`/customer-accounts/${c.id}`} className="customers-details">
                          {t("receivable.open")}
                        </Link>
                      </td>
                    ) : null}
                    {isManager ? (
                      <td>
                        <div className="customers-table__btns">
                          <button
                            type="button"
                            className="btn-touch"
                            onClick={() => setEditing(editFormOf(c))}
                          >
                            {t("common.edit")}
                          </button>
                          {isAdmin ? (
                            <button type="button" className="btn-touch customers-btn-del" onClick={() => del(c.id)}>
                              {t("common.delete")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
