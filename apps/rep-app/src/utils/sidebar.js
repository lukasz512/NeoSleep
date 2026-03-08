import { SIDEBAR_DEFAULT_COLLAPSED } from "../constants";
/**
 * Parses the sidebar collapsed state from localStorage.
 * Returns SIDEBAR_DEFAULT_COLLAPSED (false = expanded) when value is invalid.
 */
export function parseSidebarCollapsed(saved) {
    if (saved === "true")
        return true;
    if (saved === "false")
        return false;
    return SIDEBAR_DEFAULT_COLLAPSED;
}
