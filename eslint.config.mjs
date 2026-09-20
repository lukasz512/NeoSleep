import pluginVue from "eslint-plugin-vue";
import eslintConfigPrettier from "eslint-config-prettier";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import vueParser from "vue-eslint-parser";

export default [
  // Ambient declaration files legitimately use `any` for third-party type
  // augmentation (Vuetify module augmentation, Vite's DefineComponent<{},{},any>
  // boilerplate) — excluded from the TypeScript rule block below, not from
  // linting generally.
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
    // Plain .ts/.tsx had no `files` matcher at all before this block, so
    // ESLint silently skipped them entirely — not even basic syntax
    // checking, since no config object claimed them. This is the first
    // time they're linted, so the TS parser has to be set explicitly here
    // (the .vue block above already wires tsParser for .vue's <script>).
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.d.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // .vue keeps its parser from the block above (vueParser, with tsParser
    // nested for the <script> block) — only add the plugin + rule here.
    files: ["**/*.vue"],
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
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
