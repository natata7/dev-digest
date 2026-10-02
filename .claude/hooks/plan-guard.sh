#!/usr/bin/env bash
# PreToolUse guard for implementation-planner: Write/Edit only NN-plan-*.md inside docs/specs/** or specs/**.
f=$(jq -r '.tool_input.file_path // empty')
root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in *..*) f="" ;; esac
case "$f" in
  "$root"/docs/specs/*/[0-9][0-9]-plan-*.md | "$root"/specs/*/[0-9][0-9]-plan-*.md) exit 0 ;;
esac
echo "implementation-planner may only write NN-plan-*.md inside a spec folder under docs/specs/** or specs/** (got: ${f:-invalid path})" >&2
exit 2
