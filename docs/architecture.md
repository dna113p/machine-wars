# Architecture

## Boundary with Machines

`machine-wars` is a sibling application, like `machines-dispatch`, not a new Machines runtime primitive. Machines still owns transitions, retry/escalation policy, and runner invocation. Battle evidence and ranking logic stay here.

```text
saved candidate outputs + human/imported-judge votes
    -> validated campaign dataset
    -> deterministic grades + scoped pairwise evidence
    -> versioned ranking snapshot
    -> explicit selection policy
    -> locally configured Machines AgentRunner
```

No process started by this project invokes an LLM. There is no live endpoint, periodic job, provider authentication, or modification to existing Machines bindings. Ranking consumption is opt-in.

## Modules

| Module | Responsibility |
| --- | --- |
| `model.ts` | Versioned dataset types, runtime validation, deterministic grading, content fingerprints |
| `store.ts` | Size-bounded JSON reads, local exclusive lock, atomic replacement, idempotent record IDs |
| `ranking.ts` | Freshness filtering, per-category comparisons, evidence-channel selection, regularized BT fit and graph components |
| `routing.ts` | Snapshot/policy validation, evidence/quality/cost gates, revision-matched runner selection |
| `budget.ts` | Offline planned-cost arithmetic; never an execution/spending guard |
| `cli.ts` | JSON-oriented commands; only record/vote mutate campaign data |

## Evidence rules

A campaign contains one suite version, immutable task definitions, candidate configurations, trial artifacts, and judgment history. Candidate revision is a caller-maintained identifier for every setting that affects the run; creating a new revision means creating a new candidate/campaign, not relabeling old trials. Dataset imports are trusted statements about provenance, not authenticated provider receipts.

Only one trial per candidate/task is accepted in a campaign. This keeps a cache replay, a repeated trial, and an independent task from being accidentally conflated. Later support for repeats needs explicit trial identity, seeds, task-cluster aggregation, and reliability reporting. Do not just remove the uniqueness check.

Infrastructure errors are excluded from model grades and comparisons, but recorded as infrastructure errors and included in observed attempt costs. Timeouts, model errors, and budget-limit outcomes count as failures of the bounded task. No checks means unknown unless another failure occurred. A passing hard check is only as meaningful as its specification.

A comparison contributes at most one preference observation per pair/task. `human-preferred` substitutes a personal verdict rather than adding another sample. A source's latest judgment is authoritative; timestamp ties use stable judgment IDs. Multi-judge consensus is not implemented. Sparse opponents and differing task difficulty can still affect point estimates; use a shared holdout before promotion.

The BT fit has L2 penalty 1 and reports point estimates on an Elo-like display scale. The algorithm is not sequential Elo, a Davidson tie model, or an uncertainty estimate. Connected components are reported explicitly; ratings from different components must not be compared. Candidate absence means unrated.

## Snapshot and routing contract

Snapshots identify the suite, task-content hash, dataset hash, category, evidence channel, generation time, expiry, and candidate revisions. A hash identifies content, not trust or authenticity. The caller should pin suite hash and maintain a trusted file/source.

Default lookback is 30 days. Snapshot expiry is the earlier of 24 hours after generation or the earliest included trial's lookback expiry. Consumers cannot refresh old evidence just by re-exporting it. Full category coverage is required by default; five graded and compared tasks are a smoke-test minimum, not statistical validation.

The runner wrapper only chooses among locally registered candidate IDs with matching revisions. It rechecks the snapshot at invocation. Missing, stale, disconnected, over-cost, ungraded, or under-tested candidates are not silent fallbacks. No candidate produces an explicit error; a Machine can own an alternative policy.

Historical mean cost is not a per-run maximum. The wrapper does not add cancellation or a spending ledger to an existing runner. Until live adapters exist, production routing should remain unchanged or shadow-only.

## Next implementation boundaries

1. **Human review:** blind randomized A/B presentation, hidden ballot mappings, personal ordered lists, and auditable vote corrections.
2. **Execution:** provider-neutral adapters, isolated task environments, aggregate token/turn/tool/time limits, cancellation, and a reserve/reconcile cost ledger. Unknown billing fails closed. Provider-specific enforcement must be tested before paid use.
3. **Judging:** structured prompts, no judge tools, adversarial-output isolation, side-swap consistency, personal calibration, and a separate judge budget.
4. **Promotion:** task-stratified development/holdout sets, clustered uncertainty, reliability trials, and explicit promotion approval. Adaptive scheduling must not leak into the holdout or inflate sample counts.

For source findings and proposed budget allocation, see [Research](research.md).
