import { EvalExpectedOutput } from "@devdigest/shared";

/** Placeholder shown for a new case: one `must_find` location to fill in. */
export const EXPECTED_SKELETON = JSON.stringify(
  { must_find: [{ file: "src/example.ts", start_line: 1, end_line: 1 }], must_not_flag: [] },
  null,
  2,
);

export type ExpectedCheck = { ok: true; value: unknown } | { ok: false };

/** Parse + validate the expected-output editor text against the shared contract. */
export function checkExpected(text: string): ExpectedCheck {
  try {
    const parsed = EvalExpectedOutput.safeParse(JSON.parse(text));
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}
