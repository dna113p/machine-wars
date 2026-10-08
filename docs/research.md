# Research: useful agent rankings on a small budget

Research date: 2026-10-08. Recommendations below are a proposed design for DJ's workloads, not measured results from those workloads. No paid evaluations were run.

## Decision

Build a private, task-specific arena, not a universal model leaderboard. Compare an immutable **model + harness + prompt/tools + reasoning/sampling configuration** on the same bounded task. Keep correctness, personal preference, operating cost, and latency visible rather than hiding them in an arbitrary weighted score.

Use deterministic checks first, personal A/B votes second, and model judging only where objective checks cannot settle an important comparison. Export conservative ranking snapshots for Machines; do not make the Machines runtime depend on the ranking application.

## What the research supports

| Primary source | Relevant finding | Design implication |
| --- | --- | --- |
| Anthropic, *Demystifying evals for AI agents*, Jan 2026 [1] | Agent evaluation includes the harness and final environment state, not just the final response. Code, model, and human graders serve different purposes. | Record configuration identity and evaluate real outcomes. |
| Chatbot Arena paper, 2024 [2] | Blind pairwise preferences can be aggregated with Bradley–Terry models; its methodology also studies adaptive pair selection and uncertainty. | Use batch preference rankings and targeted comparisons, not recording-order-dependent Elo alone. |
| MT-Bench / LLM-as-a-judge, 2023 [3]; position-bias study, 2024 [4] | Judges can exhibit position, verbosity, self-preference, and reasoning limitations; bias depends on the judge and task. | Calibrate judges against DJ, randomize sides, and swap selected comparisons. |
| Length-Controlled AlpacaEval, 2024 [5] | Controlling response-length effects changes automatic preference estimates and improves agreement in that evaluation setting. | Do not equate a longer answer with a better answer. Specify the desired output budget. |
| tinyBenchmarks, ICML 2024 [6] | Curated subsets can approximate existing benchmark results with far fewer examples; its MMLU example uses 100 selected items instead of roughly 14,000. | Small representative suites are worth pursuing, but an arbitrary 20-item custom suite is not automatically validated. |
| RouteLLM, 2024/2025 [7] | Preference-trained routers can trade model quality against inference cost in the studied settings. | Preserve preference data for possible future routing models; start with transparent policies before training a router. |
| Anthropic, *Quantifying infrastructure noise*, Feb 2026 [8] | Runtime resource configuration can move agentic benchmark results enough to complicate small model differences. | Fix environments and separate infrastructure failures from model failures. |

## Recommended evaluation pipeline

### 1. Extract small, realistic checkpoints

Initial proposal: 20–30 cases across four or five actual Machines roles, with at least a few examples in each. Replace the included toy examples with real, redacted tasks before using the results operationally. Include easy cases, edge cases, and cases where the correct behavior is to decline an action, request input, or avoid a tool.

| Task slice | Suggested bounded input/output | Best first grader |
| --- | --- | --- |
| Classification / next state | Short ticket or state snapshot; one label | Allowed-label and expected-event checks |
| Structured extraction | One paragraph; a small JSON object | Schema, field values, missing-value handling |
| Tool selection | Small tool catalog; one proposed call | Tool and argument validity; policy constraints |
| Tiny code repair | One function or file and a narrowly specified defect | Hidden functional tests and regression tests in an isolated environment |
| Review / explanation | One short diff or result; a few findings | Known-defect checks, then blind preference against a task rubric |

A task should be small in scope, not stripped of the information needed to do it correctly. For an agentic slice, preserve relevant state, permissions, and realistic tool responses. Use deterministic fixtures instead of a second paid model pretending to be the environment. Reset state between candidates. Grade a resulting state or artifact, not a preferred sequence of actions, except when that sequence is itself an explicit requirement.

Suggested starting limits, to be adjusted to the actual task: 1,200 aggregate input tokens, 512 aggregate output tokens including billed reasoning, 60 seconds, and at most 1–3 small tool interactions. These are design knobs, not universal fair limits. The provided one-turn seed tasks need zero actual tool calls. A reasoning model truncated by a small cap is being tested for fitness under that budget, not for its unconstrained maximum capability. Report truncation separately.

Do not infer long-horizon reliability from these checkpoints. Once a candidate looks promising, run a small number of bounded end-to-end confirmation tasks separately. Do not average a code-repair suite and a classification suite into one general score.

### 2. Grade objective requirements before preferences

Store outputs and check results once. Validate schema, required facts, test outcomes, allowed actions, and resource constraints. A response that is eloquent but wrong must not defeat one that satisfies a hard requirement in automatic mode. Treat missing graders as unknown, not success.

For open-ended work, use a task-specific rubric with a short priority order: correctness/grounding, instruction satisfaction, useful coverage, then clarity and concision. Pairwise judgments should allow **A wins, B wins, tie, both bad, or abstain**. Both bad must not become evidence that either output is acceptable. A judge's confidence is not a calibrated probability of correctness.

The initial implementation handles equality, structural JSON equality, text-length constraints, and imported whole-trial usage. It does not yet run code tests, a live tool environment, or a model judge. A JSON comparator is not a substitute for a semantic coding grader.

### 3. Preserve personal and automatic evidence separately

Keep three views: human only; automatic only; and human-preferred, where a non-abstaining personal vote replaces the automatic verdict for that exact comparison. Do not add both as two independent observations. A separate ordered candidate preference list lets DJ choose among candidates that already satisfy routing gates.

For a future review interface, hide model names, costs, and provider metadata until the vote is recorded. Randomize A/B positions. Maintain a private mapping from the displayed sides to immutable trial IDs. Candidate output may still self-identify; flag those cases rather than promising perfect blinding.

For a future model judge, use an explicit structured rubric, no tools, untrusted-output delimiters, a strict verdict schema, and a small answer budget. Do not let candidate text issue instructions to the judge. Compare judge votes against a held-out set of personal votes before trusting them. Spend extra judgment calls on high-impact disagreements and swap selected comparisons; order-sensitive disagreements should abstain or go to human review, not be counted as two votes. A different provider family may reduce one concern, but it is not a guarantee of impartiality.

### 4. Spend on information, not exhaustive tournaments

Generate each candidate's answer once per task and reuse the artifact for deterministic checks and additional human/judge comparisons. Six candidates on 20 tasks require 120 candidate trials. Exhaustive pairwise judging adds 300 comparisons, or 600 calls if every comparison is judged in both orders. Those judge calls can dominate the bill.

Proposed campaign: compare challengers against a common incumbent/anchor, add a few bridge comparisons, and spend remaining judge budget on close or disputed decisions. Maintain a connected comparison graph. Use adaptive allocation on a development set; confirm any promoted candidate on a fixed holdout set with equal coverage. Do not treat an adaptively selected easy subset as representative of production.

Cache keys should eventually include task content/version, candidate revision, harness/tool configuration, sampling seed and trial identity. Regrading cached output is not a fresh trial. Repeat only a small set of reliability-critical tasks initially. Repeated trials and swapped judgments need clustered accounting; this MVP rejects duplicate candidate/task trials in one campaign rather than pretending that repeated artifacts add independent evidence.

### 5. Rank modestly and route conservatively

The implementation uses a batch, L2-regularized Bradley–Terry point estimate. Ties contribute one half-win per side; both-bad and abstentions contribute no preference match. Regularization keeps all-win/lose cases finite. Scores are comparable only within the same suite/version, category, evidence channel, and connected component.

These scores do not have calibrated confidence intervals. Minimum task counts are an operational guard, not a claim of statistical significance. Five tasks can make a smoke test useful but cannot establish a stable fine-grained leaderboard. Keep pilot rankings provisional. Before autonomous promotion, add task-cluster bootstrap uncertainty, inspect overlap, and validate on the holdout suite. Avoid training a learned router until the personal data is large and representative enough to evaluate it independently.

A Machines policy should select a candidate only after checking scope, configuration revision, recent evidence, complete task coverage, hard-check pass floor, personal rejection policy, known cost, and latency limits. No eligible candidate should mean a clear failure or an explicitly authored workflow fallback, not an automatic expensive model call. Exact ties may prefer the cheaper candidate. An average historical cost limit is not a hard spending cap on the next run.

## Worked budget — hypothetical prices, not provider quotes

The included budget example assumes six candidates and 20 tasks, one attempt each; maximum aggregate 1,200 input and 512 output tokens per candidate trial; all six priced at an illustrative $1/M input and $4/M output. It allows **20 total judge calls, including any position swaps**, each capped at 2,400 input and 128 output tokens at illustrative $3/M and $15/M. There are no paid tools.

| Item | Planned amount |
| --- | ---: |
| 120 candidate trials | $0.389760 |
| 20 judge calls | $0.182400 |
| 20% reserve | $0.114432 |
| Total | $0.686592, approximately $0.69 |

This is arithmetic under explicitly fictional rates and limits, not a promise that six actual models can be evaluated for that amount. Substitute each provider's actual billed rates, hidden/reasoning-token treatment, minimum fees, tool charges, and retry policy. The planner performs no provider calls and enforces no live cap. A future executor must reserve worst-case cost before each call, reconcile actual billing, stop on missing usage, and enforce provider and campaign limits. Budget approval remains required.

## Implementation order

**Implemented:** local evidence schema and locked JSON persistence; deterministic artifact grading; personal/imported-judge votes; three ranking channels; conservative selection and a Machines-compatible runner wrapper; offline cost planner; starter examples; tests.

**Next:** blind review interface; provider-neutral bounded execution adapters with a real cost ledger; judge calibration and selective judging; sandboxed tiny code tasks; reliability repetitions and task-cluster uncertainty. Keep the selection policy in shadow mode until real workload evidence and a holdout promotion gate exist.

## Primary references

1. Anthropic, Jan 9, 2026: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
2. Chiang et al., 2024, Chatbot Arena: https://arxiv.org/abs/2403.04132
3. Zheng et al., 2023, Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena: https://arxiv.org/abs/2306.05685
4. Shi et al., 2024, Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge: https://arxiv.org/abs/2406.07791
5. Dubois et al., 2024, Length-Controlled AlpacaEval: https://arxiv.org/abs/2404.04475
6. Maia Polo et al., ICML 2024, tinyBenchmarks: https://proceedings.mlr.press/v235/maia-polo24a.html
7. Ong et al., 2024, revised 2025, RouteLLM: https://arxiv.org/abs/2406.18665
8. Anthropic, Feb 5, 2026, Quantifying infrastructure noise in agentic coding evals: https://www.anthropic.com/engineering/infrastructure-noise
