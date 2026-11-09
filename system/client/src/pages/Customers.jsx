import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { isVerticalFeatureEnabled } from "../lib/verticalFeatures.js";

const emptyForm = () => ({ name: "", phone: "", email: "", notes: "", accountBalance: "" });

export default function Customers() {
  const { t } = useI18n();
  const { isAdmin, isManager, can, user } = useAuth();
  const showReceivable =
    can("receivables") && isVerticalFeatureEnabled("customerAccounts", user?.businessVertical);
  const showOpeningBalance = isManager;
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");

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
        },
      });
      setEditing(null);
      await load();
      setMsg(t("customers.saved"));
    } catch (x) {
      setMsg(x.message || t("customers.saveFailed"));
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
        </div>
        <button type="submit" className="btn-touch customers-form__submit">
          {t("common.add")}
        </button>
      </form>

      {msg ? <div className="customers-msg">{msg}</div> : null}

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
                            onClick={() =>
                              setEditing({
                                ...c,
                                accountBalance: Number(c.accountBalance ?? 0).toFixed(2),
                              })
                            }
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
