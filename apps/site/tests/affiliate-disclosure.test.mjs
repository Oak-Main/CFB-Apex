import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { parse } from "parse5";

const config = readFileSync(new URL("../wrangler.deploy.jsonc", import.meta.url), "utf8");
const compatibilityDate = config.match(/"compatibility_date":\s*"([\d-]+)"/)[1];
const compatibilityFlags = JSON.parse(config.match(/"compatibility_flags":\s*(\[[^\]]*\])/)[1]);
const modulesRoot = fileURLToPath(new URL("../dist/server", import.meta.url));
const scripts = readdirSync(modulesRoot, { recursive: true }).filter((path) => /\.m?js$/.test(path) && path !== "index.js");
const runtime = new Miniflare({
  modulesRoot,
  modules: ["index.js", ...scripts].map((path) => ({ type: "ESModule", path: join(modulesRoot, path) })),
  compatibilityDate,
  compatibilityFlags,
  outboundService: () => new Response("Outbound requests are disabled", { status: 503 }),
  serviceBindings: { ASSETS: () => new Response("Not found", { status: 404 }) },
});
after(() => runtime.dispose());

function walk(node, result = []) {
  result.push(node);
  for (const child of node.childNodes ?? []) walk(child, result);
  return result;
}
function attr(node, name) { return node.attrs?.find((a) => a.name === name)?.value ?? ""; }
function hasClass(node, name) { return attr(node, "class").split(/\s+/).includes(name); }
function textOf(node) {
  if (node.tagName === "script" || node.tagName === "style") return "";
  return (node.value ?? "") + (node.childNodes ?? []).map(textOf).join(" ");
}
async function page(path) {
  const request = new Request("http://localhost" + path, {
    headers: { accept: "text/html", "x-forwarded-host": "cfbapex.com", "x-forwarded-proto": "https" },
  });
  const response = await runtime.dispatchFetch(request.url, request);
  assert.equal(response.status, 200, path);
  return parse(await response.text());
}

test("the disclosure makes a conditional commission claim rather than asserting earnings", async () => {
  const document = await page("/affiliate-disclosure");
  const main = walk(document).find((n) => attr(n, "id") === "main-content");
  assert.ok(main, "main content exists");
  assert.match(textOf(main), /may earn a commission/i);
  assert.doesNotMatch(textOf(main), /tracked and earning/i);
});

test("ticket and travel modules disclose potential commissions before sponsored links", async () => {
  for (const [path, className] of [
    ["/stadiums/alabama", "lt-tickets"],
    ["/teams/alabama", "hub-tickets"],
    ["/watch", "watch-sponsored-links"],
  ]) {
    const document = await page(path);
    const panels = walk(document).filter((n) => hasClass(n, className));
    assert.ok(panels.length >= 2, path + " should expose ticket and travel modules");
    for (const panel of panels) {
      const nodes = walk(panel);
      const sponsored = nodes.findIndex((n) => n.tagName === "a" && /(?:^|\s)sponsored(?:\s|$)/.test(attr(n, "rel")));
      assert.ok(sponsored >= 0, path + " module has a sponsored link");
      const notice = nodes.findIndex((n) => n.tagName === "p" && /may earn a commission/i.test(textOf(n)));
      assert.ok(notice >= 0 && notice < sponsored, path + " notice precedes sponsored links");
      assert.ok(nodes.some((n) => n.tagName === "a" && attr(n, "href") === "/affiliate-disclosure"), path + " module links to disclosure");
      assert.doesNotMatch(textOf(panel), /official partner|partner active/i);
    }
  }
});
