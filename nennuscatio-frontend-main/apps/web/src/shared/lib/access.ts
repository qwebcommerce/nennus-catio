import type { DemoRole, ModuleId } from "@nennus-catio/contracts";

/** UI demonstration only. Future Nest endpoints must independently authorise requests. */
export function canPreviewModule(role: DemoRole, module: ModuleId): boolean {
  if (module === "team" || module === "integrations") return role === "owner";
  if (role === "finance") return module === "finance";
  return true;
}
