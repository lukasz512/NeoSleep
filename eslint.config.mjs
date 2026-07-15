import pluginVue from "eslint-plugin-vue";
import eslintConfigPrettier from "eslint-config-prettier";
import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";

export default [
  { ignores: ["**/dist/**"] },
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".vue"],
      },
    },
  },
  {
    rules: {
      "vue/component-name-in-template-casing": [
        "error",
        "PascalCase",
        { registeredComponentsOnly: false },
      ],
      // Vuetify's data-table slots use dotted names (#item.name, #item.status, ...).
      // eslint-plugin-vue's valid-v-slot misreads the dot as an unsupported modifier —
      // it doesn't know about Vuetify's naming convention. False positive, not a bug.
      "vue/valid-v-slot": "off",
      // "Flag" (apps/web) is a small country-flag-icon component, not a native
      // element name — allowed as the one intentional single-word exception.
      "vue/multi-word-component-names": ["error", { ignores: ["Flag"] }],
    },
  },
  eslintConfigPrettier,
];
