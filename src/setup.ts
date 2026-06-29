import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, ensureFile } from "./filesystem.js";

const LOG_DIR = ".repair-mcp";

const DEFAULT_TASTE_RULES = {
  globalAliases: {
    path: "filePath",
    filepath: "filePath",
    file_path: "filePath",
    commandText: "command",
    cmd: "command",
    shellCommand: "command",
    old_string: "oldValue",
    new_string: "newValue",
    old_str: "oldValue",
    new_str: "newValue",
  },
  tools: {
    repair_shell: {
      aliases: {
        commandText: "command",
        cmd: "command",
        shellCommand: "command",
      },
    },
    repair_patch_file: {
      aliases: {
        path: "filePath",
        filepath: "filePath",
        file_path: "filePath",
        old_string: "oldValue",
        new_string: "newValue",
        old_str: "oldValue",
        new_str: "newValue",
      },
    },
    repair_read_file: {
      aliases: {
        path: "filePath",
        filepath: "filePath",
        file_path: "filePath",
      },
    },
    repair_write_file: {
      aliases: {
        path: "filePath",
        filepath: "filePath",
        file_path: "filePath",
        contentText: "content",
        text: "content",
      },
    },
    repair_list_files: {
      aliases: {
        path: "directory",
        dir: "directory",
        folder: "directory",
      },
    },
  },
};

const DEFAULT_TASTE_STATS = {
  totalToolCalls: 0,
  totalRepairs: 0,
  byTool: {},
  byRepairType: {},
  byBadKey: {},
  byNormalizedKey: {},
  dangerousBlocked: 0,
  lastUpdated: "",
};

const DEFAULT_SUGGESTIONS = {
  suggestedAliases: {},
};

export function ensureStartupFiles(): void {
  ensureDir(LOG_DIR);

  ensureFile(join(LOG_DIR, "taste-rules.json"), JSON.stringify(DEFAULT_TASTE_RULES, null, 2) + "\n");
  ensureFile(join(LOG_DIR, "taste-stats.json"), JSON.stringify(DEFAULT_TASTE_STATS, null, 2) + "\n");
  ensureFile(join(LOG_DIR, "logs.jsonl"), "");
  ensureFile(join(LOG_DIR, "taste-suggestions.json"), JSON.stringify(DEFAULT_SUGGESTIONS, null, 2) + "\n");

  // Ensure existing files have updated keys
  const rulesPath = join(LOG_DIR, "taste-rules.json");
  if (existsSync(rulesPath)) {
    try {
      const existing = JSON.parse(readFileSync(rulesPath, "utf-8"));
      let changed = false;
      for (const [k, v] of Object.entries(DEFAULT_TASTE_RULES.globalAliases)) {
        if (!existing.globalAliases?.[k]) {
          if (!existing.globalAliases) existing.globalAliases = {};
          (existing.globalAliases as Record<string, string>)[k] = v;
          changed = true;
        }
      }
      if (changed) {
        writeFileSync(rulesPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
      }
    } catch { /* skip */ }
  }

  const statsPath = join(LOG_DIR, "taste-stats.json");
  if (existsSync(statsPath)) {
    try {
      const existing = JSON.parse(readFileSync(statsPath, "utf-8"));
      if (existing.dangerousBlocked === undefined) {
        existing.dangerousBlocked = 0;
        writeFileSync(statsPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
      }
    } catch { /* skip */ }
  }
}
