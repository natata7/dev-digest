import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { computeCounts, callerUrl, toGraph } from "./helpers";

function blast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [],
    downstream: [],
    summary: "",
    ...overrides,
  };
}

describe("computeCounts", () => {
  it("counts unique changed-symbol names, not rows", () => {
    const b = blast({
      changed_symbols: [
        { name: "processPayment", file: "a.ts", kind: "function" },
        { name: "processPayment", file: "b.ts", kind: "function" }, // same name, different file
        { name: "refundOrder", file: "a.ts", kind: "function" },
      ],
    });
    expect(computeCounts(b).symbols).toBe(2);
  });

  it("sums callers across all downstream groups without deduping (a caller can call two changed symbols)", () => {
    const b = blast({
      downstream: [
        {
          symbol: "a",
          callers: [
            { name: "x", file: "f1.ts", line: 1 },
            { name: "y", file: "f2.ts", line: 2 },
          ],
          endpoints_affected: [],
          crons_affected: [],
        },
        {
          symbol: "b",
          callers: [{ name: "x", file: "f1.ts", line: 1 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    });
    expect(computeCounts(b).callers).toBe(3);
  });

  it("counts the unique union of endpoints across groups (a shared handler isn't double-counted)", () => {
    const b = blast({
      downstream: [
        { symbol: "a", callers: [], endpoints_affected: ["POST /checkout", "POST /webhook"], crons_affected: [] },
        { symbol: "b", callers: [], endpoints_affected: ["POST /webhook", "POST /refund"], crons_affected: [] },
      ],
    });
    expect(computeCounts(b).endpoints).toBe(3);
  });

  it("counts the unique union of crons across groups", () => {
    const b = blast({
      downstream: [
        { symbol: "a", callers: [], endpoints_affected: [], crons_affected: ["nightly-retry"] },
        { symbol: "b", callers: [], endpoints_affected: [], crons_affected: ["nightly-retry", "weekly-cleanup"] },
      ],
    });
    expect(computeCounts(b).crons).toBe(2);
  });

  it("returns all zeros for an empty blast radius", () => {
    expect(computeCounts(blast())).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
  });
});

describe("callerUrl", () => {
  it("builds a GitHub blob URL pinned to the given sha with a line anchor", () => {
    expect(callerUrl("github", "acme/widgets", "abc123", "head-sha", "src/routes/checkout.ts", 42)).toBe(
      "https://github.com/acme/widgets/blob/abc123/src/routes/checkout.ts#L42",
    );
  });

  it("builds a GitLab blob URL (with the -/blob segment) pinned to the given sha with a line anchor", () => {
    expect(callerUrl("gitlab", "acme/widgets", "abc123", "head-sha", "src/routes/checkout.ts", 42)).toBe(
      "https://gitlab.com/acme/widgets/-/blob/abc123/src/routes/checkout.ts#L42",
    );
  });

  it("prefers indexed_sha over headSha when both are present", () => {
    const url = callerUrl("github", "acme/widgets", "indexed-sha", "head-sha", "f.ts", 1);
    expect(url).toBe("https://github.com/acme/widgets/blob/indexed-sha/f.ts#L1");
  });

  it("falls back to headSha when indexed_sha is undefined", () => {
    const url = callerUrl("github", "acme/widgets", undefined, "head-sha", "f.ts", 1);
    expect(url).toBe("https://github.com/acme/widgets/blob/head-sha/f.ts#L1");
  });

  it("falls back to headSha when indexed_sha is null", () => {
    const url = callerUrl("github", "acme/widgets", null, "head-sha", "f.ts", 1);
    expect(url).toBe("https://github.com/acme/widgets/blob/head-sha/f.ts#L1");
  });
});

describe("toGraph", () => {
  it("produces symbol -> caller -> impact columns for a group with callers, endpoints, and crons", () => {
    const b = blast({
      downstream: [
        {
          symbol: "processPayment",
          callers: [{ name: "checkoutHandler", file: "src/routes/checkout.ts", line: 42 }],
          endpoints_affected: ["POST /checkout"],
          crons_affected: ["nightly-retry"],
        },
      ],
    });
    const { nodes, edges } = toGraph(b);

    const byColumn = { symbol: 0, caller: 0, impact: 0 };
    for (const n of nodes) byColumn[n.column]++;
    expect(byColumn).toEqual({ symbol: 1, caller: 1, impact: 2 });

    expect(edges).toEqual([
      { from: "symbol:processPayment", to: "caller:checkoutHandler:src/routes/checkout.ts" },
      { from: "caller:checkoutHandler:src/routes/checkout.ts", to: "impact:endpoint:POST /checkout" },
      { from: "caller:checkoutHandler:src/routes/checkout.ts", to: "impact:cron:nightly-retry" },
    ]);
  });

  it("keys caller nodes by name+file, so a same-named caller in a different file is a distinct node", () => {
    const b = blast({
      downstream: [
        {
          symbol: "processPayment",
          callers: [
            { name: "handler", file: "src/a.ts", line: 1 },
            { name: "handler", file: "src/b.ts", line: 2 },
          ],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    });
    const { nodes, edges } = toGraph(b);
    const callerNodes = nodes.filter((n) => n.column === "caller");

    expect(callerNodes.map((n) => n.id).sort()).toEqual(["caller:handler:src/a.ts", "caller:handler:src/b.ts"]);
    expect(edges).toHaveLength(2);
  });

  it("dedupes nodes and edges shared across groups (same caller+impact pair)", () => {
    const b = blast({
      downstream: [
        {
          symbol: "processPayment",
          callers: [{ name: "webhookHandler", file: "src/routes/webhook.ts", line: 10 }],
          endpoints_affected: ["POST /webhook"],
          crons_affected: [],
        },
        {
          symbol: "refundOrder",
          callers: [{ name: "webhookHandler", file: "src/routes/webhook.ts", line: 30 }],
          endpoints_affected: ["POST /webhook"],
          crons_affected: [],
        },
      ],
    });
    const { nodes, edges } = toGraph(b);

    // Same caller (name+file) across both groups is one node, not two.
    const callerNodes = nodes.filter((n) => n.id === "caller:webhookHandler:src/routes/webhook.ts");
    expect(callerNodes).toHaveLength(1);
    // Same endpoint impact is one node too.
    const impactNodes = nodes.filter((n) => n.id === "impact:endpoint:POST /webhook");
    expect(impactNodes).toHaveLength(1);
    // caller -> impact edge only appears once even though both groups produce it.
    const dupEdges = edges.filter(
      (e) => e.from === "caller:webhookHandler:src/routes/webhook.ts" && e.to === "impact:endpoint:POST /webhook",
    );
    expect(dupEdges).toHaveLength(1);
  });

  it("omits a symbol node entirely for a group with zero callers (isolated node would be noise — Tree view covers it)", () => {
    const b = blast({
      downstream: [
        { symbol: "processPayment", callers: [], endpoints_affected: [], crons_affected: [] },
        {
          symbol: "refundOrder",
          callers: [{ name: "supportTool", file: "src/admin/support.ts", line: 12 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    });
    const { nodes } = toGraph(b);

    expect(nodes.some((n) => n.id === "symbol:processPayment")).toBe(false);
    expect(nodes.some((n) => n.id === "symbol:refundOrder")).toBe(true);
  });

  it("returns no nodes/edges for an empty blast radius", () => {
    expect(toGraph(blast())).toEqual({ nodes: [], edges: [] });
  });
});
