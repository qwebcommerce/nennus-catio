"use client";
import { Suspense, useState, type ReactNode } from "react";
import {
  ShoppingBag,
  CalendarDays,
  UserRound,
  Camera as Instagram,
  Link2 as Facebook,
  MessageCircle,
  Search,
  MapPin,
  Phone,
  ArrowRight,
} from "lucide-react";
import { formatPhone } from "@nennus-catio/contracts";
import { Link, usePathname } from "@/i18n/navigation";
import { Brand } from "@/shared/ui/Brand";
import { LocaleSwitcher } from "@/shared/ui/LocaleSwitcher";
import { NavigationDrawer } from "@/shared/ui/NavigationDrawer";
import { ActionLink } from "@/shared/ui/ActionLink";
import { useCopy } from "@/shared/lib/copy";
import { useCart } from "@/mocks/MockDataProvider";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { usePublicSettings } from "@/shared/api/use-public-settings";
import { Button } from "@/shared/ui/Button";
export function PublicLayout({ children }: { children: ReactNode }) {
  const c = useCopy(),
    pathname = usePathname(),
    { status, settings, retry } = usePublicSettings(),
    { source } = useRepositories(),
    { cart } = useCart();
  const count = cart.reduce((a, b) => a + b.quantity, 0);
  const [newsletterPreview, setNewsletterPreview] = useState(false);
  const links = [
    { href: "/", label: c.text("Home", "الرئيسية") },
    { href: "/shop", label: c.text("Shop", "المتجر") },
    { href: "/grooming", label: c.text("Grooming", "العناية") },
    { href: "/pet-houses", label: c.text("Pet Houses", "بيوت الحيوانات") },
    { href: "/relocation", label: c.text("Relocation", "النقل") },
    { href: "/about", label: c.text("About", "عنّا") },
    { href: "/contact", label: c.text("Contact", "تواصل") },
  ];
  const nav = (close?: () => void) => (
    <nav
      className="public-nav"
      aria-label={c.text("Main navigation", "التنقل الرئيسي")}
    >
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          onClick={close}
          aria-current={pathname === l.href ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
  const social = settings?.socialLinks;
  const socials = [
    { label: c.text("Instagram", "إنستغرام"), url: social?.instagram ?? "", icon: Instagram },
    {
      label: c.text("Grooming Instagram", "إنستغرام العناية"),
      url: social?.instagramGrooming ?? "",
      icon: Instagram,
    },
    { label: c.text("Facebook", "فيسبوك"), url: social?.facebook ?? "", icon: Facebook },
    { label: c.text("WhatsApp", "واتساب"), url: social?.whatsapp ?? "", icon: MessageCircle },
  ];
  return (
    <div className="public-shell">
      <a className="skip-link" href="#main-content">
        {c.text("Skip to content", "انتقل للمحتوى")}
      </a>
      <header className="public-header">
        <div className="public-header__inner">
          <Brand />
          <div className="desktop-nav">{nav()}</div>
          <div className="public-tools">
            <Link
              href="/shop?search="
              className="icon-button public-search"
              aria-label={c.text("Search products", "ابحث عن المنتجات")}
            >
              <Search size={21} />
            </Link>
            <Link
              href="/account"
              className="icon-button"
              aria-label={c.text("My account", "حسابي")}
              aria-current={pathname.startsWith("/account") ? "page" : undefined}
            >
              <UserRound size={21} />
            </Link>
            <Link
              href="/cart"
              className="icon-button cart-link"
              aria-label={`${c.text("Cart", "السلة")} (${count})`}
            >
              <ShoppingBag size={21} />
              <span className="cart-count">{count}</span>
            </Link>
            <Suspense fallback={<span>EN / AR</span>}>
              <LocaleSwitcher />
            </Suspense>
            <ActionLink href="/grooming" className="header-booking">
              <CalendarDays size={16} />
              {c.text("Book Now", "احجز الآن")}
            </ActionLink>
            <NavigationDrawer title={c.text("Nennus Catio", "Nennus Catio")}>
              {(close) => nav(close)}
            </NavigationDrawer>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="public-footer" id="contact">
        <div className="footer-grid">
          <div>
            <Brand compact light />
            <p>
              {c.text("Everything Your Pet Needs.", "كل ما يحتاجه حيوانك.")}
            </p>
            <div className="public-footer__socials">
              <h3>{c.text("Follow Us", "تابعنا")}</h3>
              {status === "loading" ? (
                <p className="sr-only" role="status" aria-busy="true">
                  {c.text("Loading links", "جارٍ تحميل الروابط")}
                </p>
              ) : status === "error" ? (
                <div className="row" role="alert">
                  <small className="muted">
                    {c.text("Links could not be loaded.", "تعذّر تحميل الروابط.")}
                  </small>
                  <Button variant="secondary" onClick={retry}>
                    {c.text("Retry", "أعد المحاولة")}
                  </Button>
                </div>
              ) : (
              <div className="row">
                {socials.map((s) =>
                  s.url ? (
                    <a
                      key={s.label}
                      href={s.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="icon-button"
                      aria-label={s.label}
                    >
                      <s.icon size={20} />
                    </a>
                  ) : (
                    <span
                      className="social-placeholder"
                      key={s.label}
                      title={c.text(
                        `${s.label} · awaiting link`,
                        `${s.label} · بانتظار الرابط`,
                      )}
                    >
                      <s.icon size={20} />
                      <span className="sr-only">
                        {s.label} {c.text("link not set", "الرابط غير محدد")}
                      </span>
                    </span>
                  ),
                )}
              </div>
              )}
              <small className="muted">
                {c.text(
                  "Links managed by administration",
                  "الروابط تُدار من الإدارة",
                )}
              </small>
            </div>
          </div>
          <div>
            <h3>{c.text("Shop", "المتجر")}</h3>
            <nav className="public-nav" aria-label={c.text("Shop links", "روابط المتجر")}>
              <Link href="/shop?category=food">{c.text("Pet Food & Essentials", "الطعام والمستلزمات")}</Link>
              <Link href="/pet-houses">{c.text("Pet Houses", "بيوت الحيوانات")}</Link>
              <Link href="/shop">{c.text("All Products", "كل المنتجات")}</Link>
            </nav>
          </div>
          <div>
            <h3>{c.text("Services", "الخدمات")}</h3>
            <nav className="public-nav" aria-label={c.text("Service links", "روابط الخدمات")}>
              <Link href="/grooming">{c.text("Grooming", "العناية")}</Link>
              <Link href="/relocation">{c.text("Relocation", "النقل")}</Link>
              <Link href="/grooming/book">{c.text("Book a Service", "احجز خدمة")}</Link>
              <Link href="/about">{c.text("About Nennus Catio", "عن Nennus Catio")}</Link>
            </nav>
            <Link href="/admin" className="text-link">
              {c.text("Staff workspace", "مساحة الموظفين")}
            </Link>
          </div>
          <div>
            <h3><Link href="/contact">{c.text("Contact Us", "تواصل معنا")}</Link></h3>
            <p className="row">
              <MapPin size={16} />
              {c.text("Doha, Qatar", "الدوحة، قطر")}
            </p>
            {settings?.phone && (
              <p className="row">
                <Phone size={16} aria-hidden="true" />
                <a href={`tel:${settings.phone}`}>
                  <bdi dir="ltr">{formatPhone(settings.phone)}</bdi>
                </a>
              </p>
            )}
            <p>{settings ? c.local(settings.hours) : ""}</p>
            <small className="muted">
              {settings?.phone
                ? c.text("Address pending approval", "العنوان بانتظار الموافقة")
                : c.text(
                    "Address and phone pending approval",
                    "العنوان والهاتف بانتظار الموافقة",
                  )}
            </small>
          </div>
          <div className="public-footer__community">
            <h3>{c.text("Join the Nennus Catio community", "انضم إلى مجتمع Nennus Catio")}</h3>
            <p>{c.text("Pet care tips, new arrivals and special offers, straight to your inbox.", "نصائح للعناية بالحيوانات ومنتجات جديدة وعروض خاصة، مباشرة إلى بريدك.")}</p>
            <form className="public-footer__subscribe" onSubmit={(event) => {
              event.preventDefault();
              setNewsletterPreview(true);
              event.currentTarget.reset();
            }}>
              <label htmlFor="footer-community-email" className="sr-only">{c.text("Email address for community updates", "البريد الإلكتروني لتحديثات المجتمع")}</label>
              <input id="footer-community-email" type="email" required autoComplete="email" placeholder={c.text("Enter your email address", "أدخل بريدك الإلكتروني")} onChange={() => setNewsletterPreview(false)} />
              <button type="submit">{c.text("Subscribe", "اشترك")}<ArrowRight size={16} className="directional" aria-hidden="true" /></button>
            </form>
            <small className="public-footer__subscribe-note" role="status">{newsletterPreview
              ? c.text("Thanks for your interest! This is a preview only; no subscription was saved or sent.", "شكراً لاهتمامك! هذه معاينة فقط؛ لم يتم حفظ اشتراك أو إرساله.")
              : c.text("Demo form · no emails are saved or sent.", "نموذج تجريبي · لا يتم حفظ البريد أو إرساله.")}</small>
          </div>
        </div>
        <div className="preview-note">
          {source === "api"
            ? // True whichever payment company is on: SkipCash's sandbox (8c) or the test page (8a).
              c.text(
                "Test site · accounts, the shop, orders and grooming bookings are real but use test data. Payments are test payments: no real money moves.",
                "موقع تجريبي · الحسابات والمتجر والطلبات وحجوزات العناية حقيقية لكن ببيانات اختبار. المدفوعات تجريبية: لا تُنقل أموال حقيقية.",
              )
            : c.text(
                "Interactive frontend · synthetic data only. No live orders, payments or authentication. Refresh resets this demo.",
                "واجهة تفاعلية ببيانات تجريبية فقط. لا طلبات أو دفع أو دخول فعلي. التحديث يعيد البيانات.",
              )}
        </div>
      </footer>
    </div>
  );
}
