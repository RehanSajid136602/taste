import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readAllLogs, loadSuggestions } from "./logger.js";
import { loadStats, type TasteStats } from "./stats.js";

const REPORT_FILE = join(".repair-mcp", "taste-report.md");

function formatPct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function topEntries(map: Record<string, number>, limit = 5): string {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
}

export function generateReport(stats?: TasteStats): void {
  const s = stats ?? loadStats();
  const logs = readAllLogs();
  const dangerousCount = logs.filter((l) =>
    Array.isArray(l.repairTypes) && l.repairTypes.some((t: string) => t.startsWith("dangerous") || t.startsWith("blocked")),
  ).length;

  const repairRate = s.totalToolCalls > 0
    ? formatPct(s.totalRepairs, s.totalToolCalls)
    : "0.0%";

  const lines: string[] = [
    "# Taste Harness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Overview",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Total Tool Calls | ${s.totalToolCalls} |`,
    `| Total Repairs | ${s.totalRepairs} |`,
    `| Repair Rate | ${repairRate} |`,
    `| Dangerous Commands Blocked | ${s.dangerousBlocked} |`,
    `| Log Entries (incl. rotated) | ${logs.length} |`,
    "",
    "## Repairs by Type",
    "",
    Object.keys(s.byRepairType).length > 0
      ? topEntries(s.byRepairType)
      : "  (none)",
    "",
    "## Most Common Bad Keys",
    "",
    Object.keys(s.byBadKey).length > 0
      ? topEntries(s.byBadKey)
      : "  (none)",
    "",
    "## Most Common Normalized Keys",
    "",
    Object.keys(s.byNormalizedKey).length > 0
      ? topEntries(s.byNormalizedKey)
      : "  (none)",
    "",
    "## Per-Tool Mistakes",
    "",
    Object.keys(s.byTool).length > 0
      ? Object.entries(s.byTool)
          .sort((a, b) => b[1] - a[1])
          .map(([tool, count]) => {
            const repairs = Object.entries(s.byRepairType).filter(([k]) => k.includes(tool));
            const total = repairs.reduce((sum, [, c]) => sum + c, 0);
            return `  - ${tool}: ${count} calls, ${total} repairs`;
          })
          .join("\n")
      : "  (none)",
    "",
    "## Recommended Aliases (if any were repeated 3+ times)",
    "",
    (() => {
      const suggestionsPath = join(".repair-mcp", "taste-suggestions.json");
      if (existsSync(suggestionsPath)) {
        try {
          const data = JSON.parse(readFileSync(suggestionsPath, "utf-8"));
          const out = data.suggestedAliases && Object.keys(data.suggestedAliases).length > 0
            ? JSON.stringify(data.suggestedAliases, null, 2)
            : "  (none yet)";
          return out;
        } catch { return "  (none yet)"; }
      }
      return "  (none yet)";
    })(),
    "",
    "## Dangerous Commands",
    "",
    dangerousCount > 0 ? `  ${dangerousCount} blocked` : "  (none blocked)",
    "",
  ];

  const report = lines.join("\n");
  writeFileSync(REPORT_FILE, report, "utf-8");
  console.log(report);
}

const isMain = process.argv[1]?.endsWith("taste-profiler.ts") || process.argv[1]?.endsWith("taste-profiler.js");
if (isMain) {
  generateReport();
}
