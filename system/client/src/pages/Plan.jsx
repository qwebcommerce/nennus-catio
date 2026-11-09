import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatMoney(value, currency, locale) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currency || "SAR",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || "SAR"}`;
  }
}

export default function Plan() {
  const { t, locale } = useI18n();
  const { refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [selectedInterval, setSelectedInterval] = useState("year");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmStarted = React.useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await api("/api/plan");
      setData(payload);
      const currentInterval = payload?.current?.selectedPlanInterval;
      if (currentInterval) setSelectedInterval(currentInterval);
      else if (payload?.plans?.length) {
        const yearly = payload.plans.find((p) => p.id === "year");
        setSelectedInterval(yearly?.id || payload.plans[0].id);
      }
    } catch (requestError) {
      setData(null);
      setError(requestError.message || t("plan.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // After Stripe redirect: confirm session then refresh auth/plan
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (checkout === "cancelled") {
      setMsg(t("plan.checkoutCancelled"));
      setSearchParams({}, { replace: true });
      return;
    }
    if (checkout !== "success" || !sessionId || confirmStarted.current) return;
    confirmStarted.current = true;

    let cancelled = false;
    (async () => {
      setConfirming(true);
      setMsg(t("plan.confirming"));
      try {
        await api("/api/plan/confirm-checkout", {
          method: "POST",
          body: { sessionId },
        });
        if (cancelled) return;
        await refreshUser?.();
        await load();
        setMsg(t("plan.upgradeSuccess"));
      } catch (e) {
        if (!cancelled) {
          setError(e.message || t("plan.confirmFailed"));
          setMsg("");
          confirmStarted.current = false;
        }
      } finally {
        if (!cancelled) {
          setConfirming(false);
          setSearchParams({}, { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, load, refreshUser, t]);

  const current = data?.current;
  const purchases = Array.isArray(data?.purchases) ? data.purchases : [];
  const plans = Array.isArray(data?.plans) ? data.plans : [];
  const planName = current?.plan || "FREE";
  const isPremium = planName === "PREMIUM";
  const isHighest = Boolean(current?.isHighestPlan);
  const upgradeAvailable = Boolean(current?.upgradeAvailable);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedInterval) || plans[0],
    [plans, selectedInterval],
  );

  async function startUpgrade() {
    if (!upgradeAvailable || busy) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await api("/api/plan/checkout-session", {
        method: "POST",
        body: { planInterval: selectedInterval },
      });
      if (res?.bypass) {
        await refreshUser?.();
        setData(res.plan || null);
        setMsg(t("plan.upgradeSuccess"));
        return;
      }
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      setError(t("plan.checkoutFailed"));
    } catch (e) {
      setError(e.message || t("plan.checkoutFailed"));
    } finally {
      setBusy(false);
    }
  }

  const intervalLabel =
    locale === "en"
      ? current?.intervalLabelEn
      : current?.intervalLabelAr || current?.intervalLabelEn;

  return (
    <div className="plan-page">
      <header className="plan-page__header">
        <div>
          <h1>{t("plan.title")}</h1>
          <p>{t("plan.intro")}</p>
        </div>
        <button
          type="button"
          className="btn-touch plan-page__refresh"
          onClick={load}
          disabled={loading || confirming}
        >
          {t("pos.refresh")}
        </button>
      </header>

      {error ? <div className="card plan-page__error">{error}</div> : null}
      {msg ? <div className="card plan-page__msg">{msg}</div> : null}

      {loading && !current ? (
        <div className="card plan-page__loading">{t("common.loading")}</div>
      ) : current ? (
        <>
          <section className={`plan-current${isPremium ? " plan-current--premium" : ""}`}>
            <div className="plan-current__copy">
              <span className="plan-current__eyebrow">{t("plan.currentPlan")}</span>
              <div className="plan-current__name-row">
                <h2>{t(`plan.name.${planName}`)}</h2>
                <span className="plan-current__badge">
                  {isPremium ? t("plan.activePremium") : t("plan.active")}
                </span>
              </div>
              <p>{current.name}</p>
              {isPremium && intervalLabel ? (
                <p className="plan-current__interval">
                  {t("plan.billingInterval")}: <strong>{intervalLabel}</strong>
                  {current.intervalAmountSar != null
                    ? ` · ${formatMoney(current.intervalAmountSar, "SAR", locale)}`
                    : ""}
                </p>
              ) : (
                <p className="plan-current__interval">{t("plan.freeLimits")}</p>
              )}
            </div>

            <div className="plan-current__mark" aria-hidden="true">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m3 8 4 9h10l4-9-5 3-4-6-4 6-5-3Z" />
                <path d="M7 20h10" />
              </svg>
            </div>

            <div className="plan-current__stats">
              <div>
                <span>{t("plan.branches")}</span>
                <strong>
                  {current.branchCount} / {current.maxBranches}
                </strong>
              </div>
              <div>
                <span>{t("plan.users")}</span>
                <strong>{current.userCount}</strong>
              </div>
              <div>
                <span>{t("plan.memberSince")}</span>
                <strong>{new Date(current.createdAt).toLocaleDateString()}</strong>
              </div>
            </div>
          </section>

          {current.atBranchLimit ? (
            <div className="card" style={{ color: "var(--danger)", fontSize: 14 }}>
              {isHighest
                ? t("plan.branchLimitHighest", {
                    max: String(current.maxBranches),
                    count: String(current.branchCount),
                  })
                : t("plan.branchLimitReached", {
                    max: String(current.maxBranches),
                    count: String(current.branchCount),
                  })}
            </div>
          ) : (
            <div className="card" style={{ color: "var(--muted)", fontSize: 14 }}>
              {t("plan.branchesRemaining", {
                n: String(
                  current.branchesRemaining ??
                    Math.max(0, current.maxBranches - current.branchCount),
                ),
              })}
            </div>
          )}

          <section className="card plan-upgrade">
            <div className="plan-upgrade__head">
              <div>
                <h2>{isHighest ? t("plan.highestTitle") : t("plan.upgradeTitle")}</h2>
                <p>
                  {isHighest ? t("plan.highestIntro") : t("plan.upgradeIntro", { days: String(current.trialDays || 90) })}
                </p>
              </div>
            </div>

            <div className="plan-upgrade__grid">
              {plans.map((p) => {
                const active = selectedInterval === p.id;
                const label = locale === "en" ? p.labelEn : p.labelAr;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`plan-upgrade__card${active ? " is-active" : ""}${isHighest ? " is-disabled" : ""}`}
                    onClick={() => !isHighest && setSelectedInterval(p.id)}
                    disabled={isHighest}
                    aria-pressed={active}
                  >
                    <span className="plan-upgrade__card-label">{label}</span>
                    <strong>
                      {formatMoney(p.amountSar ?? p.amount, "SAR", locale)}
                    </strong>
                    {p.amountLocal != null && p.currencyLocal && p.currencyLocal !== "SAR" ? (
                      <span className="plan-upgrade__card-local">
                        ≈ {formatMoney(p.amountLocal, p.currencyLocal, locale)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <ul className="plan-upgrade__features">
              <li>{t("plan.feature.pos")}</li>
              <li>{t("plan.feature.inventory")}</li>
              <li>{t("plan.feature.branches")}</li>
              <li>{t("plan.feature.intelligence")}</li>
              <li>{t("plan.feature.support")}</li>
            </ul>

            <div className="plan-upgrade__actions">
              <button
                type="button"
                className="btn"
                disabled={isHighest || !upgradeAvailable || busy || confirming || !selectedPlan}
                onClick={startUpgrade}
                title={isHighest ? t("plan.upgradeDisabledHint") : undefined}
              >
                {isHighest
                  ? t("plan.upgradeDisabled")
                  : busy
                    ? t("plan.upgradeStarting")
                    : t("plan.upgradeCta", {
                        plan: selectedPlan
                          ? locale === "en"
                            ? selectedPlan.labelEn
                            : selectedPlan.labelAr
                          : "",
                      })}
              </button>
              {!isHighest ? (
                <p className="plan-upgrade__hint">{t("plan.stripeHint")}</p>
              ) : null}
            </div>
          </section>

          <section className="card plan-history">
            <div className="plan-history__head">
              <div>
                <h2>{t("plan.historyTitle")}</h2>
                <p>{t("plan.historyIntro")}</p>
              </div>
              <span>{t("plan.purchaseCount", { count: purchases.length })}</span>
            </div>

            <div className="plan-history__table-wrap">
              <table className="plan-history__table">
                <thead>
                  <tr>
                    <th>{t("plan.date")}</th>
                    <th>{t("plan.plan")}</th>
                    <th>{t("plan.amount")}</th>
                    <th>{t("plan.reference")}</th>
                    <th>{t("plan.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="plan-history__empty">
                          <span aria-hidden="true">◇</span>
                          <strong>{t("plan.emptyTitle")}</strong>
                          <p>{t("plan.emptyHint")}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td className="plan-history__date">
                          {new Date(purchase.purchasedAt).toLocaleString()}
                        </td>
                        <td>
                          <span className="plan-history__plan">
                            {t(`plan.name.${purchase.plan}`)}
                          </span>
                        </td>
                        <td>
                          {formatMoney(purchase.amount, purchase.currency, locale)}
                        </td>
                        <td>{purchase.reference || "—"}</td>
                        <td>{purchase.note || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
