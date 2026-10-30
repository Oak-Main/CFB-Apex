import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { htmlText, htmlTables, ncaaInventory, isSourceEvidenceFresh } from "./gameday-source-validation.mjs";
import { reconcileGameDay } from "./reconcile-gameday.mjs";
const read = p => JSON.parse(readFileSync(p,"utf8"));
const write = (p,v) => writeFileSync(p,JSON.stringify(v,null,2)+"\n");
const basePath="data/cfb-2026/refresh/verified-refresh.json";
const snapshot=read(basePath);
assert.equal(snapshot.refresh_log.at(-1).script,"weekly-refresh-2026-10-28","Apply only to the reviewed October 28 baseline");
const evidence=read(snapshot.refresh_log.at(-1).evidence), audit=read(snapshot.full_season_review.evidence);
evidence.raw_sources.push({id:"school-isu-primer",url:"https://cyclones.com/news/2026/10/27/football-primer-iowa-state-vs-no-24-oklahoma-state"});
const docs=new Map(), receipts=new Map();
const sources=[...evidence.raw_sources,...audit.raw_sources];
for(let offset=0;offset<sources.length;offset+=6)await Promise.all(sources.slice(offset,offset+6).map(async row=>{
 const response=await fetch(row.url,{signal:AbortSignal.timeout(45000),headers:{"Cache-Control":"no-cache"}});
 assert.equal(response.status,200,row.id);
 const serverDate=response.headers.get("date"), age=response.headers.get("age"),body=await response.text();
 assert.ok(isSourceEvidenceFresh(serverDate,Date.now()),row.id+": stale HTTP Date");
 assert.ok(Number(age??0)<7200,row.id+": stale cache");
 docs.set(row.id,body);receipts.set(row.id,{...row,url:response.url,resolvedUrl:response.url,bytes:Buffer.byteLength(body),headers:Object.fromEntries([...response.headers].filter(([key])=>["date","age","content-type","etag","last-modified","cache-control"].includes(key))),status:200,checkedAt:new Date().toISOString(),serverDate,age,sha256:createHash("sha256").update(body).digest("hex")});
}));
const checkedAt=new Date().toISOString();
const original=read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
const ids=new Map(original.conferences.flatMap(c=>c.rows).map(r=>[r.id,r.slug]));
const prior=read("data/cfb-2026/refresh/evidence/2026-10-25-week9-preparation.json");
const events=Array.from({length:12},(_,i)=>i+20).flatMap(day=>JSON.parse(docs.get("day-"+day)).events);
assert.equal(events.length,112);assert.equal(new Set(events.map(e=>e.id)).size,112);
const official=ncaaInventory(docs.get("ncaa9"),2026,9);
assert.equal(official.length,56);
const planned=["401871058","401871057"], pending=["401862812","401869963"];
const oldIds=new Set(evidence.finals.map(r=>r.provider_id));
assert.deepEqual(new Set(events.filter(e=>e.competitions[0].status.type.completed&&!oldIds.has(e.id)).map(e=>e.id)),new Set(planned),"Unreviewed new final: collect and review another source audit");
const freshFinals=[];
for(const id of planned){
 const e=events.find(e=>e.id===id),c=e.competitions[0];
 const schedule=evidence.schedule.find(r=>r.provider_id===id);assert.ok(schedule);
 const n=official.find(r=>r.contestId===prior.schoolEvidence.find(s=>s.id===id)?.ncaa.contestId);
 assert.ok(n);assert.equal(n.gameState,"F");assert.equal(c.status.type.completed,true);assert.equal(c.status.type.state,"post");
 const home=c.competitors.find(t=>t.homeAway==="home"),away=c.competitors.find(t=>t.homeAway==="away");
 assert.equal(ids.get(home.team.id),schedule.home);assert.equal(ids.get(away.team.id),schedule.away);
 assert.equal(n.teams.find(t=>t.isHome).score,Number(home.score));assert.equal(n.teams.find(t=>!t.isHome).score,Number(away.score));
 const lines=Object.fromEntries(c.competitors.map(t=>[ids.get(t.team.id),t.linescores.map(q=>q.value)]));
 for(const t of c.competitors)assert.equal(lines[ids.get(t.team.id)].reduce((a,b)=>a+b,0),Number(t.score));
 const gameId=schedule.game_id??schedule.date+"-"+schedule.away+"-at-"+schedule.home;
 const full={checked_at:checkedAt,provider_id:id,ncaa_contest_id:n.contestId,source_urls:[schedule.source_url,"https://www.ncaa.com"+n.url],line_score:lines,state:c.status.type,ncaa_status:n.gameState,listed_kickoff_observations:{espn:e.date,ncaa:new Date(n.startTimeEpoch*1000).toISOString(),actual_start:null}};
 freshFinals.push({provider_id:id,source_url:schedule.source_url,game_id:gameId,date:schedule.date,kickoff_utc:schedule.kickoff_utc,week:9,home_slug:schedule.home,away_slug:schedule.away,site:c.venue?.fullName??null,tv:schedule.tv,neutral_site:c.neutralSite===true,verified_at:checkedAt,title:c.status.type.detail,teams:c.competitors.map(t=>({slug:ids.get(t.team.id),points:Number(t.score),name:t.team.displayName})),meta:{as_of:schedule.date,sources:full.source_urls,conference_game:c.conferenceCompetition,line_score:lines,reviewed_status:{espn:c.status.type,ncaa:n.gameState},listed_kickoff_observations:full.listed_kickoff_observations,full_season_review:full}});
 audit.finals.push({provider_id:id,date:schedule.date,week:9,home_slug:schedule.home,away_slug:schedule.away,home_name:home.team.location,away_name:away.team.location,home_conference_id:home.team.conferenceId,away_conference_id:away.team.conferenceId,home_score:Number(home.score),away_score:Number(away.score),state:c.status.type,period:c.status.period,line_score:lines,kickoff_utc:e.date,neutral_site:c.neutralSite===true,site:c.venue?.fullName??null,tv:schedule.tv,ncaa_contest_id:n.contestId,ncaa_url:"https://www.ncaa.com"+n.url,ncaa_listed_kickoff_utc:full.listed_kickoff_observations.ncaa,ncaa_status:n.gameState,ncaa_teams:n.teams,source_url:schedule.source_url,existing_game_id:gameId});
}
evidence.finals.push(...freshFinals);
evidence.schedule=evidence.schedule.filter(r=>!planned.includes(r.provider_id));
for(const row of evidence.schedule){
 const c=events.find(e=>e.id===row.provider_id).competitions[0];assert.equal(c.status.type.completed,false);
 assert.ok(["pre","in"].includes(c.status.type.state),"Unreviewed cancellation/delay");
 row.verified_at=checkedAt;
 if(Date.parse(row.kickoff_utc)<Date.now()){
  assert.ok(pending.includes(row.provider_id),"Unreviewed past kickoff");
  row.result_pending_review=true;row.observed_provider_state=c.status.type.state;
  row.result_note="Kickoff passed; result not yet verified. No provisional score is published.";
 }
}
const isu=evidence.schedule.find(r=>r.provider_id==="401856847");
const isuText=htmlText(docs.get("school-isu-primer"));
assert.ok(isuText.includes("PRIMER: Iowa State vs. No. 24 Oklahoma State"));
assert.ok(isuText.includes("Kickoff is set for 6 p.m. on FOX"));
assert.ok(isuText.includes("Saturday, Oct. 31, 2026"));
isu.tv="Fox";
isu.tv_override={source_id:"school-isu-primer",published_at:"2026-10-27",observed_text:"Kickoff is set for 6 p.m. on FOX",prior_tv:"FS1",note:"Newer school primer and current provider say FOX; older NCAA TV article and October 19 school announcement still say FS1. Preserve this conflict rather than silently rewriting the earlier evidence."};
isu.source_urls.push(receipts.get("school-isu-primer").url);
const records={},conferenceRecords={};
const entries=JSON.parse(docs.get("espn-standings")).children.flatMap(c=>c.standings?.entries??c.children?.flatMap(x=>x.standings?.entries??[])??[]);
for(const row of entries){const slug=ids.get(row.team.id);assert.ok(slug);records[slug]=row.stats.find(s=>s.type==="total").summary;conferenceRecords[slug]=row.stats.find(s=>s.type==="vsconf").summary;}
assert.equal(Object.keys(records).length,138);
assert.deepEqual(Object.keys(records).filter(s=>records[s]!==snapshot.teamRecords[s]).sort(),["jacksonville-state","kennesaw-state","middle-tennessee","new-mexico-state"]);
for(const r of evidence.primaryRecords){r.overall=records[r.slug];r.conference=conferenceRecords[r.slug];}
evidence.records=records;evidence.conferenceRecords=conferenceRecords;
evidence.raw_sources=evidence.raw_sources.map(r=>receipts.get(r.id));
evidence.cutoff_utc=checkedAt;
evidence.scope="October 29 revalidation: four Week 9 finals, two result-pending fixtures, 50 future fixtures; no live scores inferred";
evidence.counts={...evidence.counts,week9Finals:4,week9Upcoming:52,week9ResultPending:2};
evidence.inventories[9]={...evidence.inventories[9],finals:4,upcoming:52,result_pending:2};
for(const [index,id,column] of [[0,"stat-passing","Pass Yds"],[1,"stat-rushing","Rush Yds"],[2,"stat-scoring","PPG"],[3,"stat-defense","Avg"]]){
 const html=docs.get(id),text=htmlText(html),label=text.match(/Through games [A-Za-z]+, [A-Za-z]+ \d{1,2}, 2026/)?.[0];assert.ok(label);
 const through=new Date(label.slice("Through games ".length)+" 12:00:00 UTC").toISOString().slice(0,10);
 const table=htmlTables(html)[0],header=table[0],category=snapshot.metrics.categories[index];
 category.rows=table.slice(1,6).map(r=>({name:r[header.indexOf("Name")]??r[header.indexOf("Team")],team:r[header.indexOf("Team")],value:Number(r[header.indexOf(column)])}));
 assert.ok(category.rows.every(r=>r.name&&r.team&&Number.isFinite(r.value)));
 Object.assign(category,{through_games:through,through_games_label:label,verified_at:receipts.get(id).checkedAt});
}
snapshot.metrics.through_games=snapshot.metrics.categories.map(c=>c.through_games).sort()[0];snapshot.metrics.verified_at=checkedAt;evidence.metrics=snapshot.metrics;
let next=reconcileGameDay(snapshot,{finals:freshFinals,scheduled:evidence.schedule,scheduleWeeks:[9],records,conferenceRecords,observedAt:checkedAt});
for(const row of next.playedGames){row.verified_at=checkedAt;if(row.meta?.full_season_review)row.meta.full_season_review.checked_at=checkedAt;}
for(const row of evidence.finals)row.verified_at=checkedAt;
const evidencePath="data/cfb-2026/refresh/evidence/2026-10-29-week9-refresh.json",auditPath="data/cfb-2026/refresh/evidence/2026-10-29-full-season-audit.json";
audit.raw_sources=audit.raw_sources.map(r=>receipts.get(r.id));audit.data_cutoff_utc=checkedAt;audit.verification_completed_at=checkedAt;
Object.assign(audit.counts,{completed:570,upcoming:52,fbs_finals:448});
audit.record_reconciliation="All 138 whole-team records reconcile against 570 independently matched finals; in-progress scores are withheld.";
Object.assign(next,{retrieved_at:checkedAt,schedule_verified_at:checkedAt,records_verified_at:checkedAt,results_verified_at:checkedAt});
next.baseline_note=evidence.scope+". Historical editorial modules retain their independent source dates.";
next.holds=next.holds.map(t=>t.startsWith("No continuous live")?"No continuous live scoring feed is asserted. Week 8 has 56 finals; Week 9 has four finals, two result-pending fixtures and 50 future fixtures. Pending scores are withheld.":t.startsWith("National leader")?"National leader cards use their independently dated NCAA tables; detailed team/player tables retain their original sample date.":t);
next.team_records_review.as_of=checkedAt;
next.full_season_review={...next.full_season_review,checked_at:checkedAt,through_games:checkedAt,completed:570,fbs_finals:448,evidence:auditPath,note:"All nine NCAA inventories and 71 provider calendar days revalidated. Two October 28 finals added; historical canonical IDs and aliases preserved. In-progress games are excluded from final totals."};
for(const board of next.board_weeks.filter(w=>w.week===8||w.week===9)){board.records_verified_at=checkedAt;board.results_verified_at=checkedAt;if(board.week===9){board.schedule_verified_at=checkedAt;board.retrieved_at=checkedAt;board.note=evidence.scope;}}
next.refresh_log.push({script:"weekly-refresh-2026-10-29",applied_at:checkedAt,evidence_checked_at:checkedAt,evidence:evidencePath,scope:evidence.scope});
write(evidencePath,evidence);write(auditPath,audit);write(basePath,next);
console.log("STAGED_REVIEW="+JSON.stringify({checkedAt,finals:freshFinals.map(r=>({id:r.provider_id,scores:r.teams})),records:Object.fromEntries(["jacksonville-state","kennesaw-state","middle-tennessee","new-mexico-state"].map(s=>[s,records[s]])),counts:audit.counts,metrics:snapshot.metrics.categories.map(c=>({name:c.name,through:c.through_games,rows:c.rows}))}));
