import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

// Main da025cd (PR 77, the CFP Selection Committee rankings on /rankings)
// deployed this version at 100% traffic through workflow run 45526600363
// (deployment 8c3612fd-c0af-4236-9653-338411eda716, 2026-11-25T01:35:33.889741Z). It replaced
// e1c1527b, the PR 75 deploy. The provider receipt and production smoke passed.
export const reviewedProductionVersion = "0187f6f4-1bc0-429a-8660-d0ca95686571";

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
