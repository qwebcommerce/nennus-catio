import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { isVerticalFeatureEnabled } from "../lib/verticalFeatures.js";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

function toInputDateTimeLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function Appointments() {
  const { t } = useI18n();
  const { user } = useAuth();
  const branchId = useActiveBranchId();
  const showPetFields = isVerticalFeatureEnabled("petPosFilters", user?.businessVertical);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [list, setList] = useState([]);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(() => {
    const start = new Date();
    start.setMinutes(start.getMinutes() + 60);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);
    return {
      customerId: "",
      serviceId: "",
      groomerId: "",
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
    api("/api/employees").then(setEmployees).catch(() => setEmployees([]));
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
      const start = new Date(f.startAt);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + Number(svc.durationMin || 60));
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
          groomerId: form.groomerId || undefined,
          petName: form.petName || undefined,
          petType: form.petType,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          notes: form.notes || undefined,
        },
      });
      await loadAppointments();
      setMsg(t("appointments.msgCreated"));
    } catch (x) {
      setMsg(x.message || t("appointments.msgCreateFail"));
    }
  };

  const setStatus = async (id, status) => {
    try {
      await api(`/api/appointments/${id}`, {
        method: "PATCH",
        body: { status },
      });
      await loadAppointments();
    } catch (x) {
      setMsg(x.message || t("appointments.msgStatusFail"));
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
          <select
            value={form.groomerId}
            onChange={(e) => setForm((f) => ({ ...f, groomerId: e.target.value }))}
            style={{ ...inp, minWidth: 180 }}
          >
            <option value="">{t("appointments.staff")}</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
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
                <th style={th}>{t("appointments.thStaff")}</th>
                <th style={th}>{t("appointments.thStatus")}</th>
                <th style={th}>{t("appointments.thQuick")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td style={td}>
                    {new Date(a.startAt).toLocaleTimeString()} - {new Date(a.endAt).toLocaleTimeString()}
                  </td>
                  <td style={td}>
                    {a.customer?.name || t("appointments.walkIn")} {a.petName ? `• ${a.petName}` : ""}
                  </td>
                  <td style={td}>{a.service?.name || "—"}</td>
                  <td style={td}>{a.groomer?.name || "—"}</td>
                  <td style={td}>{a.status}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn-touch" type="button" onClick={() => setStatus(a.id, "CONFIRMED")}>
                        {t("appointments.confirm")}
                      </button>
                      <button className="btn-touch" type="button" onClick={() => setStatus(a.id, "DONE")}>
                        {t("appointments.done")}
                      </button>
                      <button className="btn-touch" type="button" onClick={() => setStatus(a.id, "CANCELLED")}>
                        {t("appointments.cancel")}
                      </button>
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
