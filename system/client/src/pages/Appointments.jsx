import React, { useEffect, useMemo, useState } from "react";
import { api, editErrorMessage, isStaleEdit } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { fromQatarInput, qatarTime, qatarToday, toQatarInput } from "../utils/qatarTime.js";

/** Mirrors the server's allowed booking status changes (FR-53, FR-54). */
const NEXT = {
  PENDING_PAYMENT: ["CANCELLED"],
  BOOKED: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
};
const MOVABLE = ["PENDING_PAYMENT", "BOOKED", "CONFIRMED"];
import { statusLabel } from "../utils/statusLabels.js";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

/** Booking times are entered and shown in Qatar time (NFR-04). */
function toInputDateTimeLocal(d) {
  return toQatarInput(d);
}

export default function Appointments() {
  const { t, locale } = useI18n();
  const branchId = useActiveBranchId();
  const showPetFields = true;
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [list, setList] = useState([]);
  const [day, setDay] = useState(qatarToday());
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(() => {
    const start = new Date();
    start.setMinutes(start.getMinutes() + 60);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);
    return {
      customerId: "",
      serviceId: "",
      petName: "",
      petType: "OTHER",
      startAt: toInputDateTimeLocal(start),
      endAt: toInputDateTimeLocal(end),
      notes: "",
    };
  });

  const selectedService = useMemo(
    () => services.find((s) => s.id === form.serviceId) || null,
    [services, form.serviceId],
  );

  useEffect(() => {
    api("/api/customers").then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    const bid = branchId;
    if (!bid) return;
    const q = new URLSearchParams();
    q.set("branchId", bid);
    api(`/api/appointments/services?${q.toString()}`)
      .then(setServices)
      .catch(() => setServices([]));
  }, [branchId]);

  const loadAppointments = async () => {
    const bid = branchId;
    if (!bid) return;
    const q = new URLSearchParams();
    q.set("branchId", bid);
    q.set("day", day);
    const rows = await api(`/api/appointments?${q.toString()}`);
    setList(Array.isArray(rows) ? rows : []);
  };

  useEffect(() => {
    loadAppointments().catch(() => setList([]));
  }, [branchId, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const createService = async () => {
    const bid = branchId;
    if (!bid) {
      setMsg(t("appointments.needBranch"));
      return;
    }
    const name = window.prompt(t("appointments.promptServiceName"));
    if (!name?.trim()) return;
    const durationMin = Number(window.prompt(t("appointments.promptDuration"), "60") || "60");
    const price = Number(window.prompt(t("appointments.promptPrice"), "80") || "0");
    setMsg("");
    try {
      const row = await api("/api/appointments/services", {
        method: "POST",
        body: { branchId: bid, name: name.trim(), durationMin, price },
      });
      setServices((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setMsg(t("appointments.msgServiceCreated"));
    } catch (x) {
      setMsg(x.message || t("appointments.msgCreateFail"));
    }
  };

  const onServiceChange = (serviceId) => {
    setForm((f) => {
      const svc = services.find((s) => s.id === serviceId);
      if (!svc) return { ...f, serviceId };
      const start = new Date(fromQatarInput(f.startAt) || Date.now());
      const end = new Date(start.getTime() + Number(svc.durationMin || 60) * 60 * 1000);
      return { ...f, serviceId, endAt: toInputDateTimeLocal(end) };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const bid = branchId;
      await api("/api/appointments", {
        method: "POST",
        body: {
          branchId: bid,
          customerId: form.customerId || undefined,
          serviceId: form.serviceId || undefined,
          petName: form.petName || undefined,
          petType: form.petType,
          startAt: fromQatarInput(form.startAt),
          endAt: fromQatarInput(form.endAt),
          notes: form.notes || undefined,
        },
      });
      await loadAppointments();
      setMsg(t("appointments.msgCreated"));
    } catch (x) {
      setMsg(x.message || t("appointments.msgCreateFail"));
    }
  };

  const fail = (x) => setMsg(x.message);
  const resolve = (id, accept) =>
    api(`/api/appointments/${id}/resolve-payment`, { method: "POST", body: { accept } }).then(loadAppointments).catch(fail);
  const paidLeft = (a) => {
    const rows = a.payments || [];
    const inn = rows.filter((p) => p.kind === "PAYMENT" && ["CAPTURED", "REJECTED"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
    const out = rows.filter((p) => p.kind === "REFUND" && ["CAPTURED", "PENDING"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
    return Math.round((inn - out) * 100) / 100;
  };
  const refund = (a) => {
    const amount = window.prompt(t("shop.refundAmount"), String(paidLeft(a).toFixed(2)));
    if (!amount) return;
    api(`/api/appointments/${a.id}/refund`, { method: "POST", body: { amount: Number(amount) } }).then(loadAppointments).catch(fail);
  };

  /** NFR-13: changes send the booking version shown; a stale copy shows the notice and reloads. */
  const editFailed = (x, fallbackKey) => {
    setMsg(isStaleEdit(x) ? editErrorMessage(x, t) : x.message || t(fallbackKey));
    if (isStaleEdit(x)) loadAppointments().catch(() => {});
  };

  const setStatus = async (a, status) => {
    try {
      await api(`/api/appointments/${a.id}`, {
        method: "PATCH",
        body: { status, version: a.version },
      });
      await loadAppointments();
    } catch (x) {
      editFailed(x, "appointments.msgStatusFail");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("appointments.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{t("appointments.intro")}</p>

      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={form.customerId}
            onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
            style={{ ...inp, minWidth: 180 }}
          >
            <option value="">{t("appointments.customerOptional")}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={form.serviceId}
            onChange={(e) => onServiceChange(e.target.value)}
            style={{ ...inp, minWidth: 180 }}
          >
            <option value="">{t("appointments.service")}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-touch" onClick={createService}>
            {t("appointments.addService")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {showPetFields ? (
            <>
              <input
                style={{ ...inp, minWidth: 150 }}
                value={form.petName}
                onChange={(e) => setForm((f) => ({ ...f, petName: e.target.value }))}
                placeholder={t("appointments.petNamePh")}
              />
              <select
                value={form.petType}
                onChange={(e) => setForm((f) => ({ ...f, petType: e.target.value }))}
                style={{ ...inp, minWidth: 120 }}
              >
                <option value="CAT">CAT</option>
                <option value="DOG">DOG</option>
                <option value="OTHER">OTHER</option>
              </select>
            </>
          ) : null}
          <input
            type="datetime-local"
            value={form.startAt}
            onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
            style={{ ...inp }}
          />
          <input
            type="datetime-local"
            value={form.endAt}
            onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
            style={{ ...inp }}
          />
        </div>
        {selectedService ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {t("appointments.serviceSummary", {
              name: selectedService.name,
              min: String(selectedService.durationMin ?? ""),
              price: Number(selectedService.price).toFixed(2),
            })}
          </div>
        ) : null}
        <textarea
          style={{ ...inp, minHeight: 70 }}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder={t("appointments.notesPh")}
        />
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }}>
          {t("appointments.create")}
        </button>
        {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
      </form>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{t("appointments.todayTitle")}</strong>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={inp} />
          <button type="button" className="btn-touch" onClick={() => loadAppointments()}>
            {t("appointments.refresh")}
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("appointments.thTime")}</th>
                <th style={th}>{t("appointments.thCustomerPet")}</th>
                <th style={th}>{t("appointments.thService")}</th>
                <th style={th}>{t("appointments.thStatus")}</th>
                <th style={th}>{t("appointments.thQuick")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td style={td}>
                    {qatarTime(a.startAt, locale)} - {qatarTime(a.endAt, locale)}
                    <div style={{ color: "var(--muted)" }}>{a.reference}</div>
                  </td>
                  <td style={td}>
                    {a.customer?.name || t("appointments.walkIn")} {a.petName ? `• ${a.petName}` : ""}
                  </td>
                  <td style={td}>{a.service?.name || "—"}</td>
                  <td style={td}>
                    {statusLabel("booking", a.status, locale)}
                    {Number(a.amountPaid) > 0 ? <div style={{ color: "var(--muted)" }}>{t("shop.paid")} {Number(a.amountPaid).toFixed(2)}</div> : null}
                    {a.paymentReview ? (
                      <div style={{ color: "var(--danger, #b42318)" }}>
                        <strong>{t(`shop.reviewReason.${a.paymentReviewReason || "AMOUNT_MISMATCH"}`)}</strong>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button className="btn-touch" type="button" onClick={() => resolve(a.id, true)}>{t("shop.keepPayment")}</button>
                          <button className="btn-touch" type="button" onClick={() => resolve(a.id, false)}>{t("shop.refundPayment")}</button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(NEXT[a.status] || []).includes("IN_PROGRESS") ? (
                        <button className="btn-touch" type="button" onClick={() => setStatus(a, "IN_PROGRESS")}>
                          {t("shop.inProgress")}
                        </button>
                      ) : null}
                      {(NEXT[a.status] || []).includes("DONE") ? (
                        <button className="btn-touch" type="button" onClick={() => setStatus(a, "DONE")}>
                          {t("appointments.done")}
                        </button>
                      ) : null}
                      {(NEXT[a.status] || []).includes("NO_SHOW") ? (
                        <button className="btn-touch" type="button" onClick={() => setStatus(a, "NO_SHOW")}>
                          {t("shop.noShow")}
                        </button>
                      ) : null}
                      {MOVABLE.includes(a.status) ? (
                        <button className="btn-touch" type="button" onClick={() => {
                          const next = window.prompt(`${t("shop.moveBooking")} (${t("shop.qatarTime")})`, toQatarInput(a.startAt));
                          if (!next) return;
                          const start = fromQatarInput(next.trim().slice(0, 16));
                          if (!start) return;
                          api(`/api/appointments/${a.id}`, { method: "PATCH", body: { startAt: start, version: a.version } }).then(loadAppointments).catch((x) => editFailed(x, "appointments.msgStatusFail"));
                        }}>
                          {t("shop.move")}
                        </button>
                      ) : null}
                      {(NEXT[a.status] || []).includes("CANCELLED") ? (
                        <button className="btn-touch" type="button" onClick={() => setStatus(a, "CANCELLED")}>
                          {t("appointments.cancel")}
                        </button>
                      ) : null}
                      {paidLeft(a) > 0 ? (
                        <button className="btn-touch" type="button" onClick={() => refund(a)}>
                          {t("shop.refund")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length ? (
                <tr>
                  <td style={td} colSpan={6}>
                    {t("appointments.emptyDay")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
