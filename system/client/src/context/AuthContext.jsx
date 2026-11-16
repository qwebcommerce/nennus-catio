import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api, getToken } from "../api/client.js";
import { decodeJwtPayload, minimalUserFromTokenPayload } from "../lib/jwtDecode.js";
import {
  getCachedSessionUser,
  setCachedSessionUser,
} from "../lib/sessionUserCache.js";
import { resolveClientPermissions } from "../lib/permissions.js";

const AuthContext = createContext(null);

function applySessionFromTokenFallback() {
  const token = getToken();
  if (!token) return null;
  const p = decodeJwtPayload(token);
  return minimalUserFromTokenPayload(p);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      const cached = getCachedSessionUser();
      setUser(cached || applySessionFromTokenFallback());
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
          localStorage.removeItem("token");
          setCachedSessionUser(null);
          setUser(null);
          return;
        }
        const cached = getCachedSessionUser();
        if (cached) {
          setUser(cached);
          return;
        }
        setUser(applySessionFromTokenFallback());
      })
      .finally(() => setLoading(false));
  }, []);

  /** عند عودة الشبكة حدّث المستخدم من السيرفر */
  useEffect(() => {
    const onOnline = () => {
      if (!getToken()) return;
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
    localStorage.setItem("token", data.token);
    setUser(data.user);
    setCachedSessionUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setCachedSessionUser(null);
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    if (!getToken()) return null;
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
        isSuperAdmin: user?.role === "ADMIN",
        isManager: user?.role === "MANAGER" || user?.role === "ADMIN",
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
