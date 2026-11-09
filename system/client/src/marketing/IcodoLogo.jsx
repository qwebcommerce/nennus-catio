import React from "react";

/**
 * Official i codo logo lockup.
 * @param {"light"|"dark"|"nav"} variant
 *   - light/nav: for light backgrounds (dark "codo" text)
 *   - dark: for dark backgrounds (light "codo" text)
 */
export function IcodoLogo({
  variant = "light",
  height,
  width,
  className = "",
  alt = "i codo",
}) {
  const src =
    (variant === "dark"
      ? "/icodo-logo-dark.png"
      : variant === "nav"
        ? "/icodo-logo-nav.png"
        : "/icodo-logo-light.png") + "?v=5";

  const style = {
    display: "block",
    objectFit: "contain",
    objectPosition: "center",
    flexShrink: 0,
  };

  if (width != null) {
    style.width = width;
    style.height = "auto";
    style.maxWidth = "100%";
  } else if (height != null) {
    style.height = height;
    style.width = "auto";
    style.maxWidth = "100%";
  } else {
    style.height = 48;
    style.width = "auto";
    style.maxWidth = "100%";
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`mkt-logo mkt-logo--${variant} ${className}`.trim()}
      style={style}
      decoding="async"
    />
  );
}

/** Top nav: logo + optional POS chip */
export function IcodoNavBrand({ height = 48, posLabel = "POS" }) {
  return (
    <span className="mkt-nav-brand">
      <IcodoLogo variant="nav" height={height} />
      {posLabel ? <span className="mkt-brand-pos">{posLabel}</span> : null}
    </span>
  );
}
