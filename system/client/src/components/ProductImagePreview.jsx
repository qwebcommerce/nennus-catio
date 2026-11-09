import React, { useEffect, useState } from "react";
import { useSafeImageSrc } from "../hooks/useSafeImageSrc.js";
import { ProductImagePlaceholder } from "./ProductImagePlaceholder.jsx";

/**
 * عرض صورة المنتج من رابط مخزَّن في قاعدة البيانات (imageUrl).
 */
export function ProductImagePreview({
  url,
  alt = "",
  width = 56,
  height = 56,
  style = {},
}) {
  const [failed, setFailed] = useState(false);
  const trimmed = useSafeImageSrc(url);

  useEffect(() => {
    setFailed(false);
  }, [url, trimmed]);

  if (!trimmed || failed) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 12,
          background: "var(--surface2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          overflow: "hidden",
          ...style,
        }}
      >
        <ProductImagePlaceholder compact={width <= 48} />
      </div>
    );
  }

  return (
    <img
      src={trimmed}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{
        width,
        height,
        objectFit: "cover",
        borderRadius: 12,
        background: "var(--surface2)",
        display: "block",
        ...style,
      }}
    />
  );
}
