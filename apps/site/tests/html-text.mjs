import { parse, serialize } from "parse5";

// These helpers inspect rendered output for assertions. HTML is parsed rather
// than filtered with regexes, including comments and unusual script tag casing.
export function visibleText(html) {
  const text = (node) => {
    if (node.nodeName === "#text") return node.value;
    if (["#comment", "head", "script", "style", "template"].includes(node.nodeName)) return "";
    return (node.childNodes ?? []).map(text).join(" ");
  };
  return text(parse(html)).replace(/\s+/g, " ").trim();
}

export function withoutComments(html) {
  const document = parse(html);
  const visit = (node) => {
    if (node.childNodes) {
      node.childNodes = node.childNodes.filter((child) => child.nodeName !== "#comment");
      for (const child of node.childNodes) visit(child);
    }
    if (node.content) visit(node.content);
  };
  visit(document);
  return serialize(document);
}
