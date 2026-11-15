"use client";
import { useEffect, useRef } from "react";
import type { FinanceTransaction } from "./finance-list";
import { financeMetrics, financeMoney } from "./finance-list";
import { qatarDay, shiftDay } from "@/features/admin/dashboard/lib/dashboard";
import { useCopy } from "@/shared/lib/copy";

export type FinanceChartPoint = { label: string; value: number };
export type FinanceChartKind = { kind: "product" | "house" | "grooming" | "relocation"; value: number; label: string; color: string };
export const FINANCE_KIND_COLORS = { product: "#3186f5", house: "#ff9952", grooming: "#9570e9", relocation: "#22a06b" } as const;

/** Mock mode: the demo page's charts, worked out from the sample records. */
export function FinanceCharts({ records, from, to, mode, setMode }: {
  records: FinanceTransaction[]; from: string; to: string; mode: "daily" | "weekly" | "monthly";
  setMode: (v: "daily" | "weekly" | "monthly") => void;
}) {
  const c = useCopy();
  const valid = !!from && !!to && from <= to;
  const days = valid ? Math.min(366, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1) : 0;
  const step = mode === "weekly" ? 7 : 1;
  const series = mode === "daily"
    ? Array.from({ length: 24 }, (_, hour) => ({
        label: `${String(hour).padStart(2, "0")}:00`,
        value: records.reduce((sum, r) => {
          const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", hourCycle: "h23" });
          const withinHour = (iso: string) => valid && qatarDay(iso) >= from && qatarDay(iso) <= to && Number(time.format(new Date(iso))) === hour;
          return sum + (r.status !== "pending" && withinHour(r.date) ? r.amount : 0) - (r.refundDate && withinHour(r.refundDate) ? r.refunded : 0);
        }, 0),
      }))
    : Array.from({ length: Math.ceil(days / step) }, (_, index) => {
        const first = shiftDay(from, index * step), last = shiftDay(first, step - 1);
        return { label: new Intl.DateTimeFormat(c.ar ? "ar-QA" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Qatar" }).format(new Date(`${first}T12:00:00Z`)),
          value: financeMetrics(records, first, last > to ? to : last).revenue };
      });
  const kinds = (["product", "house", "grooming"] as const).map((kind) => ({
    kind,
    value: financeMetrics(records.filter((r) => r.kind === kind), from, to).revenue,
    label: kind === "product" ? c.text("Products", "المنتجات") : kind === "house" ? c.text("Pet Houses", "بيوت الحيوانات") : c.text("Grooming", "العناية"),
    color: FINANCE_KIND_COLORS[kind],
  }));
  return <FinanceChartPanels series={series} kinds={kinds} mode={mode} setMode={setMode}
    modes={[{ value: "daily", label: c.text("Daily", "يومي") }, { value: "weekly", label: c.text("Weekly", "أسبوعي") }, { value: "monthly", label: c.text("Monthly", "شهري") }]}
    netLabel={c.text("Net Revenue", "صافي الإيراد")} />;
}

/** The two chart cards (bars over time, ring by type), shared by mock and API modes. Amounts in dirhams. */
export function FinanceChartPanels<M extends string>({ series, kinds, mode, setMode, modes, netLabel, title, typeTitle, emptyText }: {
  series: FinanceChartPoint[]; kinds: FinanceChartKind[]; mode: M; setMode: (value: M) => void;
  modes: readonly { value: M; label: string }[]; netLabel: string; title?: string; typeTitle?: string; emptyText?: string;
}) {
  const c = useCopy(), bars = useRef<HTMLCanvasElement>(null), ring = useRef<HTMLCanvasElement>(null);
  const total = kinds.reduce((n, k) => n + k.value, 0);
  const positiveTotal = kinds.reduce((n, k) => n + Math.max(0, k.value), 0);
  const hasNegative = kinds.some((k) => k.value < 0);
  const hasData = series.some((s) => s.value !== 0);
  const heading = title ?? c.text("Revenue Overview", "نظرة على الإيرادات");
  const typeHeading = typeTitle ?? c.text("Revenue by Type", "الإيرادات حسب النوع");
  useEffect(() => {
    const canvas = bars.current, donut = ring.current;
    if (!canvas || !donut) return;
    function draw() {
      if (!canvas || !donut) return;
      const context = canvas.getContext("2d"), dc = donut.getContext("2d");
      if (!context || !dc) return;
      const width = canvas.clientWidth || 500, height = 164, density = window.devicePixelRatio || 1;
      canvas.width = width * density; canvas.height = height * density;
      context.scale(density, density); context.clearRect(0, 0, width, height);
      const left = 48, right = 8, top = 10, bottom = 30;
      const values = series.map((s) => s.value / 100);
      const high = Math.max(1, ...values), low = Math.min(0, ...values);
      const ceiling = Math.ceil(high / 100) * 100, floor = Math.floor(low / 100) * 100;
      const chartHeight = height - top - bottom, chartWidth = width - left - right;
      const y = (value: number) => top + chartHeight * (ceiling - value) / (ceiling - floor);
      context.font = '9px Inter, Arial, sans-serif'; context.textAlign = "right";
      for (let i = 0; i <= 3; i++) {
        const value = floor + (ceiling - floor) * i / 3, point = y(value);
        context.strokeStyle = "#eef1f5"; context.beginPath(); context.moveTo(left, point); context.lineTo(width - right, point); context.stroke();
        context.fillStyle = "#70849d"; context.fillText(new Intl.NumberFormat(c.ar ? "ar-QA" : "en", { maximumFractionDigits: 0 }).format(value), left - 7, point + 3);
      }
      const gap = chartWidth / Math.max(series.length, 1), barWidth = Math.max(2, Math.min(16, gap * 0.6));
      series.forEach((point, index) => {
        const x = left + gap * index + (gap - barWidth) / 2, zero = y(0), valueY = y(point.value / 100);
        context.fillStyle = point.value < 0 ? "#f194a1" : "#a7cbfb";
        context.fillRect(x, Math.min(valueY, zero), barWidth, Math.max(point.value === 0 ? 0 : 2, Math.abs(zero - valueY)));
        if (index % Math.max(1, Math.ceil(series.length / 6)) === 0 || index === series.length - 1) {
          context.fillStyle = "#70849d"; context.textAlign = "center";
          context.fillText(point.label, x + barWidth / 2, height - 9);
        }
      });
      donut.width = 136 * density; donut.height = 136 * density;
      dc.scale(density, density); dc.clearRect(0, 0, 136, 136);
      const positive = kinds.reduce((n, k) => n + Math.max(0, k.value), 0);
      dc.strokeStyle = "#eef1f5"; dc.lineWidth = 22; dc.beginPath(); dc.arc(68, 68, 52, 0, Math.PI * 2); dc.stroke();
      let angle = -Math.PI / 2;
      if (positive > 0) for (const kind of kinds) {
        const sweep = Math.max(0, kind.value) / positive * Math.PI * 2;
        if (!sweep) continue;
        dc.strokeStyle = kind.color; dc.beginPath(); dc.arc(68, 68, 52, angle + 0.012, angle + sweep - 0.012); dc.stroke(); angle += sweep;
      }
    }
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw); observer.observe(canvas);
    return () => observer.disconnect();
  }, [series, kinds, c.ar]);
  return <div className="finance-chart-grid">
    <section className="finance-card finance-revenue-chart" aria-label={heading}>
      <div className="finance-card-heading"><h2>{heading}</h2>
        <fieldset className="finance-chart-tabs" aria-label={c.text("Chart grouping", "تجميع المخطط")}>
          {modes.map((item) => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => setMode(item.value)}>
            {item.label}
          </button>)}
        </fieldset>
      </div>
      <canvas ref={bars} role="img" aria-label={c.text("Net collected revenue by period in QAR", "صافي الإيرادات المحصلة حسب الفترة بالريال القطري")} />
      {!hasData && <p className="finance-chart-empty">{emptyText ?? c.text("No settled revenue in this period.", "لا توجد إيرادات محصلة في هذه الفترة.")}</p>}
      <details className="finance-chart-data"><summary>{c.text("View chart data", "عرض بيانات المخطط")}</summary>
        <ul>{series.map((point) => <li key={point.label}><span>{point.label}</span><bdi>{financeMoney(point.value, c.locale)}</bdi></li>)}</ul>
      </details>
    </section>
    <section className="finance-card finance-type-chart" aria-label={typeHeading}>
      <h2>{typeHeading}</h2>
      <div className="finance-type-chart-content">
        <div className="finance-donut"><canvas ref={ring} role="img" aria-label={c.text("Share of net revenue by type", "حصة صافي الإيرادات حسب النوع")} /><div><small>{c.text("QAR", "ر.ق")}</small>
          <strong>{new Intl.NumberFormat(c.ar ? "ar-QA" : "en", { maximumFractionDigits: 2 }).format(total / 100)}</strong>
          <small>{netLabel}</small></div></div>
        <ul>{kinds.map((kind) => <li key={kind.kind}><i style={{ backgroundColor: kind.color }} aria-hidden="true" /><div><span>{kind.label}</span><small>{financeMoney(kind.value, c.locale)}</small></div>
          <bdi>{positiveTotal > 0 && kind.value > 0 ? Math.round(kind.value / positiveTotal * 100) : 0}%</bdi></li>)}</ul>
      </div>
      {hasNegative && <p className="finance-chart-empty">{c.text("Ring shares show positive net revenue only; refunds may make a category negative.", "تُظهر نسب الدائرة الإيرادات الصافية الموجبة فقط؛ قد تجعل الاستردادات فئةً سالبة.")}</p>}
    </section>
  </div>;
}
