# Machine Wars

> **A concept, not a product.** This is a placeholder repository for an idea
> under the [Machines](https://github.com/dna113p/machines) umbrella. It is not
> ready for production use, its interfaces will change, and nothing here has
> been measured against real models. Every bundled result is synthetic.

Machine Wars compares how different Agent setups do on the same small tasks,
records your own preferences between them, and turns that evidence into
rankings that a Machine can use to pick an Agent.

It ranks a whole configuration (model, harness, prompt, tools and settings
together), not a bare model name.

## What it does today

Everything runs offline. There are no model calls, no credentials and no web
service.

| Area | What works |
| --- | --- |
| Checks | Exact values, JSON equality, text limits, whole-trial token, tool and time caps |
| Evidence | Validated local JSON files with locked, atomic writes and full judgment history |
| Your preferences | Pairwise votes and an ordered list of preferred candidates |
| Automatic ranking | Check results, optionally refined by imported LLM judgments |
| Aggregation | Bradley–Terry with ties, abstentions and disconnected-graph detection |
| Selection | Versioned snapshots, policy gates and an `AgentRunner` wrapper for Machines |
| Budgets | Cost arithmetic from rates you supply; nothing is enforced live |

Not built yet: live model execution, a live judge, a voting interface, and
any spending enforcement.

## Try it

Needs Node 24 or newer.

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

The demo is 20 handwritten toy tasks and three fictional candidates. Replace
them with real, redacted tasks before trusting any ranking.

`node src/cli.ts --help` lists every command.

## Three kinds of ranking

```sh
node src/cli.ts rank data/demo.json classification human            # your votes only
node src/cli.ts rank data/demo.json classification automatic        # checks, then any imported judge
node src/cli.ts rank data/demo.json classification human-preferred  # your vote wins where you voted
```

Human and automatic evidence never blend silently. Your vote can reorder
candidates, but it never hides a failed check.

## Using a ranking from a Machine

Machines itself does not change. A workflow binds one of its Agent roles to a
ranked runner:

```ts
import type { AgentRunner } from "@dna113p/machines";
import { rankedRunner } from "@dna113p/machine-wars";

const reviewer: AgentRunner = rankedRunner(() => snapshot, policy, {
  "my-reviewer-v1": {
    revision: "model+harness+prompt+tools+settings-v1",
    runner: reviewerRunner,
  },
});
// Pass { reviewer } as the agents binding to your Machine.
```

If no candidate passes the policy, selection throws rather than quietly
choosing a fallback. Keep it in shadow mode: it adds no spending limits,
retries or cancellation.

## More

- [Guide](docs/guide.md): data formats, importing trials and votes,
  selection rules, budgets, CLI and storage.
- [Research](docs/research.md): sources, task sizing, judge bias, sampling and
  limitations.
- [Architecture](docs/architecture.md): module boundaries and the roadmap.

`npm run build` writes the package and CLI to `dist/`. `npm run
smoke:package` installs the packed tarball in a temporary directory and tests
it. The package is marked private and has no runtime dependencies.

## The Machines family

| Project | What it does |
| --- | --- |
| [Machines](https://github.com/dna113p/machines) | The runtime: write a workflow as states, and run it with Agents, checks and people |
| [Machine Shop](https://github.com/dna113p/machine-shop) | Ready-made software workflows to copy into a project |
| [Machines Dispatch](https://github.com/dna113p/machines-dispatch) | A local daemon that runs a Machine for each ticket that is ready |
| **Machine Wars** (this repository) | A concept: ranking Agents so a Machine can pick one |
