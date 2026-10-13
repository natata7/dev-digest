import type { EvalAgentRun, EvalCaseRecord } from "@devdigest/shared";

export function evalRun(over: Partial<EvalAgentRun> = {}): EvalAgentRun {
  return {
    id: "r1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    agent_version: 7,
    system_prompt: "You are a reviewer.\nReturn at most 5 findings.",
    model: "gpt-4.1",
    ran_at: "2026-05-29T09:14:00Z",
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    traces_passed: 17,
    traces_total: 20,
    duration_ms: 1800,
    cost_usd: 0.23,
    per_case: [],
    ...over,
  };
}

export function evalCase(over: Partial<EvalCaseRecord> = {}): EvalCaseRecord {
  return {
    id: "c1",
    owner_id: "a1",
    name: "stripe-key-leak",
    input_diff: "diff",
    input_meta: null,
    expected_output: { must_find: [{ file: "src/config.ts", start_line: 12, end_line: 12 }], must_not_flag: [] },
    expectation_kind: "must_find",
    source_finding_id: null,
    notes: null,
    last_run: { pass: true, status: "ok", ran_at: "2026-05-29T09:14:00Z" },
    ...over,
  };
}
