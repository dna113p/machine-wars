import { assert, count, nonnegative, record, text, timestamp } from "./model.ts";
import type { Channel } from "./model.ts";
import type { Snapshot } from "./ranking.ts";

export interface SelectionPolicy {
  suiteId: string;
  suiteVersion: string;
  category: string;
  channel: Channel;
  /** Measured average, NOT a hard cap on a future execution. */
  maxMeanCostUsd: number;
  minTasks?: number;
  minGatePassRate?: number;
  maxMeanLatencyMs?: number;
  maxRejectedTasks?: number;
  requireCompleteCoverage?: boolean;
  expectedSuiteHash?: string;
  allowedCandidateIds?: string[];
  /** Your ordered preferences, applied only after safety/quality/budget gates. */
  preferredCandidateIds?: string[];
  referenceCandidateId?: string;
}
export interface Selection {
  candidateId: string | null;
  reason: string;
  rejected: Record<string, string[]>;
}

export function parsePolicy(value: unknown): SelectionPolicy {
  const p = record(value, "policy");
  for (const key of ["suiteId", "suiteVersion", "category"]) text(p[key], `policy.${key}`);
  assert(["human", "automatic", "human-preferred"].includes(p.channel as string), "Invalid policy channel");
  nonnegative(p.maxMeanCostUsd, "policy.maxMeanCostUsd");
  if (p.minTasks !== undefined) count(p.minTasks, "policy.minTasks", 1);
  if (p.minGatePassRate !== undefined) { nonnegative(p.minGatePassRate, "minGatePassRate"); assert(p.minGatePassRate <= 1, "minGatePassRate exceeds 1"); }
  if (p.maxMeanLatencyMs !== undefined) nonnegative(p.maxMeanLatencyMs, "maxMeanLatencyMs");
  if (p.maxRejectedTasks !== undefined) count(p.maxRejectedTasks, "maxRejectedTasks");
  if (p.requireCompleteCoverage !== undefined) assert(typeof p.requireCompleteCoverage === "boolean", "requireCompleteCoverage must be boolean");
  for (const key of ["expectedSuiteHash", "referenceCandidateId"]) if (p[key] !== undefined) text(p[key], key);
  for (const key of ["allowedCandidateIds", "preferredCandidateIds"]) if (p[key] !== undefined) {
    assert(Array.isArray(p[key]), `${key} must be an array`);
    (p[key] as unknown[]).forEach(id => text(id, key));
    assert(new Set(p[key] as unknown[]).size === (p[key] as unknown[]).length, `Duplicate ${key}`);
  }
  return value as SelectionPolicy;
}

/** Snapshots are trusted local artifacts, not signatures. Validate data before consuming it. */
export function parseSnapshot(value: unknown): Snapshot {
  const s = record(value, "snapshot");
  assert(s.schemaVersion === 1 && s.method === "regularized-bradley-terry-v1", "Unsupported snapshot schema/method");
  const suite = record(s.suite, "snapshot.suite"); text(suite.id, "suite.id"); text(suite.version, "suite.version");
  for (const key of ["suiteHash", "datasetHash", "category"]) text(s[key], key);
  count(s.categoryTaskCount, "categoryTaskCount", 1);
  assert(["human", "automatic", "human-preferred"].includes(s.channel as string), "Invalid snapshot channel");
  timestamp(s.generatedAt, "generatedAt"); timestamp(s.validUntil, "validUntil");
  assert(Date.parse(s.validUntil) > Date.parse(s.generatedAt), "Snapshot has invalid validity window");
  assert(Date.parse(s.validUntil) - Date.parse(s.generatedAt) <= 86_400_000, "Snapshot validity exceeds 24 hours");
  assert(Array.isArray(s.rows), "snapshot.rows must be an array");
  const ids = new Set<string>();
  for (const item of s.rows) {
    const row = record(item, "row"), c = record(row.candidate, "row.candidate");
    for (const key of ["id", "model", "harness", "revision"]) text(c[key], `candidate.${key}`);
    const id = c.id as string; assert(!ids.has(id), "Duplicate snapshot candidate"); ids.add(id);
    if (row.rating !== null) assert(typeof row.rating === "number" && Number.isFinite(row.rating), "Invalid rating");
    if (row.component !== null) text(row.component, "component");
    assert((row.rating === null) === (row.component === null), "Unrated/component mismatch");
    for (const key of ["evaluatedTasks", "gradedTasks", "pairwiseTasks", "comparisons", "rejectedTasks", "infrastructureErrors"]) count(row[key], key);
    assert((row.gradedTasks as number) <= (row.evaluatedTasks as number) && (row.evaluatedTasks as number) <= s.categoryTaskCount, "Invalid task coverage");
    assert((row.pairwiseTasks as number) <= (row.evaluatedTasks as number) && (row.pairwiseTasks as number) <= (row.comparisons as number), "Invalid pairwise counts");
    assert((row.comparisons === 0) === (row.rating === null), "Rating/evidence mismatch");
    if (row.gatePassRate !== null) { nonnegative(row.gatePassRate, "gatePassRate"); assert(row.gatePassRate <= 1, "gatePassRate exceeds 1"); }
    assert((row.gradedTasks === 0) === (row.gatePassRate === null), "Gate pass rate/evidence mismatch");
    for (const key of ["meanCostUsd", "meanLatencyMs"]) if (row[key] !== null) nonnegative(row[key], key);
  }
  return value as Snapshot;
}

export function selectCandidate(input: Snapshot, inputPolicy: SelectionPolicy, now = new Date().toISOString()): Selection {
  const snapshot = parseSnapshot(input), policy = parsePolicy(inputPolicy);
  timestamp(now, "now");
  const rejectAll = (reason: string): Selection => ({ candidateId: null, reason, rejected: {} });
  if (snapshot.suite.id !== policy.suiteId || snapshot.suite.version !== policy.suiteVersion || snapshot.category !== policy.category || snapshot.channel !== policy.channel) return rejectAll("Ranking scope does not match policy");
  if (policy.expectedSuiteHash && snapshot.suiteHash !== policy.expectedSuiteHash) return rejectAll("Suite contents changed");
  if (Date.parse(now) < Date.parse(snapshot.generatedAt) || Date.parse(now) >= Date.parse(snapshot.validUntil)) return rejectAll("Snapshot is stale or from the future; regenerate from recent evidence");
  const entries = snapshot.rows.map(row => {
    const reasons: string[] = [], min = policy.minTasks ?? 5;
    if (row.rating === null || row.pairwiseTasks < min) reasons.push("Insufficient pairwise task evidence");
    if (row.gradedTasks < min || row.gatePassRate === null || row.gatePassRate < (policy.minGatePassRate ?? 0.8)) reasons.push("Insufficient passing hard-check evidence");
    if ((policy.requireCompleteCoverage ?? true) && row.evaluatedTasks !== snapshot.categoryTaskCount) reasons.push("Incomplete category coverage");
    if (row.rejectedTasks > (policy.maxRejectedTasks ?? 0)) reasons.push("Both-bad judgments exceed policy");
    if (row.meanCostUsd === null || row.meanCostUsd > policy.maxMeanCostUsd) reasons.push("Unknown or excessive measured cost");
    if (policy.maxMeanLatencyMs !== undefined && (row.meanLatencyMs === null || row.meanLatencyMs > policy.maxMeanLatencyMs)) reasons.push("Unknown or excessive measured latency");
    if (policy.allowedCandidateIds && !policy.allowedCandidateIds.includes(row.candidate.id)) reasons.push("Candidate not allowed/available");
    return { row, reasons };
  });
  const reference = policy.referenceCandidateId === undefined ? undefined : snapshot.rows.find(r => r.candidate.id === policy.referenceCandidateId);
  if (policy.referenceCandidateId !== undefined && !reference?.component) return rejectAll("Reference candidate lacks comparison evidence");
  if (reference) for (const entry of entries) if (entry.row.component !== reference.component) entry.reasons.push("Disconnected from reference candidate");
  const rejected = Object.fromEntries(entries.filter(e => e.reasons.length).map(e => [e.row.candidate.id, e.reasons]));
  const eligible = entries.filter(e => e.reasons.length === 0).map(e => e.row);
  if (!eligible.length) return { candidateId: null, reason: "No candidate satisfies policy; no implicit fallback", rejected };
  if (new Set(eligible.map(r => r.component)).size > 1) return { candidateId: null, reason: "Disconnected candidates cannot be compared; collect bridge battles or specify a reference", rejected };
  for (const id of policy.preferredCandidateIds ?? []) if (eligible.some(r => r.candidate.id === id)) return { candidateId: id, reason: "Your ordered preference, after all gates", rejected };
  eligible.sort((a, b) => b.rating! - a.rating! || a.meanCostUsd! - b.meanCostUsd! || a.candidate.id.localeCompare(b.candidate.id));
  return { candidateId: eligible[0]!.candidate.id, reason: "Highest task-specific rating among eligible candidates", rejected };
}

/** Structurally compatible with Machines AgentRunner. No Machines runtime dependency.
 * Match immutable candidate revisions to locally configured runners. Re-check at invocation.
 * This selects a runner; the runner/host must separately enforce execution spending limits.
 */
export function rankedRunner<Args extends unknown[], Result>(
  readSnapshot: () => Snapshot,
  policy: SelectionPolicy,
  bindings: Readonly<Record<string, { revision: string; runner: (...args: Args) => Result }>>,
): (...args: Args) => Result {
  return (...args: Args): Result => {
    const snapshot = parseSnapshot(readSnapshot());
    const available = snapshot.rows.filter(row => Object.hasOwn(bindings, row.candidate.id) && bindings[row.candidate.id]!.revision === row.candidate.revision).map(row => row.candidate.id);
    const selection = selectCandidate(snapshot, { ...policy, allowedCandidateIds: available.filter(id => !policy.allowedCandidateIds || policy.allowedCandidateIds.includes(id)) });
    if (selection.candidateId === null) throw new Error(`No ranked Agent: ${selection.reason}`);
    return bindings[selection.candidateId]!.runner(...args);
  };
}
