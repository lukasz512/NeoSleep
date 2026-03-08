/**
 * Vuetify 3 plugin for admin app. Used by Brand settings and other admin views.
 */
import "vuetify/styles";
import { createVuetify } from "vuetify";

export default createVuetify({
  theme: {
    defaultTheme: "light",
    themes: {
      light: {
        dark: false,
        colors: {
          primary: "#1976d2",
          "primary-darken-1": "#1565c0",
        },
      },
    },
  },
});
