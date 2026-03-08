export interface BffFetchOptions extends Omit<RequestInit, "credentials"> {
    /** If true (default), failed responses trigger a notification and POST /api/logs for errors. */
    handleErrors?: boolean;
    /** Optional i18n key for the error notification. */
    errorMessageKey?: string;
}
/**
 * Fetch from BFF with credentials. On non-ok response: show notification and send error to POST /api/logs
 * so it appears in tbl_console_errors (when BFF has ENABLE_CONSOLE_LOG_DB=1 or production).
 */
export declare function bffFetch(path: string, options?: BffFetchOptions): Promise<Response>;
