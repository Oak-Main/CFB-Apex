import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gameDaySnapshot } from "../lib/gameday-shared.ts";
import { boardWeeks, games } from "../lib/cfb-dataset.ts";
import { easternDate } from "../lib/game-calendar.ts";
import { injuryResearch } from "../lib/injury-report.ts";
import { acquireWriterLock, recoverWriterLock, releaseWriterLock } from "../scripts/weekly-writer-lock.mjs";

const now = Date.parse("2026-10-20T22:00Z");
test("repository writers cannot acquire or release another owner's lock", () => {
  const scratch = mkdtempSync(join(tmpdir(), "cfb-writer-"));
  const path = join(scratch, "writer.lock");
  try {
    assert.equal(acquireWriterLock(path, "first"), true);
    assert.equal(acquireWriterLock(path, "second"), false);
    assert.equal(releaseWriterLock(path, "second"), false);
    assert.equal(releaseWriterLock(path, "first"), true);
    assert.equal(acquireWriterLock(path, "second"), true);
    assert.equal(releaseWriterLock(path, "second"), true);
  } finally { rmSync(scratch, {recursive:true,force:true}); }
});
test("crashed writer recovery requires stopped-owner verification, exact owner/token and a reason", () => {
  const scratch = mkdtempSync(join(tmpdir(), "cfb-recovery-"));
  const path = join(scratch,"writer.lock");
  try {
    assert.equal(acquireWriterLock(path,"old","owner-a"),true);
    const verified = {ownerStopped:true,expectedOwner:"owner-a",reason:"Recorded owner run is confirmed stopped"};
    assert.equal(recoverWriterLock(path,"old",{...verified,ownerStopped:false}),null);
    assert.equal(recoverWriterLock(path,"wrong",verified),null);
    assert.equal(recoverWriterLock(path,"old",{...verified,expectedOwner:"owner-b"}),null);
    assert.equal(recoverWriterLock(path,"old",{...verified,reason:""}),null);
    const archive = recoverWriterLock(path,"old",verified);
    assert.ok(archive);
    assert.equal(JSON.parse(readFileSync(archive,"utf8")).token,"old");
    assert.equal(acquireWriterLock(path,"new","owner-b"),true);
    assert.equal(releaseWriterLock(path,"old"),false);
    assert.equal(releaseWriterLock(path,"new"),true);
  } finally { rmSync(scratch,{recursive:true,force:true}); }
});
test("shared feed follows reviewed cutovers and preserves all archive games", () => {
  for (const row of boardWeeks) {
    const snapshot = gameDaySnapshot(now, String(row.week));
    assert.equal(snapshot.selectedWeek, row.week);
    assert.equal(snapshot.explicit, true);
    assert.equal(snapshot.games.length, games.filter(g => g.week === row.week).length);
    assert.deepEqual(snapshot.games.map(g => g.id), games.filter(g => g.week === row.week).map(g => g.id));
    assert.ok(snapshot.previousFinals.every(g => g.week < row.week && g.status === "final"));
  }
  assert.equal(gameDaySnapshot(Date.parse("2026-10-18T12:59:59Z")).selectedWeek, 7);
  const current = gameDaySnapshot(now);
  assert.equal(current.selectedWeek, 8);
  assert.equal(current.games.length, 56);
  assert.equal(current.previousFinals.length, 59);
  assert.ok(current.games.every(g => Date.parse(g.date) && /^\d{4}-\d{2}-\d{2}$/.test(easternDate(g.date))));
});

test("shared revision is deterministic and module source times do not follow request time", () => {
  const first = gameDaySnapshot(now);
  const later = gameDaySnapshot(now + 60_000);
  assert.match(first.revision, /^[a-f0-9]{64}$/);
  assert.equal(first.revision, later.revision);
  assert.notEqual(first.serverNow, later.serverNow);
  assert.deepEqual(first.sourceDates, later.sourceDates);
  assert.equal(first.polls[0].release_date, "2026-10-18");
  assert.equal(first.teams.length, 138);
  assert.ok(first.teams.every(t => t.record && t.logo));
  const ids = new Set(first.teams.map(t => t.slug));
  assert.ok([...first.games, ...first.previousFinals].every(g => ids.has(g.homeTeamId) && ids.has(g.awayTeamId)));
  const forbidden = /^(?:odds|spread|total|moneyline|spPlus|fpi|apiKey|secret|privateConfig|practice|likelihood)$/i;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.test(key), key); visit(child); }
  };
  visit(first);
});

test("Singleton official Questionable is source-matched and never becomes inferred clearance", () => {
  const evidence = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-20-week8-official-followup.json", import.meta.url), "utf8"));
  const official = injuryResearch.officialReports.find(r => r.player === evidence.tracked_player.name);
  assert.ok(official);
  assert.equal(official.status, evidence.tracked_player.status);
  assert.equal(official.game_date, evidence.game.dateISO);
  assert.equal(official.published_at, evidence.game.updatedAtUTC);
  assert.equal(official.retrieved_at, evidence.checked_at);
  assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.ok(games.some(g => g.week === 8 && easternDate(g.date) === official.game_date && g.homeTeamId === official.team_slug && g.awayTeamId === "james-madison"));
  const watch = injuryResearch.watch.find(r => r.player === official.player);
  assert.match(watch?.reportedStatus ?? "", /Official Questionable/);
  assert.equal(watch?.likelihood, null);
  assert.ok(Object.values(watch?.practice ?? {}).every(v => v == null));
  assert.equal(injuryResearch.watch.find(r => r.player === "Khobie Martin")?.reportedStatus, "Week 8 return unconfirmed");
});

test("ingestion rejects invalid, undated, duplicate and unknown-team official rows", () => {
  const doc = JSON.parse(readFileSync(new URL("../data/injury-research/current.json", import.meta.url), "utf8"));
  const script = fileURLToPath(new URL("../scripts/ingest-injury-research.mjs", import.meta.url));
  const scratch = mkdtempSync(join(tmpdir(), "cfb-official-"));
  try {
    for (const patch of [{status:"Likely cleared"}, {game_date:"2026-02-30"}, {published_at:null}, {team_slug:"unverified-team"}, {team_slug:"texas"}, {game_id:"wrong-game"}, {game_date:"2026-10-17"}, {matchup:"Appalachian State at James Madison"}, {source_url:"http://example.com"}, {source_url:"https://"}]) {
      const path = join(scratch, "invalid.json");
      writeFileSync(path, JSON.stringify({...doc, official_reports:[{...doc.official_reports[0], ...patch}]}));
      const result = spawnSync(process.execPath, [script, path, "--check"], {encoding:"utf8"});
      assert.notEqual(result.status, 0, JSON.stringify(patch));
    }
    const duplicate = join(scratch, "duplicate.json");
    writeFileSync(duplicate, JSON.stringify({...doc, official_reports:[doc.official_reports[0],doc.official_reports[0]]}));
    assert.notEqual(spawnSync(process.execPath, [script, duplicate, "--check"]).status, 0);
  } finally { rmSync(scratch, {recursive:true,force:true}); }
});

test("dataset build rejects a directly edited malformed official row before generating output", () => {
  const source = new URL("../",import.meta.url);
  const scratch = mkdtempSync(join(tmpdir(),"cfb-invalid-build-"));
  try {
    for (const dir of ["scripts","lib","data/cfb-2026/refresh","data/injury-research"]) mkdirSync(join(scratch,dir),{recursive:true});
    for (const path of ["scripts/build-dataset.mjs","lib/injury-freshness.mjs","lib/official-availability-validation.mjs","data/cfb-2026/teams.json","data/cfb-2026/refresh/verified-refresh.json"]) copyFileSync(new URL(path,source),join(scratch,path));
    const doc=JSON.parse(readFileSync(new URL("data/injury-research/current.json",source),"utf8"));
    doc.official_reports[0].status="Fabricated cleared";
    writeFileSync(join(scratch,"data/injury-research/current.json"),JSON.stringify(doc));
    const result=spawnSync(process.execPath,[join(scratch,"scripts/build-dataset.mjs")],{encoding:"utf8"});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Invalid official availability report/);
    assert.doesNotMatch(result.stderr,/ENOENT/);
  } finally { rmSync(scratch,{recursive:true,force:true}); }
});
