import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";

describe("sidebar nav", () => {
  it("has the Eval Dashboard item in the SKILLS LAB group (AC-20)", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    expect(lab.items.find((i) => i.key === "eval")).toMatchObject({ label: "Eval Dashboard", href: "/eval" });
  });
});
