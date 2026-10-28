import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [component, portalBoard, searchPage, stadiumPages, css, broadcastHeader] = await Promise.all([
  readFile(new URL("../components/HubApp.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/transfer-portal-board.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/site-search-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/stadium-pages.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../components/broadcast/header.tsx", import.meta.url), "utf8"),
]);

test("global shell includes accessibility foundations", () => {
  assert.match(broadcastHeader, /className="skip-link"/);
  assert.match(component, /<main id="main-content" className="route-frame"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(portalBoard, /className="db-table-wrap db-desktop-data-table"/);
  assert.match(portalBoard, /<MobileDataCardStack label="Transfer portal records">/);
  assert.match(searchPage, /event\.key === "ArrowDown"/);
  assert.match(searchPage, /aria-activedescendant=\{activeResultId\}/);
  assert.match(stadiumPages, /htmlFor="stadium-filter"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
});

test("visual metrics have accessible names or text equivalents", () => {
  assert.match(component, /role="img"/);
  assert.match(component, /aria-label=\{`/);
  assert.match(component, /Line movement from/);
});
