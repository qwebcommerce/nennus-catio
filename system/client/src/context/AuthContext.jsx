import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../api/client.js";
import {
  getCachedSessionUser,
  setCachedSessionUser,
} from "../lib/sessionUserCache.js";
import { resolveClientPermissions } from "../lib/permissions.js";
import { clearMenuPreview } from "../lib/menuPreview.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The session is an httpOnly cookie: ask the server who we are.
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      const cached = getCachedSessionUser();
      setUser(cached || null);
      setLoading(false);
      return;
    }

    api("/api/auth/me")
      .then((u) => {
        setUser(u);
        setCachedSessionUser(u);
      })
      .catch((err) => {
        if (err?.status === 401) {
          setCachedSessionUser(null);
          setUser(null);
          return;
        }
        const cached = getCachedSessionUser();
        if (cached) {
          setUser(cached);
          return;
        }
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  /** عند عودة الشبكة حدّث المستخدم من السيرفر */
  useEffect(() => {
    const onOnline = () => {
      api("/api/auth/me")
        .then((u) => {
          setUser(u);
          setCachedSessionUser(u);
        })
        .catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const login = async (email, password, organizationSlug) => {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: {
        email,
        password,
        ...(organizationSlug != null && String(organizationSlug).trim()
          ? { organizationSlug: String(organizationSlug).trim() }
          : {}),
      },
    });
    setUser(data.user);
    setCachedSessionUser(data.user);
    return data.user;
  };

  const logout = () => {
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    // fix-rf: the admin's menu preview ends with the session.
    clearMenuPreview();
    setCachedSessionUser(null);
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    const u = await api("/api/auth/me");
    setUser(u);
    setCachedSessionUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => {
      const permissions = resolveClientPermissions(user);
      return {
        user,
        loading,
        login,
        logout,
        refreshUser,
        isAdmin: user?.role === "ADMIN",
        /** FR-09: roles, business settings and payment settings — owner only. */
        isOrgOwner: user?.isOrgOwner === true,
        /** Module rights enforced by the server. */
        canModule: (mod, action = "view") => user?.role === "ADMIN" || Boolean(user?.modules?.[mod]?.[action]),
        isSuperAdmin: user?.role === "ADMIN",
        /** Top admin or supervisor (legacy manager). Prefer canModule for screen rights. */
        isManager: ["ADMIN", "SUPERVISOR", "MANAGER"].includes(user?.role),
        permissions,
        can: (key) => Boolean(permissions?.[key]),
      };
    },
    [user, loading, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth داخل AuthProvider");
  return ctx;
}
