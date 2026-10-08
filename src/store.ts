import { randomUUID } from "node:crypto";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { assert, fingerprint, parseDataset } from "./model.ts";
import type { Dataset, Judgment, Trial } from "./model.ts";

const maxFileBytes = 16 * 1024 * 1024;
export async function readJson(path: string): Promise<unknown> {
  const info = await stat(path);
  assert(info.isFile() && info.size <= maxFileBytes, "Expected a JSON file <= 16 MiB");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
export async function readDataset(path: string): Promise<Dataset> {
  return parseDataset(await readJson(path));
}

/** Single-file local store. A lock prevents lost updates; rename prevents partial files.
 * A crash can leave a .lock: inspect the owner process before manually removing it.
 */
export async function updateDataset(path: string, update: (current: Dataset) => Dataset): Promise<Dataset> {
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, "wx", 0o600);
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    const next = parseDataset(update(await readDataset(path)));
    const content = `${JSON.stringify(next, null, 2)}\n`;
    assert(Buffer.byteLength(content) <= maxFileBytes, "Dataset exceeds 16 MiB; archive campaigns or add a larger store");
    const file = await open(temp, "wx", 0o600);
    try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
    await rename(temp, path);
    return next;
  } finally {
    await unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    await lock.close();
    await unlink(lockPath);
  }
}

/** IDs are idempotency keys; conflicting reuse is rejected, never overwritten. */
export async function recordTrial(path: string, trial: Trial): Promise<Dataset> {
  return updateDataset(path, data => {
    const existing = data.trials.find(t => t.id === trial.id);
    if (existing) { assert(fingerprint(existing) === fingerprint(trial), "Trial id already exists with different content"); return data; }
    return { ...data, trials: [...data.trials, trial] };
  });
}
export async function recordJudgment(path: string, judgment: Judgment): Promise<Dataset> {
  return updateDataset(path, data => {
    const existing = data.judgments.find(j => j.id === judgment.id);
    if (existing) { assert(fingerprint(existing) === fingerprint(judgment), "Judgment id already exists with different content"); return data; }
    return { ...data, judgments: [...data.judgments, judgment] };
  });
}
