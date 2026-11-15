export type DataSource = "api" | "mock";

/**
 * `NEXT_PUBLIC_DATA_SOURCE` selects where the public shell reads from. `api` is the default.
 * `mock` keeps the in-memory prototype data and is development-only: a production build that
 * still has it set fails loudly instead of shipping synthetic data.
 */
export function resolveDataSource(
  value: string | undefined,
  nodeEnv: string | undefined,
): DataSource {
  const source = value === undefined || value === "" ? "api" : value;
  if (source !== "api" && source !== "mock") {
    throw new Error(
      `NEXT_PUBLIC_DATA_SOURCE must be "api" or "mock" (got ${JSON.stringify(value)}).`,
    );
  }
  if (source === "mock" && nodeEnv === "production") {
    throw new Error(
      "NEXT_PUBLIC_DATA_SOURCE=mock is development-only and cannot be used in a production build.",
    );
  }
  return source;
}
