import React from "react";

/** Simple line icons for dashboard widgets */
export function DashIcon({ name, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  switch (name) {
    case "cart":
      return (
        <svg {...common}>
          <path d="M6 6h15l-1.5 9h-12z" />
          <path d="M6 6L5 3H2" />
          <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 10h18" />
          <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M14.2 14.2c1.7.4 3.1 1.6 3.8 3.8" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
    case "trend-up":
      return (
        <svg {...common} strokeWidth="2">
          <path d="M4 16l6-6 4 4 6-7" />
          <path d="M14 7h6v6" />
        </svg>
      );
    case "trend-down":
      return (
        <svg {...common} strokeWidth="2">
          <path d="M4 8l6 6 4-4 6 7" />
          <path d="M14 17h6v-6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16.5 16.5L21 21" />
        </svg>
      );
    case "print":
      return (
        <svg {...common}>
          <path d="M7 9V4h10v5" />
          <rect x="5" y="9" width="14" height="8" rx="2" />
          <path d="M7 17h10v3H7z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 16h12l-1.2-2.2V10a4.8 4.8 0 10-9.6 0v3.8L6 16z" />
          <path d="M10 19a2 2 0 004 0" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 4l9 16H3L12 4z" />
          <path d="M12 10v4" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3v3.5" />
          <path d="M12 17.5V21" />
          <path d="M3 12h3.5" />
          <path d="M17.5 12H21" />
          <path d="M5.6 5.6l2.5 2.5" />
          <path d="M15.9 15.9l2.5 2.5" />
          <path d="M5.6 18.4l2.5-2.5" />
          <path d="M15.9 8.1l2.5-2.5" />
        </svg>
      );
    default:
      return null;
  }
}
