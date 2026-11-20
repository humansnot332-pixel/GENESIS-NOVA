// =====================================================================
//  Rich text for quotations (Terms & Conditions, Annexures)
//  • clean(): strict HTML cleaner — everything saved or shown goes through it.
//    Only simple formatting survives: no scripts, images, frames, forms,
//    event handlers, classes, or links other than http(s) / mailto / tel.
//  • richEditor(): a small editor (bold, colour, lists, tables …) on contenteditable.
// =====================================================================

const KEEP = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "SPAN", "UL", "OL", "LI", "H3", "H4",
  "BLOCKQUOTE", "HR", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "SUB", "SUP", "A", "CAPTION"]);
const RENAME = { H1: "H3", H2: "H3", H5: "H4", H6: "H4", FONT: "SPAN", CENTER: "P" };
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "FRAME", "FRAMESET", "OBJECT", "EMBED", "APPLET", "TEMPLATE", "NOSCRIPT", "NOEMBED",
  "NOFRAMES", "TITLE", "META", "LINK", "BASE", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "SELECT", "OPTION", "TEXTAREA", "IMG", "PICTURE",
  "SOURCE", "VIDEO", "AUDIO", "TRACK", "CANVAS", "HEAD", "MAP", "AREA", "PORTAL", "DIALOG", "XMP", "PLAINTEXT", "LISTING", "PARAM"]);
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i;
const LEN = /^(0|\d{1,3}(\.\d+)?(px|pt|em|rem|%))$/;
const DECO = /^(underline|line-through|none)(\s+(underline|line-through))?$/;
const CSS = {
  "color": COLOR, "background-color": COLOR,
  "font-weight": /^(bold|bolder|normal|[1-9]00)$/, "font-style": /^(italic|normal)$/,
  "text-decoration": DECO, "text-decoration-line": DECO,
  "text-align": /^(left|right|center|justify)$/,
  "font-size": /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|\d{1,2}(\.\d+)?(px|pt|em|rem|%))$/,
  "margin-left": LEN, "padding-left": LEN, "width": LEN, "vertical-align": /^(top|middle|bottom|baseline)$/,
};
const FONT_SIZE = { 1: "x-small", 2: "small", 3: "medium", 4: "large", 5: "x-large", 6: "xx-large", 7: "xxx-large" };
export const RICH_MAX = 60000;

function cleanStyle(st) {
  const out = [];
  for (let i = 0; i < st.length; i++) {
    const p = st[i], v = st.getPropertyValue(p).trim();
    if (CSS[p] && CSS[p].test(v) && !/[\\<>;]|url|expression|^(initial|inherit|unset|revert|revert-layer|currentcolor|transparent)$/i.test(v)) out.push(p + ": " + v);
  }
  return out.join("; ");
}

function cleanAttrs(el, tag) {
  const style = el.getAttribute("style") ? cleanStyle(el.style) : "";
  const keep = {};
  if (tag === "TD" || tag === "TH") for (const a of ["colspan", "rowspan"]) { const n = +el.getAttribute(a); if (n > 1 && n <= 20) keep[a] = String(n); }
  if (tag === "OL") { const n = +el.getAttribute("start"); if (n > 1 && n < 1000) keep.start = String(n); }
  if (tag === "A") {
    const href = (el.getAttribute("href") || "").trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(href) && href.length <= 2000 && !/[\s<>"]/.test(href)) Object.assign(keep, { href, target: "_blank", rel: "noopener noreferrer" });
  }
  for (const a of [...el.attributes]) el.removeAttribute(a.name);
  if (style) el.setAttribute("style", style);
  for (const [k, v] of Object.entries(keep)) el.setAttribute(k, v);
  if (tag === "SPAN") return !!style;          // a bare <span> adds nothing
  return tag !== "A" || !!keep.href;          // a link without a safe address is unwrapped
}

function walk(node, doc) {
  for (let ch of [...node.childNodes]) {
    if (ch.nodeType === 3) continue;                                       // text
    if (ch.nodeType !== 1) { ch.remove(); continue; }                      // comments etc.
    let tag = ch.tagName.toUpperCase();
    if (DROP.has(tag) || tag.includes(":")) { ch.remove(); continue; }    // also Word's <o:p>, <v:shape> …
    if (RENAME[tag]) {
      const n = doc.createElement(RENAME[tag]);
      const st = [ch.getAttribute("style") || ""];
      if (tag === "FONT") {
        const c = ch.getAttribute("color"), s = FONT_SIZE[+ch.getAttribute("size")];
        if (c && COLOR.test(c)) st.push("color: " + c);
        if (s) st.push("font-size: " + s);
      }
      if (st.join("").trim()) n.setAttribute("style", st.filter(Boolean).join("; "));
      n.append(...ch.childNodes); ch.replaceWith(n); ch = n; tag = n.tagName;
    }
    walk(ch, doc);
    if (!KEEP.has(tag) || !cleanAttrs(ch, tag)) ch.replaceWith(...ch.childNodes);
  }
}

function parse(html) {
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + String(html || ""), "text/html");
  walk(doc.body, doc);
  return doc;
}
const isEmpty = (body) => !body.textContent.replace(/ /g, " ").trim() && !body.querySelector("table, hr");

/** Clean HTML for saving / showing. Returns "" when there is no real content. */
export function clean(html) {
  if (!html) return "";
  const doc = parse(html);
  return isEmpty(doc.body) ? "" : doc.body.innerHTML.trim();
}

/** Put cleaned rich text into an element (nodes are moved in, never re-parsed as a string). */
export function renderRich(el, html) {
  const doc = parse(html);
  el.replaceChildren(...(isEmpty(doc.body) ? [] : doc.body.childNodes));
  return el;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Plain text (old quotations) → simple paragraphs. */
export function textToHtml(t) {
  const s = String(t || "").replace(/\r\n?/g, "\n").trim();
  if (!s) return "";
  return s.split(/\n{2,}/).map((p) => "<p>" + p.split("\n").map(esc).join("<br>") + "</p>").join("");
}

// ---------------------------------------------------------------- the editor
const COLORS = [["#111827", "Black"], ["#c00000", "Red"], ["#1d4ed8", "Blue"], ["#15803d", "Green"], ["#0f766e", "Teal"], ["#c2410c", "Orange"], ["#6b7280", "Grey"]];
const BTN = [
  ["bold", "<b>B</b>", "Bold"], ["italic", "<i>I</i>", "Italic"], ["underline", "<u>U</u>", "Underline"], "color", "|",
  "block", "size", "|",
  ["insertUnorderedList", "•&#8239;≡", "Bulleted list"], ["insertOrderedList", "1.&#8239;≡", "Numbered list"],
  ["outdent", "⇤", "Decrease indent"], ["indent", "⇥", "Increase indent"], "|",
  ["table", "⊞", "Insert table"], ["row", "+&#8239;Row", "Add a table row below (click inside the table first)"], ["insertHorizontalRule", "―", "Horizontal line"], "|",
  ["removeFormat", "T<sub>x</sub>", "Clear formatting"], ["max", "⤢", "Full screen"],
];

/**
 * Turn `host` into a rich text editor.
 * @returns {{ el: HTMLElement, body: HTMLElement, html: string, focus(): void }}
 */
export function richEditor(host, { html = "", placeholder = "", label = "Text", onInput } = {}) {
  host.classList.add("rte");
  const sel = (k, title, opts) => `<select class="rte-sel" data-s="${k}" title="${esc(title)}" aria-label="${esc(title)}">${opts.map(([v, t, st]) => `<option value="${esc(v)}"${st ? ` style="${st}"` : ""}>${esc(t)}</option>`).join("")}</select>`;
  host.innerHTML = `<div class="rte-bar" role="toolbar" aria-label="${esc(label)} — formatting">${BTN.map((b) =>
    b === "|" ? `<span class="rte-sep" aria-hidden="true"></span>`
      : b === "color" ? sel("color", "Text colour", [["", "A ▾"], ...COLORS.map(([c, n]) => [c, n, "color:" + c])])
      : b === "block" ? sel("block", "Paragraph style", [["", "Style ▾"], ["p", "Normal"], ["h3", "Heading"], ["h4", "Sub-heading"]])
      : b === "size" ? sel("size", "Text size", [["", "Size ▾"], ["2", "Small"], ["3", "Normal"], ["4", "Large"], ["5", "Extra large"]])
      : `<button type="button" class="rte-b" data-c="${b[0]}" title="${esc(b[2])}" aria-label="${esc(b[2])}">${b[1]}</button>`).join("")}</div>
    <div class="rte-body rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)}" data-ph="${esc(placeholder)}" spellcheck="true"></div>`;
  const body = host.querySelector(".rte-body");
  renderRich(body, html);
  let range = null;
  const inBody = (n) => n && (n === body || body.contains(n));
  const onSel = () => {
    if (!body.isConnected) { document.removeEventListener("selectionchange", onSel); return; }   // editor closed
    const s = document.getSelection();
    if (s.rangeCount && inBody(s.anchorNode)) range = s.getRangeAt(0).cloneRange();
  };
  document.addEventListener("selectionchange", onSel);
  const restore = () => {
    body.focus({ preventScroll: true });
    if (range) { const s = document.getSelection(); s.removeAllRanges(); s.addRange(range); }
  };
  const changed = () => { onInput?.(); };
  const cmd = (c, v = null) => { restore(); document.execCommand("styleWithCSS", false, true); document.execCommand(c, false, v); changed(); };

  const cellRow = () => { const s = document.getSelection(); let n = s.rangeCount ? s.anchorNode : null; while (n && n !== body) { if (n.nodeName === "TR") return n; n = n.parentNode; } return null; };
  host.querySelector(".rte-bar").addEventListener("mousedown", (e) => { if (e.target.closest(".rte-b")) e.preventDefault(); });
  host.querySelector(".rte-bar").addEventListener("click", (e) => {
    const b = e.target.closest(".rte-b"); if (!b) return;
    const c = b.dataset.c;
    if (c === "max") {
      const on = host.classList.toggle("max"); host.closest(".modal")?.classList.toggle("rte-max", on);
      b.title = on ? "Exit full screen" : "Full screen"; b.setAttribute("aria-label", b.title); restore(); return;
    }
    if (c === "table") {
      const row = (t) => "<tr>" + `<${t}><br></${t}>`.repeat(3) + "</tr>";
      return cmd("insertHTML", "<table><tbody>" + row("th") + row("td") + row("td") + "</tbody></table><p><br></p>");
    }
    if (c === "row") {
      restore(); const tr = cellRow(); if (!tr) { b.animate?.([{ transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }], 180); return; }
      const n = document.createElement("tr");
      for (let i = 0; i < tr.cells.length; i++) { const td = document.createElement("td"); td.append(document.createElement("br")); n.append(td); }
      tr.after(n); changed(); return;
    }
    cmd(c);
  });
  host.querySelectorAll(".rte-sel").forEach((s) => s.addEventListener("change", () => {
    const v = s.value; s.value = ""; if (!v) return;
    if (s.dataset.s === "color") cmd("foreColor", v);
    else if (s.dataset.s === "block") cmd("formatBlock", "<" + v + ">");
    else cmd("fontSize", v);
  }));
  body.addEventListener("input", changed);
  body.addEventListener("paste", (e) => {
    const cd = e.clipboardData; if (!cd) return;
    e.preventDefault();
    const h = cd.getData("text/html");
    if (h) document.execCommand("insertHTML", false, clean(h) || esc(cd.getData("text/plain")));
    else document.execCommand("insertText", false, cd.getData("text/plain"));
    changed();
  });
  body.addEventListener("drop", (e) => e.preventDefault());
  body.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && host.classList.contains("max")) { e.stopPropagation(); host.querySelector('[data-c="max"]').click(); }
  });
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* old browsers */ }
  return {
    el: host, body,
    get html() { return clean(body.innerHTML); },
    set html(v) { renderRich(body, v); range = null; },
    focus: () => body.focus(),
  };
}
