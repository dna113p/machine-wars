# Machine Wars contributor guidance

This is a separate application under the Machines umbrella. Machines owns workflow policy; this project owns evaluation evidence and selection recommendations. Do not add a Machines runtime dependency back to this application.

Use Node 24 and strict TypeScript with explicit .ts relative imports. Keep source and emitted-JavaScript entry points working. Run `npm run check` and `npm run smoke:package` for behavior/export changes.

No paid candidate or judge calls without an explicitly approved budget and enforcing adapter. Examples and tests are synthetic and must be labelled. Do not commit credentials, private prompts, or trial traces.

Keep human and automatic evidence distinguishable. Replayed artifacts are not independent trials. Hard-check pass rates are not general quality. Reject stale, disconnected, mismatched, or under-tested routing evidence. Preserve the audit trail. Bump the ranking method version when changing grading or aggregation semantics.

Read docs/research.md and docs/architecture.md before adding execution adapters or changing evidence/selection boundaries.

<!-- drip:reporting -->
## Reporting through Drip

Use Drip for work that may outlast the person's attention: more than a few
minutes, or started from Drip or a phone. Read the `drip-briefing` skill
before reporting; use `drip_guide` if the skill is unavailable. At the start,
use `drip_projects` to find the registered project holding this folder, then
open a thread with `drip_open`. Keep the person's ask in their own words.
If no project matches, say which folder needs registration and continue.
Keep the thread's recap current with `drip_recap`: on opening, after each
milestone, before each question, and when the work drifts from the ask.
Write its `now` as a sentence about where the work stands, never a name and
state label. Say what changed and what the person needs to do. Ask blocking
questions with `drip_ask`; distinguish restricted choices from suggestions,
and explain each choice's effect and your recommendation. Attach a page to
its recap or question when useful; keep the text able to stand alone.
Read and answer the person's messages returned by the tools. When finished,
close the thread with `drip_close` and a final result. Say "Nothing needed."
once when there is nothing for the person to do.
<!-- /drip:reporting -->
