/**
 * Dependency-security floor for the vinext + @vitejs/plugin-rsc + React Server
 * Components stack (read-only; inspects what is actually installed). The command
 * line is scripts/check-security-floor.mjs; this module holds the checks so tests
 * can import them.
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
 * checked, however deeply nested, and whether it is installed under its own name
 * or an npm alias. react and react-dom are not themselves named in the advisories;
 * the copies the application resolves (top level) are checked so they match the
 * patched react-server-dom-webpack, and nested copies are listed. The walk follows
 * the node_modules layout as Node resolves it; dot-directories (.bin, .cache, .store, .pnpm) are
 * reached only through the links that point into them.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative as relativePath } from "node:path";

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

/** Why `version` is below `floor`, or null when it is at or above it. */
function floorProblem(version, floor) {
  return compareVersions(version, floor) < 0 ? `is below the security floor ${floor}` : null;
}

/**
 * Every package directory reachable from <root>/node_modules, with its manifest name and
 * version, however deeply nested. Symlinked directories (and Windows junctions) are followed.
 * From each package's real path, every node_modules directory Node would search for its
 * imports is listed too (each ancestor's node_modules, as Module._nodeModulePaths does), up to
 * <root> for packages inside it and up to the filesystem root for packages linked from
 * elsewhere (npm link, file: dependencies). That reaches dependencies stored as siblings (npm's
 * linked install strategy, a .store or .pnpm directory) and those hoisted above a linked
 * package. node_modules directories above <root> are not listed for packages inside <root>.
 * Each real node_modules directory is listed once, so link cycles terminate; a directory
 * reached under several install names is recorded under each name.
 * Directories that exist but cannot be read are returned as problems.
 */
function installedPackages(root, rootReal) {
  const packages = [];
  const problems = [];
  const recorded = new Set();
  const listed = new Set();
  const queued = new Set();
  const pending = [];
  const queue = (dir) => {
    if (queued.has(dir)) return;
    queued.add(dir);
    pending.push(dir);
  };
  queue(join(root, "node_modules"));
  const missing = (error) => error.code === "ENOENT" || error.code === "ENOTDIR";
  const isDirectory = (path, entry) => {
    if (entry.isDirectory()) return true;
    if (!entry.isSymbolicLink()) return false;
    try {
      return statSync(path).isDirectory();
    } catch (error) {
      if (!missing(error)) problems.push({ path, message: `could not be read (${error.code})` });
      return false;
    }
  };
  const list = (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (!missing(error)) problems.push({ path: dir, message: `could not be listed (${error.code})` });
      return [];
    }
  };
  const addPackage = (dir, dirName) => {
    let real;
    try {
      real = realpathSync(dir);
    } catch (error) {
      packages.push({ path: dir, dirName, error: `could not be resolved (${error.code ?? error.message})` });
      return;
    }
    const key = JSON.stringify([real, dirName]);
    if (recorded.has(key)) return;
    recorded.add(key);
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        const { name, version } = JSON.parse(readFileSync(manifest, "utf8").trimStart());
        packages.push({ path: dir, dirName, name, version });
      } catch (error) {
        packages.push({ path: dir, dirName, error: `package.json could not be read (${error.message})` });
      }
    }
    queue(join(dir, "node_modules"));
    for (let ancestor = real; ; ancestor = dirname(ancestor)) {
      if (basename(ancestor) !== "node_modules") queue(join(ancestor, "node_modules"));
      if (ancestor === rootReal || dirname(ancestor) === ancestor) break;
    }
  };
  while (pending.length) {
    const nodeModules = pending.pop();
    let real;
    try {
      real = realpathSync(nodeModules);
    } catch (error) {
      if (!missing(error)) problems.push({ path: nodeModules, message: `could not be resolved (${error.code})` });
      continue;
    }
    if (listed.has(real)) continue;
    listed.add(real);
    for (const entry of list(nodeModules)) {
      const path = join(nodeModules, entry.name);
      if (entry.name.startsWith(".") || !isDirectory(path, entry)) continue;
      if (!entry.name.startsWith("@")) {
        addPackage(path, entry.name);
        continue;
      }
      for (const scoped of list(path)) {
        const scopedPath = join(path, scoped.name);
        if (isDirectory(scopedPath, scoped)) addPackage(scopedPath, `${entry.name}/${scoped.name}`);
      }
    }
  }
  return { packages, problems };
}

/** Check the installed tree under <root>/node_modules; returns failures and informational notes. */
export function checkSecurityFloor(root, { requireVinext = false } = {}) {
  const failures = [];
  const notes = [];
  let rootReal = root;
  try {
    rootReal = realpathSync(root);
  } catch {
    // A missing root is reported below as missing packages.
  }
  const { packages, problems } = installedPackages(root, rootReal);
  const relative = (path) => {
    const from = [root, rootReal].map((base) => relativePath(base, path)).find((candidate) => !candidate.startsWith("..") && !isAbsolute(candidate));
    return (from ?? path).replaceAll("\\", "/");
  };
  const topLevel = (name) => join(root, "node_modules", ...name.split("/"));
  // A copy of `name` is any directory installed as `name` or whose manifest is `name` (an npm alias).
  const copiesOf = (name, { topLevelOnly = false } = {}) =>
    packages.filter((pkg) => (pkg.dirName === name || pkg.name === name) && (!topLevelOnly || pkg.path === topLevel(name)));
  const describe = (name, pkg) => `${name}@${pkg.version} at ${relative(pkg.path)}${pkg.dirName === name ? "" : ` (installed as ${pkg.dirName})`}`;
  const problemOf = (pkg, rule) => {
    if (pkg.error) return pkg.error;
    try {
      return rule(pkg.version);
    } catch {
      return `has no valid version (${JSON.stringify(pkg.version)})`;
    }
  };

  function assertCopies(name, rule, floor, { required = true, topLevelOnly = false } = {}) {
    const copies = copiesOf(name, { topLevelOnly });
    if (!copies.length && required) failures.push(`${name}: not installed (run npm ci); floor is ${floor}`);
    for (const pkg of copies) {
      const problem = problemOf(pkg, rule);
      if (problem) failures.push(`${describe(name, pkg)} ${problem}`);
      else notes.push(`${describe(name, pkg)} >= ${floor}`);
    }
  }

  function reportCopies(name, rule, explanation) {
    for (const pkg of copiesOf(name)) {
      const problem = problemOf(pkg, rule);
      notes.push(`${describe(name, pkg)} ${problem ?? "meets the floor"}; ${explanation}`);
    }
  }

  // A directory or manifest that cannot be read cannot be ruled out as a copy of a checked package.
  for (const problem of problems) failures.push(`${relative(problem.path)}: ${problem.message}`);
  for (const pkg of packages) if (pkg.error) failures.push(`${relative(pkg.path)}: ${pkg.error}`);

  assertCopies("react-server-dom-webpack", reactVersionProblem, REACT_FLOOR);
  for (const name of RSDW_PACKAGES.slice(1)) assertCopies(name, reactVersionProblem, REACT_FLOOR, { required: false });

  // react and react-dom must move with react-server-dom-webpack (its peer range is ^19.2.9),
  // whatever react-server-dom-webpack version is installed.
  for (const name of ["react", "react-dom"]) {
    assertCopies(name, reactVersionProblem, REACT_FLOOR, { topLevelOnly: true });
    for (const pkg of copiesOf(name).filter((copy) => copy.path !== topLevel(name))) {
      notes.push(`${describe(name, pkg)} is nested and ${problemOf(pkg, reactVersionProblem) ?? "meets the floor"}; informational, not asserted`);
    }
  }

  assertCopies("@vitejs/plugin-rsc", (version) => floorProblem(version, PLUGIN_RSC_FLOOR), PLUGIN_RSC_FLOOR);
  assertCopies("next", (version) => floorProblem(version, NEXT_FLOOR), NEXT_FLOOR);

  // sharp is informational here: the copies in this tree come from the dev toolchain
  // (miniflare / wrangler), so a sub-floor copy is reported but does not fail the check.
  reportCopies("sharp", (version) => floorProblem(version, SHARP_FLOOR), "informational, not asserted");

  if (requireVinext) assertCopies("vinext", (version) => floorProblem(version, VINEXT_FLOOR), VINEXT_FLOOR);
  else reportCopies("vinext", (version) => floorProblem(version, VINEXT_FLOOR), "not asserted here (use --require-vinext)");
  return { failures, notes };
}
