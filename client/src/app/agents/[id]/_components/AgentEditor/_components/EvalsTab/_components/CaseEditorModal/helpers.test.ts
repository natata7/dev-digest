import { describe, it, expect } from "vitest";
import { checkExpected, EXPECTED_SKELETON } from "./helpers";

describe("checkExpected", () => {
  it("accepts the skeleton, an empty object (clean case) and the legacy array", () => {
    expect(checkExpected(EXPECTED_SKELETON).ok).toBe(true);
    expect(checkExpected("{}").ok).toBe(true);
    expect(checkExpected('[{"file":"a.ts","start_line":3}]').ok).toBe(true);
  });
  it("rejects bad JSON, wrong shapes and inverted ranges", () => {
    expect(checkExpected("{ nope").ok).toBe(false);
    expect(checkExpected('"x"').ok).toBe(false);
    expect(checkExpected('{"must_find":[{"file":"a.ts","start_line":9,"end_line":2}]}').ok).toBe(false);
    expect(checkExpected('{"must_find":[{"start_line":1}]}').ok).toBe(false);
  });
});
