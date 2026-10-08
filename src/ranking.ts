import { assert, fingerprint, grade, nonnegative, parseDataset, text, timestamp } from "./model.ts";
import type { Candidate, Channel, Dataset, Judgment, Trial, Verdict } from "./model.ts";

export interface RankingRow {
  candidate: Candidate;
  rating: number | null;
  component: string | null;
  evaluatedTasks: number;
  gradedTasks: number;
  gatePassRate: number | null;
  pairwiseTasks: number;
  comparisons: number;
  rejectedTasks: number;
  infrastructureErrors: number;
  meanCostUsd: number | null;
  meanLatencyMs: number | null;
}
export interface Snapshot {
  schemaVersion: 1;
  method: "regularized-bradley-terry-v1";
  suite: Dataset["suite"];
  suiteHash: string;
  datasetHash: string;
  category: string;
  categoryTaskCount: number;
  channel: Channel;
  generatedAt: string;
  /** Earliest evidence expiry, capped at 24h. Exporting old evidence does not freshen it. */
  validUntil: string;
  rows: RankingRow[];
  warnings: string[];
}
interface Match { left: string; right: string; score: number; taskId: string }
export interface RankOptions { category: string; channel?: Channel; now?: string; maxAgeDays?: number }
const day = 86_400_000;
const verdictScore = (v: Verdict): number | null => v === "left" ? 1 : v === "right" ? 0 : v === "tie" ? 0.5 : null;
const pairKey = (a: string, b: string): string => JSON.stringify([a, b].sort());

/** Batch fit, not sequential Elo: input ordering cannot change the ranking. */
function fit(ids: string[], matches: Match[]): Map<string, number> {
  const index = new Map(ids.map((id, i) => [id, i]));
  const s = ids.map(() => 0), degrees = ids.map(() => 0);
  const pairs = matches.map(m => ({ i: index.get(m.left)!, j: index.get(m.right)!, score: m.score }));
  for (const p of pairs) { degrees[p.i]!++; degrees[p.j]!++; }
  // L2 penalty 1; a safe gradient step from the graph Laplacian's spectral bound.
  const step = 1 / (1 + 0.5 * Math.max(0, ...degrees));
  for (let iteration = 0; iteration < 10_000; iteration++) {
    const gradient = [...s];
    for (const p of pairs) {
      const probability = 1 / (1 + Math.exp(s[p.j]! - s[p.i]!));
      const error = probability - p.score;
      gradient[p.i]! += error; gradient[p.j]! -= error;
    }
    const delta = Math.max(0, ...gradient.map(x => Math.abs(step * x)));
    for (let i = 0; i < s.length; i++) s[i]! -= step * gradient[i]!;
    if (delta < 1e-9) return new Map(ids.map((id, i) => [id, 1000 + 400 / Math.LN10 * s[i]!]));
  }
  throw new Error("Ranking solver did not converge");
}
function components(ids: string[], matches: Match[]): Map<string, string> {
  const neighbors = new Map(ids.map(id => [id, new Set<string>()]));
  for (const m of matches) { neighbors.get(m.left)!.add(m.right); neighbors.get(m.right)!.add(m.left); }
  const result = new Map<string, string>();
  for (const id of ids) {
    if (result.has(id) || !neighbors.get(id)!.size) continue;
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (result.has(current)) continue;
      result.set(current, id);
      stack.push(...neighbors.get(current)!);
    }
  }
  return result;
}
function oriented(j: Judgment, left: Trial): Verdict {
  if (j.leftTrialId === left.id || (j.verdict !== "left" && j.verdict !== "right")) return j.verdict;
  return j.verdict === "left" ? "right" : "left";
}

export function rank(input: Dataset, options: RankOptions): Snapshot {
  const data = parseDataset(input);
  text(options.category, "category");
  const channel = options.channel ?? "automatic";
  assert(["human", "automatic", "human-preferred"].includes(channel), "Invalid ranking channel");
  const now = options.now ?? new Date().toISOString(); timestamp(now, "now");
  const age = options.maxAgeDays ?? 30; nonnegative(age, "maxAgeDays"); assert(age > 0, "maxAgeDays must be positive");
  const end = Date.parse(now), start = end - age * day;
  const tasks = data.tasks.filter(t => t.category === options.category).sort((a, b) => a.id.localeCompare(b.id));
  assert(tasks.length > 0, `Unknown/empty category: ${options.category}`);
  const taskIds = new Set(tasks.map(t => t.id));
  const trials = data.trials.filter(t => taskIds.has(t.taskId) && Date.parse(t.createdAt) > start && Date.parse(t.createdAt) <= end);
  const byId = new Map(trials.map(t => [t.id, t]));
  const latest = new Map<string, Judgment>();
  for (const j of [...data.judgments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))) {
    if (Date.parse(j.createdAt) > end || !byId.has(j.leftTrialId) || !byId.has(j.rightTrialId)) continue;
    latest.set(`${j.source}:${pairKey(j.leftTrialId, j.rightTrialId)}`, j);
  }
  const matches: Match[] = [], rejected = new Map<string, Set<string>>();
  const grades = new Map(trials.map(t => [t.id, grade(tasks.find(task => task.id === t.taskId)!, t)]));
  for (const task of tasks) {
    const group = trials.filter(t => t.taskId === task.id && grades.get(t.id)!.eligible).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const left = group[i]!, right = group[j]!;
      const key = pairKey(left.id, right.id);
      const human = latest.get(`human:${key}`), llm = latest.get(`llm:${key}`);
      const l = grades.get(left.id)!.passed, r = grades.get(right.id)!.passed;
      let automatic: Verdict;
      if (l === false && r === false) automatic = "both_bad";
      else if (l === false) automatic = "right";
      else if (r === false) automatic = "left";
      else if (llm) automatic = oriented(llm, left);
      else automatic = l === true && r === true ? "tie" : "abstain";
      const personal = human ? oriented(human, left) : "abstain";
      const verdict = channel === "human" ? personal : channel === "human-preferred" && personal !== "abstain" ? personal : automatic;
      if (verdict === "both_bad") for (const t of [left, right]) {
        const set = rejected.get(t.candidateId) ?? new Set<string>(); set.add(task.id); rejected.set(t.candidateId, set);
      }
      const score = verdictScore(verdict);
      if (score !== null) matches.push({ left: left.candidateId, right: right.candidateId, score, taskId: task.id });
    }
  }
  const ids = data.candidates.map(c => c.id).sort();
  const ratings = fit(ids, matches), connected = components(ids, matches);
  const rows: RankingRow[] = ids.map(id => {
    const all = trials.filter(t => t.candidateId === id);
    const usable = all.filter(t => grades.get(t.id)!.eligible);
    const graded = usable.filter(t => grades.get(t.id)!.passed !== null);
    const played = matches.filter(m => m.left === id || m.right === id);
    const costsKnown = all.length > 0 && all.every(t => t.usage.costUsd !== null);
    return {
      candidate: data.candidates.find(c => c.id === id)!,
      rating: played.length ? ratings.get(id)! : null,
      component: connected.get(id) ?? null,
      evaluatedTasks: usable.length,
      gradedTasks: graded.length,
      gatePassRate: graded.length ? graded.filter(t => grades.get(t.id)!.passed).length / graded.length : null,
      pairwiseTasks: new Set(played.map(m => m.taskId)).size,
      comparisons: played.length,
      rejectedTasks: rejected.get(id)?.size ?? 0,
      infrastructureErrors: all.length - usable.length,
      meanCostUsd: costsKnown ? all.reduce((sum, t) => sum + t.usage.costUsd!, 0) / all.length : null,
      meanLatencyMs: all.length ? all.reduce((sum, t) => sum + t.usage.latencyMs, 0) / all.length : null,
    };
  }).sort((a, b) => (a.component ?? "~").localeCompare(b.component ?? "~") || (b.rating ?? -Infinity) - (a.rating ?? -Infinity) || a.candidate.id.localeCompare(b.candidate.id));
  const warnings = [
    "Pilot estimates, not statistically certified ranks. Task counts are not confidence intervals.",
    "Gate pass rate measures the configured checks, not general intelligence or subjective quality.",
    "Ties split one comparison; both_bad and abstain do not create preference wins.",
    "Ratings are comparable only inside a connected component and this suite/category/channel.",
  ];
  if (new Set(connected.values()).size > 1) warnings.push("Disconnected comparison graph: collect cross-component battles before global selection.");
  const validUntil = new Date(Math.min(end + day, ...trials.map(t => Date.parse(t.createdAt) + age * day))).toISOString();
  return {
    schemaVersion: 1, method: "regularized-bradley-terry-v1", suite: { ...data.suite },
    suiteHash: fingerprint({ suite: data.suite, tasks: [...data.tasks].sort((a, b) => a.id.localeCompare(b.id)) }),
    datasetHash: fingerprint(data), category: options.category, categoryTaskCount: tasks.length,
    channel, generatedAt: now, validUntil, rows, warnings,
  };
}
