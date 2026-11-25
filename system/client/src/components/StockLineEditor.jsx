import React, { useMemo, useRef, useState } from "react";

/**
 * Lines for a transfer or a van return: a scan field (a USB / Bluetooth scanner types the code
 * and presses Enter), a searchable product + variant picker, and per line the unit (piece / bag,
 * carton, kg) with the quantity converted to stock units ("2 cartons = 24 pcs").
 * Van returns also choose a condition per line and need a photo for a damaged line.
 */

export function cartonSize(product, variant) {
  const n = Number(variant?.piecesPerCarton ?? product?.piecesPerCarton);
  return Number.isInteger(n) && n >= 2 ? n : null;
}

export function unitOptions(product, variant) {
  if (!product) return ["PIECE"];
  if (product.sellBy === "WEIGHT") return ["KG"];
  return cartonSize(product, variant) ? ["PIECE", "CARTON"] : ["PIECE"];
}

/** Stock units for a line (pieces, or grams for weight goods); null when not valid yet. */
export function baseQuantity(line, product, variant) {
  const raw = String(line.quantity ?? "").trim().replace(",", ".");
  const q = Number(raw);
  if (!raw || !Number.isFinite(q) || q <= 0 || !product) return null;
  if (product.sellBy === "WEIGHT") {
    if (!/^\d+(\.\d{1,3})?$/.test(raw)) return null;
    return Math.round(q * 1000);
  }
  if (!Number.isInteger(q)) return null;
  if (line.unit === "CARTON") {
    const size = cartonSize(product, variant);
    return size ? q * size : null;
  }
  return q;
}

export function productName(p, locale) {
  if (!p) return "";
  return locale === "en" ? p.nameEn || p.name : p.name || p.nameEn;
}

export function variantName(v, locale) {
  if (!v) return "";
  return locale === "en" ? v.labelEn || v.label : v.label || v.labelEn;
}

/** "Piece" for plain goods, "Bag" for pack-size variants. */
export function unitLabel(unit, { variant, t }) {
  if (unit === "CARTON") return t("stockUnit.carton");
  if (unit === "KG") return t("stockUnit.kg");
  return variant ? t("stockUnit.bag") : t("stockUnit.piece");
}

/** "2 cartons = 24 pcs" / "2.5 kg = 2500 g". */
export function conversionText(line, product, variant, t) {
  const base = baseQuantity(line, product, variant);
  if (base == null) return "";
  if (product.sellBy === "WEIGHT") return t("stockUnit.equalsGrams", { qty: line.quantity, grams: base });
  if (line.unit === "CARTON") return t("stockUnit.equalsPieces", { qty: line.quantity, unit: t("stockUnit.cartons"), pieces: base });
  return t("stockUnit.pieces", { pieces: base });
}

/** Local barcode / SKU match in a product list (product or variant). */
export function matchCode(products, code) {
  const c = String(code || "").trim();
  if (!c) return null;
  for (const p of products) {
    for (const v of p.variants || []) {
      if (v.barcode === c || v.sku === c) return { productId: p.id, variantId: v.id };
    }
  }
  const p = products.find((x) => x.barcode === c || x.sku === c);
  return p ? { productId: p.id, variantId: null } : null;
}

/** Payment proof file → { dataBase64, fileName }: a PDF as it is, an image shrunk like a photo. */
export async function readProofFile(file) {
  if (!file) return null;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    return { dataBase64: dataUrl, fileName: file.name };
  }
  return { dataBase64: await shrinkPhoto(file), fileName: file.name };
}

let seq = 0;
export function newLine(product, variantId, extra = {}) {
  seq += 1;
  const variant = (product?.variants || []).find((v) => v.id === variantId) || null;
  return {
    key: `l${Date.now()}${seq}`,
    productId: product?.id || "",
    variantId: variantId || "",
    unit: unitOptions(product, variant)[0],
    quantity: "1",
    ...extra,
  };
}

/** Shrinks a phone photo before upload (JPEG, longest side 1600 px). */
export async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function StockLineEditor({
  products,
  lines,
  setLines,
  t,
  locale,
  remoteLookup,
  withCondition = false,
  onMessage,
  stockOf,
  addLabelKey = "transfer.addItems",
}) {
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [pickId, setPickId] = useState("");
  const [pickVariant, setPickVariant] = useState("");
  const scanRef = useRef(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter((p) =>
          [p.name, p.nameEn, p.sku, p.barcode, ...(p.variants || []).flatMap((v) => [v.label, v.labelEn, v.sku, v.barcode])]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q)),
        )
      : products;
    return list.slice(0, 200);
  }, [products, search]);

  const update = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addItem = (productId, variantId) => {
    const product = byId.get(productId);
    if (!product) return false;
    setLines((prev) => {
      const unit = product.sellBy === "WEIGHT" ? "KG" : "PIECE";
      const same = prev.find(
        (l) => l.productId === productId && (l.variantId || "") === (variantId || "") && l.unit === unit && (!withCondition || (l.condition === "GOOD" && !l.photo)),
      );
      if (same) {
        const q = Number(String(same.quantity).replace(",", ".")) || 0;
        return prev.map((l) => (l === same ? { ...l, quantity: String(Math.round((q + 1) * 1000) / 1000) } : l));
      }
      return [...prev, newLine(product, variantId, withCondition ? { condition: "GOOD", photo: null } : {})];
    });
    return true;
  };

  const onScan = async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    setScan("");
    let hit = matchCode(products, code);
    if (!hit && remoteLookup) {
      try {
        hit = await remoteLookup(code);
      } catch {
        hit = null;
      }
    }
    if (!hit || !addItem(hit.productId, hit.variantId)) {
      onMessage?.(t("transfer.scanMiss", { code }));
    } else {
      const p = byId.get(hit.productId);
      onMessage?.(t("transfer.scanAdded", { name: `${productName(p, locale)}${hit.variantId ? ` · ${variantName((p.variants || []).find((v) => v.id === hit.variantId), locale)}` : ""}` }));
    }
    scanRef.current?.focus();
  };

  const picked = byId.get(pickId);

  return (
    <div className="vr-lines">
      <label className="vr-field">
        <span>{t("transfer.scanLabel")}</span>
        <input
          ref={scanRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          className="vr-scan"
          placeholder={t("transfer.scanPlaceholder")}
          aria-label={t("transfer.scanLabel")}
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={onScan}
          data-testid="scan-input"
        />
      </label>

      <div className="vr-pick">
        <label className="vr-field">
          <span>{t("transfer.searchProduct")}</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("transfer.searchPlaceholder")} aria-label={t("transfer.searchProduct")} />
        </label>
        <label className="vr-field">
          <span>{t("returns.pickProduct")}</span>
          <select value={pickId} onChange={(e) => { setPickId(e.target.value); setPickVariant(""); }} aria-label={t("returns.pickProduct")} data-testid="pick-product">
            <option value="">{t("returns.pickProduct")}</option>
            {filtered.map((p) => (
              <option key={p.id} value={p.id}>
                {productName(p, locale)}
                {stockOf ? ` (${t("productCard.stock")} ${stockOf(p)})` : ""}
              </option>
            ))}
          </select>
        </label>
        {picked?.variants?.length ? (
          <label className="vr-field">
            <span>{t("pos.variant")}</span>
            <select value={pickVariant} onChange={(e) => setPickVariant(e.target.value)} aria-label={t("pos.variant")} data-testid="pick-variant">
              <option value="">{t("pos.variant")}</option>
              {picked.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {variantName(v, locale)}
                  {stockOf ? ` · ${stockOf(picked, v)}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="btn-touch vr-btn"
          disabled={!picked || (picked.variants?.length && !pickVariant)}
          onClick={() => {
            if (addItem(pickId, pickVariant || null)) {
              setPickId("");
              setPickVariant("");
            }
          }}
          data-testid="add-items"
        >
          {t(addLabelKey)}
        </button>
      </div>

      {lines.length ? (
        <ul className="vr-line-list">
          {lines.map((line) => {
            const product = byId.get(line.productId);
            const variant = (product?.variants || []).find((v) => v.id === line.variantId) || null;
            const units = unitOptions(product, variant);
            const conv = product ? conversionText(line, product, variant, t) : "";
            return (
              <li key={line.key} className="vr-line" data-testid="line">
                <div className="vr-line__name">
                  <strong>{productName(product, locale) || "—"}</strong>
                  {product?.variants?.length ? (
                    <select
                      value={line.variantId}
                      onChange={(e) => {
                        const v = product.variants.find((x) => x.id === e.target.value) || null;
                        const u = unitOptions(product, v);
                        update(line.key, { variantId: e.target.value, unit: u.includes(line.unit) ? line.unit : u[0] });
                      }}
                      aria-label={t("pos.variant")}
                    >
                      <option value="">{t("pos.variant")}</option>
                      {product.variants.map((v) => (
                        <option key={v.id} value={v.id}>{variantName(v, locale)}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div className="vr-line__qty">
                  <select
                    value={line.unit}
                    onChange={(e) => update(line.key, { unit: e.target.value })}
                    aria-label={t("stockUnit.unit")}
                    data-testid="line-unit"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>{unitLabel(u, { variant, t })}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={product?.sellBy === "WEIGHT" ? 0.001 : 1}
                    step={product?.sellBy === "WEIGHT" ? 0.001 : 1}
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                    aria-label={t("invoice.colQty")}
                    className="vr-qty"
                    data-testid="line-qty"
                  />
                  <span className="vr-conv" data-testid="line-conv">{conv || t("stockUnit.invalid")}</span>
                </div>
                {withCondition ? (
                  <div className="vr-line__cond">
                    <select
                      value={line.condition || "GOOD"}
                      onChange={(e) => update(line.key, { condition: e.target.value })}
                      aria-label={t("vr.condition")}
                      data-testid="line-condition"
                    >
                      <option value="GOOD">{t("vr.good")}</option>
                      <option value="DAMAGED">{t("vr.damaged")}</option>
                    </select>
                    {line.condition === "DAMAGED" ? (
                      <label className="vr-photo">
                        <span>{line.photo ? t("vr.photoReady") : t("vr.photoNeeded")}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          aria-label={t("vr.photo")}
                          data-testid="line-photo"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              update(line.key, { photo: await shrinkPhoto(file) });
                            } catch {
                              onMessage?.(t("vr.photoBad"));
                            }
                          }}
                        />
                        {line.photo ? <img src={line.photo} alt="" className="vr-thumb" /> : null}
                      </label>
                    ) : null}
                  </div>
                ) : null}
                <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                  {t("returns.removeLine")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="vr-muted">{t("transfer.noLines")}</p>
      )}
    </div>
  );
}
