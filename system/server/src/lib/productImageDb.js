const PRODUCT_IMAGE_PATH_RE = /^\/api\/product-images\/([a-z0-9]+)$/i;

export function extractProductImageId(imageUrl) {
  if (imageUrl == null) return null;
  const s = String(imageUrl).trim();
  const m = s.match(PRODUCT_IMAGE_PATH_RE);
  return m ? m[1] : null;
}

export function productImagePublicPath(id) {
  return `/api/product-images/${id}`;
}

export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
