/**
 * Dependency-security floor for the vinext + @vitejs/plugin-rsc + React Server
 * Components stack (read-only; inspects what is actually installed).
 *
 * Advisories (published 2026-10-14):
 *   GHSA-xqc2-xf4c-x3h3  React Server Components RCE (critical)
 *   GHSA-h3gv-c5rc-p453  Denial of service in server functions
 *     react-server-dom-webpack / -turbopack / -parcel <= 19.2.8 and 19.3.0 are
 *     vulnerable; fixed in 19.0.9 / 19.1.10 / 19.2.9 / 19.3.1. This repo stays
 *     on the 19.2 line, so react, react-dom and react-server-dom-webpack must
 *     all be >= 19.2.9, and none of them may be 19.3.0 or a pre-release build.
 *   GHSA-8969-277p-8rrm / GHSA-2956-r8mj-w5c4  vinext < 1.2.0, fixed in vinext
 *     1.2.0 together with @vitejs/plugin-rsc >= 0.5.37. This script asks for
 *     @vitejs/plugin-rsc >= 0.5.38, the first release whose notes record the
 *     React 19.3.1 update (the vendored Flight code); 0.5.37 predates it.
 *   GHSA-2464-fhr4-w9xw / GHSA-p3m5-59mp-jv5r / GHSA-673q-mjm6-r5xr  next < 16.4.1.
 *
 * Every installed copy of react-server-dom-*, @vitejs/plugin-rsc and next is
 * checked, however deeply nested. react and react-dom are not themselves named in
 * the advisories; the copies the application resolves (top level) are checked so
 * they match the patched react-server-dom-webpack, and nested copies are listed.
 *
 * Usage:
 *   node scripts/check-security-floor.mjs                  # React / RSC floor
 *   node scripts/check-security-floor.mjs --require-vinext # also assert vinext >= 1.2.0
 *   node scripts/check-security-floor.mjs --root <dir>     # inspect <dir>/node_modules instead
 *
 * Exit codes: 0 = floor met, 1 = a package is below the floor or missing.
 * No exploit payloads, network access or file writes.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REACT_FLOOR = "19.2.9";
const PLUGIN_RSC_FLOOR = "0.5.38";
const NEXT_FLOOR = "16.4.1";
const SHARP_FLOOR = "0.35.5";
const VINEXT_FLOOR = "1.2.0";
const RSDW_PACKAGES = ["react-server-dom-webpack", "react-server-dom-turbopack", "react-server-dom-parcel"];

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(version));
  if (!match) throw new Error(`Unparseable version: ${version}`);
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split(".") : [] };
}

/** Semver precedence: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a, b) {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return Number(x) - Number(y);
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Why a react / react-dom / react-server-dom-* version is not patched, or null when it is.
 * 19.3.0 sorts above the 19.2.9 floor but is vulnerable (fixed in 19.3.1). Pre-release
 * builds (canary, experimental, rc) are refused: the advisories name stable releases only.
 */
export function reactVersionProblem(version) {
  const { core, pre } = parse(version);
  if (compareVersions(version, REACT_FLOOR) < 0) return `is below the security floor ${REACT_FLOOR}`;
  if (core[0] === 19 && core[1] === 3 && core[2] === 0) return "is vulnerable (19.3.0; fixed in 19.3.1)";
  if (pre.length) return "is a pre-release build; use a stable patched release";
  return null;
}

/** Installed copies of `name` under <root>/node_modules, nested copies too unless topLevelOnly. */
function installedCopies(root, name, { topLevelOnly = false } = {}) {
  const found = new Map();
  const visited = new Set();
  const pending = [join(root, "node_modules")];
  const isDirectory = (path, entry) => {
    if (entry.isDirectory()) return true;
    if (!entry.isSymbolicLink()) return false;
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  };
  // Iterative walk with no depth limit; symlinks and junctions are followed once per real path.
  while (pending.length) {
    const nodeModules = pending.pop();
    let real;
    try {
      real = realpathSync(nodeModules);
    } catch {
      continue;
    }
    if (visited.has(real)) continue;
    visited.add(real);
    const own = join(nodeModules, name, "package.json");
    if (existsSync(own)) {
      const packageReal = realpathSync(join(nodeModules, name));
      if (!found.has(packageReal)) found.set(packageReal, { path: join(nodeModules, name), version: JSON.parse(readFileSync(own, "utf8")).version });
    }
    if (topLevelOnly) break;
    for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
      const path = join(nodeModules, entry.name);
      if (entry.name.startsWith(".") || !isDirectory(path, entry)) continue;
      if (entry.name.startsWith("@")) {
        for (const scoped of readdirSync(path, { withFileTypes: true })) {
          const scopedPath = join(path, scoped.name);
          if (isDirectory(scopedPath, scoped)) pending.push(join(scopedPath, "node_modules"));
        }
      } else {
        pending.push(join(path, "node_modules"));
      }
    }
  }
  return [...found.values()];
}

/** Check the installed tree under <root>/node_modules; returns failures and informational notes. */
export function checkSecurityFloor(root, { requireVinext = false } = {}) {
  const failures = [];
  const notes = [];
  const relative = (path) => path.slice(root.length + 1).replaceAll("\\", "/");

  function requireAtLeast(name, floor, { required = true } = {}) {
    const copies = installedCopies(root, name);
    if (!copies.length && required) failures.push(`${name}: not installed (run npm ci); floor is ${floor}`);
    for (const copy of copies) {
      if (compareVersions(copy.version, floor) < 0) failures.push(`${name}@${copy.version} at ${relative(copy.path)} is below the security floor ${floor}`);
      else notes.push(`${name}@${copy.version} at ${relative(copy.path)} >= ${floor}`);
    }
  }

  function requirePatchedReact(name, { required = true, topLevelOnly = false } = {}) {
    const copies = installedCopies(root, name, { topLevelOnly });
    if (!copies.length && required) failures.push(`${name}: not installed (run npm ci); floor is ${REACT_FLOOR}`);
    for (const copy of copies) {
      const problem = reactVersionProblem(copy.version);
      if (problem) failures.push(`${name}@${copy.version} at ${relative(copy.path)} ${problem}`);
      else notes.push(`${name}@${copy.version} at ${relative(copy.path)} >= ${REACT_FLOOR}`);
    }
  }

  requirePatchedReact("react-server-dom-webpack");
  for (const name of RSDW_PACKAGES.slice(1)) requirePatchedReact(name, { required: false });

  // react and react-dom must move with react-server-dom-webpack (its peer range is ^19.2.9),
  // whatever react-server-dom-webpack version is installed.
  for (const name of ["react", "react-dom"]) {
    requirePatchedReact(name, { topLevelOnly: true });
    const nested = installedCopies(root, name).filter((copy) => relative(copy.path) !== `node_modules/${name}`);
    for (const copy of nested) {
      const problem = reactVersionProblem(copy.version);
      notes.push(`${name}@${copy.version} at ${relative(copy.path)} is nested${problem ? ` and ${problem}` : ""}; informational, not asserted`);
    }
  }

  requireAtLeast("@vitejs/plugin-rsc", PLUGIN_RSC_FLOOR);
  requireAtLeast("next", NEXT_FLOOR);

  // sharp is informational here: the copies in this tree come from the dev toolchain
  // (miniflare / wrangler), so a sub-floor copy is reported but does not fail the check.
  for (const copy of installedCopies(root, "sharp")) {
    const state = compareVersions(copy.version, SHARP_FLOOR) < 0 ? "below" : "at or above";
    notes.push(`sharp@${copy.version} at ${relative(copy.path)} is ${state} ${SHARP_FLOOR}; informational, not asserted`);
  }

  if (requireVinext) {
    requireAtLeast("vinext", VINEXT_FLOOR);
  } else {
    for (const copy of installedCopies(root, "vinext")) {
      const state = compareVersions(copy.version, VINEXT_FLOOR) < 0 ? "below" : "at or above";
      notes.push(`vinext@${copy.version} is ${state} ${VINEXT_FLOOR}; not asserted here (use --require-vinext)`);
    }
  }
  return { failures, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const requireVinext = args.includes("--require-vinext");
  const rootFlag = args.indexOf("--root");
  const root = resolve(rootFlag >= 0 ? args[rootFlag + 1] : fileURLToPath(new URL("..", import.meta.url)));
  const { failures, notes } = checkSecurityFloor(root, { requireVinext });
  for (const note of notes) console.log(`ok    ${note}`);
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  if (failures.length) {
    console.error(`Security floor: FAIL (${failures.length} problem${failures.length === 1 ? "" : "s"}) in ${root}`);
    process.exit(1);
  }
  console.log(`Security floor: PASS${requireVinext ? " (including vinext)" : ""}`);
}
