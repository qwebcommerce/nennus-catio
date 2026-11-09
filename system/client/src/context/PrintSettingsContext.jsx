import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  loadPrintPaperSizes,
  savePrintPaperSizes,
  printPaperClass,
} from "../utils/printPaper.js";

const PrintSettingsContext = createContext(null);

export function PrintSettingsProvider({ children }) {
  const [sizes, setSizes] = useState(() => loadPrintPaperSizes());

  const update = useCallback((patch) => {
    setSizes((prev) => savePrintPaperSizes({ ...prev, ...patch }));
  }, []);

  const classFor = useCallback((kind) => printPaperClass(sizes[kind] || "A4"), [sizes]);

  const value = useMemo(
    () => ({
      sizes,
      setSizes: update,
      classFor,
    }),
    [sizes, update, classFor]
  );

  return (
    <PrintSettingsContext.Provider value={value}>{children}</PrintSettingsContext.Provider>
  );
}

export function usePrintSettings() {
  const ctx = useContext(PrintSettingsContext);
  if (!ctx) {
    throw new Error("usePrintSettings must be used within PrintSettingsProvider");
  }
  return ctx;
}
