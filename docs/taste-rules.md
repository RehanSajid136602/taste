# Taste Rules

Taste rules define how malformed tool arguments are normalized before execution. Rules are stored in `.repair-mcp/taste-rules.json` and can be edited manually at any time.

## File Location

```json
.repair-mcp/taste-rules.json
```

This file is auto-generated on first startup with safe defaults. You can edit it to add custom aliases for your specific workflow.

## Structure

```json
{
  "globalAliases": {
    "path": "filePath",
    "filepath": "filePath",
    "file_path": "filePath",
    "commandText": "command",
    "cmd": "command",
    "shellCommand": "command",
    "old_string": "oldValue",
    "new_string": "newValue",
    "old_str": "oldValue",
    "new_str": "newValue"
  },
  "tools": {
    "repair_shell": {
      "aliases": {
        "commandText": "command"
      }
    },
    "repair_patch_file": {
      "aliases": {
        "path": "filePath",
        "old_string": "oldValue",
        "new_string": "newValue"
      }
    }
  }
}
```

## Rule Precedence

When resolving an alias, Taste MCP follows this priority order:

1. **Tool-specific aliases** from taste-rules.json (highest priority)
2. **Built-in tool aliases** (hardcoded in the server)
3. **Global aliases** from taste-rules.json
4. **Built-in global aliases** (hardcoded fallback)

This means you can override any built-in alias by adding it to the tool-specific section in taste-rules.json.

## Built-in Aliases

### Global (apply to all tools)

| Wrong Key | Correct Key |
|-----------|-------------|
| `path` | `filePath` |
| `filepath` | `filePath` |
| `file_path` | `filePath` |
| `old_string` | `oldValue` |
| `new_string` | `newValue` |
| `old_str` | `oldValue` |
| `new_str` | `newValue` |
| `commandText` | `command` |
| `cmd` | `command` |
| `shellCommand` | `command` |

### Per-Tool

| Tool | Wrong Key | Correct Key |
|------|-----------|-------------|
| `repair_shell` | `commandText`, `cmd`, `shellCommand` | `command` |
| `repair_read_file` | `path`, `filepath`, `file_path` | `filePath` |
| `repair_write_file` | `path`, `filepath`, `file_path`, `contentText`, `text` | `filePath`, `content` |
| `repair_patch_file` | `path`, `filepath`, `file_path`, `old_string`, `new_string`, `old_str`, `new_str` | `filePath`, `oldValue`, `newValue` |
| `repair_list_files` | `path`, `filepath`, `file_path` | `filePath` |

## Adding Custom Rules

To add a new alias, edit taste-rules.json:

```json
{
  "globalAliases": {
    "cwdPath": "cwd"
  },
  "tools": {
    "repair_shell": {
      "aliases": {
        "shellCmd": "command"
      }
    }
  }
}
```

## Taste Suggestions

When the same bad key is detected 3+ times, Taste MCP creates a suggestion in `.repair-mcp/taste-suggestions.json`. These suggestions are NOT applied automatically — you must manually copy them to taste-rules.json if you want to adopt them.
