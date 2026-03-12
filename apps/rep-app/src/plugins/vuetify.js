/**
 * Vuetify 3 plugin for rep-app. Primary colors should match apps/rep-app/src/assets/scss/_brand-colors.scss
 * (see also repo root brand/NeoSleep.pdf and brand/README.md).
 */
import "vuetify/styles";
import { createVuetify } from "vuetify";
export const repLightTheme = "repLight";
export const repDarkTheme = "repDark";
export default createVuetify({
    theme: {
        defaultTheme: repLightTheme,
        themes: {
            [repLightTheme]: {
                dark: false,
                colors: {
                    primary: "#1976d2",
                    "primary-darken-1": "#1565c0",
                },
            },
            [repDarkTheme]: {
                dark: true,
                colors: {
                    primary: "#42a5f5",
                    "primary-darken-1": "#64b5f6",
                },
            },
        },
    },
});
