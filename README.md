# machine-wars

A local evaluation and ranking project under the **Machines** umbrella.

Compare bounded task outputs, record your own preferences, and export task-specific rankings that Machines can use to choose an Agent runner. Rank the complete candidate configuration, not an unexplained model name.

**Status: offline foundation.** No paid model requests, provider credentials, web service, or automatic production routing. Automatic grading works on imported artifacts. Imported LLM judgments are supported, but live judging/execution adapters are not implemented. All supplied results are explicitly synthetic.

## Start from the source checkout

Requires Node 24 or newer.

```sh
npm install
npm run check
mkdir -p data
node examples/demo.ts > data/demo.json
node src/cli.ts validate data/demo.json
node src/cli.ts rank data/demo.json classification > data/rankings.json
node src/cli.ts select data/rankings.json examples/policy.json
node src/cli.ts plan examples/budget.json
```

The demo contains 20 handwritten toy tasks and three fictional candidates, not measurements of real models. `examples/seed-suite.ts` exports an empty starter dataset with five cases each for classification, extraction, proposed tool selection, and state transitions. Proposed tool selection is not actual tool execution. Replace these with representative, redacted real tasks before trusting a ranking.

`npm run build` emits the package and CLI under `dist/`. `npm run smoke:package` builds a tarball, installs it into a temporary directory, and tests its public exports and executable without model calls. This project is marked private and has no runtime dependencies.

## What works

| Area | Current behavior |
| --- | --- |
| Artifact checks | Exact values, structural JSON equality, text limits, whole-trial token/tool/time caps |
| Evidence | Validated local JSON, idempotent record IDs, locked atomic writes, raw judgment history |
| Personal ranking | Your pairwise votes and an ordered candidate preference list |
| Automatic ranking | Deterministic check comparisons, optionally refined by imported LLM judgments |
| Aggregation | Batch regularized Bradley–Terry, tied outcomes, explicit abstentions, disconnected graph detection |
| Machines selection | Versioned JSON snapshots, policy gates, and a structurally compatible `AgentRunner` wrapper |
| Budget planning | Candidate, judge, tool, repeat, and reserve costs from supplied assumptions; no live enforcement |

## Three evidence channels

```sh
node src/cli.ts rank data/demo.json classification human
node src/cli.ts rank data/demo.json classification automatic
node src/cli.ts rank data/demo.json classification human-preferred
```

`human` uses only your recorded votes. `automatic` resolves hard-check failures before considering an imported judge; two passing artifacts tie without another preference signal. `human-preferred` uses your non-abstaining vote instead of, not in addition to, the automatic verdict for that comparison. Your vote can change the preference leaderboard without erasing a hard-check failure.

Use `preferredCandidateIds` in a selection policy for an explicit personal order. Preferences apply after evidence, quality, cost, and availability gates. Human-only and automatic rankings never silently blend.

## Import actual artifacts and votes

Create a dataset with candidate configurations and versioned task definitions. Then import a completed trial JSON or judgment JSON:

```sh
node src/cli.ts record data/campaign.json data/trial.json
node src/cli.ts grade data/campaign.json trial-id
node src/cli.ts vote data/campaign.json data/judgment.json
```

The exported TypeScript types in `src/model.ts` define the input format. A trial records candidate/task IDs, output, status, timestamp, and total usage. `outputTokens` includes billed reasoning; use `costUsd: null` when actual cost is unknown, never zero as a placeholder. API credentials and private traces do not belong in Git.

A judgment references two existing trials for different candidates on the same task and records `source`, `judge`, `rubricVersion`, `verdict`, timestamp, and rationale. Verdicts are `left`, `right`, `tie`, `both_bad`, and `abstain`. A new judgment ID can supersede an earlier judgment for the same source/pair; history is preserved. This MVP uses one authoritative latest vote per source/pair, not judge-panel voting.

Duplicate candidate/task trials are rejected within one dataset to avoid inflating evidence with replayed output. Use a separate campaign for a fresh attempt. Cross-campaign reliability aggregation and clustered uncertainty are future work. Keep task and candidate configurations immutable within a campaign. An API import records the supplied evidence; it does not independently authenticate that a model produced it.

## Machines integration

Machines stays unchanged. A workflow owner imports the ranking package and explicitly binds a semantic role to a ranked runner. A local snapshot can be loaded with `parseSnapshot(await readJson(path))`.

```ts
import type { AgentRunner } from "@dna113p/machines";
import { rankedRunner } from "@dna113p/machine-wars";

// snapshot and policy were loaded and validated by your application.
// reviewerRunner is one of your existing configured Machines runners.
const reviewer: AgentRunner = rankedRunner(
  () => snapshot,
  policy,
  {
    "my-reviewer-v1": {
      revision: "model+harness+prompt+tools+settings-v1",
      runner: reviewerRunner,
    },
  },
);

// Pass { reviewer } as the agents binding to your existing Machine.
```

The candidate ID and revision must match the recorded configuration. Selection checks scope/channel, snapshot expiry, independent task coverage, check pass rate, known historical cost, rejection policy, and optionally latency/reference connectivity. Defaults require at least five graded and pairwise tasks, complete category coverage, an 80% check-pass floor, and zero both-bad rejections. These defaults are pilot guards, not proof of reliability. Ratings contain no calibrated confidence interval.

Unknown or stale candidates do not win by default. No eligible candidate throws rather than silently choosing an expensive fallback; fallback/escalation belongs in the Machine's policy. Snapshots expire within 24 hours and earlier when their underlying evidence ages out of the default 30-day window. Regenerating a snapshot does not refresh old evidence.

**Budget boundary:** `maxMeanCostUsd` is a historical average filter. It cannot guarantee the next execution's cost. `rankedRunner` does not add spending limits, cancellation, or retries to the delegated runner. Keep selection in shadow mode until a bounded live adapter and promotion checks exist.

## CLI and storage

Use `node src/cli.ts --help` for commands. Read commands print JSON; `record` and `vote` are the only CLI data mutations. Invalid inputs exit 1. Rejected budget plans and selections exit 2. Stored files have a 16 MiB limit. Writers fail on an existing lock instead of silently dropping updates; a crash may leave a `.lock` file. Inspect its owner process before removing a stale lock.

Snapshots are trusted local data, not signed attestations. `suiteHash` and `datasetHash` provide content identity, not authenticity. Pin `expectedSuiteHash` in a production policy. All saved actual data belongs under ignored `data/` or another private store.

## Research and next work

Read [Research](docs/research.md) for source findings, task sizing, judge bias, sampling, budget arithmetic, and limitations. Read [Architecture](docs/architecture.md) for module boundaries and the execution roadmap.

Next work is a blind voting interface, an approved-budget executor with usage reconciliation, a calibrated judge adapter, sandboxed code tasks, and holdout/uncertainty-aware promotion. None of these are implied by the offline demo.
