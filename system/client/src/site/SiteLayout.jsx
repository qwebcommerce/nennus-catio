import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Link2 as Facebook,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShoppingBag,
  UserRound,
  X,
  Camera as Instagram,
} from "lucide-react";
import { useCopy, useShopMeta, waLink } from "./copy.js";
import "./site.css";
import { CART_EVENT, CART_KEY, cartCount } from "./cartStore.js";

const LINKS = [
  { href: "/", en: "Home", ar: "الرئيسية" },
  { href: "/shop", en: "Shop", ar: "المتجر" },
  { href: "/grooming", en: "Grooming", ar: "العناية" },
  { href: "/pet-houses", en: "Pet Houses", ar: "بيوت الحيوانات" },
  { href: "/relocation", en: "Relocation", ar: "النقل" },
  { href: "/about", en: "About", ar: "عنّا" },
  { href: "/contact", en: "Contact", ar: "تواصل" },
];

function Brand({ compact = false, light = false }) {
  const tone = light ? "-light" : "";
  return (
    <Link to="/" className={`brand ${compact ? "brand--compact" : ""}`} aria-label="Nennus Catio">
      <img className="brand__mark" src={`/images/brand/nennus-catio-mark${tone}.png`} alt="" width="53" height="60" />
      <img className="brand__name" src={`/images/brand/nennus-catio-wordmark${tone}.png`} alt="" width="152" height="50" />
    </Link>
  );
}

export function SiteLayout() {
  const { locale, setLocale, text } = useCopy();
  const { business, status } = useShopMeta();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(cartCount);
  const [note, setNote] = useState("");

  useEffect(() => {
    setOpen(false);
    setCount(cartCount());
  }, [location.pathname, location.search]);

  // The header count follows every cart change right away, also from other tabs.
  useEffect(() => {
    const refresh = () => setCount(cartCount());
    const onStorage = (event) => {
      if (event.key === CART_KEY) refresh();
    };
    window.addEventListener(CART_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CART_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const current = (href) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  };

  const nav = (close) => (
    <nav className="public-nav" aria-label={text("Main navigation", "التنقل الرئيسي")}>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          to={link.href}
          onClick={close}
          aria-current={current(link.href) ? "page" : undefined}
        >
          {text(link.en, link.ar)}
        </Link>
      ))}
    </nav>
  );

  const whatsapp = waLink(business?.whatsapp);
  const socials = [
    { label: text("Instagram", "إنستغرام"), url: "", icon: Instagram },
    { label: text("Grooming Instagram", "إنستغرام العناية"), url: "", icon: Instagram },
    { label: text("Facebook", "فيسبوك"), url: "", icon: Facebook },
    { label: text("WhatsApp", "واتساب"), url: whatsapp, icon: MessageCircle },
  ];
  const hours = locale === "en" ? business?.hoursEn || business?.hours : business?.hours || business?.hoursEn;
  const place = business?.address || text("Doha, Qatar", "الدوحة، قطر");

  return (
    <div className="site-public" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="public-shell">
        <a className="skip-link" href="#main-content">{text("Skip to content", "انتقل للمحتوى")}</a>
        <header className="public-header">
          <div className="public-header__inner">
            <Brand />
            <div className="desktop-nav">{nav()}</div>
            <div className="public-tools">
              <Link to="/shop?search=" className="icon-button public-search" aria-label={text("Search products", "ابحث عن المنتجات")}>
                <Search size={21} />
              </Link>
              <Link
                to="/shop/account"
                className="icon-button"
                aria-label={text("My account", "حسابي")}
                aria-current={location.pathname.startsWith("/shop/account") ? "page" : undefined}
              >
                <UserRound size={21} />
              </Link>
              <Link to="/shop/checkout" className="icon-button cart-link" aria-label={`${text("Cart", "السلة")} (${count})`}>
                <ShoppingBag size={21} />
                <span className="cart-count">{count}</span>
              </Link>
              <nav className="locale-switch" aria-label={text("Language", "اللغة")} dir="ltr">
                <button type="button" lang="en" aria-current={locale === "en" ? "true" : undefined} onClick={() => setLocale("en")}>EN</button>
                <span aria-hidden="true">/</span>
                <button type="button" lang="ar" aria-current={locale === "ar" ? "true" : undefined} onClick={() => setLocale("ar")}>AR</button>
              </nav>
              <Link to="/grooming" className="button button--primary header-booking">
                <CalendarDays size={16} />
                {text("Book Now", "احجز الآن")}
              </Link>
              <button type="button" className="icon-button drawer-trigger" aria-label={text("Menu", "القائمة")} onClick={() => setOpen(true)}>
                <Menu size={22} strokeWidth={1.6} />
              </button>
            </div>
          </div>
        </header>
        {open && (
          <>
            <button type="button" className="drawer-overlay" aria-label={text("Close", "إغلاق")} onClick={() => setOpen(false)} />
            <div className="drawer-content" role="dialog" aria-modal="true" aria-label="Nennus Catio">
              <div className="drawer-heading">
                <h2>Nennus Catio</h2>
                <button type="button" className="icon-button" aria-label={text("Close", "إغلاق")} onClick={() => setOpen(false)}>
                  <X size={22} />
                </button>
              </div>
              {nav(() => setOpen(false))}
            </div>
          </>
        )}
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="public-footer" id="contact">
          <div className="footer-grid">
            <div>
              <Brand compact light />
              <p>{text("Everything Your Pet Needs.", "كل ما يحتاجه حيوانك.")}</p>
              <div className="public-footer__socials">
                <h3>{text("Follow Us", "تابعنا")}</h3>
                <div className="row">
                  {socials.map((item) => {
                    const Icon = item.icon;
                    return item.url ? (
                      <a key={item.label} href={item.url} rel="noopener noreferrer" target="_blank" className="icon-button" aria-label={item.label}>
                        <Icon size={20} />
                      </a>
                    ) : (
                      <span className="social-placeholder" key={item.label} title={text(`${item.label} · awaiting link`, `${item.label} · بانتظار الرابط`)}>
                        <Icon size={20} />
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div>
              <h3>{text("Shop", "المتجر")}</h3>
              <nav className="public-nav" aria-label={text("Shop links", "روابط المتجر")}>
                <Link to="/shop?category=food">{text("Pet Food & Essentials", "الطعام والمستلزمات")}</Link>
                <Link to="/pet-houses">{text("Pet Houses", "بيوت الحيوانات")}</Link>
                <Link to="/shop">{text("All Products", "كل المنتجات")}</Link>
              </nav>
            </div>
            <div>
              <h3>{text("Services", "الخدمات")}</h3>
              <nav className="public-nav" aria-label={text("Service links", "روابط الخدمات")}>
                <Link to="/grooming">{text("Grooming", "العناية")}</Link>
                <Link to="/relocation">{text("Relocation", "النقل")}</Link>
                <Link to="/grooming">{text("Book a Service", "احجز خدمة")}</Link>
                <Link to="/about">{text("About Nennus Catio", "عن Nennus Catio")}</Link>
              </nav>
              <Link to="/login" className="text-link">{text("Staff workspace", "مساحة الموظفين")}</Link>
            </div>
            <div>
              <h3><Link to="/contact">{text("Contact Us", "تواصل معنا")}</Link></h3>
              <p className="row"><MapPin size={16} />{place}</p>
              {business?.phone && (
                <p className="row">
                  <Phone size={16} aria-hidden="true" />
                  <a href={`tel:${business.phone}`}><bdi dir="ltr">{business.phone}</bdi></a>
                </p>
              )}
              {hours && <p>{hours}</p>}
              {status === "ready" && !business?.phone && (
                <small className="muted">{text("Phone will appear once it is added in settings.", "سيظهر الهاتف بعد إضافته في الإعدادات.")}</small>
              )}
            </div>
            <div className="public-footer__community">
              <h3>{text("Join the Nennus Catio community", "انضم إلى مجتمع Nennus Catio")}</h3>
              <p>{text("Pet care tips, new arrivals and special offers, straight to your inbox.", "نصائح للعناية بالحيوانات ومنتجات جديدة وعروض خاصة، مباشرة إلى بريدك.")}</p>
              <form
                className="public-footer__subscribe"
                onSubmit={(event) => {
                  event.preventDefault();
                  setNote(text("Email updates are not open yet. Please use the contact page.", "تحديثات البريد غير متاحة بعد. يرجى استخدام صفحة التواصل."));
                  event.currentTarget.reset();
                }}
              >
                <label htmlFor="footer-community-email" className="sr-only">{text("Email address", "البريد الإلكتروني")}</label>
                <input id="footer-community-email" type="email" required autoComplete="email" placeholder={text("Enter your email address", "أدخل بريدك الإلكتروني")} onChange={() => setNote("")} />
                <button type="submit">{text("Subscribe", "اشترك")}<ArrowRight size={16} className="directional" aria-hidden="true" /></button>
              </form>
              {note && <small className="public-footer__subscribe-note" role="status">{note}</small>}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
