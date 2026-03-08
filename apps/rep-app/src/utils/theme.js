export function getNextTheme(current) {
    return current === "light" ? "dark" : "light";
}
export function isValidTheme(value) {
    return value === "light" || value === "dark";
}
