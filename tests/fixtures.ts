import type { CampaignBudget, Dataset, Judgment, SelectionPolicy } from "../src/index.ts";
export const now = new Date().toISOString();
export const createdAt = new Date(Date.parse(now) - 60_000).toISOString();
export function fixture(): Dataset {
  return {
    schemaVersion: 1, suite: { id: "test-only", version: "1" },
    candidates: ["a", "b", "unrated"].map(id => ({ id, model: `synthetic-${id}`, harness: "fixture", revision: "v1" })),
    tasks: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, category: "routing", prompt: `Synthetic test ${i}`, checks: [{ kind: "json-equals", expected: { ok: true } }], caps: { inputTokens: 1000, outputTokens: 512, toolCalls: 2, latencyMs: 10_000 } })),
    trials: ["a", "b"].flatMap(candidateId => Array.from({ length: 6 }, (_, i) => ({ id: `${candidateId}${i}`, candidateId, taskId: `t${i}`, createdAt, status: "completed" as const, output: JSON.stringify({ ok: candidateId === "a" || i < 3 }), usage: { inputTokens: 100, outputTokens: 20, toolCalls: 0, latencyMs: 100, costUsd: 0.001 } }))),
    judgments: [],
  };
}
export const policy = (): SelectionPolicy => ({ suiteId: "test-only", suiteVersion: "1", category: "routing", channel: "automatic", maxMeanCostUsd: 0.01 });
export function preference(i: number, extra: Partial<Judgment> = {}): Judgment {
  return { id: `j${i}`, leftTrialId: `b${i}`, rightTrialId: `a${i}`, source: "human", judge: "DJ", rubricVersion: "1", verdict: "left", createdAt: now, reason: "Synthetic preference", ...extra };
}
export const budget = (): CampaignBudget => ({
  tasks: 20, repeats: 1, caps: { inputTokens: 1200, outputTokens: 512, toolCalls: 0 },
  candidates: Array.from({ length: 6 }, (_, i) => ({ candidateId: `synthetic-${i}`, inputUsdPerMillion: 1, outputUsdPerMillion: 4 })),
  toolCallUsd: 0, judge: { calls: 20, inputTokens: 2400, outputTokens: 128, inputUsdPerMillion: 3, outputUsdPerMillion: 15 }, budgetUsd: 1, reserveFraction: 0.2,
});
