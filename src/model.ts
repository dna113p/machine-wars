import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Channel = "human" | "automatic" | "human-preferred";
export type Verdict = "left" | "right" | "tie" | "both_bad" | "abstain";
export type Status = "completed" | "error" | "timeout" | "budget_exceeded" | "infrastructure_error";
export interface Candidate {
  id: string;
  model: string;
  harness: string;
  /** Immutable version of model + harness + prompt + tools + sampling/reasoning config. */
  revision: string;
}
export type Check =
  | { kind: "equals"; expected: Json }
  | { kind: "json-equals"; expected: Json }
  | { kind: "max-chars"; limit: number };
export interface Task {
  id: string;
  category: string;
  prompt: string;
  checks: Check[];
  caps: { inputTokens: number; outputTokens: number; toolCalls: number; latencyMs: number };
}
export interface Trial {
  id: string;
  candidateId: string;
  taskId: string;
  createdAt: string;
  status: Status;
  output: Json;
  /** Counts cover the entire trial. outputTokens includes billed reasoning tokens. */
  usage: { inputTokens: number; outputTokens: number; toolCalls: number; latencyMs: number; costUsd: number | null };
}
export interface Judgment {
  id: string;
  leftTrialId: string;
  rightTrialId: string;
  source: "human" | "llm";
  judge: string;
  rubricVersion: string;
  verdict: Verdict;
  createdAt: string;
  reason: string;
}
export interface Dataset {
  schemaVersion: 1;
  suite: { id: string; version: string };
  candidates: Candidate[];
  tasks: Task[];
  trials: Trial[];
  judgments: Judgment[];
}
export interface Grade { eligible: boolean; passed: boolean | null; reasons: string[] }

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function record(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0 && value === value.trim(), `${label} must be a nonempty trimmed string`);
}
export function nonnegative(value: unknown, label: string): asserts value is number {
  assert(typeof value === "number" && Number.isFinite(value) && value >= 0, `${label} must be a finite nonnegative number`);
}
export function count(value: unknown, label: string, min = 0): asserts value is number {
  nonnegative(value, label);
  assert(Number.isSafeInteger(value) && value >= min, `${label} must be an integer >= ${min}`);
}
export function timestamp(value: unknown, label: string): asserts value is string {
  text(value, label);
  assert(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp with timezone`);
}
function json(value: unknown): asserts value is Json {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") { assert(Number.isFinite(value), "JSON number must be finite"); return; }
  if (Array.isArray(value)) { value.forEach(json); return; }
  for (const item of Object.values(record(value, "JSON value"))) json(item);
}
function array(value: unknown, label: string): asserts value is unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
}
function unique(items: unknown[], label: string): void {
  const ids = items.map(item => { const id = record(item, label).id; text(id, `${label}.id`); return id; });
  assert(new Set(ids).size === ids.length, `Duplicate ${label} id`);
}

/** Validate at every disk/import boundary; never execute strings from a dataset. */
export function parseDataset(value: unknown): Dataset {
  const d = record(value, "dataset");
  assert(d.schemaVersion === 1, "Unsupported dataset schemaVersion");
  const suite = record(d.suite, "suite");
  text(suite.id, "suite.id"); text(suite.version, "suite.version");
  for (const key of ["candidates", "tasks", "trials", "judgments"] as const) {
    array(d[key], key); unique(d[key], key);
  }
  for (const item of d.candidates as unknown[]) {
    const c = record(item, "candidate");
    for (const key of ["id", "model", "harness", "revision"]) text(c[key], `candidate.${key}`);
  }
  for (const item of d.tasks as unknown[]) {
    const t = record(item, "task");
    for (const key of ["id", "category", "prompt"]) text(t[key], `task.${key}`);
    array(t.checks, "task.checks");
    for (const item of t.checks) {
      const c = record(item, "check");
      if (c.kind === "equals" || c.kind === "json-equals") json(c.expected);
      else if (c.kind === "max-chars") count(c.limit, "check.limit", 1);
      else throw new Error(`Unsupported check kind: ${String(c.kind)}`);
    }
    const caps = record(t.caps, "task.caps");
    count(caps.inputTokens, "caps.inputTokens", 1); count(caps.outputTokens, "caps.outputTokens", 1);
    count(caps.toolCalls, "caps.toolCalls"); count(caps.latencyMs, "caps.latencyMs", 1);
  }
  const data = value as Dataset;
  const candidateIds = new Set(data.candidates.map(c => c.id));
  const taskIds = new Set(data.tasks.map(t => t.id));
  const trialKeys = new Set<string>();
  const statuses: Status[] = ["completed", "error", "timeout", "budget_exceeded", "infrastructure_error"];
  for (const item of data.trials) {
    const t = record(item, "trial");
    text(t.candidateId, "trial.candidateId"); text(t.taskId, "trial.taskId");
    assert(candidateIds.has(t.candidateId) && taskIds.has(t.taskId), "Trial references an unknown candidate/task");
    const key = JSON.stringify([t.candidateId, t.taskId]);
    assert(!trialKeys.has(key), "MVP accepts one trial per candidate/task; repeated trials need a separate campaign");
    trialKeys.add(key);
    timestamp(t.createdAt, "trial.createdAt");
    assert(statuses.includes(t.status as Status), "Invalid trial status"); json(t.output);
    const usage = record(t.usage, "trial.usage");
    for (const key of ["inputTokens", "outputTokens", "toolCalls", "latencyMs"]) count(usage[key], `usage.${key}`);
    if (usage.costUsd !== null) nonnegative(usage.costUsd, "usage.costUsd (use null when unknown)");
  }
  const trials = new Map(data.trials.map(t => [t.id, t]));
  const verdicts: Verdict[] = ["left", "right", "tie", "both_bad", "abstain"];
  for (const item of data.judgments) {
    const j = record(item, "judgment");
    text(j.leftTrialId, "leftTrialId"); text(j.rightTrialId, "rightTrialId");
    const left = trials.get(j.leftTrialId), right = trials.get(j.rightTrialId);
    assert(left && right && left.taskId === right.taskId && left.candidateId !== right.candidateId, "Judgments require different candidates on the same task");
    assert(j.source === "human" || j.source === "llm", "Invalid judgment source");
    assert(verdicts.includes(j.verdict as Verdict), "Invalid judgment verdict");
    text(j.judge, "judgment.judge"); text(j.rubricVersion, "judgment.rubricVersion");
    timestamp(j.createdAt, "judgment.createdAt");
    assert(Date.parse(j.createdAt) >= Math.max(Date.parse(left.createdAt), Date.parse(right.createdAt)), "Judgment predates its trials");
    assert(typeof j.reason === "string", "judgment.reason must be a string");
  }
  return data;
}

export function grade(task: Task, trial: Trial): Grade {
  if (trial.status === "infrastructure_error") return { eligible: false, passed: null, reasons: ["Infrastructure error: not model evidence"] };
  const reasons: string[] = [];
  if (trial.status !== "completed") reasons.push(`Trial ${trial.status}`);
  for (const key of ["inputTokens", "outputTokens", "toolCalls", "latencyMs"] as const) {
    if (trial.usage[key] > task.caps[key]) reasons.push(`${key} exceeds task cap`);
  }
  for (const check of task.checks) {
    if (check.kind === "equals" && !isDeepStrictEqual(trial.output, check.expected)) reasons.push("Output does not match reference");
    if (check.kind === "max-chars" && (typeof trial.output !== "string" || [...trial.output].length > check.limit)) reasons.push("Output exceeds character limit or is not text");
    if (check.kind === "json-equals") {
      try {
        const decoded: unknown = typeof trial.output === "string" ? JSON.parse(trial.output) : trial.output;
        if (!isDeepStrictEqual(decoded, check.expected)) reasons.push("JSON does not match reference");
      } catch { reasons.push("Output is not valid JSON"); }
    }
  }
  return { eligible: true, passed: reasons.length ? false : task.checks.length ? true : null, reasons };
}

/** Stable object ordering makes hashes independent of JSON formatting. Arrays retain order. */
export function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
    : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
