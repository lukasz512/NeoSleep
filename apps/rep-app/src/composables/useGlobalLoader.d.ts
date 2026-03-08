/**
 * Global loader state for API requests and other async operations.
 * Use startLoading() when a request starts and stopLoading() when it ends.
 * Multiple concurrent requests are supported (counter-based).
 */
export declare function useGlobalLoader(): {
    isLoading: import("vue").ComputedRef<boolean>;
    startLoading: () => void;
    stopLoading: () => void;
};
