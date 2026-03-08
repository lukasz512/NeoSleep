"use strict";
/**
 * Vitest setup: minimal window/history for node environment so vue-router and Vuetify work.
 */
if (typeof globalThis.window === "undefined") {
    const noop = () => { };
    const navigator = { maxTouchPoints: 0, userAgent: "Node" };
    const win = {
        history: { replaceState: noop, pushState: noop, go: noop, back: noop, forward: noop },
        location: { pathname: "/", search: "", hash: "" },
        addEventListener: noop,
        removeEventListener: noop,
        navigator,
    };
    globalThis.window = win;
    globalThis.navigator = navigator;
    globalThis.location = win.location;
}
