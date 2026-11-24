import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

// Main c9a81ce (PR 75, the First Round intro on /stadiums) deployed this version
// at 100% traffic through workflow run 45457690523 (deployment
// b0b2638e-3fe9-414c-8cb5-16ab23deaa6c, 2026-11-24T18:19:00.054859Z). It replaced
// 6760d426, the PR 73 deploy. The provider receipt and production smoke passed.
// Read from provider deployment history on 2026-11-24; it is the newest deployment at 100% traffic.
export const reviewedProductionVersion = "e1c1527b-247f-4bd7-993a-617c1738e4e1";

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
