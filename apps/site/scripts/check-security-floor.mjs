/**
 * Command line for the dependency-security floor in scripts/security-floor.mjs
 * (advisories, floors and rules are documented there).
 *
 * Usage:
 *   node scripts/check-security-floor.mjs                  # React / RSC floor
 *   node scripts/check-security-floor.mjs --require-vinext # also assert vinext >= 1.2.0
 *   node scripts/check-security-floor.mjs --root <dir>     # inspect <dir>/node_modules instead
 *
 * Exit codes: 0 = floor met, 1 = a package is below the floor, missing or unreadable,
 * 2 = invalid arguments. No exploit payloads, network access or file writes.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSecurityFloor } from "./security-floor.mjs";

function usageError(message) {
  console.error(`check-security-floor: ${message}`);
  console.error("Usage: node scripts/check-security-floor.mjs [--require-vinext] [--root <dir>]");
  process.exit(2);
}

let root = fileURLToPath(new URL("..", import.meta.url));
let requireVinext = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--require-vinext") requireVinext = true;
  else if (arg === "--root") {
    const value = args[++i];
    if (!value || value.startsWith("--")) usageError("--root needs a directory");
    root = value;
  } else if (arg.startsWith("--root=")) {
    if (arg.length === "--root=".length) usageError("--root needs a directory");
    root = arg.slice("--root=".length);
  } else usageError(`unknown argument ${arg}`);
}
root = resolve(root);

let result;
try {
  result = checkSecurityFloor(root, { requireVinext });
} catch (error) {
  console.error(`Security floor: ERROR in ${root}: ${error.message}`);
  process.exit(1);
}
for (const note of result.notes) console.log(`ok    ${note}`);
for (const failure of result.failures) console.error(`FAIL  ${failure}`);
if (result.failures.length) {
  console.error(`Security floor: FAIL (${result.failures.length} problem${result.failures.length === 1 ? "" : "s"}) in ${root}`);
  process.exit(1);
}
console.log(`Security floor: PASS${requireVinext ? " (including vinext)" : ""} in ${root}`);
