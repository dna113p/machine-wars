# Machine Wars contributor guidance

This is a separate application under the Machines umbrella. Machines owns workflow policy; this project owns evaluation evidence and selection recommendations. Do not add a Machines runtime dependency back to this application.

Use Node 24 and strict TypeScript with explicit .ts relative imports. Keep source and emitted-JavaScript entry points working. Run `npm run check` and `npm run smoke:package` for behavior/export changes.

No paid candidate or judge calls without an explicitly approved budget and enforcing adapter. Examples and tests are synthetic and must be labelled. Do not commit credentials, private prompts, or trial traces.

Keep human and automatic evidence distinguishable. Replayed artifacts are not independent trials. Hard-check pass rates are not general quality. Reject stale, disconnected, mismatched, or under-tested routing evidence. Preserve the audit trail. Bump the ranking method version when changing grading or aggregation semantics.

Read docs/research.md and docs/architecture.md before adding execution adapters or changing evidence/selection boundaries.
