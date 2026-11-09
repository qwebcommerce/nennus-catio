import React from "react";

/** Line icons for app sidebar navigation */
export function SidebarIcon({ name, size = 18 }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className: "app-sidebar-ico",
  };

  switch (name) {
    case "dashboard":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...props}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15v-4" />
          <path d="M12 15V8" />
          <path d="M16 15v-7" />
        </svg>
      );
    case "spark":
      return (
        <svg {...props}>
          <path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z" />
          <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M6 16h12l-1.2-2.2V10a4.8 4.8 0 10-9.6 0v3.8L6 16z" />
          <path d="M10 19a2 2 0 004 0" />
        </svg>
      );
    case "sync":
      return (
        <svg {...props}>
          <path d="M4 12a8 8 0 0114.1-5.1" />
          <path d="M18 4v5h-5" />
          <path d="M20 12a8 8 0 01-14.1 5.1" />
          <path d="M6 20v-5h5" />
        </svg>
      );
    case "pos":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M7 9h10" />
          <path d="M7 13h6" />
        </svg>
      );
    case "inventory":
      return (
        <svg {...props}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
    case "products":
      return (
        <svg {...props}>
          <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" />
          <path d="M12 12v8" />
          <path d="M4 8l8 4 8-4" />
        </svg>
      );
    case "categories":
      return (
        <svg {...props}>
          <path d="M4 6h16" />
          <path d="M4 12h10" />
          <path d="M4 18h14" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="20" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "funds":
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 10h18" />
          <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "profile":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19c1-3.5 3.5-5.2 7-5.2S18 15.5 19 19" />
        </svg>
      );
    case "accounts":
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M8 9h8" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    case "audit":
      return (
        <svg {...props}>
          <path d="M8 4h8a2 2 0 012 2v14l-6-3-6 3V6a2 2 0 012-2z" />
          <path d="M10 9h4" />
          <path d="M10 13h4" />
        </svg>
      );
    case "customers":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.6-3 2.7-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
          <circle cx="17" cy="9" r="2.3" />
          <path d="M14.4 14.4c1.6.4 2.9 1.5 3.6 3.6" />
        </svg>
      );
    case "coupons":
      return (
        <svg {...props}>
          <path d="M4 9a2.5 2.5 0 010-5h16a2.5 2.5 0 010 5" />
          <path d="M4 9v10a1.5 1.5 0 001.5 1.5H18.5A1.5 1.5 0 0020 19V9" />
          <path d="M9 12.5h6" />
        </svg>
      );
    case "plan":
      return (
        <svg {...props}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path d="M3.5 9.5h17" />
          <path d="M7.5 14h4" />
          <path d="M15.5 13.5v3" />
          <path d="M14 15h3" />
        </svg>
      );
    case "admin":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.6-3 2.7-4.8 5.5-4.8" />
          <circle cx="16.5" cy="9.5" r="2.4" />
          <path d="M12.8 19c.5-2.4 2.2-3.8 4.2-3.8 2.2 0 4 1.6 4.5 3.8" />
        </svg>
      );
    case "branches":
      return (
        <svg {...props}>
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "platform":
      return (
        <svg {...props}>
          <path d="M4 18h16" />
          <path d="M6 18V9l6-4 6 4v9" />
          <path d="M10 18v-4h4v4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2M12 18.5v2M4.8 6.2l1.4 1.4M17.8 16.4l1.4 1.4M3.5 12h2M18.5 12h2M4.8 17.8l1.4-1.4M17.8 7.6l1.4-1.4" />
        </svg>
      );
    case "logout":
      return (
        <svg {...props}>
          <path d="M10 5H6a2 2 0 00-2 2v10a2 2 0 002 2h4" />
          <path d="M15 16l4-4-4-4" />
          <path d="M19 12H10" />
        </svg>
      );
    case "reports":
      return (
        <svg {...props}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 16l3-5 3 3 4-7" />
        </svg>
      );
    case "sales":
      return (
        <svg {...props}>
          <path d="M6 7h12l-1 11H7L6 7z" />
          <path d="M9 7V5.5A3 3 0 0115 5.5V7" />
        </svg>
      );
    case "wholesale":
      return (
        <svg {...props}>
          <path d="M3 8l9-4 9 4-9 4-9-4z" />
          <path d="M3 12l9 4 9-4" />
          <path d="M3 16l9 4 9-4" />
        </svg>
      );
    case "purchases":
      return (
        <svg {...props}>
          <path d="M4 7h16v12H4z" />
          <path d="M8 7V5h8v2" />
          <path d="M8 12h8" />
        </svg>
      );
    case "transfer":
      return (
        <svg {...props}>
          <path d="M7 7h11l-3-3" />
          <path d="M17 17H6l3 3" />
          <path d="M18 7v4M6 17v-4" />
        </svg>
      );
    case "count":
      return (
        <svg {...props}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <path d="M14 16.5h5M16.5 14v5" />
        </svg>
      );
    case "returns":
      return (
        <svg {...props}>
          <path d="M9 7H5v4" />
          <path d="M5 11a7 7 0 101.5-4.5" />
        </svg>
      );
    case "appointments":
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "business":
      return (
        <svg {...props}>
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M9 20v-5h6v5" />
        </svg>
      );
    case "accounting":
      return (
        <svg {...props}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "zakat":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v10M9 9.5c1.5-1 4.5-1 6 0M9 14.5c1.5 1 4.5 1 6 0" />
        </svg>
      );
    case "commissions":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v2M12 15v2M9.5 10.5c.6-.8 1.6-1.2 2.5-1.2 1.4 0 2.5.8 2.5 2s-1.1 2-2.5 2c-.9 0-1.9-.4-2.5-1.2" />
        </svg>
      );
    case "automations":
      return (
        <svg {...props}>
          <path d="M12 3v3M12 18v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "hr":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.6-3 2.7-4.8 5.5-4.8" />
          <path d="M15 11l2 2 4-4" />
        </svg>
      );
    case "websiteSync":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="M3 12h18M12 4a14 14 0 010 16M12 4a14 14 0 000 16" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...props} width={14} height={14} viewBox="0 0 16 16">
          <path d="M4 6.5L8 10.5L12 6.5" />
        </svg>
      );
    default:
      return null;
  }
}
