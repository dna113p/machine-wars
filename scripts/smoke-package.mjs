import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
run("npm", ["run", "build"]);
const temp = await mkdtemp(join(tmpdir(), "machine-wars-package-"));
try {
  const packed = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temp]));
  const tarball = join(temp, packed[0].filename);
  const consumer = join(temp, "consumer"); await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);
  const installed = join(consumer, "node_modules", "@dna113p", "machine-wars");
  const cli = join(installed, "dist", "src", "cli.js");
  assert.match(run(join(consumer, "node_modules", ".bin", "machine-wars"), ["--help"], consumer), /no provider calls/);
  const demo = JSON.parse(run(process.execPath, [join(installed, "dist", "examples", "demo.js")], consumer));
  assert.equal(demo.tasks.length, 20); assert.equal(demo.trials.length, 60);
  assert.match(demo.suite.id, /SYNTHETIC/);
  const dataPath = join(consumer, "demo.json"); await writeFile(dataPath, JSON.stringify(demo));
  assert.equal(JSON.parse(run(process.execPath, [cli, "validate", dataPath], consumer)).valid, true);
  const ranks = JSON.parse(run(process.execPath, [cli, "rank", dataPath, "classification"], consumer));
  const ranksPath = join(consumer, "rankings.json"); await writeFile(ranksPath, JSON.stringify(ranks));
  const selected = JSON.parse(run(process.execPath, [cli, "select", ranksPath, join(installed, "examples", "policy.json")], consumer));
  assert.equal(selected.candidateId, "fixture-accurate");
  const plan = JSON.parse(run(process.execPath, [cli, "plan", join(installed, "examples", "budget.json")], consumer));
  assert.equal(plan.fitsBudget, true);
  const exportsCheck = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import * as wars from '@dna113p/machine-wars';
    for (const key of ['rank', 'grade', 'selectCandidate', 'rankedRunner', 'planCampaign', 'parseDataset', 'readDataset', 'recordTrial', 'recordJudgment']) assert.equal(typeof wars[key], 'function');
    const data = JSON.parse(readFileSync(${JSON.stringify(dataPath)}, 'utf8'));
    const s = wars.rank(data, {category:'classification'});
    const p = {suiteId:data.suite.id,suiteVersion:'1',category:'classification',channel:'automatic',maxMeanCostUsd:0.01};
    const fn = wars.rankedRunner(() => s, p, {'fixture-accurate':{revision:'fixture-v1',runner: request => ({type:'completed', echo:request.prompt})}});
    assert.deepEqual(fn({prompt:'test',outcomes:['completed']}),{type:'completed',echo:'test'});
  `;
  run(process.execPath, ["--input-type=module", "-e", exportsCheck], consumer);
  console.log("Package smoke passed: offline tarball install, public exports, executable, built demo, ranking, selection, budget plan, and runner forwarding. No model calls.");
} finally { await rm(temp, { recursive: true, force: true }); }
