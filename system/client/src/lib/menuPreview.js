/**
 * fix-rf: the top admin's "Preview menu as role". Navigation only: it changes which links the
 * sidebar shows, never the admin's rights (screens and the API still use the admin's own rights).
 * Kept in sessionStorage so it survives navigation and reloads in this tab; signing out clears it.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../api/client.js";

const KEY = "nc_menu_preview";
const listeners = new Set();

function read() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw || "";
  } catch {
    return "";
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

/** Turn the preview on for a role ("" or null turns it off). */
export function setMenuPreview(userId, role) {
  try {
    if (role && userId) window.sessionStorage.setItem(KEY, JSON.stringify({ userId, role }));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: preview simply does not persist */
  }
  emit();
}

export function clearMenuPreview() {
  setMenuPreview(null, null);
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** The role being previewed by this (top admin) user, or "". */
export function useMenuPreviewRole(user) {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  if (!raw || user?.role !== "ADMIN") return "";
  try {
    const v = JSON.parse(raw);
    return v?.userId === user.id && typeof v.role === "string" ? v.role : "";
  } catch {
    return "";
  }
}

/** GET /api/role-menus (top admin only): every role's resolved module map and user counts. */
export function useRoleMenuData(enabled, refreshKey = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api("/api/role-menus")
      .then((r) => alive && (setData(r), setError("")))
      .catch((e) => alive && setError(e.message || "error"));
    return () => {
      alive = false;
    };
  }, [enabled, refreshKey]);
  return { data, error };
}
