export type ThemeMode = "light" | "dark";

export function getNextTheme(current: ThemeMode): ThemeMode {
  return current === "light" ? "dark" : "light";
}

export function isValidTheme(value: string): value is ThemeMode {
  return value === "light" || value === "dark";
}
