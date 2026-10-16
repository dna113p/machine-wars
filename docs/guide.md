# Machine Wars guide

The detail behind the [README](../README.md). Machine Wars is a concept: none of
this has been used on real models yet.

## Datasets

A dataset holds candidate configurations and versioned task definitions.
`examples/seed-suite.ts` prints an empty starter dataset with five cases each
for classification, extraction, proposed tool selection and state transitions.
"Proposed tool selection" checks the tool an Agent would pick; it does not run
the tool.

Keep task and candidate configurations unchanged within a campaign. Start a new
campaign for a fresh attempt.

The TypeScript types in `src/model.ts` are the input format.

## Importing trials and votes

```sh
node src/cli.ts record data/campaign.json data/trial.json
node src/cli.ts grade  data/campaign.json trial-id
node src/cli.ts vote   data/campaign.json data/judgment.json
```

**A trial** records the candidate and task ids, output, status, timestamp and
total usage.

- `outputTokens` includes billed reasoning tokens.
- Use `costUsd: null` when the cost is unknown, never `0`.
- A second trial for the same candidate and task is rejected, so replayed
  output cannot inflate the evidence.
- An import records what you supply. It does not prove a model produced it.

**A judgment** compares two trials of different candidates on the same task.

- It records `source`, `judge`, `rubricVersion`, `verdict`, timestamp and
  rationale.
- Verdicts: `left`, `right`, `tie`, `both_bad`, `abstain`.
- A new judgment id can replace an earlier one for the same source and pair.
  History is kept, and the latest one counts. There is no judge-panel voting.

## How the rankings differ

- `human` uses only your recorded votes.
- `automatic` settles hard-check failures first, then uses an imported judge.
  Two passing artifacts tie unless something else prefers one.
- `human-preferred` uses your vote instead of the automatic verdict wherever
  you voted (not in addition to it).

To state an explicit personal order, set `preferredCandidateIds` in a
selection policy. It applies after the evidence, quality, cost and availability
gates.

## Selection rules

Load a saved snapshot with `parseSnapshot(await readJson(path))`.

The candidate id and revision in your binding must match the recorded
configuration. Selection then checks:

- scope and channel, and that the snapshot has not expired
- independent task coverage and complete category coverage
- check pass rate, known historical cost and rejections
- optionally, latency and reference connectivity

Defaults, meant as pilot guards and not proof of reliability:

- at least five graded and pairwise-compared tasks
- an 80% check-pass floor
- zero `both_bad` rejections

Unknown or stale candidates never win by default. With no eligible candidate,
selection throws; fallback and escalation belong in the Machine's own policy.

Snapshots expire within 24 hours, and sooner when their evidence ages out of
the default 30-day window. Regenerating a snapshot does not refresh old
evidence. Ratings carry no calibrated confidence interval.

## Budgets

`node src/cli.ts plan examples/budget.json` does cost arithmetic from rates and
limits you supply. It makes no provider calls and enforces nothing.

`maxMeanCostUsd` in a policy filters on the historical average. It cannot
guarantee what the next run costs.

## CLI and storage

- Read commands print JSON. `record` and `vote` are the only commands that
  change data.
- Exit codes: 1 for invalid input, 2 for a rejected budget plan or selection.
- Stored files are limited to 16 MiB.
- A writer fails on an existing lock instead of dropping an update. A crash can
  leave a `.lock` file: check its owner process before removing it.
- Snapshots are trusted local data, not signed attestations. `suiteHash` and
  `datasetHash` identify content; they do not authenticate it. Pin
  `expectedSuiteHash` in a policy you rely on.
- Keep real data under the ignored `data/` directory or another private store.
  Credentials and private traces never belong in Git.

## Next work

A blind voting interface, an executor that works within an approved budget and
reconciles actual usage, a calibrated judge adapter, sandboxed code tasks, and
promotion that uses holdout sets and accounts for uncertainty.
