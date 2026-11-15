"use client";

import {
  type AdminPosIntegration,
  type AdminPosKey,
  type CreatePosKeyResponse,
  POS_ALERT_MINUTES,
  type PosScope,
} from "@nennus-catio/contracts";
import { Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ReauthModal, useReauthentication } from "@/features/admin/auth/Reauthentication";
import { Link } from "@/i18n/navigation";
import { alertLine } from "../lib/alerts";
import { usePosIntegration, usePosIntegrationChanges } from "@/shared/api/admin-pos";
import { ApiError } from "@/shared/api/client";
import { errorMessage } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { formatStaffDateTime, isolate } from "@/shared/lib/format";
import { AdminPage, Field, Modal } from "@/shared/ui/BusinessUI";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { NumberInput } from "@/shared/ui/NumberInput";

const RIGHTS: readonly { scope: PosScope; en: string; ar: string }[] = [
  { scope: "orders:read", en: "Read orders and bookings", ar: "قراءة الطلبات والحجوزات" },
  { scope: "items:write", en: "Send items (stock, prices, on/off)", ar: "إرسال الأصناف (المخزون والأسعار وحالة العرض)" },
];

/**
 * The owner's Integrations page (#16 part 2c; the part 2 plan's sections 4 and 7; D285 answer
 * 14): the POS connection's keys, how it is doing, and the alert settings. Owner only (the menu and
 * the API). Making a key and changing what a key may do ask for the password again (D98); every risky
 * change asks first (D128). The server command (`pnpm pos-key:*`) stays for a locked-out owner.
 */
export function AdminIntegrationsApiPage() {
  const c = useCopy();
  const page = usePosIntegration();
  const reauth = useReauthentication();
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<CreatePosKeyResponse | null>(null);
  const changes = usePosIntegrationChanges(reauth.run, (created) => {
    setCreating(false);
    setMade(created);
  });
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const when = (iso: string) => formatStaffDateTime(iso, c.locale);

  async function act(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (error: unknown) {
      setActionError(error);
    }
  }

  function askRevoke(key: AdminPosKey) {
    setConfirming({
      title: c.text(`Revoke the key “${key.name}”?`, `إلغاء المفتاح «${isolate(key.name)}»؟`),
      message: c.text(
        "Calls with it are refused at once, and it can never be used again. A new key starts after the events that exist when it is made, so the POS would skip the ones in between: when replacing a key, make the new one first.",
        "تُرفض الطلبات به فوراً ولا يمكن استخدامه مرة أخرى. يبدأ المفتاح الجديد بعد الأحداث الموجودة عند إنشائه، لذا سيتخطى نظام نقطة البيع ما بينها: عند استبدال مفتاح، أنشئ الجديد أولاً.",
      ),
      confirmLabel: c.text("Revoke the key", "إلغاء المفتاح"),
      run: () => act(() => changes.revoke(key.id)),
    });
  }

  function askItems(key: AdminPosKey, allow: boolean) {
    const scopes: PosScope[] = allow ? [...key.scopes, "items:write"] : key.scopes.filter((scope) => scope !== "items:write");
    setConfirming(
      allow
        ? {
            title: c.text(`Let “${key.name}” send items?`, `السماح لـ«${isolate(key.name)}» بإرسال الأصناف؟`),
            message: c.text(
              "The POS can then set the stock, price and on/off of every pack that follows a POS code. Big price drops still wait for staff, and a price of 0 is refused. The same key keeps its place in the order list.",
              "يمكن لنظام نقطة البيع عندها ضبط مخزون وسعر وحالة عرض كل عبوة تتبع رمزاً من نقطة البيع. يبقى انخفاض السعر الكبير بانتظار الموظفين، ويُرفض السعر صفر. ويحتفظ المفتاح نفسه بمكانه في قائمة الطلبات.",
            ),
            confirmLabel: c.text("Allow sending items", "السماح بإرسال الأصناف"),
            run: () => act(() => changes.setScopes(key.id, scopes)),
          }
        : {
            title: c.text(`Stop “${key.name}” sending items?`, `إيقاف إرسال الأصناف لـ«${isolate(key.name)}»؟`),
            message: c.text(
              "Its next items message is refused. Packs keep the stock, prices and on/off last sent, and keep following their POS codes, but nothing updates them until a key may send items again. The stock alert stops watching this key.",
              "تُرفض رسالة الأصناف التالية منه. تحتفظ العبوات بآخر مخزون وأسعار وحالة عرض أُرسلت، وتبقى تتبع رموز نقطة البيع، لكن لا شيء يحدّثها حتى يُسمح لمفتاح بإرسال الأصناف من جديد. ويتوقف تنبيه المخزون عن متابعة هذا المفتاح.",
            ),
            confirmLabel: c.text("Stop sending items", "إيقاف إرسال الأصناف"),
            run: () => act(() => changes.setScopes(key.id, scopes)),
          },
    );
  }

  return (
    <AdminPage
      module="integrations"
      title={c.text("Integrations", "الربط مع الأنظمة")}
      subtitle={c.text(
        "The POS connection: its keys, how it is doing, and when you hear if it stops. Only you, the owner, see this page.",
        "الربط مع نظام نقطة البيع: مفاتيحه، وحالته، ومتى يصلك تنبيه إن توقف. لا يرى هذه الصفحة غيرك بصفتك المالك.",
      )}
      actions={
        <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          {c.text("Make a key", "إنشاء مفتاح")}
        </button>
      }
    >
      {actionError !== null && (
        <p className="form-error" role="alert">
          {errorMessage(actionError, c.text)}
        </p>
      )}
      {page.isError && (
        <div className="form-error" role="alert">
          <p>{errorMessage(page.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void page.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      )}
      {!page.data ? (
        !page.isError && (
          <p role="status" aria-busy="true" className="muted">
            {c.text("Loading the POS connection…", "جارٍ تحميل الربط مع نظام نقطة البيع…")}
          </p>
        )
      ) : (
        <>
          {page.data.alerts.map((alert) => (
            <p key={alert.kind} className="note-box row integration-alert" role="alert">
              <TriangleAlert size={20} aria-hidden="true" />
              <span>
                <strong>{c.text(`Alert since ${when(alert.openedAt)}`, `تنبيه منذ ${when(alert.openedAt)}`)}</strong>{" "}
                {alertLine(alert, c.text, when)}
              </span>
            </p>
          ))}
          <Health data={page.data} />
          <Keys data={page.data} onRevoke={askRevoke} onItems={askItems} />
          <AlertSettings settings={page.data.settings} save={changes.saveSettings} />
        </>
      )}

      {/* Fresh each time it opens, so a second key starts empty. */}
      {creating && <CreateKeyModal open onClose={() => setCreating(false)} onCreate={(body) => changes.createKey(body)} />}
      <Modal
        open={made !== null}
        onOpenChange={(open) => !open && setMade(null)}
        title={c.text("Pass this key on", "سلّم هذا المفتاح")}
        description={c.text(
          "Shown only now: it is never shown again. Send it privately to whoever will use it (a direct message, never a group chat). If it is lost before it is used, revoke it and make a new one.",
          "يظهر الآن فقط ولن يظهر مرة أخرى. أرسله بشكل خاص إلى من سيستخدمه (رسالة مباشرة، وليس في مجموعة). إن ضاع قبل استخدامه، ألغِه وأنشئ مفتاحاً جديداً.",
        )}
      >
        {made && <MadeKey made={made} onDone={() => setMade(null)} />}
      </Modal>
      <ReauthModal
        description={c.text(
          "For your security, enter your password again to make a key or change what a key may do.",
          "لحمايتك، أدخل كلمة المرور مرة أخرى لإنشاء مفتاح أو تغيير صلاحياته.",
        )}
        open={reauth.pending}
        onCancel={reauth.cancel}
        error={reauth.reauth.error}
        pending={reauth.reauth.isPending}
        onConfirm={(password) => {
          void reauth.confirm(password).catch((error: unknown) => {
            if (!(error instanceof ApiError && error.code === "INVALID_CREDENTIALS")) setActionError(error);
          });
        }}
      />
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </AdminPage>
  );
}

/** The link's health: the last items message, each key's collection, and the POS items list in figures. */
function Health({ data }: { data: AdminPosIntegration }) {
  const c = useCopy();
  const when = (iso: string) => formatStaffDateTime(iso, c.locale);
  const message = data.lastMessage;
  const collectors = data.keys.filter((key) => key.collection !== null);
  return (
    <section className="panel form-stack" aria-labelledby="integration-health">
      <div className="admin-setting-heading">
        <h2 id="integration-health">{c.text("How the connection is doing", "حالة الربط")}</h2>
      </div>
      <div className="integration-health">
        <div>
          <h3>{c.text("Stock from the POS", "المخزون من نقطة البيع")}</h3>
          {message ? (
            <>
              <p>
                {c.text(
                  `Last message ${when(message.receivedAt)}, from “${message.keyName}”: ${message.items} items.`,
                  `آخر رسالة ${when(message.receivedAt)} من «${isolate(message.keyName)}»: ${message.items} صنفاً.`,
                )}
              </p>
              <p className="small muted">
                {c.text(
                  `${message.applied} applied · ${message.new} new · ${message.priceHeld} price waiting · ${message.priceRefused} price refused · ${message.stale} older than the last count · ${message.short} short`,
                  `${message.applied} طُبّق · ${message.new} جديد · ${message.priceHeld} سعر بانتظار القرار · ${message.priceRefused} سعر مرفوض · ${message.stale} أقدم من آخر جرد · ${message.short} نقص`,
                )}
              </p>
            </>
          ) : (
            <p>{c.text("No stock message from the POS yet.", "لم تصل رسالة مخزون من نظام نقطة البيع بعد.")}</p>
          )}
          <p className="small muted">
            {c.text(
              `You get an alert after ${data.settings.itemsSilenceMinutes} minutes without one (an empty message counts), once the POS has sent its first.`,
              `يصلك تنبيه بعد ${data.settings.itemsSilenceMinutes} دقيقة دون رسالة (والرسالة الفارغة تُحسب)، بعد أن يرسل نظام نقطة البيع أول رسالة.`,
            )}
          </p>
        </div>
        <div>
          <h3>{c.text("Orders and bookings to the POS", "الطلبات والحجوزات إلى نقطة البيع")}</h3>
          {collectors.length === 0 ? (
            <p>{c.text("No key may read orders.", "لا يوجد مفتاح يُسمح له بقراءة الطلبات.")}</p>
          ) : (
            collectors.map((key) => (
              <p key={key.id}>
                <strong>{key.name}</strong>: <CollectionText keyRow={key} />
              </p>
            ))
          )}
          <p className="small muted">
            {c.text(
              `You get an alert when an event waits more than ${data.settings.eventsLagMinutes} minutes, once a key has collected. Newest event: number ${data.lastEventId}.`,
              `يصلك تنبيه عندما ينتظر حدث أكثر من ${data.settings.eventsLagMinutes} دقيقة، بعد أن يستلم مفتاح مرة. أحدث حدث: رقم ${data.lastEventId}.`,
            )}
          </p>
        </div>
        <div>
          <h3>{c.text("The POS items list", "قائمة «أصناف نقطة البيع»")}</h3>
          <p>
            {c.text(
              `${data.items.total} codes: ${data.items.linked} linked, ${data.items.new} new, ${data.items.attention} needing attention.`,
              `${data.items.total} رمزاً: ${data.items.linked} مربوط، ${data.items.new} جديد، ${data.items.attention} يحتاج متابعة.`,
            )}
          </p>
          <Link className="text-link" href="/admin/products?section=pos">
            {c.text("Open the POS items list", "افتح قائمة «أصناف نقطة البيع»")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function CollectionText({ keyRow }: { keyRow: AdminPosKey }) {
  const c = useCopy();
  const when = (iso: string) => formatStaffDateTime(iso, c.locale);
  const collection = keyRow.collection;
  if (!collection) return null;
  if (collection.lastAt === null) {
    return <>{c.text(`never collected; ${collection.waiting} events wait.`, `لم يستلم بعد؛ ${collection.waiting} حدثاً بالانتظار.`)}</>;
  }
  return (
    <>
      {c.text(`last collected ${when(collection.lastAt)}; `, `آخر استلام ${when(collection.lastAt)}؛ `)}
      {collection.waiting === 0 || collection.oldestWaitingAt === null
        ? c.text("nothing waits.", "لا شيء بالانتظار.")
        : c.text(
            `${collection.waiting} events wait, the oldest since ${when(collection.oldestWaitingAt)}.`,
            `${collection.waiting} حدثاً بالانتظار، أقدمها منذ ${when(collection.oldestWaitingAt)}.`,
          )}
    </>
  );
}

function Keys({ data, onRevoke, onItems }: { data: AdminPosIntegration; onRevoke: (key: AdminPosKey) => void; onItems: (key: AdminPosKey, allow: boolean) => void }) {
  const c = useCopy();
  const when = (iso: string) => formatStaffDateTime(iso, c.locale);
  return (
    <section className="panel" aria-labelledby="integration-keys">
      <div className="admin-setting-heading">
        <h2 id="integration-keys">{c.text("Keys", "المفاتيح")}</h2>
        <p className="small muted">
          {c.text(
            "One key per system and site. To change what a system may do, change the rights of its key: a new key would make it skip the events in between.",
            "مفتاح واحد لكل نظام وموقع. لتغيير ما يُسمح لنظام ما به، غيّر صلاحيات مفتاحه: المفتاح الجديد سيجعله يتخطى الأحداث بينهما.",
          )}
        </p>
      </div>
      {data.keys.length === 0 ? (
        <p className="muted">{c.text("No keys yet.", "لا مفاتيح بعد.")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{c.text("Name", "الاسم")}</th>
                <th>{c.text("May", "الصلاحيات")}</th>
                <th>{c.text("Made", "أُنشئ")}</th>
                <th>{c.text("Last call", "آخر اتصال")}</th>
                <th>{c.text("Status", "الحالة")}</th>
                <th>
                  <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.keys.map((key) => (
                <tr key={key.id}>
                  <td>
                    <KeyRound size={15} aria-hidden="true" /> {key.name}
                  </td>
                  <td>
                    {RIGHTS.filter((right) => key.scopes.includes(right.scope))
                      .map((right) => c.text(right.en, right.ar))
                      .join(" · ")}
                  </td>
                  <td>
                    {when(key.createdAt)}
                    <small className="pos-item-name">
                      {key.createdBy === "owner" ? c.text("on this page", "من هذه الصفحة") : c.text("by the server command", "بأمر الخادم")}
                    </small>
                  </td>
                  <td>{key.lastUsedAt ? when(key.lastUsedAt) : c.text("Never", "لم يُستخدم")}</td>
                  <td>
                    {key.revokedAt
                      ? c.text(`Revoked ${when(key.revokedAt)}`, `أُلغي ${when(key.revokedAt)}`)
                      : c.text("Active", "نشط")}
                  </td>
                  <td>
                    {!key.revokedAt && (
                      <div className="row">
                        {key.scopes.includes("items:write") ? (
                          key.scopes.includes("orders:read") && (
                            <button type="button" className="text-button" onClick={() => onItems(key, false)} aria-label={`${c.text("Stop sending items", "إيقاف إرسال الأصناف")} ${key.name}`}>
                              {c.text("Stop sending items", "إيقاف إرسال الأصناف")}
                            </button>
                          )
                        ) : (
                          <button type="button" className="text-button" onClick={() => onItems(key, true)} aria-label={`${c.text("Allow sending items", "السماح بإرسال الأصناف")} ${key.name}`}>
                            {c.text("Allow sending items", "السماح بإرسال الأصناف")}
                          </button>
                        )}
                        <button type="button" className="text-button" onClick={() => onRevoke(key)} aria-label={`${c.text("Revoke", "إلغاء")} ${key.name}`}>
                          {c.text("Revoke", "إلغاء")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CreateKeyModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (body: { name: string; scopes: PosScope[] }) => Promise<unknown>;
}) {
  const c = useCopy();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<PosScope[]>(["orders:read", "items:write"]);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), scopes });
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={c.text("Make a key", "إنشاء مفتاح")}
      description={c.text(
        "For one system on this site, for example “POS live”. It sees events from now on: orders placed before it is made never reach that system.",
        "لنظام واحد على هذا الموقع، مثل «POS live». يرى الأحداث من الآن: الطلبات التي سبقت إنشاءه لا تصل إلى ذلك النظام.",
      )}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={c.text("Name", "الاسم")}>
          <input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <fieldset className="form-stack">
          <legend>{c.text("It may", "يُسمح له بـ")}</legend>
          {RIGHTS.map((right) => (
            <label key={right.scope} className="row">
              <input
                type="checkbox"
                checked={scopes.includes(right.scope)}
                onChange={(event) =>
                  setScopes((current) => (event.target.checked ? [...current, right.scope] : current.filter((scope) => scope !== right.scope)))
                }
              />
              {c.text(right.en, right.ar)}
            </label>
          ))}
        </fieldset>
        {error !== null && (
          <p className="form-error" role="alert">
            {errorMessage(error, c.text)}
          </p>
        )}
        <button type="submit" className="button button--primary" disabled={saving || scopes.length === 0}>
          {c.text("Make the key", "أنشئ المفتاح")}
        </button>
      </form>
    </Modal>
  );
}

function MadeKey({ made, onDone }: { made: CreatePosKeyResponse; onDone: () => void }) {
  const c = useCopy();
  const [copied, setCopied] = useState(false);
  return (
    <div className="form-stack">
      <p>
        <strong>{made.key.name}</strong> ·{" "}
        {RIGHTS.filter((right) => made.key.scopes.includes(right.scope))
          .map((right) => c.text(right.en, right.ar))
          .join(" · ")}
      </p>
      <Field label={c.text("The key", "المفتاح")}>
        <input readOnly value={made.secret} dir="ltr" onFocus={(event) => event.currentTarget.select()} />
      </Field>
      <div className="row">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(made.secret).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          <Copy size={15} aria-hidden="true" />
          {c.text("Copy", "نسخ")}
        </Button>
        {copied && <span role="status">{c.text("Copied.", "تم النسخ.")}</span>}
      </div>
      <Button onClick={onDone}>{c.text("Done", "تم")}</Button>
    </div>
  );
}

function AlertSettings({
  settings,
  save,
}: {
  settings: AdminPosIntegration["settings"];
  save: (body: { version: number; itemsSilenceMinutes: number; eventsLagMinutes: number; alertEmail: string }) => Promise<unknown>;
}) {
  const c = useCopy();
  const [silence, setSilence] = useState(String(settings.itemsSilenceMinutes));
  const [lag, setLag] = useState(String(settings.eventsLagMinutes));
  const [email, setEmail] = useState(settings.alertEmail ?? "");
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const conflict = error instanceof ApiError && error.code === "CONFLICT";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await save({ version: settings.version, itemsSilenceMinutes: Number(silence), eventsLagMinutes: Number(lag), alertEmail: email.trim() });
      setSaved(true);
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel form-stack" onSubmit={submit} aria-labelledby="integration-alerts">
      <div className="admin-setting-heading">
        <h2 id="integration-alerts">{c.text("Alerts", "التنبيهات")}</h2>
        <p className="small muted">
          {c.text(
            "When the POS goes quiet, the website keeps selling with the last counts and you get one email when the problem starts and one when it ends. A line also shows in the bell.",
            "عندما يتوقف نظام نقطة البيع، يواصل الموقع البيع بآخر الكميات ويصلك بريد واحد عند بدء المشكلة وآخر عند انتهائها. ويظهر سطر في الجرس أيضاً.",
          )}
        </p>
      </div>
      <div className="form-two">
        <Field label={c.text("Minutes without a stock update", "دقائق دون تحديث للمخزون")}>
          <NumberInput kind="whole" min={POS_ALERT_MINUTES.min} max={POS_ALERT_MINUTES.max} required value={silence} onChange={(event) => setSilence(event.target.value)} />
        </Field>
        <Field label={c.text("Minutes an online order may wait for the POS", "دقائق يمكن أن ينتظر فيها طلب الموقع لدى نظام نقطة البيع")}>
          <NumberInput kind="whole" min={POS_ALERT_MINUTES.min} max={POS_ALERT_MINUTES.max} required value={lag} onChange={(event) => setLag(event.target.value)} />
        </Field>
      </div>
      <Field label={c.text("Alert email", "بريد التنبيهات")}>
        <input
          type="email"
          dir="ltr"
          maxLength={254}
          placeholder={settings.ownerEmail ?? ""}
          aria-describedby="integration-alert-email-hint"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <p className="small muted" id="integration-alert-email-hint">
        {c.text(
          `Leave it empty to use your login email${settings.ownerEmail ? ` (${settings.ownerEmail})` : ""}. The minutes are from ${POS_ALERT_MINUTES.min} to ${POS_ALERT_MINUTES.max} (a day).`,
          `اتركه فارغاً لاستخدام بريد دخولك${settings.ownerEmail ? ` (${settings.ownerEmail})` : ""}. الدقائق من ${POS_ALERT_MINUTES.min} إلى ${POS_ALERT_MINUTES.max} (يوم كامل).`,
        )}
      </p>
      {error !== null && (
        <p className="form-error" role="alert">
          {conflict
            ? c.text("Someone else saved these settings while you were editing. Reload the page to see them.", "حفظ شخص آخر هذه الإعدادات أثناء تعديلك. أعد تحميل الصفحة لرؤيتها.")
            : error instanceof ApiError && error.code === "VALIDATION_FAILED"
              ? c.text(
                  `Check the settings: the minutes from ${POS_ALERT_MINUTES.min} to ${POS_ALERT_MINUTES.max}, and a full email address or none.`,
                  `تحقق من الإعدادات: الدقائق من ${POS_ALERT_MINUTES.min} إلى ${POS_ALERT_MINUTES.max}، وبريد كامل أو لا شيء.`,
                )
              : errorMessage(error, c.text)}
        </p>
      )}
      {saved && <p role="status">{c.text("Saved.", "تم الحفظ.")}</p>}
      <div>
        <button type="submit" className="button button--primary" disabled={saving}>
          {c.text("Save alert settings", "احفظ إعدادات التنبيهات")}
        </button>
      </div>
    </form>
  );
}
