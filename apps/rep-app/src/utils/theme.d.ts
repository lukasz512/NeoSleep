export type ThemeMode = "light" | "dark";
export declare function getNextTheme(current: ThemeMode): ThemeMode;
export declare function isValidTheme(value: string): value is ThemeMode;
