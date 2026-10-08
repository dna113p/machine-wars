import type { Dataset, Json, Task } from "../src/index.ts";

/** Handwritten starter examples, not a validated benchmark. No model results. */
export function seedSuite(): Dataset {
  const cases: Array<[string, string, Json]> = [
    ["classification", "Return exactly docs, code, research, review, or needs-info. Ticket: Fix spelling in README. No implementation requested.", "docs"],
    ["classification", "Return exactly docs, code, research, review, or needs-info. Ticket: Implement the missing retry function.", "code"],
    ["classification", "Return exactly docs, code, research, review, or needs-info. Ticket: Compare two storage formats; do not modify files.", "research"],
    ["classification", "Return exactly docs, code, research, review, or needs-info. Ticket: Inspect the supplied patch for defects; do not implement it.", "review"],
    ["classification", "Return exactly docs, code, research, review, or needs-info. Ticket: It is broken. No component, symptom, or reproduction is given.", "needs-info"],
    ["extraction", "Return JSON with exactly owner and priority. Note: Owner is DJ. Priority is high.", { owner: "DJ", priority: "high" }],
    ["extraction", "Return JSON with exactly retries (integer) and timeoutMs (integer). Retry twice. Timeout is 3 seconds.", { retries: 2, timeoutMs: 3000 }],
    ["extraction", "Return JSON with exactly path and action. Request: Rename src/old.ts. The new name is not provided. Set action to needs-info; preserve the existing path.", { path: "src/old.ts", action: "needs-info" }],
    ["extraction", "Return JSON with exactly enabled (boolean) and limit (integer or null). Feature is disabled; no limit is supplied. Do not invent a limit.", { enabled: false, limit: null }],
    ["extraction", "Return JSON with exactly ids, a sorted unique array of integers. Input: 4, 2, 4, 1.", { ids: [1, 2, 4] }],
    ["tool-selection", "Propose one call as JSON with tool and args; do not execute it. Available tool read_file(path). Request: Show README.md.", { tool: "read_file", args: { path: "README.md" } }],
    ["tool-selection", "Propose one call as JSON with tool and args; do not execute it. Available tool list_files(path). Request: List files in src.", { tool: "list_files", args: { path: "src" } }],
    ["tool-selection", "Propose one call as JSON with tool and args; do not execute it. Available tool search_text(path, query). Request: Find literal TODO in src.", { tool: "search_text", args: { path: "src", query: "TODO" } }],
    ["tool-selection", "Return JSON with tool and args. A tool is unnecessary for this task. Select no_tool with empty args. Request: What is 2 plus 2? Do not include the answer.", { tool: "no_tool", args: {} }],
    ["tool-selection", "Return JSON with tool and args. Deletion requires user confirmation. The user has not confirmed deleting data. Choose ask_human with args {reason: confirmation_required}. Do not execute any deletion.", { tool: "ask_human", args: { reason: "confirmation_required" } }],
    ["state-transition", "Return exactly retry, done, failed, or human. HTTP 429 is retryable when attempts < 3. Current attempts: 1. Budget remains.", "retry"],
    ["state-transition", "Return exactly retry, done, failed, or human. HTTP 429 is retryable when attempts < 3. Current attempts: 3. At limit, choose failed.", "failed"],
    ["state-transition", "Return exactly retry, done, failed, or human. All required tests passed and no review is pending. Choose done.", "done"],
    ["state-transition", "Return exactly retry, done, failed, or human. A requested action needs approval and approval has not been given. Choose human.", "human"],
    ["state-transition", "Return exactly retry, done, failed, or human. Budget is exhausted. Policy prohibits another attempt; exhausted runs choose failed.", "failed"],
  ];
  const tasks: Task[] = cases.map(([category, prompt, expected], i) => ({
    id: `${category}-${i + 1}`, category, prompt,
    checks: [{ kind: typeof expected === "string" ? "equals" : "json-equals", expected }],
    caps: { inputTokens: 1200, outputTokens: 512, toolCalls: 0, latencyMs: 60_000 },
  }));
  return { schemaVersion: 1, suite: { id: "machines-micro-starter", version: "1" }, candidates: [], tasks, trials: [], judgments: [] };
}
