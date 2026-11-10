import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { isVerticalFeatureEnabled } from "../lib/verticalFeatures.js";

/**
 * يحمي مساراً من الوصول المباشر عندما لا يطابق مجال نشاط المنشأة.
 */
export function VerticalFeatureGate({ feature, children }) {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return children;
  if (!isVerticalFeatureEnabled(feature, user?.businessVertical)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
