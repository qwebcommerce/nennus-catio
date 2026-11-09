import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { useI18n } from "../context/LanguageContext.jsx";
import { productDisplayName } from "../utils/productName.js";

/**
 * Printable barcode label for a product (CODE128).
 */
export function BarcodeLabelPrint({ product, code }) {
  const { t, locale } = useI18n();
  const svgRef = useRef(null);
  const value = String(code || product?.barcode || product?.sku || "").trim();

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 2,
        height: 64,
        displayValue: true,
        fontSize: 14,
        margin: 8,
        background: "#ffffff",
        lineColor: "#111111",
      });
    } catch {
      /* invalid characters for CODE128 — ignore */
    }
  }, [value]);

  if (!product || !value) return null;

  return (
    <div className="barcode-label">
      <div className="barcode-label__name">{productDisplayName(product, locale)}</div>
      {product.sku ? (
        <div className="barcode-label__sku">
          SKU {product.sku}
        </div>
      ) : null}
      <svg ref={svgRef} className="barcode-label__svg" />
      <div className="barcode-label__price">
        {Number(product.price ?? 0).toFixed(2)} {t("common.currency")}
      </div>
    </div>
  );
}
