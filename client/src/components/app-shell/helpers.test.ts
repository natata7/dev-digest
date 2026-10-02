import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("onboarding tour navigation", () => {
  it("AC-1: NAV has an Onboarding Tour entry pointing at the repo-scoped page", () => {
    const items = NAV.flatMap((g) => g.items);
    const item = items.find((i) => i.key === "onboarding-tour");
    expect(item?.label).toBe("Onboarding Tour");
    expect(item?.href).toBe("/repos/:repoId/onboarding");
  });

  it("AC-24: active only on /repos/:repoId/onboarding, not on the Add-repository page", () => {
    expect(activeKeyFor("/repos/abc/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/onboarding/")).toBe("");
  });
});
