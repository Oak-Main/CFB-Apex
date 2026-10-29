import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkSecurityFloor, reactVersionProblem } from "../scripts/security-floor.mjs";

const script = fileURLToPath(new URL("../scripts/check-security-floor.mjs", import.meta.url));
const patched: Record<string, string> = {
  "node_modules/react": "19.2.9",
  "node_modules/react-dom": "19.2.9",
  "node_modules/react-server-dom-webpack": "19.2.9",
  "node_modules/@vitejs/plugin-rsc": "0.5.38",
  "node_modules/next": "16.4.3",
};

/** Synthetic install: each key is a package directory relative to the fixture root; the value is its
 *  version, or "name@version" for a directory whose manifest has another name (an npm alias). */
function fixture(packages: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "security-floor-"));
  for (const [dir, spec] of Object.entries(packages)) {
    const at = spec.lastIndexOf("@");
    const [name, version] = at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [dir.split("node_modules/").at(-1), spec];
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name, version }));
  }
  return root;
}

function withFixture<T>(packages: Record<string, string>, use: (root: string) => T) {
  const root = fixture(packages);
  try {
    return use(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const check = (packages: Record<string, string>, options: { requireVinext?: boolean } = {}) => withFixture(packages, (root) => checkSecurityFloor(root, options));
const cli = (args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("security floor: react, react-dom and react-server-dom versions", () => {
  for (const version of ["19.2.9", "19.2.10", "19.3.1", "20.0.0"]) assert.equal(reactVersionProblem(version), null, version);
  assert.match(reactVersionProblem("19.2.8") ?? "", /below the security floor/);
  assert.match(reactVersionProblem("19.1.10") ?? "", /below the security floor/);
  assert.match(reactVersionProblem("19.2.9-rc.1") ?? "", /below the security floor/);
  assert.match(reactVersionProblem("19.3.0") ?? "", /vulnerable/);
  assert.match(reactVersionProblem("19.3.0-canary-0d1f1e2-20261001") ?? "", /vulnerable/);
  assert.match(reactVersionProblem("19.4.0-rc.0") ?? "", /pre-release/);
  assert.match(reactVersionProblem("0.0.0-experimental-0d1f1e2-20261001") ?? "", /below the security floor/);
});

test("security floor: the patched tree passes, on the 19.2 line and on 19.3.1", () => {
  assert.deepEqual(check(patched).failures, []);
  const on1931 = { ...patched, "node_modules/react": "19.3.1", "node_modules/react-dom": "19.3.1", "node_modules/react-server-dom-webpack": "19.3.1" };
  assert.deepEqual(check(on1931).failures, []);
});

test("security floor: react and react-dom are checked whatever react-server-dom-webpack version is installed", () => {
  const failures = check({ ...patched, "node_modules/react-server-dom-webpack": "19.3.1", "node_modules/react": "19.2.8", "node_modules/react-dom": "19.2.8" }).failures;
  assert.equal(failures.length, 2);
  assert.match(failures.join("\n"), /react@19\.2\.8 at node_modules\/react is below/);
  assert.match(failures.join("\n"), /react-dom@19\.2\.8 at node_modules\/react-dom is below/);
});

test("security floor: 19.3.0 is rejected for react and react-dom as well as react-server-dom-webpack", () => {
  const reactFailures = check({ ...patched, "node_modules/react": "19.3.0", "node_modules/react-dom": "19.3.0" }).failures;
  assert.equal(reactFailures.length, 2);
  assert.ok(reactFailures.every((failure) => /19\.3\.0 at node_modules\/react(-dom)? is vulnerable/.test(failure)), reactFailures.join("\n"));
  assert.match(check({ ...patched, "node_modules/react-server-dom-webpack": "19.3.0" }).failures.join("\n"), /react-server-dom-webpack@19\.3\.0 .* is vulnerable/);
  assert.match(check({ ...patched, "node_modules/react-server-dom-webpack": "19.2.8" }).failures.join("\n"), /react-server-dom-webpack@19\.2\.8 .* is below/);
});

test("security floor: missing packages and unreadable manifests fail", () => {
  const rest = Object.fromEntries(Object.entries(patched).filter(([dir]) => dir !== "node_modules/react-server-dom-webpack" && dir !== "node_modules/react"));
  const failures = check(rest).failures.join("\n");
  assert.match(failures, /react-server-dom-webpack: not installed/);
  assert.match(failures, /react: not installed/);
  withFixture(patched, (root) => {
    writeFileSync(join(root, "node_modules/next/package.json"), JSON.stringify({ name: "next" }));
    mkdirSync(join(root, "node_modules/broken"));
    writeFileSync(join(root, "node_modules/broken/package.json"), "{ not json");
    const unreadable = checkSecurityFloor(root).failures.join("\n");
    assert.match(unreadable, /next@undefined at node_modules\/next has no valid version/);
    assert.match(unreadable, /node_modules\/broken: package\.json could not be read/);
  });
});

test("security floor: plugin-rsc and next floors", () => {
  assert.match(check({ ...patched, "node_modules/@vitejs/plugin-rsc": "0.5.37" }).failures.join("\n"), /@vitejs\/plugin-rsc@0\.5\.37 .* below the security floor 0\.5\.38/);
  assert.match(check({ ...patched, "node_modules/next": "16.4.0" }).failures.join("\n"), /next@16\.4\.0 .* below the security floor 16\.4\.1/);
});

test("security floor: nested copies are found at any depth, including scoped packages", () => {
  const deep = `node_modules/${Array.from({ length: 8 }, (_, i) => `d${i}`).join("/node_modules/")}/node_modules/react-server-dom-webpack`;
  assert.match(check({ ...patched, [deep]: "19.2.8" }).failures.join("\n"), /react-server-dom-webpack@19\.2\.8 at node_modules\/d0\/node_modules\/d1\/.*\/d7\/node_modules\/react-server-dom-webpack is below/);
  const scoped = "node_modules/@scope/tool/node_modules/react-server-dom-turbopack";
  assert.match(check({ ...patched, [scoped]: "19.3.0" }).failures.join("\n"), /react-server-dom-turbopack@19\.3\.0 at node_modules\/@scope\/tool\/node_modules\/react-server-dom-turbopack is vulnerable/);
});

test("security floor: copies installed under an npm alias are checked", () => {
  const failures = check({
    ...patched,
    "node_modules/rsdw-legacy": "react-server-dom-webpack@19.3.0",
    "node_modules/tool/node_modules/rsc-flight": "react-server-dom-turbopack@19.2.8",
    "node_modules/next-old": "next@16.3.8",
  }).failures.join("\n");
  assert.match(failures, /react-server-dom-webpack@19\.3\.0 at node_modules\/rsdw-legacy \(installed as rsdw-legacy\) is vulnerable/);
  assert.match(failures, /react-server-dom-turbopack@19\.2\.8 at node_modules\/tool\/node_modules\/rsc-flight \(installed as rsc-flight\) is below/);
  assert.match(failures, /next@16\.3\.8 at node_modules\/next-old \(installed as next-old\) is below/);
});

test("security floor: nested react copies are reported but not asserted", () => {
  const { failures, notes } = check({ ...patched, "node_modules/dev-tool/node_modules/react": "18.3.1" });
  assert.deepEqual(failures, []);
  assert.ok(notes.some((note) => /react@18\.3\.1 at node_modules\/dev-tool\/node_modules\/react is nested and is below/.test(note)), notes.join("\n"));
});

test("security floor: link cycles terminate and each real package is checked once", { timeout: 10_000 }, () => {
  withFixture({ ...patched, "node_modules/linked": "1.0.0" }, (root) => {
    // Two back-links make node_modules/linked/node_modules/a/node_modules/b/... loop forever without a visited set.
    mkdirSync(join(root, "node_modules/linked/node_modules"));
    for (const name of ["a", "b"]) symlinkSync(join(root, "node_modules/linked"), join(root, "node_modules/linked/node_modules", name), "junction");
    // A second path to the same react-server-dom-webpack, and a node_modules directory linked back to the top.
    symlinkSync(join(root, "node_modules/react-server-dom-webpack"), join(root, "node_modules/linked/node_modules/react-server-dom-webpack"), "junction");
    mkdirSync(join(root, "node_modules/other"));
    symlinkSync(join(root, "node_modules"), join(root, "node_modules/other/node_modules"), "junction");
    const { failures, notes } = checkSecurityFloor(root);
    assert.deepEqual(failures, []);
    assert.equal(notes.filter((note) => note.startsWith("react-server-dom-webpack@")).length, 1);
  });
});

test("security floor: packages reached only through a link are checked", () => {
  withFixture({ ...patched, "vendor/flight": "react-server-dom-webpack@19.2.8" }, (root) => {
    mkdirSync(join(root, "node_modules/tool/node_modules"), { recursive: true });
    symlinkSync(join(root, "vendor/flight"), join(root, "node_modules/tool/node_modules/react-server-dom-webpack"), "junction");
    assert.match(checkSecurityFloor(root).failures.join("\n"), /react-server-dom-webpack@19\.2\.8 at node_modules\/tool\/node_modules\/react-server-dom-webpack is below/);
  });
});

test("security floor: vinext is asserted only with --require-vinext", () => {
  const tree = { ...patched, "node_modules/vinext": "0.0.50" };
  assert.deepEqual(check(tree).failures, []);
  assert.ok(check(tree).notes.some((note) => /vinext@0\.0\.50 at node_modules\/vinext is below the security floor 1\.2\.0; not asserted/.test(note)));
  assert.match(check(tree, { requireVinext: true }).failures.join("\n"), /vinext@0\.0\.50 .* below the security floor 1\.2\.0/);
});

test("security floor: command line exit codes and arguments", () => {
  withFixture(patched, (pass) =>
    withFixture({ ...patched, "node_modules/react": "19.3.0" }, (fail) => {
      const ok = cli(["--root", pass]);
      assert.equal(ok.status, 0, ok.stderr);
      assert.ok(ok.stdout.includes(`Security floor: PASS in ${pass}`), ok.stdout);
      const bad = cli(["--root", fail]);
      assert.equal(bad.status, 1, bad.stdout);
      assert.match(bad.stderr, /FAIL {2}react@19\.3\.0 at node_modules\/react is vulnerable/);
      assert.equal(cli([`--root=${fail}`]).status, 1);
      for (const args of [["--roots", fail], ["--root"], ["--root="], ["--require-vinext", "--root", "--require-vinext"]]) {
        const usage = cli(args);
        assert.equal(usage.status, 2, `${args.join(" ")}: ${usage.stdout}`);
        assert.match(usage.stderr, /Usage:/);
      }
    }),
  );
});

test("security floor: the command line also runs when started through a linked path", () => {
  withFixture({ ...patched, "node_modules/react": "19.3.0" }, (fail) => {
    // Link to a copy of the scripts, so fixture cleanup can never reach the real directory.
    const copy = join(fail, "scripts-copy");
    const link = join(fail, "scripts-link");
    mkdirSync(copy);
    for (const file of ["check-security-floor.mjs", "security-floor.mjs"]) copyFileSync(join(dirname(script), file), join(copy, file));
    symlinkSync(copy, link, "junction");
    const result = spawnSync(process.execPath, [join(link, "check-security-floor.mjs"), "--root", fail], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /react@19\.3\.0 at node_modules\/react is vulnerable/);
  });
});
