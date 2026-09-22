import type { SmartDiffRole } from "@devdigest/shared";

/** Display order — matches SmartDiffRole's enum member order. */
export const ROLE_ORDER: SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];

/** Groups that start collapsed (low-signal roles) — AC2. */
export const DEFAULT_COLLAPSED_ROLES: SmartDiffRole[] = ["docs", "boilerplate"];

/** i18n key (under the `smartDiff` namespace) for each role's display label. */
export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "coreLabel",
  tests: "testsLabel",
  wiring: "wiringLabel",
  docs: "docsLabel",
  boilerplate: "boilerplateLabel",
};
