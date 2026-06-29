# Troubleshooting

## Server Won't Start

**Symptoms:** `Error: Cannot find module`, `ERR_MODULE_NOT_FOUND`

**Solutions:**

```bash
pnpm install
pnpm build
pnpm start
```

Make sure you're running from the project root directory.

## Tools Not Showing in Agent

**Symptoms:** Agent says "unknown tool" or tools don't appear in the list.

**Solutions:**

1. Verify the server is running: `ps aux | grep taste-mcp`
2. Test the server directly:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
   ```
3. Check your MCP config for the right path
4. Restart your AI agent completely

## Taste Rules Not Applying

**Symptoms:** Keys not being normalized, commands going through unrepaired.

**Solutions:**

1. Check `.repair-mcp/taste-rules.json` exists and has valid JSON
2. Verify the alias key matches exactly what the agent is sending
3. Check the logs in `.repair-mcp/logs.jsonl` for the repair event
4. Run `pnpm taste:report` to see current statistics

## Dangerous Command Not Blocked

**Symptoms:** A dangerous command executed when it should have been blocked.

**Solutions:**

1. Check that the command matches one of the built-in dangerous patterns
2. Verify the command is being routed through `repair_shell` and not a raw shell tool
3. Check `.repair-mcp/logs.jsonl` for the repair event
4. If you found a pattern that should be blocked, report it

## Logs Growing Too Fast

**Symptoms:** Disk space warning, many rotated log files.

**Solutions:**

1. Set `REPAIR_MCP_MAX_LOG_MB` to a smaller value (e.g., `1`)
2. Run `pnpm taste:report` less frequently
3. Clean up rotated logs manually: `rm .repair-mcp/logs-*.jsonl`

## Validation Errors

**Symptoms:** Getting `Validation error` responses from tools.

**Solutions:**

1. Check the error message for which key is wrong
2. Add the wrong key to `.repair-mcp/taste-rules.json` as an alias
3. If the value type is wrong (e.g., string instead of number), fix the agent prompt

## Taste Report Not Generating

**Symptoms:** `pnpm taste:report` produces no output or errors.

**Solutions:**

1. Ensure `.repair-mcp/logs.jsonl` exists
2. Run `pnpm build` first
3. Check that `node dist/taste-profiler.js` works directly
4. Verify the project was built with `pnpm build`
