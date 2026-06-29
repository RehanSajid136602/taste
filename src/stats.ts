import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSuggestions, saveSuggestions } from "./logger.js";

const STATS_DIR = ".repair-mcp";
const STATS_FILE = join(STATS_DIR, "taste-stats.json");

export interface TasteStats {
  totalToolCalls: number;
  totalRepairs: number;
  byTool: Record<string, number>;
  byRepairType: Record<string, number>;
  byBadKey: Record<string, number>;
  byNormalizedKey: Record<string, number>;
  dangerousBlocked: number;
  lastUpdated: string;
}

const DEFAULT_STATS: TasteStats = {
  totalToolCalls: 0,
  totalRepairs: 0,
  byTool: {},
  byRepairType: {},
  byBadKey: {},
  byNormalizedKey: {},
  dangerousBlocked: 0,
  lastUpdated: "",
};

export function loadStats(): TasteStats {
  if (existsSync(STATS_FILE)) {
    try {
      const raw = readFileSync(STATS_FILE, "utf-8");
      return { ...DEFAULT_STATS, ...JSON.parse(raw) };
    } catch { /* fall through */ }
  }
  return { ...DEFAULT_STATS };
}

export function saveStats(stats: TasteStats): void {
  stats.lastUpdated = new Date().toISOString();
  if (!existsSync(STATS_DIR)) {
    import("node:fs").then((fs) => fs.mkdirSync(STATS_DIR, { recursive: true }));
  }
  writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), "utf-8");
}

export function updateStats(
  toolName: string,
  repairTypes: string[],
  badKeys: string[],
  normalizedKeys: string[],
  wasDangerous: boolean,
): TasteStats {
  const stats = loadStats();
  stats.totalToolCalls++;
  if (repairTypes.length > 0) stats.totalRepairs++;

  stats.byTool[toolName] = (stats.byTool[toolName] ?? 0) + 1;
  for (const t of repairTypes) {
    stats.byRepairType[t] = (stats.byRepairType[t] ?? 0) + 1;
  }
  for (const k of badKeys) {
    stats.byBadKey[k] = (stats.byBadKey[k] ?? 0) + 1;
  }
  for (const k of normalizedKeys) {
    stats.byNormalizedKey[k] = (stats.byNormalizedKey[k] ?? 0) + 1;
  }
  if (wasDangerous) stats.dangerousBlocked++;
  saveStats(stats);
  return stats;
}

export function generateSuggestions(): void {
  const stats = loadStats();
  const suggestions = loadSuggestions();
  const { byBadKey, byNormalizedKey } = stats;

  const suggestionCount: Record<string, Record<string, number>> = {};
  for (const [badKey, count] of Object.entries(byBadKey)) {
    const parts = badKey.split(":");
    if (parts.length < 2) continue;
    const tool = parts[0];
    const key = parts.slice(1).join(":");
    const normalized = Object.keys(byNormalizedKey).find((nk) => {
      const nkParts = nk.split(":");
      return nkParts[0] === tool && nkParts[1]?.startsWith(key.split("->")[0]);
    });
    if (normalized && count >= 3) {
      if (!suggestionCount[tool]) suggestionCount[tool] = {};
      suggestionCount[tool][key] = count;
    }
  }

  for (const [tool, keys] of Object.entries(suggestionCount)) {
    if (!suggestions.suggestedAliases[tool]) suggestions.suggestedAliases[tool] = {};
    for (const badKey of Object.keys(keys)) {
      const nkEntry = Object.keys(byNormalizedKey).find((nk) => nk.startsWith(`${tool}:${badKey}`));
      if (nkEntry) {
        const nk = nkEntry.split("->").slice(1).join("->");
        suggestions.suggestedAliases[tool][badKey] = nk;
      }
    }
  }

  saveSuggestions(suggestions);
}
