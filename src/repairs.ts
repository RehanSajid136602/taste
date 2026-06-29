import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RULES_DIR = ".repair-mcp";
const RULES_FILE = join(RULES_DIR, "taste-rules.json");

export interface TasteRules {
  globalAliases: Record<string, string>;
  tools: Record<string, { aliases: Record<string, string> }>;
}

export const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\//,
  /\bsudo\s+rm\b/,
  /\bmkfs\b/,
  /\bdd\s+if=\//,
  /\bchmod\s+-R\s+777\s+\//,
  /\bcurl\b.*\|\s*(sh|bash|zsh)\b/,
  /\bwget\b.*\|\s*(sh|bash|zsh)\b/,
];

const BUILTIN_GLOBAL_ALIASES: Record<string, string> = {
  path: "filePath",
  filepath: "filePath",
  file_path: "filePath",
  old_string: "oldValue",
  new_string: "newValue",
  old_str: "oldValue",
  new_str: "newValue",
  commandText: "command",
  cmd: "command",
  shellCommand: "command",
};

const BUILTIN_TOOL_ALIASES: Record<string, Record<string, string>> = {
  repair_shell: { commandText: "command", cmd: "command", shellCommand: "command" },
  repair_patch_file: { path: "filePath", filepath: "filePath", file_path: "filePath", old_string: "oldValue", new_string: "newValue", old_str: "oldValue", new_str: "newValue" },
  repair_read_file: { path: "filePath", filepath: "filePath", file_path: "filePath" },
  repair_write_file: { path: "filePath", filepath: "filePath", file_path: "filePath", contentText: "content", text: "content" },
  repair_list_files: { path: "filePath", filepath: "filePath", file_path: "filePath", dir: "filePath", folder: "filePath" },
};

export function loadTasteRules(): TasteRules {
  const custom: Partial<TasteRules> = {};
  if (existsSync(RULES_FILE)) {
    try {
      const raw = readFileSync(RULES_FILE, "utf-8");
      Object.assign(custom, JSON.parse(raw));
    } catch {
      // fall through
    }
  }
  return {
    globalAliases: { ...BUILTIN_GLOBAL_ALIASES, ...(custom.globalAliases ?? {}) },
    tools: custom.tools ?? {},
  };
}

export function getEffectiveAliases(toolName: string, rules: TasteRules): Record<string, string> {
  const toolAliases = rules.tools[toolName]?.aliases ?? {};
  const fallbackAliases = BUILTIN_TOOL_ALIASES[toolName] ?? {};
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(rules.globalAliases)) merged[k] = v;
  for (const [k, v] of Object.entries(fallbackAliases)) merged[k] = v;
  for (const [k, v] of Object.entries(toolAliases)) merged[k] = v;
  return merged;
}

export function checkDangerousCommand(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked dangerous shell command matching: ${pattern}`;
    }
  }
  return null;
}
