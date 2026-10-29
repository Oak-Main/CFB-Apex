import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkSecurityFloor, reactVersionProblem } from "../scripts/check-security-floor.mjs";

const script = fileURLToPath(new URL("../scripts/check-security-floor.mjs", import.meta.url));
const patched: Record<string, string> = {
  "node_modules/react": "19.2.9",
  "node_modules/react-dom": "19.2.9",
  "node_modules/react-server-dom-webpack": "19.2.9",
  "node_modules/@vitejs/plugin-rsc": "0.5.38",
  "node_modules/next": "16.4.3",
};

/** Synthetic install: each key is a package directory relative to the fixture root. */
function fixture(packages: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "security-floor-"));
  for (const [dir, version] of Object.entries(packages)) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: dir.split("node_modules/").at(-1), version }));
  }
  return root;
}

function check(packages: Record<string, string>, options: { requireVinext?: boolean } = {}) {
  const root = fixture(packages);
  try {
    return checkSecurityFloor(root, options);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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

test("security floor: missing packages fail", () => {
  const rest = Object.fromEntries(Object.entries(patched).filter(([dir]) => dir !== "node_modules/react-server-dom-webpack" && dir !== "node_modules/react"));
  const failures = check(rest).failures.join("\n");
  assert.match(failures, /react-server-dom-webpack: not installed/);
  assert.match(failures, /react: not installed/);
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

test("security floor: nested react copies are reported but not asserted", () => {
  const { failures, notes } = check({ ...patched, "node_modules/dev-tool/node_modules/react": "18.3.1" });
  assert.deepEqual(failures, []);
  assert.ok(notes.some((note) => /react@18\.3\.1 at node_modules\/dev-tool\/node_modules\/react is nested and is below/.test(note)), notes.join("\n"));
});

test("security floor: a symlink cycle terminates and linked packages are checked once", () => {
  const root = fixture({ ...patched, "node_modules/linked": "1.0.0" });
  try {
    // node_modules/linked/node_modules/loop -> <root>/node_modules (a cycle back to the top).
    mkdirSync(join(root, "node_modules/linked/node_modules"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(root, "node_modules/linked/node_modules/loop"), "junction");
    const { failures, notes } = checkSecurityFloor(root);
    assert.deepEqual(failures, []);
    assert.equal(notes.filter((note) => note.startsWith("react-server-dom-webpack@")).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("security floor: vinext is asserted only with --require-vinext", () => {
  const tree = { ...patched, "node_modules/vinext": "0.0.50" };
  assert.deepEqual(check(tree).failures, []);
  assert.ok(check(tree).notes.some((note) => /vinext@0\.0\.50 is below 1\.2\.0; not asserted/.test(note)));
  assert.match(check(tree, { requireVinext: true }).failures.join("\n"), /vinext@0\.0\.50 .* below the security floor 1\.2\.0/);
});

test("security floor: command-line exit codes", () => {
  const pass = fixture(patched);
  const fail = fixture({ ...patched, "node_modules/react": "19.3.0" });
  try {
    const ok = spawnSync(process.execPath, [script, "--root", pass], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Security floor: PASS/);
    const bad = spawnSync(process.execPath, [script, "--root", fail], { encoding: "utf8" });
    assert.equal(bad.status, 1, bad.stdout);
    assert.match(bad.stderr, /FAIL {2}react@19\.3\.0 at node_modules\/react is vulnerable/);
  } finally {
    rmSync(pass, { recursive: true, force: true });
    rmSync(fail, { recursive: true, force: true });
  }
});
