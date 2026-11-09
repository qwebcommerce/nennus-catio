import React, { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { useI18n } from "./context/LanguageContext.jsx";
import { AppLayout } from "./components/layout/AppLayout.jsx";
import { VerticalFeatureGate } from "./components/VerticalFeatureGate.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import { MarketingLayout } from "./marketing/MarketingLayout.jsx";
import Home from "./pages/marketing/Home.jsx";
import OnboardingProfile from "./pages/onboarding/OnboardingProfile.jsx";
import OnboardingPayment from "./pages/onboarding/OnboardingPayment.jsx";
import OnboardingPaymentSuccess from "./pages/onboarding/OnboardingPaymentSuccess.jsx";
import OnboardingPending from "./pages/onboarding/OnboardingPending.jsx";
import OnboardingReview from "./pages/onboarding/OnboardingReview.jsx";
import OnboardingRejected from "./pages/onboarding/OnboardingRejected.jsx";
import { getPostAuthPath, isOnboardingComplete } from "./lib/onboardingPath.js";
import POS from "./pages/POS.jsx";
import FloorPos from "./pages/FloorPos.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Categories from "./pages/Categories.jsx";
import Users from "./pages/Users.jsx";
import Permissions from "./pages/Permissions.jsx";
import Branches from "./pages/Branches.jsx";
import Customers from "./pages/Customers.jsx";
import CustomerReceivables from "./pages/CustomerReceivables.jsx";
import CustomerAccountDetail from "./pages/CustomerAccountDetail.jsx";
import ComingSoon from "./pages/ComingSoon.jsx";
import Zakat from "./pages/Zakat.jsx";
import Returns from "./pages/Returns.jsx";
import Purchases from "./pages/Purchases.jsx";
import Transfer from "./pages/Transfer.jsx";
import Count from "./pages/Count.jsx";
import Cash from "./pages/Cash.jsx";
import Audit from "./pages/Audit.jsx";
import SyncQueueStatus from "./pages/SyncQueueStatus.jsx";
import Alerts from "./pages/Alerts.jsx";
import Settings from "./pages/Settings.jsx";
import LoyaltyCoupons from "./pages/LoyaltyCoupons.jsx";
import Plan from "./pages/Plan.jsx";
import SalesHistory from "./pages/SalesHistory.jsx";
import InventoryLots from "./pages/InventoryLots.jsx";
import StockBrain from "./pages/StockBrain.jsx";
import PricingBrain from "./pages/PricingBrain.jsx";
import CommandCenter from "./pages/CommandCenter.jsx";
import CostBrain from "./pages/CostBrain.jsx";
import StockBalancer from "./pages/StockBalancer.jsx";
import CustomersBrain from "./pages/CustomersBrain.jsx";
const loadReports = () => import("./pages/Reports.jsx");
const loadAppointments = () => import("./pages/Appointments.jsx");
const loadAccounting = () => import("./pages/Accounting.jsx");
const loadCommissions = () => import("./pages/Commissions.jsx");
const loadHrLayout = () => import("./pages/hr/HrLayout.jsx");
const loadHrEmployees = () => import("./pages/hr/HrEmployees.jsx");
const loadHrPayrollList = () => import("./pages/hr/HrPayrollList.jsx");
const loadHrPayrollPeriod = () => import("./pages/hr/HrPayrollPeriod.jsx");
const loadHrLoans = () => import("./pages/hr/HrLoans.jsx");
const loadPlatformLayout = () => import("./components/layout/PlatformLayout.jsx");
const loadPlatformOrganizations = () => import("./pages/PlatformOrganizations.jsx");
const loadPlatformUsers = () => import("./pages/PlatformUsers.jsx");
const loadPlatformAnalytics = () => import("./pages/PlatformAnalytics.jsx");
const loadPlatformOnboardingQueue = () => import("./pages/PlatformOnboardingQueue.jsx");
const loadPlatformOnboardingDetail = () => import("./pages/PlatformOnboardingDetail.jsx");

const Reports = React.lazy(loadReports);
const Appointments = React.lazy(loadAppointments);
const Accounting = React.lazy(loadAccounting);
const Commissions = React.lazy(loadCommissions);
const HrLayout = React.lazy(loadHrLayout);
const HrEmployees = React.lazy(loadHrEmployees);
const HrPayrollList = React.lazy(loadHrPayrollList);
const HrPayrollPeriod = React.lazy(loadHrPayrollPeriod);
const HrLoans = React.lazy(loadHrLoans);
const PlatformLayout = React.lazy(loadPlatformLayout);
const PlatformOrganizations = React.lazy(loadPlatformOrganizations);
const PlatformUsers = React.lazy(loadPlatformUsers);
const PlatformAnalytics = React.lazy(loadPlatformAnalytics);
const PlatformOnboardingQueue = React.lazy(loadPlatformOnboardingQueue);
const PlatformOnboardingDetail = React.lazy(loadPlatformOnboardingDetail);

function Protected({ children, roles, permission, anyPermission }) {
  const { user, loading, can } = useAuth();
  const { t } = useI18n();
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Platform operators stay in the platform console — not a tenant POS session.
  if (user.isPlatformAdmin) {
    return <Navigate to="/platform/analytics" replace />;
  }
  // Floor associates only use /floor-pos
  if (user.role === "ASSOCIATE") {
    return <Navigate to="/floor-pos" replace />;
  }
  if (!isOnboardingComplete(user)) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }
  if (user.role !== "ADMIN") {
    if (roles && !roles.includes(user.role)) {
      return <Navigate to="/dashboard" replace />;
    }
    if (permission && !can(permission)) {
      return <Navigate to="/dashboard" replace />;
    }
    if (Array.isArray(anyPermission) && anyPermission.length > 0) {
      const ok = anyPermission.some((key) => can(key));
      if (!ok) return <Navigate to="/dashboard" replace />;
    }
  }
  return children;
}

function ProtectedFloor({ children }) {
  const { user, loading, can } = useAuth();
  const { t } = useI18n();
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.isPlatformAdmin) return <Navigate to="/platform/analytics" replace />;
  if (user.role === "ASSOCIATE") return children;
  if (!isOnboardingComplete(user)) return <Navigate to={getPostAuthPath(user)} replace />;
  if (user.role === "ADMIN" || can("floorPos") || can("pos")) return children;
  return <Navigate to={getPostAuthPath(user)} replace />;
}

/** Floor POS stays live for ASSOCIATE; managers/admins see coming soon for now. */
function ComingSoonFloorOrLive() {
  const { user } = useAuth();
  if (user?.role === "ASSOCIATE") return <FloorPos />;
  return <ComingSoon titleKey="nav.floorPos" blurbKey="comingSoon.floorPos" />;
}

function PublicHome() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        Loading...
      </div>
    );
  }
  if (user) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }
  return <Home />;
}

function ProtectedPlatform({ children }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isPlatformAdmin) return <Navigate to={getPostAuthPath(user)} replace />;
  return children;
}

/** Logged-in users on incomplete onboarding; blocks dashboard until done. */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;
    const preload = () => {
      // Warm up heavy chunks in idle time for faster first navigation.
      Promise.allSettled([
        loadReports(),
        loadAppointments(),
      ]);
      if (user.role === "ADMIN" || user.role === "MANAGER") {
        Promise.allSettled([loadAccounting(), loadCommissions()]);
      }
      if (user.isPlatformAdmin) {
        Promise.allSettled([loadPlatformLayout(), loadPlatformOrganizations(), loadPlatformUsers()]);
      }
    };
    const schedule = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 1200));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const taskId = schedule(preload);
    return () => cancel(taskId);
  }, [user]);

  const lazyFallback = (
    <div style={{ padding: 24, textAlign: "center" }}>
      Loading...
    </div>
  );

  return (
    <React.Suspense fallback={lazyFallback}>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<PublicHome />} />
          <Route path="/about" element={<Navigate to="/#categories" replace />} />
          <Route path="/pricing" element={<Navigate to="/#services" replace />} />
          <Route path="/privacy" element={<Navigate to="/" replace />} />
          <Route path="/contact" element={<Navigate to="/#contact" replace />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/onboarding/profile"
          element={
            <RequireAuth>
              <OnboardingProfile />
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding/payment"
          element={
            <RequireAuth>
              <OnboardingPayment />
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding/payment/success"
          element={
            <RequireAuth>
              <OnboardingPaymentSuccess />
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding/pending"
          element={
            <RequireAuth>
              <OnboardingPending />
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding/review"
          element={
            <RequireAuth>
              <OnboardingReview />
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding/rejected"
          element={
            <RequireAuth>
              <OnboardingRejected />
            </RequireAuth>
          }
        />
        <Route
          path="/platform"
          element={
            <ProtectedPlatform>
              <PlatformLayout />
            </ProtectedPlatform>
          }
        >
          <Route index element={<Navigate to="/platform/analytics" replace />} />
          <Route path="analytics" element={<PlatformAnalytics />} />
          <Route path="onboarding" element={<PlatformOnboardingQueue />} />
          <Route path="onboarding/:orgId" element={<PlatformOnboardingDetail />} />
          <Route path="organizations" element={<PlatformOrganizations />} />
          <Route path="users" element={<PlatformUsers />} />
        </Route>
        <Route
          path="/floor-pos"
          element={
            <ProtectedFloor>
              <ComingSoonFloorOrLive />
            </ProtectedFloor>
          }
        />
        <Route
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route path="/pos" element={<Protected permission="pos"><POS /></Protected>} />
          <Route
            path="/floor-assist"
            element={
              <Protected permission="floorPos">
                <Navigate to="/floor-pos" replace />
              </Protected>
            }
          />
          <Route path="/wholesale" element={<Navigate to="/pos" replace />} />
          <Route path="/sync-queue" element={<SyncQueueStatus />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/sales"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} anyPermission={["pos", "reports"]}>
                <SalesHistory />
              </Protected>
            }
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/print-settings" element={<Navigate to="/settings" replace />} />
          <Route
            path="/loyalty"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="loyalty">
                <LoyaltyCoupons />
              </Protected>
            }
          />
          <Route
            path="/zakat"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Zakat />
              </Protected>
            }
          />
          <Route
            path="/reports"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="reports">
                <Reports />
              </Protected>
            }
          />
          <Route
            path="/appointments"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <VerticalFeatureGate feature="appointments">
                  <Appointments />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/accounting"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Accounting />
              </Protected>
            }
          />
          <Route
            path="/automations"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <ComingSoon titleKey="nav.automations" blurbKey="comingSoon.automations" />
              </Protected>
            }
          />
          <Route
            path="/commissions"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <VerticalFeatureGate feature="appointments">
                  <Commissions />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/hr"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <HrLayout />
              </Protected>
            }
          >
            <Route index element={<Navigate to="/hr/employees" replace />} />
            <Route path="employees" element={<HrEmployees />} />
            <Route path="payroll" element={<HrPayrollList />} />
            <Route path="payroll/:periodId" element={<HrPayrollPeriod />} />
            <Route path="loans" element={<HrLoans />} />
          </Route>
          <Route
            path="/products"
            element={
              <Protected permission="productsView">
                <Products />
              </Protected>
            }
          />
          <Route
            path="/inventory-lots"
            element={
              <Protected permission="productsView">
                <VerticalFeatureGate feature="lotsExpiry">
                  <InventoryLots />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/stock-brain"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="purchases">
                <VerticalFeatureGate feature="stockBrain">
                  <StockBrain />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/pricing-brain"
            element={
              <Protected roles={["ADMIN", "MANAGER"]} permission="productsEdit">
                <VerticalFeatureGate feature="priceBrain">
                  <PricingBrain />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/command-center"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <VerticalFeatureGate feature="ownerBrief">
                  <CommandCenter />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/cost-brain"
            element={
              <Protected roles={["ADMIN", "MANAGER"]} permission="purchases">
                <VerticalFeatureGate feature="costBrain">
                  <CostBrain />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/stock-balancer"
            element={
              <Protected roles={["ADMIN", "MANAGER"]} permission="transfer">
                <VerticalFeatureGate feature="stockBalancer">
                  <StockBalancer />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/customers-brain"
            element={
              <Protected roles={["ADMIN", "MANAGER"]} permission="customers">
                <VerticalFeatureGate feature="customerRfm">
                  <CustomersBrain />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/categories"
            element={
              <Protected permission="catalogEdit">
                <Categories />
              </Protected>
            }
          />
          <Route
            path="/customers"
            element={
              <Protected permission="customers">
                <Customers />
              </Protected>
            }
          />
          <Route
            path="/customer-accounts"
            element={
              <Protected permission="receivables">
                <VerticalFeatureGate feature="customerAccounts">
                  <CustomerReceivables />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/customer-accounts/:customerId"
            element={
              <Protected permission="receivables">
                <VerticalFeatureGate feature="customerAccounts">
                  <CustomerAccountDetail />
                </VerticalFeatureGate>
              </Protected>
            }
          />
          <Route
            path="/users"
            element={
              <Protected roles={["ADMIN"]}>
                <Users />
              </Protected>
            }
          />
          <Route
            path="/permissions"
            element={
              <Protected roles={["ADMIN"]}>
                <Permissions />
              </Protected>
            }
          />
          <Route
            path="/branches"
            element={
              <Protected roles={["ADMIN"]}>
                <Branches />
              </Protected>
            }
          />
          <Route
            path="/sync"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <ComingSoon titleKey="nav.sync" blurbKey="comingSoon.sync" />
              </Protected>
            }
          />
          <Route
            path="/returns"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="refunds">
                <Returns />
              </Protected>
            }
          />
          <Route
            path="/purchases"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="purchases">
                <Purchases />
              </Protected>
            }
          />
          <Route
            path="/transfer"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="transfer">
                <Transfer />
              </Protected>
            }
          />
          <Route
            path="/count"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="stockCount">
                <Count />
              </Protected>
            }
          />
          <Route
            path="/cash"
            element={
              <Protected permission="cashSession">
                <Cash />
              </Protected>
            }
          />
          <Route
            path="/audit"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="audit">
                <Audit />
              </Protected>
            }
          />
          <Route
            path="/plan"
            element={
              <Protected roles={["ADMIN"]}>
                <Plan />
              </Protected>
            }
          />
        </Route>
        <Route
          path="*"
          element={<Navigate to={user ? "/dashboard" : "/"} replace />}
        />
      </Routes>
    </React.Suspense>
  );
}
