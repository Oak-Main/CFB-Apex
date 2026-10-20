import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function acquireWriterLock(path, token) {
  if (!token) throw new Error("An owner token is required");
  try { writeFileSync(path, JSON.stringify({token, acquired_at:new Date().toISOString()}), {flag:"wx"}); return true; }
  catch (error) { if (error.code === "EEXIST") return false; throw error; }
}
export function releaseWriterLock(path, token) {
  try {
    if (JSON.parse(readFileSync(path, "utf8")).token !== token) return false;
    unlinkSync(path);
    return true;
  } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, token] = process.argv.slice(2);
  if (!["acquire", "release"].includes(action) || !token) throw new Error("Usage: node scripts/weekly-writer-lock.mjs acquire|release OWNER_TOKEN");
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {encoding:"utf8"}).trim();
  const path = join(isAbsolute(common) ? common : resolve(common), "cfb-weekly-writer.lock");
  const ok = action === "acquire" ? acquireWriterLock(path, token) : releaseWriterLock(path, token);
  console.log(JSON.stringify({action, ok, path}));
  process.exitCode = ok ? 0 : 2;
}
