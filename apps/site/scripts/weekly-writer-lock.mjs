import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function acquireWriterLock(path, token, owner = process.env.CODEX_THREAD_ID ?? "unspecified") {
  if (!token) throw new Error("An owner token is required");
  try { writeFileSync(path, JSON.stringify({token, owner, acquired_at:new Date().toISOString()}), {flag:"wx"}); return true; }
  catch (error) { if (error.code === "EEXIST") return false; throw error; }
}
export function releaseWriterLock(path, token) {
  try {
    if (JSON.parse(readFileSync(path, "utf8")).token !== token) return false;
    unlinkSync(path);
    return true;
  } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
/** Operator recovery only after verifying the recorded owner has stopped. */
export function recoverWriterLock(path, token, {ownerStopped, expectedOwner, reason}) {
  if (!ownerStopped || !expectedOwner || !reason?.trim()) return null;
  try {
    const prior = JSON.parse(readFileSync(path, "utf8"));
    if (prior.token !== token || prior.owner !== expectedOwner) return null;
    const archive = `${path}.recovered-${randomUUID()}.json`;
    renameSync(path, archive);
    writeFileSync(archive, JSON.stringify({...prior,recovered_at:new Date().toISOString(),recovery_reason:reason,verified_owner_stopped:true}));
    return archive;
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, token, ...flags] = process.argv.slice(2);
  if (!["acquire", "release", "inspect", "recover"].includes(action) || action !== "inspect" && !token) throw new Error("Usage: acquire|release TOKEN; inspect; recover OLD_TOKEN --owner OWNER --owner-stopped --reason REASON");
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {encoding:"utf8"}).trim();
  const path = join(isAbsolute(common) ? common : resolve(common), "cfb-weekly-writer.lock");
  if (action === "inspect") { console.log(readFileSync(path,"utf8")); process.exit(0); }
  const owner = flags[flags.indexOf("--owner") + 1];
  const reason = flags[flags.indexOf("--reason") + 1];
  const result = action === "acquire" ? acquireWriterLock(path, token, flags.includes("--owner") ? owner : undefined) : action === "release" ? releaseWriterLock(path, token) : recoverWriterLock(path, token, {ownerStopped:flags.includes("--owner-stopped"),expectedOwner:flags.includes("--owner") ? owner : null,reason:flags.includes("--reason") ? reason : null});
  const ok = Boolean(result);
  console.log(JSON.stringify({action, ok, path, ...(typeof result === "string" ? {archive:result} : {})}));
  process.exitCode = ok ? 0 : 2;
}
