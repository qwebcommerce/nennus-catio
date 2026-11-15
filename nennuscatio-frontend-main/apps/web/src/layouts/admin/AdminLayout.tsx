"use client";
import type { DemoRole, StaffProfile } from "@nennus-catio/contracts";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import {
  DashboardDateControl,
  DashboardDateProvider,
} from "@/features/admin/dashboard/components/DashboardDate";
import {
  STAFF_CHANGE_PASSWORD_PATH,
  STAFF_PUBLIC_PATHS,
  StaffGate,
  useStaffLogout,
} from "@/features/admin/auth/StaffGate";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { StaffIdentityProvider, useDemoIdentity } from "@/layouts/global/GlobalProviders";
import { adminBookingSearch, emptyAdminBookingFilters, useAdminBookings } from "@/shared/api/admin-bookings";
import { adminCustomerSearch, emptyAdminCustomerFilters, useAdminCustomers } from "@/shared/api/admin-customers";
import { adminOrderSearch, emptyAdminOrderFilters, useAdminOrders } from "@/shared/api/admin-orders";
import { usePosAttention, usePosShort } from "@/shared/api/admin-pos";
import { adminRelocationSearch, emptyAdminRelocationFilters, useAdminRelocationList } from "@/shared/api/admin-relocation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { AdminAccessProvider, useAdminAccess } from "@/shared/access/AdminAccess";
import { useBusiness } from "@/mocks/MockDataProvider";
import { canPreviewModule } from "@/shared/lib/access";
import { useCopy } from "@/shared/lib/copy";
import { formatStaffDateTime } from "@/shared/lib/format";
import { petLabel } from "@/shared/lib/pet-label";
import { Brand } from "@/shared/ui/Brand";
import { Modal } from "@/shared/ui/BusinessUI";
import { LocaleSwitcher } from "@/shared/ui/LocaleSwitcher";
import { NavigationDrawer } from "@/shared/ui/NavigationDrawer";
import { adminNavigation, firstAllowedHref, SAMPLE_DATA_PAGES, visibleNavigation } from "./navigation";
import { alertLine } from "@/features/admin/integrations/lib/alerts";
import { ReleaseNotice } from "./ReleaseNotice";
import { SampleDataBanner } from "./SampleDataBanner";
import {
  BookingsHeaderControls,
  BookingsWorkspaceProvider,
} from "@/features/admin/bookings/BookingsWorkspace";
import {
  FinanceHeaderSearch,
  FinanceWorkspaceProvider,
} from "@/features/admin/finance/FinanceWorkspace";
import {
  PromotionsCreateButton,
  PromotionsHeaderSearch,
  PromotionsWorkspaceProvider,
} from "@/features/admin/promotions/PromotionsWorkspace";
import {
  CatalogueCreateMenu,
  CatalogueHeaderSearch,
  CatalogueWorkspaceProvider,
} from "@/features/admin/products/CatalogueWorkspace";
import {
  DispatchHeaderSearch,
  DispatchWorkspaceProvider,
} from "@/features/admin/dispatch/DispatchWorkspace";
/**
 * API mode (default): the admin needs a staff login (D95); login and password pages render without
 * the shell. Mock mode (development only): the demo role switcher stays, with no login.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { source } = useRepositories();
  const pathname = usePathname();
  if (
    (STAFF_PUBLIC_PATHS as readonly string[]).includes(pathname) ||
    pathname === STAFF_CHANGE_PASSWORD_PATH
  ) {
    return <>{children}</>;
  }
  if (source === "mock") {
    return <AdminShell staff={null}>{children}</AdminShell>;
  }
  return (
    <StaffGate>
      {(staff) => (
        // Sample-data pages still read the demo role for their own buttons; real access comes
        // from the staff member's role (D100) through AdminAccessProvider.
        <StaffIdentityProvider demoRole={staff.isOwner ? "owner" : "core"}>
          <AdminAccessProvider staff={staff}>
            <AdminShell staff={staff}>{children}</AdminShell>
          </AdminAccessProvider>
        </StaffIdentityProvider>
      )}
    </StaffGate>
  );
}
function AdminShell({ staff, children }: { staff: StaffProfile | null; children: ReactNode }) {
  return (
    <DashboardDateProvider>
      <BookingsWorkspaceProvider>
        <FinanceWorkspaceProvider>
          <PromotionsWorkspaceProvider>
            <CatalogueWorkspaceProvider>
              <DispatchWorkspaceProvider>
                <AdminWorkspace staff={staff}>{children}</AdminWorkspace>
              </DispatchWorkspaceProvider>
            </CatalogueWorkspaceProvider>
          </PromotionsWorkspaceProvider>
        </FinanceWorkspaceProvider>
      </BookingsWorkspaceProvider>
    </DashboardDateProvider>
  );
}
function AdminWorkspace({ staff, children }: { staff: StaffProfile | null; children: ReactNode }) {
  const a = useTranslations("Admin"),
    c = useCopy(),
    { role, setRole } = useDemoIdentity(),
    pathname = usePathname(),
    router = useRouter(),
    logout = useStaffLogout(),
    access = useAdminAccess(),
    d = useBusiness();
  const [search, setSearch] = useState(""),
    [showSearch, setShowSearch] = useState(false),
    [notifications, setNotifications] = useState(false);
  // D105: a page the role does not allow is never shown; its address quietly leads to the first
  // allowed page. (The server refuses its data either way.)
  const currentModule = adminNavigation.find((i) => i.href === pathname)?.id;
  const hiddenPage = staff !== null && currentModule !== undefined && !access.canView(currentModule);
  const fallbackHref = firstAllowedHref(access.canView);
  useEffect(() => {
    if (hiddenPage && fallbackHref) router.replace(fallbackHref);
  }, [hiddenPage, fallbackHref, router]);
  // API mode (D141): the header search and the bell read real orders; the sample-data store
  // below is only for mock mode. Pages still on sample data get a banner.
  const liveOrders = staff !== null && access.canView("orders");
  const query = search.trim();
  const orderSearch = useAdminOrders(adminOrderSearch({ ...emptyAdminOrderFilters(query), pageSize: 10 }), {
    enabled: liveOrders && showSearch && query.length >= 2,
  });
  // Bookings too (9f), for roles that may see them.
  const liveBookings = staff !== null && access.canView("bookings");
  const bookingSearch = useAdminBookings(adminBookingSearch({ ...emptyAdminBookingFilters(query), sort: "newest", pageSize: 10 }), {
    enabled: liveBookings && showSearch && query.length >= 2,
  });
  // And customer records (10d), for roles that may see them.
  const liveCustomers = staff !== null && access.canView("customers");
  const customerSearch = useAdminCustomers(adminCustomerSearch({ ...emptyAdminCustomerFilters(query), pageSize: 10 }), {
    enabled: liveCustomers && showSearch && query.length >= 2,
  });
  // And relocation requests (15d), for roles that may see them.
  const liveRelocation = staff !== null && access.canView("relocation");
  const relocationSearch = useAdminRelocationList(adminRelocationSearch({ ...emptyAdminRelocationFilters(query), pageSize: 10 }), {
    enabled: liveRelocation && showSearch && query.length >= 2,
  });
  // Only the searches this role runs count: one it may not run never stays "searching" (isLoading is false when off).
  const liveSearches = [orderSearch, bookingSearch, customerSearch, relocationSearch];
  const searching = liveSearches.some((search) => search.isLoading);
  const searchFailed = liveSearches.some((search) => search.isError);
  const awaitingPayment = useAdminOrders(adminOrderSearch({ ...emptyAdminOrderFilters(), pageSize: 10 }), {
    enabled: liveOrders,
    refetchInterval: 60_000,
  });
  // The bell's relocation part (15d; plan section 4.7): new requests, documents to review, payments to check.
  const relocationWaiting = useAdminRelocationList(adminRelocationSearch({ ...emptyAdminRelocationFilters(), pageSize: 10 }), {
    enabled: liveRelocation,
    refetchInterval: 60_000,
  });
  const relocationToCheck = useAdminRelocationList(adminRelocationSearch({ ...emptyAdminRelocationFilters("", "", true), pageSize: 10 }), {
    enabled: liveRelocation,
    refetchInterval: 60_000,
  });
  const relocationAlerts = liveRelocation
    ? {
        submitted: relocationWaiting.data?.counts.submitted ?? 0,
        documents: relocationWaiting.data?.counts.documents_received ?? 0,
        toCheck: relocationToCheck.data?.total ?? 0,
      }
    : null;
  const relocationPending = relocationAlerts ? relocationAlerts.submitted + relocationAlerts.documents + relocationAlerts.toCheck : 0;
  // The bell's POS part (#16 part 2c; the part 2 plan's section 7): the alerts and waiting
  // prices for the owner and Catalogue View, the packs the store sold short for Orders View.
  const livePos = staff !== null && access.canView("products");
  const posAttention = usePosAttention({ enabled: livePos });
  const posShort = usePosShort({ enabled: liveOrders });
  const posAlerts = livePos ? (posAttention.data?.alerts ?? []) : [];
  const pricesWaiting = livePos ? (posAttention.data?.pricesWaiting ?? 0) : 0;
  const shortPacks = liveOrders ? (posShort.data?.items ?? []) : [];
  const posPending = posAlerts.length + pricesWaiting + shortPacks.length;
  const samplePage = staff !== null && currentModule !== undefined ? SAMPLE_DATA_PAGES[currentModule] : undefined;
  function changeRole(next: DemoRole) {
    setRole(next);
    const current = adminNavigation.find((i) => i.href === pathname);
    if (current && !canPreviewModule(next, current.id))
      router.replace(next === "finance" ? "/admin/finance" : "/admin");
  }
  const navigation = (close?: () => void) => (
    <nav className="admin-nav" aria-label={a("navigation")}>
      {visibleNavigation(access.canView).map((group) => (
        <div className="admin-nav-group" key={group.id}>
          {group.labelKey && (
            <h2 className="admin-nav-group__label">{a(group.labelKey)}</h2>
          )}
          <div className="admin-nav-group__links">
            {group.items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={close}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <item.icon size={19} strokeWidth={1.5} />
                <span>{a(item.labelKey ?? item.id)}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
  // Search only covers modules this user may view.
  const results =
    staff !== null
      ? [
          ...(orderSearch.data?.orders ?? []).map((o) => ({
            label: `${o.reference} · ${o.contactName}`,
            href: `/admin/orders?search=${encodeURIComponent(o.reference)}`,
          })),
          ...(bookingSearch.data?.bookings ?? []).map((b) => ({
            label: `${b.reference} · ${b.contactName} · ${petLabel(b.pet, c.local)}`,
            href: `/admin/bookings?search=${encodeURIComponent(b.reference)}`,
          })),
          ...(customerSearch.data?.customers ?? []).map((customer) => ({
            label: customer.name ? `${customer.name} · ${customer.email}` : customer.email,
            href: `/admin/customers?search=${encodeURIComponent(customer.email)}`,
          })),
          ...(relocationSearch.data?.requests ?? []).map((request) => ({
            label: `${request.reference} · ${request.contactName} · ${request.pets.join(", ")}`,
            href: `/admin/relocation?search=${encodeURIComponent(request.reference)}`,
          })),
        ]
      : role === "finance"
      ? []
      : [
          ...(access.canView("orders") ? d.orders : []).map((o) => ({
            label: `${o.id} · ${d.guests.find((g) => g.id === o.customerId)?.name}`,
            href: `/admin/orders?search=${o.id}`,
          })),
          ...(access.canView("bookings") ? d.bookings : []).map((b) => ({
            label: `${b.id} · ${b.petName}`,
            href: `/admin/bookings?search=${b.id}`,
          })),
          ...(access.canView("customers") ? d.guests : []).map((g) => ({
            label: `${g.name} · ${g.email}`,
            href: `/admin/customers?search=${encodeURIComponent(g.email)}`,
          })),
          ...(access.canView("products") ? d.products : []).map((p) => ({
            label: `${c.local(p.name)} · ${p.variants.map((v) => v.sku).join(" · ")}`,
            href: "/admin/products",
          })),
        ]
          .filter((r) => r.label.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 8);
  // Header "Create" shortcuts only for modules this user may create in.
  const createShortcuts = (
    [
      { module: "products", href: "/admin/products", label: c.text("Product or Pet House", "منتج أو بيت للحيوان") },
      { module: "groomingPackages", href: "/admin/grooming-packages", label: c.text("Grooming package", "باقة عناية") },
      { module: "groomingCalendar", href: "/admin/grooming-calendar", label: c.text("Grooming slot", "موعد عناية") },
      { module: "deliverySlots", href: "/admin/delivery-slots", label: c.text("Delivery slot", "موعد توصيل") },
    ] as const
  ).filter((shortcut) => access.can(shortcut.module, "edit"));
  const pending =
    staff !== null
      ? (awaitingPayment.data?.counts.awaiting_payment ?? 0)
      : d.orders.filter((o) => o.payment === "pending" && o.status !== "cancelled").length +
        d.bookings.filter((b) => b.payment === "pending" && b.status !== "cancelled").length;
  return (
    <div
      className={`admin-shell ${["/admin", "/admin/orders", "/admin/bookings", "/admin/relocation", "/admin/customers", "/admin/finance", "/admin/promotions", "/admin/products", "/admin/dispatch"].includes(pathname) ? "admin-shell--dashboard" : ""} ${["/admin/orders", "/admin/bookings", "/admin/relocation", "/admin/customers"].includes(pathname) ? "admin-shell--orders" : ""} ${pathname === "/admin/bookings" ? "admin-shell--bookings" : ""} ${pathname === "/admin/customers" ? "admin-shell--customers" : ""} ${pathname === "/admin/finance" ? "admin-shell--finance" : ""} ${pathname === "/admin/promotions" ? "admin-shell--promotions" : ""} ${pathname === "/admin/products" ? "admin-shell--catalogue" : ""} ${pathname === "/admin/dispatch" ? "admin-shell--dispatch" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        {c.text("Skip to content", "انتقل للمحتوى")}
      </a>
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <Brand compact light />
          <p>{a("workspace")}</p>
        </div>
        {navigation()}
        <div className="sidebar-footer">
          {/* The full logo in place of the cat photo (D233); the name is already the top link. */}
          <div className="sidebar-logo">
            <Image
              className="sidebar-logo__image"
              src="/images/brand/nennus-catio-logo-light.png"
              alt=""
              width={110}
              height={130}
            />
            <em>
              {c.text(
                "Happy Pets. Happier People.",
                "حيوانات سعيدة. حياة أسعد.",
              )}
            </em>
          </div>
          <Link href="/" className="text-link">
            {a("viewSite")}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className="admin-body">
        <header className="admin-header">
          <div className="admin-header__start">
            <NavigationDrawer title={a("navigation")} variant="admin">
              {(close) => navigation(close)}
            </NavigationDrawer>
            {pathname === "/admin/finance" && <FinanceHeaderSearch />}
            {pathname === "/admin/dispatch" && role !== "finance" && (
              <DispatchHeaderSearch />
            )}
            {pathname === "/admin/promotions" && role !== "finance" && (
              <PromotionsHeaderSearch />
            )}
            {pathname === "/admin/products" && role !== "finance" && (
              <CatalogueHeaderSearch />
            )}
            {role !== "finance" &&
              pathname !== "/admin/dispatch" &&
              pathname !== "/admin/products" &&
              pathname !== "/admin/finance" &&
              pathname !== "/admin/promotions" && (
                <form
                  className="admin-search search-field"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setShowSearch(true);
                  }}
                >
                  <Search size={17} />
                  <input
                    aria-label={staff !== null ? c.text("Search by reference, name, phone or email", "ابحث بالمرجع أو الاسم أو الهاتف أو البريد") : c.text(
                      pathname === "/admin/customers"
                        ? "Search customers, pets, orders, bookings"
                        : pathname === "/admin/bookings"
                          ? "Search bookings, customers, pets"
                          : "Search orders, bookings, customers, products",
                      pathname === "/admin/customers"
                        ? "ابحث عن العملاء والحيوانات والطلبات والحجوزات"
                        : pathname === "/admin/bookings"
                          ? "ابحث عن الحجوزات والعملاء والحيوانات"
                          : "ابحث عن الطلبات والحجوزات والعملاء والمنتجات",
                    )}
                    placeholder={staff !== null ? c.text("Search by reference, name, phone or email…", "ابحث بالمرجع أو الاسم أو الهاتف أو البريد…") : c.text(
                      pathname === "/admin/customers"
                        ? "Search customers, pets, orders, bookings…"
                        : pathname === "/admin/bookings"
                          ? "Search bookings, customers, pets…"
                          : "Search orders, bookings, customers, products…",
                      pathname === "/admin/customers"
                        ? "ابحث عن العملاء والحيوانات والطلبات والحجوزات…"
                        : pathname === "/admin/bookings"
                          ? "ابحث عن الحجوزات والعملاء والحيوانات…"
                          : "ابحث عن الطلبات والحجوزات والعملاء والمنتجات…",
                    )}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </form>
              )}
            <span className="admin-breadcrumb">
              Nennus Catio /{" "}
              {a(
                adminNavigation.find((i) => i.href === pathname)?.id ??
                  "dashboard",
              )}
            </span>
          </div>
          <div className="admin-header__tools">
            {[
              "/admin",
              // API mode: Bookings (9f), Customers (10d) and Promotions (11d) read the server; the demo's date picker would not change them.
              ...(staff === null ? ["/admin/bookings", "/admin/customers", "/admin/promotions"] : []),
              "/admin/finance",
              "/admin/products",
              "/admin/dispatch",
            ].includes(pathname) &&
            (role !== "finance" || pathname === "/admin/finance") ? (
              <DashboardDateControl
                label={
                  pathname === "/admin/dispatch"
                    ? c.text("Dispatch date (Qatar)", "تاريخ التوصيل (قطر)")
                    : pathname === "/admin/products"
                      ? c.text(
                          "Catalogue performance date (Qatar)",
                          "تاريخ أداء الكتالوج (قطر)",
                        )
                      : pathname === "/admin/promotions"
                        ? c.text(
                            "Promotions date (Qatar)",
                            "تاريخ العروض (قطر)",
                          )
                        : pathname === "/admin/finance"
                          ? c.text(
                              "Finance date (Qatar)",
                              "تاريخ المالية (قطر)",
                            )
                          : pathname === "/admin/customers"
                            ? c.text(
                                "Customer metrics month (Qatar)",
                                "شهر إحصاءات العملاء (قطر)",
                              )
                            : pathname === "/admin/bookings"
                              ? c.text(
                                  "Bookings date (Qatar)",
                                  "تاريخ الحجوزات (قطر)",
                                )
                              : undefined
                }
              />
            ) : (
              <span className="admin-header__date">
                <CalendarDays size={16} />
                {pathname === "/admin/orders" || pathname === "/admin/bookings"
                  ? new Intl.DateTimeFormat(
                      c.locale === "ar" ? "ar-QA" : "en-GB",
                      {
                        timeZone: "Asia/Qatar",
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      },
                    ).format(new Date())
                  : c.text("Qatar · QAR", "قطر · ر.ق")}
              </span>
            )}
            {/* The demo's List/Calendar and New Booking; real bookings are made by customers (plan question 6). */}
            {staff === null && role !== "finance" && pathname === "/admin/bookings" && (
              <BookingsHeaderControls />
            )}
            {/* API mode: only roles that may create promotions see Create (11d); the demo keeps its preview roles. */}
            {role !== "finance" && pathname === "/admin/promotions" && (staff === null || access.can("promotions", "edit")) && (
              <PromotionsCreateButton />
            )}
            {role !== "finance" && pathname === "/admin/products" && (
              <CatalogueCreateMenu header />
            )}
            {role !== "finance" &&
              pathname !== "/admin/dispatch" &&
              pathname !== "/admin/products" &&
              pathname !== "/admin/bookings" &&
              pathname !== "/admin/finance" &&
              pathname !== "/admin/promotions" &&
              createShortcuts.length > 0 && (
                <details className="admin-create-menu">
                  <summary>
                    <Plus size={16} />
                    {c.text("Create", "إنشاء")}
                    <ChevronDown size={12} aria-hidden="true" />
                  </summary>
                  <div>
                    {createShortcuts.map((shortcut) => (
                      <Link key={shortcut.href} href={shortcut.href}>
                        {shortcut.label}
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            {(staff === null || liveOrders || liveRelocation || livePos) && (
              <button
                type="button"
                className="icon-button notification-button"
                aria-label={staff !== null ? c.text("Needs attention", "يحتاج إلى متابعة") : c.text("Pending payments", "المدفوعات المعلقة")}
                onClick={() => setNotifications(true)}
              >
                <Bell size={20} />
                {(pending > 0 || relocationPending > 0 || posPending > 0) && <i />}
              </button>
            )}
            <Suspense fallback={<span>EN / AR</span>}>
              <LocaleSwitcher />
            </Suspense>
            {staff ? (
              <>
                <span className="avatar identity-icon" aria-hidden="true">
                  {staff.displayName.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span className="staff-identity">
                  <strong>{staff.displayName}</strong>
                  <small>{staff.isOwner ? a("owner") : c.text("Staff", "موظف")}</small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={c.text("Log out", "تسجيل الخروج")}
                  title={c.text("Log out", "تسجيل الخروج")}
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
            <span className="avatar identity-icon">
              {role === "owner" ? "O" : role === "finance" ? "F" : "J"}
            </span>
            <label className="role-control">
              <span>
                {c.text(
                  "Demo employee · preview role",
                  "موظف تجريبي · دور المعاينة",
                )}
              </span>
              <select
                aria-label={c.text(
                  "Demo preview role",
                  "دور المعاينة التجريبي",
                )}
                aria-describedby="role-demo-warning"
                value={role}
                onChange={(e) => changeRole(e.target.value as DemoRole)}
              >
                <option value="core">{a("core")}</option>
                <option value="owner">{a("owner")}</option>
                <option value="finance">{a("finance")}</option>
              </select>
            </label>
              </>
            )}
          </div>
        </header>
        <main id="main-content" className="admin-main" tabIndex={-1}>
          <ReleaseNotice />
          {!hiddenPage && samplePage && <SampleDataBanner branch={samplePage.branch} what={samplePage.what} />}
          {hiddenPage ? null : children}
        </main>
        <footer className="admin-footer">
          {staff ? (
            <p>
              {/* No list of pages here (it went out of date); the "Sample data" banner marks the rest (D141). */}
              {c.text(
                "Logged in with a real staff account. Pages marked \"Sample data\" show demonstration figures until their branches; every other page uses the server. Payments and refunds are test payments: no real money moves.",
                "تسجيل دخول بحساب موظف حقيقي. الصفحات الموسومة «بيانات تجريبية» تعرض أرقاماً توضيحية إلى أن تُبنى فروعها؛ وكل الصفحات الأخرى تعمل عبر الخادم. المدفوعات والاسترداد تجريبية: لا تُنقل أموال حقيقية.",
              )}
            </p>
          ) : (
            <>
              <p id="role-demo-warning">{a("roleWarning")}</p>
              <p>
                {c.text(
                  "Synthetic data only. Refresh resets records. Backend authentication, payment and concurrency are not implemented.",
                  "بيانات تجريبية فقط. التحديث يعيد السجلات. لا دخول أو دفع أو تزامن عبر الخادم.",
                )}
              </p>
            </>
          )}
        </footer>
      </div>
      <Modal
        open={showSearch}
        onOpenChange={setShowSearch}
        title={c.text("Search results", "نتائج البحث")}
      >
        <div className="form-stack">
          {results.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              onClick={() => setShowSearch(false)}
              className="search-result"
            >
              {r.label}
              <ArrowUpRight size={15} />
            </Link>
          ))}
          {staff !== null && query.length < 2 ? (
            <p>{c.text("Type at least two characters.", "اكتب حرفين على الأقل.")}</p>
          ) : staff !== null && searching ? (
            <p>{c.text("Searching…", "جارٍ البحث…")}</p>
          ) : staff !== null && searchFailed ? (
            <p>{c.text("The search could not be completed. Please try again.", "تعذّر إكمال البحث. يرجى المحاولة مرة أخرى.")}</p>
          ) : (
            !results.length && <p>{c.text("No matching records.", "لا سجلات مطابقة.")}</p>
          )}
          {staff !== null && (
            <>
              {query.length >= 2 && liveOrders && (
                <Link className="text-link" href={`/admin/orders?search=${encodeURIComponent(query)}`} onClick={() => setShowSearch(false)}>
                  {c.text("Open all matching orders", "افتح كل الطلبات المطابقة")}
                </Link>
              )}
              {query.length >= 2 && liveBookings && (
                <Link className="text-link" href={`/admin/bookings?search=${encodeURIComponent(query)}`} onClick={() => setShowSearch(false)}>
                  {c.text("Open all matching bookings", "افتح كل الحجوزات المطابقة")}
                </Link>
              )}
              {query.length >= 2 && liveCustomers && (
                <Link className="text-link" href={`/admin/customers?search=${encodeURIComponent(query)}`} onClick={() => setShowSearch(false)}>
                  {c.text("Open all matching customers", "افتح كل العملاء المطابقين")}
                </Link>
              )}
              {query.length >= 2 && liveRelocation && (
                <Link className="text-link" href={`/admin/relocation?search=${encodeURIComponent(query)}`} onClick={() => setShowSearch(false)}>
                  {c.text("Open all matching relocation requests", "افتح كل طلبات النقل المطابقة")}
                </Link>
              )}
              <small>
                {c.text(
                  "Searches the orders, bookings, relocation requests and customers your role may see, by reference, name, phone or email.",
                  "يبحث في الطلبات والحجوزات وطلبات النقل والعملاء التي يسمح بها دورك، بالمرجع أو الاسم أو الهاتف أو البريد.",
                )}
              </small>
            </>
          )}
        </div>
      </Modal>
      <Modal
        open={notifications}
        onOpenChange={setNotifications}
        title={staff !== null ? c.text("Needs attention", "يحتاج إلى متابعة") : c.text("Pending payments", "المدفوعات المعلقة")}
      >
        {staff !== null ? (
          <div className="form-stack">
            {liveOrders && (
              <>
                <p>
                  {pending}{" "}
                  {c.text(
                    "orders are awaiting payment. Their items and delivery seat stay held until the time to pay runs out.",
                    "طلبات بانتظار الدفع. تبقى عناصرها ومقعد التوصيل محجوزة حتى انتهاء مهلة الدفع.",
                  )}
                </p>
                <Link className="text-link" href="/admin/orders" onClick={() => setNotifications(false)}>
                  {c.text("Open Orders", "افتح الطلبات")}
                </Link>
              </>
            )}
            {relocationAlerts && (
              <>
                <h3>{c.text("Relocation", "النقل")}</h3>
                <Link className="text-link" href="/admin/relocation?status=submitted" onClick={() => setNotifications(false)}>
                  {c.text(`${relocationAlerts.submitted} new relocation requests`, `${relocationAlerts.submitted} طلبات نقل جديدة`)}
                </Link>
                <Link className="text-link" href="/admin/relocation?status=documents_received" onClick={() => setNotifications(false)}>
                  {c.text(`${relocationAlerts.documents} with documents to review`, `${relocationAlerts.documents} بمستندات للمراجعة`)}
                </Link>
                <Link className="text-link" href="/admin/relocation?needsAction=1" onClick={() => setNotifications(false)}>
                  {c.text(`${relocationAlerts.toCheck} needing a refund or a payment check`, `${relocationAlerts.toCheck} تحتاج استرداداً أو مراجعة دفع`)}
                </Link>
              </>
            )}
            {posPending > 0 && (
              <>
                <h3>{c.text("POS", "نقطة البيع")}</h3>
                {posAlerts.map((alert) => (
                  <p key={alert.kind} role="alert">
                    {alertLine(alert, c.text, (iso) => formatStaffDateTime(iso, c.locale))}
                  </p>
                ))}
                {posAlerts.length > 0 && access.isOwner && (
                  <Link className="text-link" href="/admin/integrations" onClick={() => setNotifications(false)}>
                    {c.text("Open Integrations", "افتح الربط مع الأنظمة")}
                  </Link>
                )}
                {pricesWaiting > 0 && (
                  <Link className="text-link" href="/admin/products?section=pos" onClick={() => setNotifications(false)}>
                    {c.text(`${pricesWaiting} POS prices waiting for a decision`, `${pricesWaiting} أسعار من نقطة البيع بانتظار القرار`)}
                  </Link>
                )}
                {shortPacks.map((pack) => (
                  <Link
                    key={pack.code}
                    className="text-link"
                    href={`/admin/orders?search=${encodeURIComponent(pack.sku)}`}
                    onClick={() => setNotifications(false)}
                  >
                    {c.text(
                      `${c.local(pack.productName)} · ${c.local(pack.label)}: short by ${pack.short}. The store sold units online customers are paying for: check its orders.`,
                      `${c.local(pack.productName)} · ${c.local(pack.label)}: نقص ${pack.short}. باع المتجر وحدات يدفع ثمنها عملاء الموقع: راجع طلباتها.`,
                    )}
                  </Link>
                ))}
              </>
            )}
            {!liveOrders && !relocationAlerts && posPending === 0 && (
              <p>{c.text("Nothing needs attention right now.", "لا شيء يحتاج إلى متابعة الآن.")}</p>
            )}
          </div>
        ) : (
          <>
            <p>
              {pending}{" "}
              {c.text(
                "active orders/bookings awaiting simulated payment. No real notifications are sent.",
                "طلبات/حجوزات نشطة بانتظار الدفع التجريبي. لا إشعارات فعلية.",
              )}
            </p>
            <Link
              className="text-link"
              href="/admin/finance"
              onClick={() => setNotifications(false)}
            >
              {c.text("Open Finance", "افتح المالية")}
            </Link>
          </>
        )}
      </Modal>
    </div>
  );
}
