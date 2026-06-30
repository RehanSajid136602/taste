import { existsSync } from "node:fs";
import { ensureStartupFiles } from "./setup.js";
import { generateProjectMap } from "./project-map.js";
import { sessionWarmup } from "./consistency.js";

let pass = 0;
let fail = 0;

function assert(condition: unknown, label: string): void {
  if (condition) {
    console.log(`ok - ${label}`);
    pass++;
  } else {
    console.error(`not ok - ${label}`);
    fail++;
  }
}

function main(): void {
  ensureStartupFiles();
  generateProjectMap();
  const warmup = sessionWarmup();

  assert(warmup.loadedFiles.includes(".repair-mcp/taste-rules.json"), "warmup reads taste rules");
  assert(warmup.loadedFiles.includes(".repair-mcp/taste-stats.json"), "warmup reads taste stats");
  assert(warmup.loadedFiles.includes(".repair-mcp/taste-suggestions.json"), "warmup reads suggestions");
  assert(warmup.loadedFiles.includes(".repair-mcp/project-rules.md"), "warmup reads project rules");
  assert(warmup.loadedFiles.includes(".repair-mcp/project-map.json"), "warmup reads project map");
  assert(warmup.summary.includes("logs.jsonl was intentionally not read"), "warmup avoids logs by default");
  assert(existsSync(".repair-mcp/project-rules.md"), "default project rules exist");

  console.log(`Passed: ${pass} Failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

main();
