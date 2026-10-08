import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { planCampaign, readDataset, recordJudgment, recordTrial, updateDataset } from "../src/index.ts";
import { budget, fixture, preference } from "./fixtures.ts";

test("budget includes all candidates, judge calls, and reserve", () => { const p = planCampaign(budget()); assert.equal(p.candidateTrials, 120); assert.equal(p.judgeCalls, 20); assert.ok(Math.abs(p.plannedCeilingUsd - 0.686592) < 0.000002); assert.equal(p.fitsBudget, true); });
test("budget rejects unknown prices and excess spending", () => { const b = budget(); b.budgetUsd = 0.1; assert.equal(planCampaign(b).fitsBudget, false); b.candidates[0]!.inputUsdPerMillion = NaN; assert.throws(() => planCampaign(b), /finite/); });
test("budget charges repeated trials and tools", () => { const b = budget(); b.repeats = 2; b.caps.toolCalls = 2; b.toolCallUsd = 0.01; assert.equal(planCampaign(b).candidateTrials, 240); assert.equal(planCampaign(b).toolCeilingUsd, 4.8); });
async function withStore(fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "machine-wars-test-"));
  try { const path = join(dir, "data.json"); await writeFile(path, JSON.stringify(fixture())); await fn(path); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
test("trial IDs are idempotent and cannot be overwritten", async () => withStore(async path => {
  const trial = fixture().trials[0]!; await recordTrial(path, trial); assert.equal((await readDataset(path)).trials.length, 12);
  await assert.rejects(recordTrial(path, { ...trial, output: "conflict" }), /different content/);
}));
test("human judgment persists and validates", async () => withStore(async path => { await recordJudgment(path, preference(0)); await recordJudgment(path, preference(0)); assert.equal((await readDataset(path)).judgments.length, 1); }));
test("failed mutations preserve original data and release lock", async () => withStore(async path => {
  const before = await readFile(path, "utf8"); await assert.rejects(updateDataset(path, d => ({ ...d, schemaVersion: 2 as 1 })), /schemaVersion/);
  assert.equal(await readFile(path, "utf8"), before); await recordJudgment(path, preference(0));
}));
test("concurrent writes do not silently lose data", async () => withStore(async path => {
  const outcomes = await Promise.allSettled([recordJudgment(path, preference(0)), recordJudgment(path, preference(1))]);
  const successes = outcomes.filter(r => r.status === "fulfilled").length;
  assert.ok(successes >= 1); assert.equal((await readDataset(path)).judgments.length, successes);
  for (const result of outcomes) if (result.status === "rejected") assert.equal((result.reason as NodeJS.ErrnoException).code, "EEXIST");
}));
test("source CLI validates, ranks, and returns structured errors", async () => withStore(async path => {
  const cli = new URL("../src/cli.ts", import.meta.url).pathname;
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const valid = run("validate", path); assert.equal(valid.status, 0); assert.equal(JSON.parse(valid.stdout).valid, true);
  const ranks = run("rank", path, "routing"); assert.equal(ranks.status, 0); assert.equal(JSON.parse(ranks.stdout).category, "routing");
  const bad = run("rank", path, "routing", "invalid"); assert.equal(bad.status, 1); assert.match(JSON.parse(bad.stderr).error, /channel/);
}));
