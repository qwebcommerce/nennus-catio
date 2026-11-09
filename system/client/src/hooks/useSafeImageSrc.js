import { useEffect, useState } from "react";
import { getToken } from "../api/client.js";
import {
  resolveImageUrlForDisplay,
  dataUrlToObjectUrl,
} from "../utils/imageUrl.js";

function isProductImageApiPath(url) {
  return typeof url === "string" && /\/api\/product-images\//i.test(url);
}

/**
 * Safe &lt;img src&gt;: data: → blob:; /api/product-images/* → authenticated blob fetch.
 */
export function useSafeImageSrc(rawUrl) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    const cleanup = () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    const resolved = resolveImageUrlForDisplay(rawUrl);
    if (!resolved) {
      setSrc("");
      return cleanup;
    }

    if (resolved.startsWith("data:")) {
      const u = dataUrlToObjectUrl(resolved);
      if (!u) {
        setSrc("");
        return cleanup;
      }
      objectUrl = u;
      setSrc(u);
      return cleanup;
    }

    if (!isProductImageApiPath(resolved)) {
      setSrc(resolved);
      return cleanup;
    }

    const token = getToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(resolved, { headers })
      .then(async (res) => {
        if (!res.ok) throw new Error("image fetch failed");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return cleanup;
  }, [rawUrl]);

  return src;
}
