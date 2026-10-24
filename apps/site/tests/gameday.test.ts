import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gameDaySnapshot, isReviewedGameDayRefresh, publicGame } from "../lib/gameday-shared.ts";
import { heismanWeekCopy, reportingWeekLabel } from "../lib/editorial-week-copy.ts";
import { parseWeekParam, selectBoardWeek } from "../lib/week-cutover.ts";
import { boardWeeks, games } from "../lib/cfb-dataset.ts";
import { easternDate } from "../lib/game-calendar.ts";
import { injuryResearch, officialAvailabilityNote } from "../lib/injury-report.ts";
import { acquireWriterLock, recoverWriterLock, releaseWriterLock } from "../scripts/weekly-writer-lock.mjs";

const now = Date.parse("2026-10-20T22:00Z");

test("week copy preserves zero, null fallbacks and the actual statistics week", () => {
  assert.equal(reportingWeekLabel(0), "Week 0");
  assert.equal(reportingWeekLabel(null), "weekly");
  assert.deepEqual(heismanWeekCopy(0, []), {watch:"Week 0",statistics:"dated"});
  assert.deepEqual(heismanWeekCopy(null, ["Week 1: reviewed statistics"]), {watch:"Week 2",statistics:"Week 1"});
  assert.deepEqual(heismanWeekCopy(9, ["Week 7: reviewed statistics"]), {watch:"Week 9",statistics:"Week 7"});
  assert.equal(heismanWeekCopy(8, ["Week 7: first", "Week 6: second"]).statistics, "dated");
  const weeks = [{week:0,cutover_utc:"2026-08-20T00:00Z"},{week:1,cutover_utc:"2026-08-30T00:00Z"}];
  assert.equal(parseWeekParam("0", weeks), 0);
  assert.deepEqual(selectBoardWeek(weeks, now, "0"), {week:0,serverNow:now,explicit:true});
});

test("elapsed scheduled kickoffs stay unconfirmed and zero final scores survive projection", () => {
  const scheduled = games.find(game => game.status === "scheduled");
  assert.ok(scheduled);
  const before = publicGame(scheduled, Date.parse(scheduled.date) - 1);
  const after = publicGame(scheduled, Date.parse(scheduled.date) + 1);
  assert.equal(before.status, "scheduled");
  assert.equal(after.status, "scheduled");
  assert.equal(after.homeScore, null);
  assert.equal(after.awayScore, null);
  assert.match(after.statusDetail ?? "", /result not yet verified/);
  assert.equal(publicGame({...scheduled,status:"final",homeScore:0,awayScore:7}, now).homeScore, 0);
});

test("Command Center rejects malformed or wrong-archive refreshes, including Week 0 overrides", () => {
  const snapshot = gameDaySnapshot(now);
  assert.equal(snapshot.season, 2026);
  assert.equal(isReviewedGameDayRefresh(snapshot, null), true);
  assert.equal(isReviewedGameDayRefresh(snapshot, 7), false);
  assert.equal(isReviewedGameDayRefresh({...snapshot,revision:"broken"}, null), false);
  assert.equal(isReviewedGameDayRefresh(null, null), false);
  const zero = {...snapshot,selectedWeek:0,weeks:[{...snapshot.weeks[0],week:0}],games:[]};
  assert.equal(isReviewedGameDayRefresh(zero, 0), true);
  assert.equal(isReviewedGameDayRefresh(snapshot, 0), false);
  assert.equal(snapshot.sourceDates.previousResults, boardWeeks.find(row=>row.week===7)?.results_verified_at);
});
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

test("October 22 official updates match retained sources while prior Singleton history and unknowns remain intact", () => {
  const evidence = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-22-week8-official-followup.json", import.meta.url), "utf8"));
  assert.equal(injuryResearch.officialReports.length, 6);
  assert.equal(evidence.previous_official_reports[0].status, "Questionable");
  for (const source of evidence.source_json) assert.equal(createHash("sha256").update(source.raw).digest("hex"), source.sha256);
  for (const source of evidence.public_boards) assert.equal(createHash("sha256").update(source.ax).digest("hex"), source.sha256);
  for (const official of injuryResearch.officialReports) {
    assert.deepEqual(official, evidence.verified_updates.find((row: {player: string}) => row.player === official.player));
    assert.ok(games.some(g => g.id === official.game_id && g.week === 8 && easternDate(g.date) === official.game_date && [g.homeTeamId,g.awayTeamId].includes(official.team_slug)));
    const jsonSource=evidence.source_json.find((row: {url: string})=>row.url===official.source_url);
    if(jsonSource){
      const game=JSON.parse(jsonSource.raw).games.find((g: {gameId: string})=>g.gameId===official.report_id);
      const sides=[game.home,game.away];
      const player=sides.flatMap(side=>side.players).find((p: {name: string})=>p.name.trim()===official.player);
      assert.equal(player.status,official.status);assert.equal(player.position,official.position);
      assert.equal(game.dateISO,official.game_date);assert.equal(game.updatedAtUTC,official.published_at);
      assert.equal(game.notes,official.report_type);assert.equal(jsonSource.retrieved_at,official.retrieved_at);
    } else {
      const board=evidence.public_boards.find((row: {url: string})=>row.url===official.source_url);
      assert.ok(board, `Missing public board for ${official.player}`);
      const blocks=board.ax.split(official.conference==="Big Ten" ? /\d+ text AVAILABILITY REPORT/ : /\d+ heading Initial Report/).slice(1);
      const block=blocks.find((text: string)=>text.includes(official.player));
      assert.ok(block, `Missing matching report block for ${official.player}`);
      for(const team of official.matchup.split(" at ")) assert.ok(block.includes(`image ${team}\n`) || block.includes(`heading ${team}, Value: 3`), `Missing matchup team ${team}`);
      assert.match(block,/October 24|Oct\. 24/);
      const line=block.split("\n").find((text: string)=>text.includes(`${official.position} #${official.jersey} ${official.player}`));
      assert.ok(line, `Missing source player/position/jersey for ${official.player}`);
      const beforePlayer=line.slice(0,line.indexOf(`${official.position} #${official.jersey} ${official.player}`));
      const groups=[...beforePlayer.matchAll(/\b(Out|Doubtful|Questionable|Probable|Available)\b/gi)];
      assert.equal(groups.at(-1)?.[1].toLowerCase(),official.status.toLowerCase());
      assert.equal(board.retrieved_at,official.retrieved_at);
      if(official.conference==="Big Ten") {
        assert.match(block,/INITIAL REPORT 10\/21\/26/);
        assert.equal(official.published_at,"2026-10-21");
      } else {
        assert.match(block,/posted\s+7:10pm CT\s+on\s+Wednesday, Oct\. 21/);
        assert.equal(official.published_at,"2026-10-22T00:10:00Z");
      }
    }
    const watch=injuryResearch.watch.find(r=>r.player===official.player);
    assert.ok(watch?.reportedStatus?.includes(`Official ${official.status}`));
    assert.equal(watch?.likelihood,null);assert.ok(Object.values(watch?.practice??{}).every(v=>v==null));
  }
  assert.equal(injuryResearch.officialReports.find(r=>r.player==="Malachi Singleton")?.status,"Available");
  assert.equal(injuryResearch.officialReports.find(r=>r.player==="Dante Moore")?.status,"Out");
  for(const row of injuryResearch.officialReports.filter(r=>r.conference==="Big Ten")){
    assert.equal(row.published_at,"2026-10-21");assert.equal(row.publication_precision,"date");
    assert.match(officialAvailabilityNote(row),/date only; exact time not published/);
    assert.doesNotMatch(officialAvailabilityNote(row),/00:00/);
  }
  assert.equal(injuryResearch.watch.find(r => r.player === "Khobie Martin")?.reportedStatus, "Week 8 return unconfirmed");
  assert.ok(!injuryResearch.officialReports.some(r=>["Khobie Martin","AJ Bianco","Carter Jones","Noah Kim","Julian Sayin"].includes(r.player)));
});

test("ingestion rejects invalid, undated, duplicate and unknown-team official rows", () => {
  const doc = JSON.parse(readFileSync(new URL("../data/injury-research/current.json", import.meta.url), "utf8"));
  const script = fileURLToPath(new URL("../scripts/ingest-injury-research.mjs", import.meta.url));
  const scratch = mkdtempSync(join(tmpdir(), "cfb-official-"));
  try {
    for (const patch of [{status:"Likely cleared"}, {game_date:"2026-02-30"}, {published_at:null}, {published_at:"2026-10-22T14:37:43"}, {retrieved_at:"2026-10-22T18:58:29"}, {retrieved_at:"2026-10-22T11:58:29-07:00"}, {published_at:"2026-02-30T12:00:00Z"}, {published_at:"2026-10-21"}, {publication_precision:"date"}, {publication_precision:"unknown"}, {published_at:"2026-02-30",publication_precision:"date"}, {published_at:"2026-10-23",publication_precision:"date"}, {retrieved_at:"2026-10-22"}, {team_slug:"unverified-team"}, {team_slug:"texas"}, {game_id:"wrong-game"}, {game_date:"2026-10-17"}, {matchup:"Appalachian State at James Madison"}, {source_url:"http://example.com"}, {source_url:"https://"}]) {
      const path = join(scratch, "invalid.json");
      writeFileSync(path, JSON.stringify({...doc, official_reports:[{...doc.official_reports[0], ...patch}]}));
      const result = spawnSync(process.execPath, [script, path, "--check"], {encoding:"utf8"});
      assert.notEqual(result.status, 0, JSON.stringify(patch));
    }
    const duplicate = join(scratch, "duplicate.json");
    writeFileSync(duplicate, JSON.stringify({...doc, official_reports:[doc.official_reports[0],doc.official_reports[0]]}));
    assert.notEqual(spawnSync(process.execPath, [script, duplicate, "--check"]).status, 0);
    const dated=join(scratch,"date-only.json");
    writeFileSync(dated,JSON.stringify({...doc,official_reports:doc.official_reports.filter((r: {publication_precision?: string})=>r.publication_precision==="date")}));
    assert.equal(spawnSync(process.execPath,[script,dated,"--check"],{encoding:"utf8"}).status,0);
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
