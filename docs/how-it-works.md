# How It Works

## Overview

Taste MCP is a local MCP server that sits between AI coding agents and the real file system / shell. Its job is to intercept every tool call, repair it deterministically, run it safely, and teach the AI agent through structured feedback.

## The Problem

AI coding agents (OpenCode, Codex CLI, Antigravity) frequently make mistakes when calling tools:

- Wrong key names: `commandText` instead of `command`
- Wrong casing: `filepath` instead of `filePath`
- Null optional fields: `{ "command": "ls", "cwd": null }`
- Empty object placeholders: `{ "path": ".", "excludePatterns": {} }`
- Stringified arrays: `"[\"a\",\"b\"]"` instead of `["a","b"]`
- Dangerous commands: `rm -rf /`, `curl | sh`

Each mistake causes tool failures, cryptic errors, and wasted debugging time.

## How Taste MCP Fixes This

### 1. Pre-hook (Repair)

Every incoming tool call passes through the repair pipeline:

```
Raw args → Load taste rules → Apply aliases → Strip nulls/empties →
Parse stringified arrays → Check dangerous commands → Zod validate
```

If the payload doesn't match the schema after repair, a clear validation error is returned instead of executing.

### 2. Execution

Only fully-validated payloads reach the actual tool handler. The tool never sees the raw, potentially dangerous input.

### 3. Post-hook (Learning)

After execution, three things happen:

1. **Logging** — The repair event (before/after/repairs) is written to `.repair-mcp/logs.jsonl`
2. **Stats** — Counters are updated in `.repair-mcp/taste-stats.json`
3. **Notice** — A `SYSTEM REPAIR HARNESS NOTICE` is appended to the response

The notice explains exactly what was wrong and what format to use next time. The AI sees this in the conversation and adjusts its behavior within the same session.

## Taste Profiler

Run `pnpm taste:report` to generate a report from accumulated data:

- Total tool calls and repair rate
- Most common bad keys (e.g., `path` used instead of `filePath`)
- Most common normalized keys
- Per-tool mistake patterns
- Dangerous commands blocked
- Suggested aliases (keys seen 3+ times)

## Important

This system does **not** permanently train or fine-tune AI models. Instead, it:

- Repairs bad tool calls deterministically
- Returns feedback notes inside the current session
- Saves local logs and taste profiles
- Helps users and agents improve tool reliability
