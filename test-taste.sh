#!/usr/bin/env bash
set -euo pipefail

SERVER="node dist/index.js"
PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $1\033[0m"; }
red() { echo -e "\033[31m✗ $1\033[0m"; }

mcp_call() {
  local tool_name="$1"
  shift
  local args="$*"
  {
    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
    echo '{"jsonrpc":"2.0","id":2,"method":"notifications/initialized"}'
    printf '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"%s","arguments":%s}}\n' "$tool_name" "$args"
  } | timeout 5 $SERVER 2>/dev/null | grep '"id":3'
}

assert_contains() {
  local label="$1" output="$2" pattern="$3"
  if echo "$output" | grep -q "$pattern"; then
    green "$label"
    PASS=$((PASS + 1))
  else
    red "$label (expected: $pattern)"
    echo "  got: $(echo "$output" | head -c 200)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1" output="$2" pattern="$3"
  if ! echo "$output" | grep -q "$pattern"; then
    green "$label"
    PASS=$((PASS + 1))
  else
    red "$label (should NOT contain: $pattern)"
    echo "  got: $(echo "$output" | head -c 200)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Taste Harness Tests ==="
echo ""

# 1. commandText → command
RESULT=$(mcp_call repair_shell '{"commandText":"echo hello world"}')
assert_contains "commandText → command (key alias)" "$RESULT" "hello world"
assert_contains "commandText → command (notice)" "$RESULT" "SYSTEM REPAIR HARNESS NOTICE"

# 2. null optional field removed
RESULT=$(mcp_call repair_shell '{"command":"echo ok","cwd":null}')
assert_contains "null field removed" "$RESULT" "ok"
assert_contains "null field notice" "$RESULT" "Removed null"

# 3. {} optional field removed
RESULT=$(mcp_call repair_shell '{"command":"echo ok","cwd":{}}')
assert_contains "empty object removed" "$RESULT" "ok"
assert_contains "empty obj notice" "$RESULT" "empty object"

# 4. path → filePath
RESULT=$(mcp_call repair_read_file '{"path":".repair-mcp/logs.jsonl"}')
assert_contains "path → filePath" "$RESULT" "SYSTEM REPAIR HARNESS NOTICE"
assert_contains "path notice key alias" "$RESULT" "Normalized key.*path.*filePath"

# 5. old_string/new_string → oldValue/newValue
# First write a test file
echo "hello world" > /tmp/repair-mcp-test.txt
RESULT=$(mcp_call repair_patch_file '{"filePath":"/tmp/repair-mcp-test.txt","old_string":"hello","new_string":"hi"}')
assert_contains "old_string → oldValue" "$RESULT" "SYSTEM REPAIR HARNESS NOTICE"

# 6. stringified array parsed (excludePatterns as JSON string)
RESULT=$(mcp_call repair_list_files '{"filePath":".","excludePatterns":"[\"node_modules\",\"dist\"]"}')
assert_not_contains "stringified array parsed (no error)" "$RESULT" "Validation error"
assert_contains "stringified array notice" "$RESULT" "stringified JSON"

# 7. dangerous command blocked
RESULT=$(mcp_call repair_shell '{"command":"rm -rf /"}')
assert_contains "dangerous command blocked" "$RESULT" "Blocked"

# 8. logs created
if [ -f ".repair-mcp/logs.jsonl" ]; then
  green "logs.jsonl exists"
  PASS=$((PASS + 1))
else
  red "logs.jsonl does not exist"
  FAIL=$((FAIL + 1))
fi

# 9. stats updated
if [ -f ".repair-mcp/taste-stats.json" ]; then
  green "taste-stats.json exists"
  PASS=$((PASS + 1))
else
  red "taste-stats.json does not exist"
  FAIL=$((FAIL + 1))
fi

# 10. taste rules exist
if [ -f ".repair-mcp/taste-rules.json" ]; then
  green "taste-rules.json exists"
  PASS=$((PASS + 1))
else
  red "taste-rules.json does not exist"
  FAIL=$((FAIL + 1))
fi

# 11. taste suggestions exist
if [ -f ".repair-mcp/taste-suggestions.json" ]; then
  green "taste-suggestions.json exists"
  PASS=$((PASS + 1))
else
  red "taste-suggestions.json does not exist"
  FAIL=$((FAIL + 1))
fi

# 12. repair_event structure
RESULT=$(mcp_call repair_shell '{"command":"echo repair-event"}')
# Just check it works without error
assert_not_contains "clean call has no notice" "$RESULT" "SYSTEM REPAIR HARNESS NOTICE"

echo ""
echo "---"
echo "Passed: $PASS  Failed: $FAIL"

# Cleanup
rm -f /tmp/repair-mcp-test.txt

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
