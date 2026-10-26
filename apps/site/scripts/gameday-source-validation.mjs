import assert from "node:assert/strict";
import { parse } from "parse5";

function textContent(node) {
  if (["script", "style", "noscript"].includes(node.nodeName)) return "";
  return node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textContent).join(" ");
}

export function htmlText(html) {
  return textContent(parse(html)).replace(/\s+/g, " ").trim();
}

export function ncaaInventory(html, season, week) {
  let script;
  function find(node) {
    if (node.nodeName === "script" && node.attrs.some(attr => attr.value === "drupal-settings-json")) script ??= node;
    for (const child of node.childNodes ?? []) find(child);
  }
  find(parse(html));
  assert.ok(script, "NCAA scoreboard settings missing");
  let board;
  function visit(value) { if (!value || typeof value !== "object") return; if (value.initialGames) board = value; Object.values(value).forEach(visit); }
  visit(JSON.parse(script.childNodes.map(node => node.value ?? "").join("")));
  assert.equal(Number(board?.seasonYear), season);
  assert.equal(Number(board.currentDate.week), week);
  return board.initialGames;
}

export function sourceScheduleStatus(name) {
  assert.equal(typeof name, "string", "Missing source schedule status");
  if (/postpon/i.test(name)) return "postponed";
  if (/cancel/i.test(name)) return "canceled";
  if (/delay/i.test(name)) return "delayed";
  assert.ok(/schedul|time_tbd/i.test(name), `Unsupported source schedule status: ${name}`);
  return "scheduled";
}

export function schoolBlocks(html, day, opponents) {
  const found = [], date = new RegExp(`Oct(?:ober)?\\.?\\s*${day}\\b`, "i");
  function walk(node) {
    if (["script", "style", "noscript"].includes(node.nodeName)) return "";
    const own = node.nodeName === "#text" ? node.value : (node.attrs ?? []).filter(a => ["alt", "aria-label", "title"].includes(a.name) || (node.nodeName === "img" && ["src", "data-src"].includes(a.name))).map(a => decodeURIComponent(a.value)).join(" ");
    const value = `${own} ${(node.childNodes ?? []).map(walk).join(" ")}`.replace(/\s+/g, " ").trim();
    const dates = new Set([...value.matchAll(/\b(Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?)\.?\s+(\d{1,2})\b/gi)].map(m => m[1].slice(0, 3).toLowerCase() + Number(m[2])));
    if (value.length < 6000 && dates.size === 1 && date.test(value) && opponents.some(name => value.toLowerCase().includes(name.toLowerCase()))) found.push(value);
    return value;
  }
  walk(parse(html));
  return [...new Set(found)].sort((a, b) => a.length - b.length);
}

export function tvPattern(tv) {
  const names = { CBSSN: "CBS Sports Network|CBSSN", CW: "The CW|\\bCW\\b", Fox: "\\bFOX\\b", BTN: "BTN|Big Ten Network|B1G", "USA Net": "USA Network|USA_Network|USA Net", "MW+": "MW\\+|Mountain West Network|MW Network", "ESPN+": "ESPN\\+|ESPN Plus|ESPNPlus|ESPN__" };
  return new RegExp(Object.hasOwn(names, tv) ? names[tv] : tv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export function htmlTables(html) {
  const text = h => h.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map(m => [...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => text(c[1]))));
}

export function isSourceEvidenceFresh(checkedAt, nowMs) {
  const age = nowMs - Date.parse(checkedAt);
  return Number.isFinite(age) && age >= 0 && age < 7_200_000;
}
