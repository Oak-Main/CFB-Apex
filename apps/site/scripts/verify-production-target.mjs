import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

// Production moved twice after the PR 63 pin without this constant following it:
// PR 64 main e8d258d deployed 78b3ff21 (run 43883539405, deployment 2c5c54e2, 2026-11-16T14:16:07Z),
// then a manual `wrangler deploy` from the owner account published the PR 65 postseason release as
// c96e0422 (deployment 04c5ddd0-d382-4743-b7e8-4a943a31da92, 2026-11-19T14:08:48Z, version 136).
// Read from provider deployment history on 2026-11-20; it is the newest deployment at 100% traffic.
// A newer or split deployment still fails closed before this release writes.
export const reviewedProductionVersion = "c96e0422-7e5b-4416-a4f0-1d263fa1cebb";

/** Wrangler's JSON list is oldest-first. Never assume its first entry is active. */
export function verifyProductionTarget(deployments, expectedVersion) {
  assert.ok(Array.isArray(deployments) && deployments.length > 0, "No provider deployment evidence");
  assert.match(expectedVersion, /^[a-f0-9-]{36}$/);
  for (const row of deployments) assert.ok(Number.isFinite(Date.parse(row.created_on)), "Invalid provider deployment timestamp");
  const active = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  assert.ok(typeof active.id === "string" && active.id.length > 0, "Provider deployment identity missing");
  assert.ok(Array.isArray(active.versions), "Provider traffic assignment missing");
  const traffic = active.versions.map(row => ({ version_id: row.version_id, percentage: row.percentage }));
  assert.deepEqual(traffic, [{ version_id: expectedVersion, percentage: 100 }], "Active production differs from the reviewed target; stop before overwriting newer or split-traffic work");
  return { deploymentId: active.id, createdAt: active.created_on, version: expectedVersion, percentage: 100 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
  let expected = reviewedProductionVersion;
  if (process.argv[3]) {
    const output = stripVTControlCharacters(readFileSync(process.argv[3], "utf8"));
    expected = output.match(/Current Version ID:\s*([a-f0-9-]{36})/)?.[1];
    assert.ok(expected, "Wrangler did not identify the deployed version");
  }
  console.log(JSON.stringify({ acceptance: "PASS", account: "820e7cee61fccc60d14c8e20bc686942", worker: "cfb-apex", ...verifyProductionTarget(rows, expected) }));
}
