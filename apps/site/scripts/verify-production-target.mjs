import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

// Main 459fb62 (PR 66) deployed this version at 100% traffic through this workflow's manual
// dispatch, run 44712436235 (deployment f7bea3df-5bdf-447f-9969-4855d3e6d450,
// 2026-11-20T09:39:53Z). It replaced c96e0422, the manual postseason deploy of 2026-11-19.
// A newer or split deployment still fails closed before this release writes.
export const reviewedProductionVersion = "b7061c1a-b145-4777-951e-8ba5be03b151";

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
