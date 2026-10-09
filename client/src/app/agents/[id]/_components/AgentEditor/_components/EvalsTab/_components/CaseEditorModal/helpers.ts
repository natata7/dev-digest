/* Local validation only: a runtime import of the shared Zod contracts does not bundle under
   Next (the barrel re-exports `./x.js` paths), and the server normalizes the value anyway. */

/** Placeholder shown for a new case: one `must_find` location to fill in. */
export const EXPECTED_SKELETON = JSON.stringify(
  { must_find: [{ file: "src/example.ts", start_line: 1, end_line: 1 }], must_not_flag: [] },
  null,
  2,
);

export type ExpectedCheck = { ok: true; value: unknown } | { ok: false };

const isLoc = (x: unknown): boolean => {
  if (!x || typeof x !== "object") return false;
  const { file, start_line, end_line } = x as Record<string, unknown>;
  const int = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1;
  return typeof file === "string" && file.length > 0 && int(start_line) && (end_line === undefined || (int(end_line) && end_line >= start_line));
};

const isList = (x: unknown): boolean => x === undefined || (Array.isArray(x) && x.every(isLoc));

/** Accepts `{must_find?, must_not_flag?}` or the legacy array of findings (treated as must_find). */
export function checkExpected(text: string): ExpectedCheck {
  try {
    const v: unknown = JSON.parse(text);
    if (Array.isArray(v)) return v.every(isLoc) ? { ok: true, value: v } : { ok: false };
    if (v && typeof v === "object") {
      const o = v as { must_find?: unknown; must_not_flag?: unknown };
      return isList(o.must_find) && isList(o.must_not_flag) ? { ok: true, value: v } : { ok: false };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
