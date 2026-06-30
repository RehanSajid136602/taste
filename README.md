# Taste MCP

**A deterministic Tool Taste Harness for AI coding agents.**

Taste MCP is a local MCP server that sits between AI coding agents and real shell/file operations. It repairs malformed tool calls, validates them with Zod, blocks dangerous commands, logs model "taste" patterns, generates taste reports, and returns repair notices so the AI improves during the current session.

---

## Why AI Coding Agents Need It

AI coding agents (OpenCode, Codex CLI, Antigravity CLI) frequently make mistakes when calling tools:

- **Wrong key names**: `commandText` instead of `command`
- **Wrong casing**: `filepath` instead of `filePath`
- **Null garbage**: `{ "command": "ls", "cwd": null }`
- **Empty objects**: `{ "excludePatterns": {} }`
- **Stringified arrays**: `"[\"a\",\"b\"]"` instead of `["a","b"]`
- **Dangerous commands**: `rm -rf /`, `curl | sh`

Taste MCP catches all of these, repairs them safely, and teaches the agent the correct format — all within the current session.

## What It Does NOT Do

Taste MCP does **not** permanently train or fine-tune AI models. Instead, it:

- Repairs bad tool calls **deterministically**
- Returns **structured feedback notices** inside the current session
- Saves **local logs** and a **taste profile**
- Helps users and agents improve **tool reliability**

---

## AI Consistency Harness

Taste MCP is also an AI Consistency Harness for coding agents. It does not permanently train or fine-tune models. It reduces hallucinations at runtime by forcing evidence-backed tool use, deterministic checks, receipts, claim verification, and honest final reporting.

This is useful for open-source and local coding models such as DeepSeek, Qwen, GLM, and other models that may be capable but inconsistent about tool schemas, build status, edited files, and final claims.

## How Taste MCP Reduces Hallucinations

Taste MCP adds a runtime evidence layer around agent work:

- **Session warmup** loads local taste rules, stats, suggestions, reports, project rules, and project maps before work begins.
- **Project map** gives the agent a structured view of the framework, scripts, routes, components, config files, style files, and env example files.
- **File guards** block traversal, warn on missing files, require patch targets to exist, and only allow writes when the parent folder exists.
- **Edit receipts** prove what files changed and record before/after hashes without logging secrets.
- **Shell receipts** record commands, exit codes, duration, summaries, and blocked status without logging secrets.
- **Build truth gate** prevents agents from claiming build/lint/typecheck success unless the latest receipt proves it.
- **Claim verification** checks final-response claims against receipts, file existence, the project map, and build evidence.
- **Final response gate** produces an honest report of changed files, commands, build status, unverified claims, remaining risks, and receipt counts.

## Tools

| Tool | Description |
|------|-------------|
| `repair_shell` | Execute shell commands with dangerous-command blocking and shell receipts |
| `repair_read_file` | Read file contents with optional offset/limit and path-safety checks |
| `repair_write_file` | Write content to a file with path-safety checks and edit receipts |
| `repair_patch_file` | Find-and-replace within an existing file with edit receipts |
| `repair_list_files` | Recursive directory listing with filter support |
| `repair_session_warmup` | Read and summarize local taste/project context without reading `logs.jsonl` |
| `repair_project_map` | Generate `.repair-mcp/project-map.json` for the current project |
| `repair_build_gate` | Check whether latest build/lint/typecheck receipt allows a success claim |
| `repair_verify_claims` | Verify final claims against receipts, project map, and file existence |
| `repair_final_report_gate` | Generate an evidence-backed final-report summary |

## Claim Verification

Use `repair_verify_claims` before final responses that mention changed files, successful builds, fixed UI issues, or broad completion claims.

```json
{
  "claims": [
    "I updated app/page.tsx",
    "The build passed",
    "I fixed all broken icons"
  ]
}
```

Each claim is returned as `verified`, `not_verified`, or `contradicted`, with evidence and safer recommended wording. If a claim is unverified, the final response should say `not verified` instead of pretending.

## Build Truth Gate

The agent may only claim build, lint, or typecheck passed if `repair_build_gate` confirms success from the latest relevant shell receipt.

A build-like command should be run through `repair_shell`, for example:

```bash
pnpm build
pnpm lint
pnpm typecheck
```

Then call `repair_build_gate`. If it does not return `allowedToClaimBuildPassed: true`, do not claim the build passed.

## Edit Receipts

Every successful `repair_write_file` or `repair_patch_file` appends a receipt to `.repair-mcp/edit-receipts.jsonl` with:

- timestamp
- tool
- filePath
- operation
- changed true/false
- beforeHash
- afterHash
- summary
- sanitized args

## Project Map

`repair_project_map` writes `.repair-mcp/project-map.json` with detected framework, package manager, scripts, important folders, routes/pages, components, config files, style files, and env example files. It never records real `.env` values.

## Session Warmup

`repair_session_warmup` reads and summarizes:

- `.repair-mcp/taste-rules.json`
- `.repair-mcp/taste-stats.json`
- `.repair-mcp/taste-suggestions.json`
- `.repair-mcp/taste-report.md` if present
- `.repair-mcp/project-rules.md` if present
- `.repair-mcp/project-map.json` if present

It does not read `.repair-mcp/logs.jsonl` by default.

## Recommended Agent Rules

Add these rules to coding-agent instructions:

```txt
Start each coding session with repair_session_warmup.
Use repair_project_map when project structure is unknown or stale.
Use Taste MCP tools instead of raw shell/filesystem tools when available.
Do not invent files or claim edits without edit receipts.
Do not claim build/lint/typecheck passed without repair_build_gate.
Run repair_verify_claims before final responses with concrete claims.
Use repair_final_report_gate for honest final reports.
If a claim is not verified, say "not verified".
```

## Comparison With Other Guardrail Tools

| Tool | Primary Use | How Taste MCP Differs |
|------|-------------|-----------------------|
| promptfoo | Prompt and model evaluation suites | Taste MCP runs inside the coding session and creates receipts for real tool use |
| DeepEval | LLM evaluation metrics and test cases | Taste MCP focuses on deterministic runtime evidence, file edits, shell results, and final claims |
| Guardrails AI | Structured output validation and policy checks | Taste MCP guards tool calls, project context, file paths, build claims, and receipts |
| NeMo Guardrails | Conversational rails and policy flows | Taste MCP is narrower and operational: it verifies coding-agent actions against local artifacts |

## How Repair Notices Work

When a malformed tool call is detected, the response includes a `SYSTEM REPAIR HARNESS NOTICE`:

```
========================================
SYSTEM REPAIR HARNESS NOTICE
========================================
  • Normalized key "commandText" → "command" (taste rule)

What to send next time:
  - Use "command" instead of "commandText" for this parameter

In future repair_shell calls, use only the documented schema:
  { command: string, cwd?: string, timeout?: number }
========================================
```

The agent sees this notice in the conversation and corrects its behavior.

## How Taste Rules Work

Taste rules are stored in `.repair-mcp/taste-rules.json`:

```json
{
  "globalAliases": {
    "path": "filePath",
    "commandText": "command",
    "old_string": "oldValue"
  },
  "tools": {
    "repair_shell": { "aliases": { "cmd": "command" } }
  }
}
```

When the same bad key appears 3+ times, Taste MCP suggests it as a permanent alias in `.repair-mcp/taste-suggestions.json`. You can manually copy suggestions into `taste-rules.json`.

## Where Data Is Saved

All data lives under `.repair-mcp/` in the server's working directory:

| File | Purpose |
|------|---------|
| `logs.jsonl` | Repair audit log (auto-rotated at 5 MB, keeps 10) |
| `taste-rules.json` | Manual + generated key aliases |
| `taste-stats.json` | Counts of tool calls, repairs, bad keys |
| `taste-suggestions.json` | Suggested aliases (3+ repeat bad keys) |
| `taste-report.md` | Human-readable report (generated by `pnpm taste:report`) |
| `project-rules.md` | Local project rules used by session warmup and final-report guidance |
| `project-map.json` | Generated project structure map from `repair_project_map` |
| `edit-receipts.jsonl` | Write/patch receipts with before/after hashes and sanitized args |
| `shell-receipts.jsonl` | Shell command receipts with exit code, duration, and sanitized output summary |

All secrets, API keys, tokens, and passwords are **redacted** before being written to any file.

---

## Installation

```bash
git clone https://github.com/RehanSajid136602/taste.git
cd taste
pnpm install
pnpm build
pnpm start   # runs in stdio mode
```

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm start          # Run server (stdio mode)
pnpm dev            # Watch mode
pnpm taste:report     # Generate .repair-mcp/taste-report.md
pnpm test:taste       # Run taste harness MCP tests
pnpm test:warmup      # Run session warmup tests
pnpm test:consistency # Run consistency harness tests
pnpm eval:taste       # Run promptfoo tool-schema eval if available, else local tests
pnpm eval:claims      # Run promptfoo claim eval if available, else local tests
pnpm eval:website     # Run promptfoo website/build eval if available, else local tests
pnpm check            # Build + tests + report
```

---

## Connecting Agents

### OpenCode

Add to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "mcp": {
    "taste-mcp": {
      "type": "local",
      "command": [
        "node",
        "/path/to/taste/dist/index.js"
      ]
    }
  },
  "instructions": [
        "/path/to/taste/examples/agent-instructions.md"
  ]
}
```

### Codex CLI

Add to `~/.codexclirc.json` or `~/.codexclirc.toml`:

```toml
[mcp_servers]
[mcp_servers.taste-mcp]
command = "node"
args = ["/path/to/taste/dist/index.js"]
```

### Antigravity CLI

Add to the project's `mcp.json` or `~/.antigravity/config.json`:

```json
{
  "mcpServers": {
    "taste-mcp": {
      "command": "node",
      "args": ["/path/to/taste/dist/index.js"]
    }
  }
}
```

---

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `REPAIR_MCP_MODEL_NAME` | `unknown` | Model name recorded in log entries |
| `REPAIR_MCP_MAX_LOG_MB` | `5` | Max log file size before rotation (MB) |

---

## Project Structure

```
taste/
├── src/
│   ├── index.ts              # Server entrypoint
│   ├── taste-harness.ts      # withTasteHarness wrapper (pre/post hooks)
│   ├── taste-profiler.ts     # Report generation (taste:report)
│   ├── repairs.ts            # Taste rules and alias resolution
│   ├── schemas.ts            # Zod schemas for all tools
│   ├── security.ts           # Dangerous command blocking + secret redaction
│   ├── filesystem.ts         # File system helpers
│   ├── logger.ts             # Logging, rotation, suggestions
│   ├── stats.ts              # Taste statistics tracking
│   └── setup.ts              # Startup file initialization
├── examples/
│   ├── opencode.config.example.json
│   ├── codex.config.example.toml
│   ├── antigravity.settings.example.json
│   └── agent-instructions.md
├── docs/
│   ├── architecture.md
│   ├── how-it-works.md
│   ├── safety.md
│   ├── taste-rules.md
│   └── troubleshooting.md
├── .repair-mcp/
│   └── .gitkeep
├── test-taste.sh
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── LICENSE
└── README.md
```

## Agent Session Instructions

At the start of every new coding session in a project using Taste MCP, read the local taste profile before using tools:

- `.repair-mcp/taste-rules.json`
- `.repair-mcp/taste-stats.json`
- `.repair-mcp/taste-suggestions.json`
- `.repair-mcp/taste-report.md` if it exists

Use those files as session context for how tool calls commonly fail in that project and how they should be repaired. Do not read `.repair-mcp/logs.jsonl` by default unless debugging is requested, because it can become large.

If any Taste MCP profile file changes during a session, especially `taste-rules.json`, `taste-suggestions.json`, or `taste-report.md`, reload the changed file before the next major tool operation.

When Taste MCP tools are available, use them for shell commands, file reading, file writing, file patching, and file listing instead of raw shell or filesystem tools. If a tool response includes a `SYSTEM REPAIR HARNESS NOTICE`, follow that notice in the next tool call.

## Agent Setup Prompts

Taste MCP works with any AI coding agent that supports local MCP stdio servers.

Each prompt below is written for a specific coding agent. Copy the matching prompt, paste it into that agent, and let it configure Taste MCP automatically.

The agent should:

* read this README
* clone or locate the Taste MCP repo
* install dependencies
* build the server
* configure MCP
* test the connection
* run a malformed tool-call repair test
* report the result

> Important: These prompts never require API keys. Do not paste secrets into your agent.

---

# Claude Code Setup Prompt

```txt
Configure Taste MCP for Claude Code.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Claude Code.

Steps:
1. Read the Taste MCP README.md.
2. If the repo is not cloned, clone it:
   git clone https://github.com/RehanSajid136602/taste.git
3. Enter the repo.
4. Install dependencies:
   pnpm install
5. Build:
   pnpm build
6. Confirm this file exists:
   dist/index.js

Configure Claude Code MCP:
Use this format if available:

claude mcp add taste-mcp -- node <ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js

If that command is not available, configure Claude Code manually as a stdio MCP server:

Name:
taste-mcp

Command:
node

Args:
["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Use absolute paths.
- Do not remove existing MCP servers.
- Back up config files before editing.
- Do not expose secrets.
- Do not commit .repair-mcp logs.

Test:
1. Run:
   claude mcp list
2. Confirm taste-mcp appears.
3. In Claude Code, list Taste MCP tools.
4. Call repair_shell with:
   echo "Taste MCP connected to Claude Code"
5. Then test malformed args:
   commandText: echo "Taste MCP repaired Claude Code call"
   idleTime: null

Expected:
- commandText is repaired to command.
- idleTime:null is removed.
- The command runs.
- SYSTEM REPAIR HARNESS NOTICE appears.
- .repair-mcp/logs.jsonl is created or updated.

Permanent Claude Code instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- config path changed
- MCP status
- test result
- log path
```

---

# Codex CLI Setup Prompt

```txt
Configure Taste MCP for Codex CLI.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Codex.

Steps:
1. Read the Taste MCP README.md.
2. Clone the repo if needed:
   git clone https://github.com/RehanSajid136602/taste.git
3. Enter the repo.
4. Install dependencies:
   pnpm install
5. Build:
   pnpm build
6. Confirm:
   dist/index.js exists.

Preferred setup:
codex mcp add taste-mcp -- node <ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js

If the command is unavailable, edit:
~/.codex/config.toml

Add:

[mcp_servers.taste-mcp]
command = "node"
args = ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]
enabled = true

Optional safer approval mode:

[mcp_servers.taste-mcp]
command = "node"
args = ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]
enabled = true
default_tools_approval_mode = "prompt"

Rules:
- Back up ~/.codex/config.toml before editing.
- Do not overwrite existing MCP servers.
- Use absolute paths.
- Validate TOML after editing.
- Do not expose secrets.
- Do not commit private logs.

Test:
1. Run:
   codex mcp list
2. Run:
   codex mcp get taste-mcp
3. Start Codex.
4. List Taste MCP tools.
5. Call repair_shell:
   echo "Taste MCP connected to Codex"
6. Test malformed args:
   commandText: echo "Taste MCP repaired Codex call"
   idleTime: null

Expected:
- commandText becomes command.
- null optional field is removed.
- command runs.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are saved under .repair-mcp/logs.jsonl.

Permanent Codex instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- Codex config path
- MCP server status
- test result
- log path
```

---

# OpenCode Setup Prompt

```txt
Configure Taste MCP for OpenCode.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for OpenCode.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed:
   git clone https://github.com/RehanSajid136602/taste.git
3. Enter repo.
4. Install dependencies:
   pnpm install
5. Build:
   pnpm build
6. Confirm:
   dist/index.js exists.

Configure OpenCode:
1. Detect the OpenCode MCP configuration location.
2. Back up the config file.
3. Add Taste MCP as a stdio MCP server.

Server:
Name: taste-mcp
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Do not delete existing MCP servers.
- Do not overwrite unrelated config.
- Use absolute paths.
- Validate config after editing.
- Do not expose secrets.
- Do not commit .repair-mcp logs.

Test:
1. Restart or reload OpenCode if needed.
2. Confirm taste-mcp appears in available MCP tools.
3. Call repair_shell:
   echo "Taste MCP connected to OpenCode"
4. Test malformed args:
   commandText: echo "Taste MCP repaired OpenCode call"
   idleTime: null

Expected:
- commandText is normalized to command.
- idleTime:null is stripped.
- command runs successfully.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are written to .repair-mcp/logs.jsonl.

Permanent OpenCode instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- OpenCode config path
- whether config was backed up
- whether server loaded
- repair test result
```

---

# Antigravity CLI / AGY Setup Prompt

```txt
Configure Taste MCP for Antigravity CLI / AGY.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Antigravity.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed:
   git clone https://github.com/RehanSajid136602/taste.git
3. Enter repo.
4. Install dependencies:
   pnpm install
5. Build:
   pnpm build
6. Confirm:
   dist/index.js exists.

Detect Antigravity MCP config:
Check common paths:
- ~/.gemini/antigravity-cli/settings.json
- ~/.gemini/config/mcp_config.json
- any local Antigravity/Gemini MCP config file documented on this machine

Configure:
Name: taste-mcp
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Back up the config before editing.
- Do not delete existing MCP servers.
- Do not overwrite unrelated config.
- Use absolute paths.
- Validate JSON after editing.
- Do not expose secrets.
- Do not commit .repair-mcp logs.

Test:
1. Restart or reload Antigravity CLI if needed.
2. Confirm taste-mcp appears as an MCP server/tool provider.
3. Call repair_shell:
   echo "Taste MCP connected to Antigravity"
4. Test malformed args:
   commandText: echo "Taste MCP repaired Antigravity call"
   idleTime: null

Expected:
- commandText is repaired to command.
- idleTime:null is removed.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are saved to .repair-mcp/logs.jsonl.

Permanent Antigravity instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- config path used
- whether config was backed up
- whether MCP loaded
- test result
- any errors
```

---

# Cursor Setup Prompt

```txt
Configure Taste MCP for Cursor.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Cursor.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed:
   git clone https://github.com/RehanSajid136602/taste.git
3. Enter repo.
4. Install dependencies:
   pnpm install
5. Build:
   pnpm build
6. Confirm:
   dist/index.js exists.

Configure Cursor MCP:
1. Detect the Cursor MCP config location.
2. Back up config before editing.
3. Add this MCP server:

Name:
taste-mcp

Type:
stdio

Command:
node

Args:
["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

If Cursor supports project-level MCP config, prefer project-level config when setting this up for a specific codebase. Otherwise use user/global config.

Rules:
- Do not remove existing MCP servers.
- Use absolute paths.
- Validate JSON/config syntax.
- Do not expose secrets.
- Do not commit .repair-mcp logs.

Test:
1. Restart Cursor if needed.
2. Confirm taste-mcp appears in MCP tools.
3. Call repair_shell:
   echo "Taste MCP connected to Cursor"
4. Test malformed args:
   commandText: echo "Taste MCP repaired Cursor call"
   idleTime: null

Expected:
- commandText becomes command.
- idleTime:null is removed.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are saved to .repair-mcp/logs.jsonl.

Permanent Cursor instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- Cursor config path
- MCP status
- test result
```

---

# Windsurf Setup Prompt

```txt
Configure Taste MCP for Windsurf.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Windsurf.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed.
3. Enter repo.
4. Run:
   pnpm install
   pnpm build
5. Confirm:
   dist/index.js exists.

Configure Windsurf MCP:
1. Detect Windsurf MCP/server config location.
2. Back up config before editing.
3. Add Taste MCP:

Name: taste-mcp
Type: stdio
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Do not remove existing MCP servers.
- Use absolute paths.
- Validate config syntax.
- Do not expose secrets.
- Do not commit .repair-mcp logs.

Test:
1. Restart/reload Windsurf if needed.
2. Confirm taste-mcp appears in tools.
3. Call repair_shell:
   echo "Taste MCP connected to Windsurf"
4. Test malformed args:
   commandText: echo "Taste MCP repaired Windsurf call"
   idleTime: null

Expected:
- commandText is repaired to command.
- null optional field is stripped.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are written to .repair-mcp/logs.jsonl.

Permanent Windsurf instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- Windsurf config path
- MCP status
- test result
```

---

# Cline Setup Prompt

```txt
Configure Taste MCP for Cline.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Cline.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed.
3. Enter repo.
4. Run:
   pnpm install
   pnpm build
5. Confirm:
   dist/index.js exists.

Configure Cline MCP:
1. Detect Cline MCP settings/config path.
2. Back up the config before editing.
3. Add Taste MCP as a local stdio server:

Name: taste-mcp
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Do not remove existing MCP servers.
- Use absolute paths.
- Validate config syntax.
- Do not expose secrets.
- Do not commit private logs.

Test:
1. Restart/reload Cline if needed.
2. Confirm taste-mcp appears in MCP servers.
3. Call repair_shell:
   echo "Taste MCP connected to Cline"
4. Test malformed args:
   commandText: echo "Taste MCP repaired Cline call"
   idleTime: null

Expected:
- commandText becomes command.
- idleTime:null is removed.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are saved to .repair-mcp/logs.jsonl.

Permanent Cline instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- Cline config path
- MCP status
- test result
```

---

# Roo Code Setup Prompt

```txt
Configure Taste MCP for Roo Code.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Roo Code.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed.
3. Enter repo.
4. Run:
   pnpm install
   pnpm build
5. Confirm:
   dist/index.js exists.

Configure Roo Code MCP:
1. Detect Roo Code MCP settings/config path.
2. Back up config before editing.
3. Add:

Name: taste-mcp
Type: stdio
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Do not remove existing MCP servers.
- Use absolute paths.
- Validate config syntax.
- Do not expose secrets.
- Do not commit .repair-mcp logs.

Test:
1. Restart/reload Roo Code if needed.
2. Confirm taste-mcp appears.
3. Call repair_shell:
   echo "Taste MCP connected to Roo Code"
4. Test malformed args:
   commandText: echo "Taste MCP repaired Roo Code call"
   idleTime: null

Expected:
- commandText is repaired to command.
- idleTime:null is removed.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are updated.

Permanent Roo Code instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- Roo Code config path
- MCP status
- test result
```

---

# Continue Setup Prompt

```txt
Configure Taste MCP for Continue.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server for Continue.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed.
3. Enter repo.
4. Run:
   pnpm install
   pnpm build
5. Confirm:
   dist/index.js exists.

Configure Continue:
1. Detect Continue config file.
2. Back up the config before editing.
3. Add Taste MCP as a local MCP server.

Server:
Name: taste-mcp
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Do not remove existing config.
- Use absolute paths.
- Validate config after editing.
- Do not expose secrets.
- Do not commit .repair-mcp logs.

Test:
1. Reload Continue/VS Code if needed.
2. Confirm taste-mcp tools are available.
3. Call repair_shell:
   echo "Taste MCP connected to Continue"
4. Test malformed args:
   commandText: echo "Taste MCP repaired Continue call"
   idleTime: null

Expected:
- commandText is normalized to command.
- null optional fields are removed.
- SYSTEM REPAIR HARNESS NOTICE appears.
- logs are saved.

Permanent Continue instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- Continue config path
- MCP status
- test result
```

---

# Aider Setup Prompt

```txt
Configure Taste MCP for Aider if MCP support or an MCP bridge is available.

Repository:
https://github.com/RehanSajid136602/taste

Goal:
Install and build Taste MCP, then connect it if this Aider environment supports MCP directly or through a bridge.

Steps:
1. Read the Taste MCP README.md.
2. Clone repo if needed.
3. Enter repo.
4. Run:
   pnpm install
   pnpm build
5. Confirm:
   dist/index.js exists.

MCP server:
Name: taste-mcp
Type: stdio
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Important:
If this Aider setup does not support MCP, do not fake it.
Instead:
- report that direct MCP config is unavailable
- suggest using Taste MCP through Claude Code, Codex, OpenCode, Cursor, Cline, Roo Code, or another MCP-capable client

If MCP is available:
1. Back up config before editing.
2. Add taste-mcp.
3. Validate config.
4. Test repair_shell:
   echo "Taste MCP connected to Aider"
5. Test malformed args:
   commandText: echo "Taste MCP repaired Aider call"
   idleTime: null

Expected:
- commandText is repaired to command.
- idleTime:null is removed.
- SYSTEM REPAIR HARNESS NOTICE appears.

Permanent instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists.

Final report:
- whether MCP is supported
- repo path
- config path if used
- test result
```

---

# Generic MCP Agent Setup Prompt

```txt
Configure Taste MCP for this AI coding agent.

Repository:
https://github.com/RehanSajid136602/taste

Use this prompt if the agent supports MCP but is not listed above.

Goal:
Install, build, configure, and test Taste MCP as a local stdio MCP server.

Steps:
1. Read the Taste MCP README.md.
2. Clone the repository if needed:
   git clone https://github.com/RehanSajid136602/taste.git
3. Enter the repo.
4. Run:
   pnpm install
   pnpm build
5. Confirm:
   dist/index.js exists.

MCP server config:
Name: taste-mcp
Transport/type: stdio
Command: node
Args: ["<ABSOLUTE_PATH_TO_TASTE_REPO>/dist/index.js"]

Rules:
- Find this agent's MCP config location.
- Back up config before editing.
- Do not remove existing MCP servers.
- Use absolute paths.
- Validate config syntax.
- Do not expose secrets.
- Do not commit private logs.

Test:
1. Reload/restart the agent if needed.
2. Confirm taste-mcp is available.
3. List Taste MCP tools.
4. Call repair_shell:
   echo "Taste MCP connected"
5. Test malformed args:
   commandText: echo "Taste MCP repaired malformed args"
   idleTime: null

Expected:
- commandText is repaired to command.
- idleTime:null is removed.
- command runs.
- SYSTEM REPAIR HARNESS NOTICE appears.
- .repair-mcp/logs.jsonl is updated.

Permanent instruction:
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.

Final report:
- repo path
- config path
- MCP status
- test result
- log path
```

---

## Supported Agents

| Agent             | Prompt included | Notes                                               |
| ----------------- | --------------: | --------------------------------------------------- |
| Claude Code       |             Yes | Best with `claude mcp add`                          |
| Codex CLI         |             Yes | Best with `codex mcp add` or `~/.codex/config.toml` |
| OpenCode          |             Yes | Detect config path first                            |
| Antigravity / AGY |             Yes | Detect Gemini/Antigravity config path               |
| Cursor            |             Yes | Use Cursor MCP settings                             |
| Windsurf          |             Yes | Use Windsurf MCP settings                           |
| Cline             |             Yes | Use Cline MCP settings                              |
| Roo Code          |             Yes | Similar to Cline-style MCP setup                    |
| Continue          |             Yes | Use Continue config if MCP is available             |
| Aider             |     Conditional | Only if MCP or bridge is available                  |
| Any MCP Agent     |             Yes | Generic fallback prompt                             |

## Required Agent Instruction

After setup, add this instruction to your agent memory/rules:

```txt
Always use Taste MCP tools for shell commands, file reading, file writing, file patching, and file listing when available. Do not use raw shell, raw edit, or raw filesystem tools when a Taste MCP equivalent exists. When Taste MCP returns a SYSTEM REPAIR HARNESS NOTICE, follow that notice in the next tool call.
```

## License

MIT
