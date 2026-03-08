import { insertConsoleLog } from "../db.js";
function isLoggingToDbEnabled() {
    if (process.env.ENABLE_CONSOLE_LOG_DB === "1")
        return true;
    if (process.env.NODE_ENV === "production")
        return true;
    return false;
}
export function errorHandler(err, _req, res, _next) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("BFF error:", message, stack ?? "");
    if (isLoggingToDbEnabled()) {
        insertConsoleLog({
            level: "error",
            message: `BFF: ${message}`,
            stack: stack ?? null,
            source: "bff",
            metadata: stack ? { stack } : undefined,
        }).catch((e) => console.error("errorHandler insertConsoleLog failed:", e));
    }
    if (res.headersSent)
        return;
    res.status(500).json({ error: "Internal server error" });
}
/** Wrap async route handlers so thrown errors are passed to error middleware. */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
