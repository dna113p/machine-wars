import { assert, count, nonnegative, record, text } from "./model.ts";

export interface Price {
  candidateId: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}
export interface CampaignBudget {
  tasks: number;
  repeats: number;
  /** Aggregate token caps for the WHOLE trial, not per turn. Include billed reasoning. */
  caps: { inputTokens: number; outputTokens: number; toolCalls: number };
  candidates: Price[];
  toolCallUsd: number;
  judge: { calls: number; inputTokens: number; outputTokens: number; inputUsdPerMillion: number; outputUsdPerMillion: number };
  budgetUsd: number;
  reserveFraction?: number;
}
export interface BudgetPlan {
  candidateTrials: number;
  judgeCalls: number;
  candidateCeilingUsd: number;
  judgeCeilingUsd: number;
  toolCeilingUsd: number;
  reserveUsd: number;
  plannedCeilingUsd: number;
  budgetUsd: number;
  fitsBudget: boolean;
  warning: string;
}

export function planCampaign(value: CampaignBudget): BudgetPlan {
  const p = record(value, "campaign");
  count(p.tasks, "tasks", 1); count(p.repeats, "repeats", 1);
  const caps = record(p.caps, "caps");
  count(caps.inputTokens, "caps.inputTokens", 1); count(caps.outputTokens, "caps.outputTokens", 1); count(caps.toolCalls, "caps.toolCalls");
  assert(Array.isArray(p.candidates) && p.candidates.length > 0, "At least one priced candidate is required");
  const ids = new Set<string>();
  for (const item of p.candidates) {
    const price = record(item, "price"); text(price.candidateId, "candidateId");
    assert(!ids.has(price.candidateId), "Duplicate priced candidate"); ids.add(price.candidateId);
    nonnegative(price.inputUsdPerMillion, "inputUsdPerMillion"); nonnegative(price.outputUsdPerMillion, "outputUsdPerMillion");
  }
  nonnegative(p.toolCallUsd, "toolCallUsd"); nonnegative(p.budgetUsd, "budgetUsd");
  const judge = record(p.judge, "judge");
  for (const key of ["calls", "inputTokens", "outputTokens"]) count(judge[key], `judge.${key}`);
  if ((judge.calls as number) > 0) assert((judge.inputTokens as number) > 0 && (judge.outputTokens as number) > 0, "Judge calls need nonzero token budgets");
  nonnegative(judge.inputUsdPerMillion, "judge.inputUsdPerMillion"); nonnegative(judge.outputUsdPerMillion, "judge.outputUsdPerMillion");
  const reserve = value.reserveFraction ?? 0.2; nonnegative(reserve, "reserveFraction");
  const trialsPerCandidate = value.tasks * value.repeats;
  const candidateTrials = trialsPerCandidate * value.candidates.length;
  count(candidateTrials, "candidateTrials", 1);
  const candidateCeilingUsd = trialsPerCandidate * value.candidates.reduce((sum, price) => sum + (value.caps.inputTokens * price.inputUsdPerMillion + value.caps.outputTokens * price.outputUsdPerMillion) / 1e6, 0);
  const judgeCeilingUsd = value.judge.calls * (value.judge.inputTokens * value.judge.inputUsdPerMillion + value.judge.outputTokens * value.judge.outputUsdPerMillion) / 1e6;
  const toolCeilingUsd = candidateTrials * value.caps.toolCalls * value.toolCallUsd;
  const base = candidateCeilingUsd + judgeCeilingUsd + toolCeilingUsd;
  const reserveUsd = base * reserve;
  const microUsd = Math.ceil((base + reserveUsd) * 1e6);
  assert(Number.isSafeInteger(microUsd), "Campaign cost exceeds supported precision");
  return {
    candidateTrials, judgeCalls: value.judge.calls, candidateCeilingUsd, judgeCeilingUsd,
    toolCeilingUsd, reserveUsd, plannedCeilingUsd: microUsd / 1e6, budgetUsd: value.budgetUsd,
    fitsBudget: microUsd <= Math.floor(value.budgetUsd * 1e6),
    warning: "Offline plan only. Rates are caller-supplied assumptions. No provider calls or spending enforcement. Include retries, swapped judging calls, reasoning tokens, and all tool/provider charges; adapters must enforce whole-trial limits before live use.",
  };
}
