import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function hasPromptfoo(): boolean {
  const result = spawnSync("pnpm", ["exec", "promptfoo", "--version"], { encoding: "utf-8" });
  return result.status === 0;
}

if (hasPromptfoo() && existsSync("evals/tool-schema.yaml")) {
  const result = spawnSync("pnpm", ["exec", "promptfoo", "eval", "--config", "evals/tool-schema.yaml"], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

console.log("promptfoo not installed; using local Taste MCP harness tests via pnpm test:taste.");
const fallback = spawnSync("pnpm", ["test:taste"], { stdio: "inherit" });
process.exit(fallback.status ?? 1);
