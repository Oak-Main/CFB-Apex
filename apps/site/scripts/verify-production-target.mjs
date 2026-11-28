import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

// Main dd7406e (PR 82, all 16 verified Tuesday–Friday Week 13 finals and the
// 32 teams' records) deployed this version at 100% traffic through workflow run
// 46171346887 (deployment 773febc3-8ffa-459e-ad29-cf56f748d164,
// 2026-11-28T17:38:02.835938Z). It replaced 81459983, the PR 80 deploy. The provider receipt and production smoke passed.
// Read from provider deployment history on 2026-11-28; it is the newest deployment at 100% traffic.
export const reviewedProductionVersion = "cd8821af-2f85-4163-b89a-682ae25a4795";

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
