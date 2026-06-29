# Architecture

Taste MCP is a local [Model Context Protocol](https://modelcontextprotocol.io) server that wraps dangerous or malformed tool calls from AI coding agents with a deterministic repair harness.

## Layered Architecture

```
┌─────────────────────────────────────────────┐
│            AI Agent (OpenCode,               │
│            Codex CLI, Antigravity)           │
└─────────────────────┬───────────────────────┘
                      │ MCP protocol (stdio)
┌─────────────────────▼───────────────────────┐
│              Taste MCP Server                │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │         MCP Handler Layer           │    │
│  │  ListToolsRequest / CallToolRequest │    │
│  └─────────────┬───────────────────────┘    │
│                │                             │
│  ┌─────────────▼───────────────────────┐    │
│  │     withTasteHarness (wrapper)      │    │
│  │                                     │    │
│  │  Pre-hook:                          │    │
│  │   ├─ Load taste-rules.json          │    │
│  │   ├─ Apply alias normalizations     │    │
│  │   ├─ Strip nulls / empty objects    │    │
│  │   ├─ Parse stringified arrays       │    │
│  │   ├─ Check dangerous commands       │    │
│  │   └─ Validate with Zod              │    │
│  │                                     │    │
│  │  Execute:                           │    │
│  │   └─ Run the actual tool handler    │    │
│  │                                     │    │
│  │  Post-hook:                         │    │
│  │   ├─ Log repair event               │    │
│  │   ├─ Update taste stats             │    │
│  │   ├─ Update taste suggestions       │    │
│  │   └─ Append repair notice           │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## Module Map

| Module | Path | Responsibility |
|--------|------|---------------|
| `index.ts` | Entrypoint | MCP server setup, tool registration |
| `taste-harness.ts` | Core wrapper | `withTasteHarness()` pre/post hooks |
| `taste-profiler.ts` | Reporting | `taste:report` command, report generation |
| `repairs.ts` | Rules | Taste rules loading, alias resolution |
| `schemas.ts` | Validation | Zod schemas for all 5 tools |
| `security.ts` | Safety | Dangerous command detection, secret redaction |
| `filesystem.ts` | I/O | File system helpers |
| `logger.ts` | Logging | Log rotation, repair logging, suggestions |
| `stats.ts` | Statistics | Taste stats tracking |
| `setup.ts` | Initialization | Startup file creation |

## Data Flow

1. Agent sends `tools/call` with tool name and arguments
2. Server routes to `withTasteHarness()`
3. Taste rules are loaded from `.repair-mcp/taste-rules.json`
4. Aliases are applied (e.g., `commandText` → `command`)
5. Nulls, empty objects, and stringified arrays are cleaned
6. Dangerous commands are checked and blocked
7. Payload is validated against the Zod schema
8. On success, the tool executes
9. Repair events are logged to `.repair-mcp/logs.jsonl`
10. Stats are updated in `.repair-mcp/taste-stats.json`
11. A `SYSTEM REPAIR HARNESS NOTICE` is appended to the response
