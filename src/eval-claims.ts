import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function hasPromptfoo(): boolean {
  const result = spawnSync("pnpm", ["exec", "promptfoo", "--version"], { encoding: "utf-8" });
  return result.status === 0;
}

if (hasPromptfoo() && existsSync("evals/hallucination-claims.yaml")) {
  const result = spawnSync("pnpm", ["exec", "promptfoo", "eval", "--config", "evals/hallucination-claims.yaml"], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

console.log("promptfoo not installed; using local consistency tests.");
const fallback = spawnSync("node", ["dist/test-consistency.js"], { stdio: "inherit" });
process.exit(fallback.status ?? 1);
