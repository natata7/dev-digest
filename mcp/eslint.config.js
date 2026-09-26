import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Convention: a leading underscore marks an intentionally-unused param/var.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // stdout is the MCP stdio protocol channel — anything but console.error corrupts it.
      "no-console": ["error", { allow: ["error"] }],
    },
  },
);
