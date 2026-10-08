#!/usr/bin/env node
import { planCampaign } from "./budget.ts";
import type { CampaignBudget } from "./budget.ts";
import { assert, grade } from "./model.ts";
import type { Channel, Judgment, Trial } from "./model.ts";
import { rank } from "./ranking.ts";
import { parsePolicy, parseSnapshot, selectCandidate } from "./routing.ts";
import { readDataset, readJson, recordJudgment, recordTrial } from "./store.ts";

const help = `machine-wars — local, task-specific agent rankings (no provider calls)

  validate <dataset.json>
  grade <dataset.json> <trial-id>
  record <dataset.json> <trial.json>
  vote <dataset.json> <judgment.json>
  rank <dataset.json> <category> [automatic|human|human-preferred]
  select <rankings.json> <policy.json>
  plan <budget.json>

All output is JSON except help. Redirect rank output to a snapshot file.
record/vote are locked atomic writes; all other commands are read-only.
plan is an estimate, not a spending guard. A rejected selection/plan exits 2.
`;
const print = (value: unknown): void => { console.log(JSON.stringify(value, null, 2)); };
async function main(args: string[]): Promise<void> {
  const [command, file, second, channel] = args;
  if (!command || command === "--help" || command === "help") { console.log(help); return; }
  assert(file, "Missing JSON file; use --help");
  if (command === "validate") {
    assert(args.length === 2, "Usage: validate <dataset.json>");
    const data = await readDataset(file);
    print({ valid: true, suite: data.suite, candidates: data.candidates.length, tasks: data.tasks.length, trials: data.trials.length, judgments: data.judgments.length });
  } else if (command === "grade") {
    assert(args.length === 3 && second, "Usage: grade <dataset.json> <trial-id>");
    const data = await readDataset(file), trial = data.trials.find(t => t.id === second);
    assert(trial, `Unknown trial: ${second}`);
    print(grade(data.tasks.find(t => t.id === trial.taskId)!, trial));
  } else if (command === "record" || command === "vote") {
    assert(args.length === 3 && second, `Usage: ${command} <dataset.json> <record.json>`);
    const entry = await readJson(second);
    const data = command === "record" ? await recordTrial(file, entry as Trial) : await recordJudgment(file, entry as Judgment);
    print({ saved: true, trials: data.trials.length, judgments: data.judgments.length });
  } else if (command === "rank") {
    assert((args.length === 3 || args.length === 4) && second, "Usage: rank <dataset.json> <category> [channel]");
    print(rank(await readDataset(file), { category: second, channel: (channel ?? "automatic") as Channel }));
  } else if (command === "select") {
    assert(args.length === 3 && second, "Usage: select <rankings.json> <policy.json>");
    const selection = selectCandidate(parseSnapshot(await readJson(file)), parsePolicy(await readJson(second)));
    print(selection); if (selection.candidateId === null) process.exitCode = 2;
  } else if (command === "plan") {
    assert(args.length === 2, "Usage: plan <budget.json>");
    const plan = planCampaign(await readJson(file) as CampaignBudget);
    print(plan); if (!plan.fitsBudget) process.exitCode = 2;
  } else throw new Error(`Unknown command: ${command}; use --help`);
}
await main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
