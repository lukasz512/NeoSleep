import { SIDEBAR_DEFAULT_COLLAPSED } from "../config/layout";

export function parseSidebarCollapsed(saved: string | null): boolean {
  if (saved === "true") return true;
  if (saved === "false") return false;
  return SIDEBAR_DEFAULT_COLLAPSED;
}
