import { seedSuite } from "./seed-suite.ts";
import { parseDataset } from "../src/index.ts";
import type { Json } from "../src/index.ts";

// Fully synthetic fixtures. This does not invoke or benchmark real models.
const data = seedSuite();
data.suite = { id: "SYNTHETIC-DEMO-NOT-MODEL-RESULTS", version: "1" };
data.candidates = ["fixture-accurate", "fixture-cheap", "fixture-unpriced"].map(id => ({ id, model: "not-a-real-model", harness: "synthetic-fixture", revision: "fixture-v1" }));
const createdAt = new Date().toISOString();
data.trials = data.candidates.flatMap(candidate => data.tasks.map((task, index) => {
  const check = task.checks[0]!;
  const reference: Json = "expected" in check ? check.expected : "example";
  return {
    id: `${candidate.id}:${task.id}`, candidateId: candidate.id, taskId: task.id, createdAt,
    status: "completed" as const,
    output: candidate.id === "fixture-cheap" && index % 5 === 0 ? "intentionally incorrect synthetic output" : reference,
    usage: { inputTokens: 250, outputTokens: 50, toolCalls: 0, latencyMs: 200,
      costUsd: candidate.id === "fixture-unpriced" ? null : candidate.id === "fixture-cheap" ? 0.0003 : 0.003 },
  };
}));
console.error("SYNTHETIC DEMO ONLY. No real model results, provider calls, or spending.");
console.log(JSON.stringify(parseDataset(data), null, 2));
