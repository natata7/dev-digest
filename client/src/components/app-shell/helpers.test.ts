import { describe, it, expect } from "vitest";
import { Icon, NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("onboarding tour navigation", () => {
  it("AC-1: NAV has an Onboarding Tour entry pointing at the repo-scoped page", () => {
    const items = NAV.flatMap((g) => g.items);
    const item = items.find((i) => i.key === "onboarding-tour");
    expect(item?.label).toBe("Onboarding Tour");
    expect(item?.href).toBe("/repos/:repoId/onboarding");
  });

  it("AC-1: WORKSPACE order is Pull Requests -> Onboarding Tour -> Project Context, graph icon (not Lightbulb)", () => {
    const group = NAV.find((g) => g.items.some((i) => i.key === "onboarding-tour"))!;
    expect(group.section).toBe("WORKSPACE");
    const labels = group.items.map((i) => i.label);
    const at = labels.indexOf("Onboarding Tour");
    expect(labels[at - 1]).toBe("Pull Requests");
    expect(labels[at + 1]).toBe("Project Context");
    const icon = group.items[at]!.icon;
    expect(icon).toBe("Workflow");
    expect(icon).not.toBe("Lightbulb");
    expect(Icon[icon as keyof typeof Icon]).toBeDefined();
  });

  it("AC-24: active only on /repos/:repoId/onboarding, not on the Add-repository page", () => {
    expect(activeKeyFor("/repos/abc/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/onboarding/")).toBe("");
  });
});

describe("eval dashboard navigation", () => {
  it("/eval and /eval/<agent> resolve to the eval nav key", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/3b1f")).toBe("eval");
  });
});
