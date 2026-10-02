#!/usr/bin/env bash
# PreToolUse guard for the specreator agent: Write/Edit only inside docs/specs/** or specs/**, *.md only.
f=$(jq -r '.tool_input.file_path // empty')
root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in *..*) f="" ;; esac
case "$f" in
  "$root"/docs/specs/*.md | "$root"/specs/*.md) exit 0 ;;
esac
echo "specreator may only write *.md files under docs/specs/** or specs/** (got: ${f:-invalid path})" >&2
exit 2
