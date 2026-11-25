import React, { useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { useI18n } from "./context/LanguageContext.jsx";
import { AppLayout } from "./components/layout/AppLayout.jsx";
import Login from "./pages/Login.jsx";
import { ChangePassword, StaffForgotPassword, StaffResetPassword } from "./pages/StaffPassword.jsx";
import { ShopAccount, ShopCheckout, ShopOrders, ShopProduct, ShopReset, ShopVerify } from "./pages/shop/Shop.jsx";
import { ShopBookings, ShopGrooming, ShopGroomingBook, ShopHouses, ShopRelocation } from "./pages/shop/ShopServices.jsx";
import { SiteLayout } from "./site/SiteLayout.jsx";
import { SiteHome } from "./site/SiteHome.jsx";
import { SiteShop } from "./site/SiteShop.jsx";
import { SiteAbout } from "./site/SiteAbout.jsx";
import { SiteContact } from "./site/SiteContact.jsx";
import { SiteGrooming } from "./site/SiteGrooming.jsx";
import { SiteHouses } from "./site/SiteHouses.jsx";
import { SiteRelocation } from "./site/SiteRelocation.jsx";
import POS from "./pages/POS.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Categories from "./pages/Categories.jsx";
import Users from "./pages/Users.jsx";
import Permissions from "./pages/Permissions.jsx";
import Branches from "./pages/Branches.jsx";
import Customers from "./pages/Customers.jsx";
import CustomerReceivables from "./pages/CustomerReceivables.jsx";
import CustomerAccountDetail from "./pages/CustomerAccountDetail.jsx";
import Returns from "./pages/Returns.jsx";
import Purchases from "./pages/Purchases.jsx";
import PurchaseOrders from "./pages/PurchaseOrders.jsx";
import OnlineOrders from "./pages/OnlineOrders.jsx";
import PetTypes from "./pages/PetTypes.jsx";
import GroomingDesk from "./pages/GroomingDesk.jsx";
import RelocationDesk from "./pages/RelocationDesk.jsx";
import Promotions from "./pages/Promotions.jsx";
import Finance from "./pages/Finance.jsx";
import Vehicles from "./pages/Vehicles.jsx";
import Transfer, { TransferDetail, TransferHistory } from "./pages/Transfer.jsx";
import VehicleDashboard, { DamagedStockPage } from "./pages/VehicleDashboard.jsx";
import Count from "./pages/Count.jsx";
import Cash from "./pages/Cash.jsx";
import Audit from "./pages/Audit.jsx";
import Alerts from "./pages/Alerts.jsx";
import Settings from "./pages/Settings.jsx";
import SalesHistory from "./pages/SalesHistory.jsx";
import SalesOrders from "./pages/SalesOrders.jsx";
const loadReports = () => import("./pages/Reports.jsx");
const loadAppointments = () => import("./pages/Appointments.jsx");

const Reports = React.lazy(loadReports);
const Appointments = React.lazy(loadAppointments);

function Protected({ children, roles, permission, anyPermission, anyModule, module }) {
  const { user, loading, can, canModule } = useAuth();
  const { t } = useI18n();
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") {
    // A screen this role may not use says so (a silent jump to the dashboard looked like a fault).
    const denied =
      (roles && !roles.includes(user.role)) ||
      (permission && !can(permission)) ||
      (Array.isArray(module) && !canModule(module[0], module[1])) ||
      (Array.isArray(anyPermission) && anyPermission.length > 0 && !anyPermission.some((key) => can(key))) ||
      // anyModule: [["returns", "view"], ...] — any one module right is enough.
      (Array.isArray(anyModule) && anyModule.length > 0 && !anyModule.some(([mod, action]) => canModule(mod, action)));
    if (denied) {
      return (
        <div className="card" role="alert" style={{ maxWidth: 520, margin: "24px auto", display: "grid", gap: 12 }}>
          <strong>{t("common.noAccessTitle")}</strong>
          <span>{t("common.noAccess")}</span>
          <Link to="/dashboard" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", textDecoration: "none", textAlign: "center", maxWidth: 220 }}>
            {t("common.backToDashboard")}
          </Link>
        </div>
      );
    }
  }
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
        <Route element={<SiteLayout />}>
          <Route path="/" element={<SiteHome />} />
          <Route path="/about" element={<SiteAbout />} />
          <Route path="/pricing" element={<Navigate to="/shop" replace />} />
          <Route path="/privacy" element={<Navigate to="/" replace />} />
          <Route path="/contact" element={<SiteContact />} />
          <Route path="/shop" element={<SiteShop />} />
          <Route path="/grooming" element={<SiteGrooming />} />
          <Route path="/pet-houses" element={<SiteHouses />} />
          <Route path="/relocation" element={<SiteRelocation />} />
          <Route path="/shop/product/:id" element={<ShopProduct />} />
          <Route path="/shop/checkout" element={<ShopCheckout />} />
          <Route path="/shop/account" element={<ShopAccount />} />
          <Route path="/shop/verify" element={<ShopVerify />} />
          <Route path="/shop/reset" element={<ShopReset />} />
          <Route path="/shop/orders" element={<ShopOrders />} />
          <Route path="/shop/orders/:id" element={<ShopOrders />} />
          <Route path="/shop/grooming" element={<ShopGrooming />} />
          <Route path="/shop/grooming/bookings" element={<ShopBookings />} />
          <Route path="/shop/grooming/bookings/:id" element={<ShopBookings />} />
          <Route path="/shop/grooming/:packageId" element={<ShopGroomingBook />} />
          <Route path="/shop/houses" element={<ShopHouses />} />
          <Route path="/shop/relocation" element={<ShopRelocation />} />
          <Route path="/shop/relocation/:id" element={<ShopRelocation />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<StaffForgotPassword />} />
        <Route path="/reset-password" element={<StaffResetPassword />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/pos" element={<Protected permission="pos"><POS /></Protected>} />
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
          <Route
            path="/sales-orders"
            element={
              <Protected module={["salesOrders", "view"]}>
                <SalesOrders />
              </Protected>
            }
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/print-settings" element={<Navigate to="/settings" replace />} />
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
                <Appointments />
              </Protected>
            }
          />
          <Route
            path="/products"
            element={
              <Protected permission="productsView">
                <Products />
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
                <CustomerReceivables />
              </Protected>
            }
          />
          <Route
            path="/customer-accounts/:customerId"
            element={
              <Protected permission="receivables">
                <CustomerAccountDetail />
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
            path="/returns"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="refunds">
                <Returns />
              </Protected>
            }
          />
          <Route
            path="/purchase-orders"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]} permission="purchases">
                <PurchaseOrders />
              </Protected>
            }
          />
          <Route
            path="/online-orders"
            element={
              <Protected roles={["ADMIN", "MANAGER", "CASHIER"]}>
                <OnlineOrders />
              </Protected>
            }
          />
          <Route
            path="/promotions"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Promotions />
              </Protected>
            }
          />
          <Route
            path="/finance"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Finance />
              </Protected>
            }
          />
          <Route
            path="/vehicles"
            element={
              <Protected anyModule={[["delivery", "create"], ["returns", "view"]]}>
                <Vehicles />
              </Protected>
            }
          />
          <Route
            path="/vehicles/:id"
            element={
              <Protected anyModule={[["returns", "view"]]}>
                <VehicleDashboard />
              </Protected>
            }
          />
          <Route
            path="/damaged-stock"
            element={
              <Protected anyModule={[["returns", "view"]]}>
                <DamagedStockPage />
              </Protected>
            }
          />
          {/* Staff desks live under /admin so the public /grooming and /relocation pages never shadow them. */}
          <Route
            path="/admin/grooming"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <GroomingDesk />
              </Protected>
            }
          />
          <Route
            path="/admin/relocation"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <RelocationDesk />
              </Protected>
            }
          />
          <Route
            path="/pet-types"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <PetTypes />
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
            path="/transfer/history"
            element={
              <Protected anyModule={[["warehouses", "view"]]}>
                <TransferHistory />
              </Protected>
            }
          />
          <Route
            path="/transfer/history/:id"
            element={
              <Protected anyModule={[["warehouses", "view"]]}>
                <TransferDetail />
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
        </Route>
        <Route
          path="*"
          element={<Navigate to={user ? "/dashboard" : "/"} replace />}
        />
      </Routes>
    </React.Suspense>
  );
}
