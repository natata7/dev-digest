/** Metric colours match the dashboard (recall = accent, precision = ok, citation = warn). */
export const COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn, #e8a33d)",
  neutral: "var(--text-primary)",
} as const;

/** Kind → message key (namespace `eval`, under `evalsTab`). */
export const KIND_KEY = {
  must_find: "kindMustFind",
  must_not_flag: "kindMustNotFlag",
  none: "kindNone",
} as const;
