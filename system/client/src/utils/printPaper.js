/** مفاتيح أحجام الورق المدعومة للطباعة */
export const PRINT_PAPER_KEYS = ["A4", "A5", "Letter", "thermal80", "thermal58"];

const TO_CLASS = {
  A4: "a4",
  A5: "a5",
  Letter: "letter",
  thermal80: "thermal80",
  thermal58: "thermal58",
};

const STORAGE_KEY = "petstore-print-paper-v1";

const DEFAULTS = {
  retail: "A4",
  wholesale: "A4",
  reports: "A4",
  other: "A4",
};

function normalize(key) {
  return PRINT_PAPER_KEYS.includes(key) ? key : "A4";
}

/** فئة CSS لحجم الورق (مثال: print-paper--a4) */
export function printPaperClass(paperKey) {
  const k = normalize(paperKey);
  return `print-paper--${TO_CLASS[k]}`;
}

export function isThermalPaper(paperKey) {
  return paperKey === "thermal80" || paperKey === "thermal58";
}

export function loadPrintPaperSizes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw);
    return {
      retail: normalize(o.retail),
      wholesale: normalize(o.wholesale),
      reports: normalize(o.reports),
      other: normalize(o.other),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrintPaperSizes(sizes) {
  const next = {
    retail: normalize(sizes.retail),
    wholesale: normalize(sizes.wholesale),
    reports: normalize(sizes.reports),
    other: normalize(sizes.other),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export { DEFAULTS as DEFAULT_PRINT_PAPER_SIZES, STORAGE_KEY };
