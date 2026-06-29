import { z } from "zod";
import { loadTasteRules, getEffectiveAliases } from "./repairs.js";
import { checkDangerousCommand } from "./security.js";
import { logRepair, loadSuggestions, saveSuggestions } from "./logger.js";
import { updateStats } from "./stats.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type Executor = (args: Record<string, unknown>) => Promise<CallToolResult>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseStringifiedArrays(v: unknown): unknown {
  if (typeof v === "string" && v.startsWith("[") && v.endsWith("]")) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON */ }
  }
  return v;
}

function removeNullsAndEmpties(v: unknown): unknown {
  if (v === null) return undefined;
  if (isPlainObject(v) && Object.keys(v).length === 0) return undefined;
  if (Array.isArray(v)) {
    return v.map(removeNullsAndEmpties).filter((x) => x !== undefined);
  }
  if (isPlainObject(v)) {
    const result: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const cleaned = removeNullsAndEmpties(val);
      if (cleaned !== undefined) result[k] = cleaned;
    }
    return result;
  }
  return v;
}

function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) r[k] = v;
  }
  return r;
}

function buildNotice(toolName: string, repairs: string[], repairTypes: string[]): string {
  if (repairs.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("========================================");
  lines.push("SYSTEM REPAIR HARNESS NOTICE");
  lines.push("========================================");

  for (const r of repairs) {
    lines.push(`  • ${r}`);
  }

  lines.push("");
  lines.push("What to send next time:");

  for (const t of repairTypes) {
    if (t.startsWith("key_alias:")) {
      const parts = t.split(":");
      const badKey = parts[1];
      const goodKey = parts[2];
      lines.push(`  - Use "${goodKey}" instead of "${badKey}" for this parameter`);
    } else if (t === "null_removed") {
      lines.push("  - Omit null optional fields entirely");
    } else if (t === "empty_obj_removed") {
      lines.push("  - Omit empty object optional fields");
    } else if (t === "array_parsed") {
      lines.push("  - Pass arrays as JSON arrays, not stringified JSON");
    } else if (t.startsWith("dangerous") || t.startsWith("blocked")) {
      lines.push("  - This command is permanently blocked for safety");
    }
  }

  lines.push("");
  lines.push(`In future ${toolName} calls, use only the documented schema:`);

  const schemaHints: Record<string, string> = {
    repair_shell: `{ command: string, cwd?: string, timeout?: number }`,
    repair_read_file: `{ filePath: string, offset?: number, limit?: number }`,
    repair_write_file: `{ filePath: string, content: string }`,
    repair_patch_file: `{ filePath: string, oldValue: string, newValue: string, replaceAll?: boolean }`,
    repair_list_files: `{ filePath: string, pattern?: string, excludePatterns?: string[] }`,
  };
  if (schemaHints[toolName]) {
    lines.push(`  ${schemaHints[toolName]}`);
  }

  lines.push("========================================");

  return lines.join("\n");
}

export interface WithTasteHarnessOpts {
  toolName: string;
  rawArgs: Record<string, unknown>;
  schema: z.ZodTypeAny;
  executor: Executor;
}

export async function withTasteHarness(opts: WithTasteHarnessOpts): Promise<CallToolResult> {
  const { toolName, rawArgs, schema, executor } = opts;
  const repairs: string[] = [];
  const repairTypes: string[] = [];
  const badKeys: string[] = [];
  const normalizedKeys: string[] = [];

  let current = { ...rawArgs };

  // 1. Load taste rules
  const rules = loadTasteRules();
  const aliases = getEffectiveAliases(toolName, rules);

  // 2. Apply taste rules (aliases)
  const aliased: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    const alias = aliases[k];
    if (alias && alias !== k) {
      repairs.push(`Normalized key "${k}" → "${alias}" (taste rule)`);
      repairTypes.push(`key_alias:${k}:${alias}`);
      badKeys.push(`${toolName}:${k}`);
      normalizedKeys.push(`${toolName}:${k}->${alias}`);
      aliased[alias] = v;
    } else {
      aliased[k] = v;
    }
  }
  current = aliased;

  // 3. Parse stringified arrays
  for (const [k, v] of Object.entries(current)) {
    const parsed = parseStringifiedArrays(v);
    if (parsed !== v) {
      repairs.push(`Parsed stringified JSON array for key "${k}"`);
      repairTypes.push("array_parsed");
      current[k] = parsed;
    }
  }

  // 4. Remove nulls and empties
  const cleaned = removeNullsAndEmpties(current) as Record<string, unknown>;
  for (const [k, v] of Object.entries(current)) {
    if (v !== cleaned[k]) {
      if (v === null) {
        repairs.push(`Removed null value for optional key "${k}"`);
        repairTypes.push("null_removed");
      } else if (isPlainObject(v) && Object.keys(v).length === 0) {
        repairs.push(`Removed empty object for optional key "${k}"`);
        repairTypes.push("empty_obj_removed");
      }
    }
  }

  // 5. Dangerous command check
  let wasDangerous = false;
  if (toolName === "repair_shell" && typeof cleaned.command === "string") {
    const danger = checkDangerousCommand(cleaned.command);
    if (danger) {
      repairs.push(danger);
      repairTypes.push("dangerous_blocked");
      wasDangerous = true;
      cleaned._dangerous = true;
      cleaned._blocked = danger;
    }
  }

  // 6. Validate with Zod
  let validated: Record<string, unknown>;
  try {
    validated = schema.parse(stripUndefined(cleaned)) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof z.ZodError
      ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : String(e);
    return {
      isError: true,
      content: [{ type: "text", text: `Validation error: ${msg}` }],
    };
  }

  // 7. Execute
  const result = await executor({ ...validated, _dangerous: cleaned._dangerous, _blocked: cleaned._blocked });

  // 8. Post-hook: generate notice
  const notice = buildNotice(toolName, repairs, repairTypes);

  // 9. Update stats and log
  updateStats(toolName, repairTypes, badKeys, normalizedKeys, wasDangerous);
  if (repairs.length > 0) {
    logRepair(toolName, rawArgs, validated, repairs, repairTypes, notice);
  }

  // 10. Update suggestions
  if (badKeys.length > 0) {
    const suggestions = loadSuggestions();
    let changed = false;
    for (const bk of badKeys) {
      const parts = bk.split(":");
      if (parts.length < 2) continue;
      const tool = parts[0];
      const key = parts.slice(1).join(":");
      const nkEntry = normalizedKeys.find((nk) => nk.startsWith(`${tool}:${key}`));
      if (nkEntry) {
        const nk = nkEntry.split("->")[1];
        if (!suggestions.suggestedAliases[tool]) suggestions.suggestedAliases[tool] = {};
        suggestions.suggestedAliases[tool][key] = nk;
        changed = true;
      }
    }
    if (changed) saveSuggestions(suggestions);
  }

  // 11. Append notice to result
  if (notice && result.content.length > 0) {
    const first = result.content[0];
    if (first.type === "text") {
      (result.content[0] as { type: "text"; text: string }).text += notice;
    }
  }

  return result;
}
