"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, Layers3 } from "lucide-react";
import type {
  FoundationAreaId,
  Locale,
  ModuleId,
} from "@nennus-catio/contracts";
import {
  createFoundationRepository,
  type PreviewScenario,
} from "@/mocks/adapters/foundation-repository";
import { useDemoIdentity } from "@/layouts/global/GlobalProviders";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { Button } from "./Button";
import { ActionLink } from "./ActionLink";

export function FeatureFoundation({
  area,
  admin = false,
}: {
  area: FoundationAreaId;
  admin?: boolean;
}) {
  const t = useTranslations("Common");
  const features = useTranslations("Features");
  const a = useTranslations("Admin");
  const locale = useLocale() as Locale;
  const { role } = useDemoIdentity();
  const access = useAdminAccess();
  const allowed = !admin || access.canView(area as ModuleId);
  const [scenario, setScenario] = useState<PreviewScenario>("normal");
  const query = useQuery({
    queryKey: ["foundation", area, scenario],
    enabled: allowed,
    queryFn: ({ signal }) =>
      createFoundationRepository(scenario).getArea(area, signal),
  });
  if (!allowed)
    return (
      <section className="state-panel" aria-labelledby="restricted-title">
        <CircleAlert size={30} strokeWidth={1.5} aria-hidden="true" />
        <h1 id="restricted-title">{a("forbidden")}</h1>
        <p>{a("forbiddenText")}</p>
        <ActionLink href={role === "finance" ? "/admin/finance" : "/admin"}>
          {role === "finance" ? a("goFinance") : a("goDashboard")}
        </ActionLink>
      </section>
    );
  return (
    <section
      className={`feature-foundation ${admin ? "feature-foundation--admin" : ""}`}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("foundation")}</p>
          <h1>{features(area)}</h1>
          <p className="muted">{t("foundationNotice")}</p>
        </div>
        <span className="phase-badge">
          {query.data
            ? t("phase", { number: query.data.readyInPhase })
            : t("preview")}
        </span>
      </div>
      <div className="foundation-panel">
        <div className="panel-heading">
          <Layers3 size={23} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("noData")}</span>
        </div>
        <label className="scenario-control">
          {t("scenario")}
          <select
            value={scenario}
            onChange={(event) =>
              setScenario(event.target.value as PreviewScenario)
            }
          >
            <option value="normal">{t("normal")}</option>
            <option value="empty">{t("empty")}</option>
            <option value="unavailable">{t("unavailable")}</option>
          </select>
        </label>
        {query.isPending ? (
          <p role="status" aria-busy="true">
            {t("loading")}
          </p>
        ) : query.isError ? (
          <div className="inline-state" role="alert">
            <h2>{t("loadError")}</h2>
            <p>{t("loadErrorDetail")}</p>
            <Button variant="secondary" onClick={() => void query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : query.data.steps.length === 0 ? (
          <div className="inline-state" role="status">
            <h2>{t("mockEmpty")}</h2>
            <p>{t("emptyDetail")}</p>
          </div>
        ) : (
          <>
            <p className="sr-only" role="status">
              {t("mockSuccess")}
            </p>
            <ol className="journey-preview">
              {query.data.steps.map((step, index) => (
                <li key={step.en}>
                  <span className="step-index">{index + 1}</span>
                  <span>{step[locale]}</span>
                  {index < query.data.steps.length - 1 && (
                    <ArrowRight
                      className="directional"
                      size={17}
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="foundation-caption">{t("demo")}</p>
      </div>
    </section>
  );
}
