// =====================================================================
//  Document → PDF file, made in the browser (no server): the same page the
//  Print button shows, drawn at A4 width, cut into pages between rows /
//  paragraphs (never through a line), with a clickable link where asked.
//  Used to attach the quotation PDF to Gmail / Outlook drafts.
// =====================================================================
import { loadScript } from "./core.js";

const A4W = 794, A4H = 1123;          // CSS px at 96 dpi
const PAD_Y = 30;                       // top / bottom white space on every page (px)
const SCALE = 2;                        // sharp text when zoomed / printed
const BREAK_AT = "tr, p, li, h1, h2, h3, h4, .hd, .hd2, .qlinkbox, .qterms, .rich > *, img";

let libs = null, formLib = null;
const loadLibs = () => (libs ||= Promise.all([loadScript("html2canvas.min.js"), loadScript("jspdf.umd.min.js")])
  .then(() => { if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error("PDF library not loaded"); })
  .catch((e) => { libs = null; throw e; }));
const loadFormLib = () => (formLib ||= loadScript("pdf-lib.min.js")
  .then(() => { if (!window.PDFLib?.PDFDocument) throw new Error("PDF form library not loaded"); })
  .catch((e) => { formLib = null; throw e; }));

/**
 * fill(root) puts the document's HTML into root (a .qdoc box at A4 width).
 * marks: selector of elements whose place on the PDF is wanted (for form fields) →
 *   [{ key, page, x, top, w, h }] in PDF points, top measured from the top of that page
 * → { blob, pages, bytes, marks }
 */
export async function htmlToPdf(fill, opts = {}) {
  const stage = document.createElement("div");
  stage.className = "pdf-stage"; stage.setAttribute("aria-hidden", "true");
  const root = document.createElement("div"); root.style.width = A4W + "px";
  stage.append(root); document.body.append(stage);
  try { await fill(root); return await elementToPdf(root, { ...opts, width: A4W }); }
  finally { stage.remove(); }
}
/** an element already laid out (in this page or in an iframe), `width` CSS px wide → A4 portrait PDF */
export async function elementToPdf(root, { title = "Document", linkSel = null, url = null, marks: markSel = null, width = A4W } = {}) {
  await loadLibs();
  const W = width, Hpg = W * 297 / 210, PAD = PAD_Y * W / A4W;
  {
    await root.ownerDocument.fonts?.ready;
    await Promise.all([...root.querySelectorAll("img")].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    const top0 = root.getBoundingClientRect().top, total = Math.ceil(root.scrollHeight);
    const rel = (el) => { const r = el.getBoundingClientRect(); return { top: r.top - top0, bottom: r.bottom - top0, left: r.left - root.getBoundingClientRect().left, width: r.width, height: r.height }; };
    const cuts = [...new Set([...root.querySelectorAll(BREAK_AT)].map((el) => Math.round(rel(el).bottom)))].filter((y) => y > 0 && y < total).sort((a, b) => a - b);
    const forced = [...root.querySelectorAll(".qannex, [data-pdf-break]")].map((el) => Math.round(rel(el).top)).filter((y) => y > 0 && y < total);
    const link = linkSel && url ? root.querySelector(linkSel) : null, lr = link ? rel(link) : null;
    const want = markSel ? [...root.querySelectorAll(markSel)].map((el) => ({ key: el.dataset.pi != null ? "it" + el.dataset.pi : el.dataset.pk != null ? "it" + el.dataset.pk : el.dataset.tot, r: rel(el) })) : [];
    const marks = [];

    const canvas = await window.html2canvas(root, { scale: SCALE, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: W });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    pdf.setProperties({ title, creator: "Genesis Nova CRM" });
    const pw = pdf.internal.pageSize.getWidth(), k = pw / W, room = Hpg - 2 * PAD;
    let y = 0, page = 0;
    while (y < total - 1) {
      const limit = y + room;
      let cut = forced.find((f) => f > y + 40 && f <= limit);
      if (cut == null) cut = limit >= total ? total : ([...cuts].reverse().find((c) => c > y + room * 0.45 && c <= limit) ?? limit);
      const h = Math.max(1, Math.min(cut, total) - y);
      const part = document.createElement("canvas");
      part.width = canvas.width; part.height = Math.ceil(h * SCALE);
      const g = part.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, part.width, part.height);
      g.drawImage(canvas, 0, Math.floor(y * SCALE), canvas.width, part.height, 0, 0, part.width, part.height);
      if (page) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", 0, PAD * k, pw, h * k, undefined, "FAST");
      // the online link stays clickable in the PDF
      if (lr && lr.top >= y && lr.bottom <= cut) pdf.link(lr.left * k, (PAD + lr.top - y) * k, lr.width * k, lr.height * k, { url });
      for (const m of want) if (m.r.top >= y - 0.5 && m.r.bottom <= cut + 0.5) marks.push({ key: m.key, page, x: m.r.left * k, top: (PAD + m.r.top - y) * k, w: m.r.width * k, h: m.r.height * k });
      y = cut; page++;
    }
    const blob = pdf.output("blob");
    return { blob, pages: page, bytes: blob.size, marks };
  }
}

/** Blob → base64 (no "data:" prefix) — for Outlook attachments */
export const blobB64 = (blob) => new Promise((ok, no) => {
  const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1] || ""); f.onerror = no; f.readAsDataURL(blob);
});

/** save a Blob on this device */
export function saveBlob(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * Turns marks into PDF form fields: "itN" → a tick box (ticked when checked[N]); anything else → a read-only
 * text box laid over the printed value (white background), named "t_<key>". Ticking a box runs `script`
 * (PDF JavaScript), which fills the text boxes again.
 */
export async function makeFillable(blob, marks, { checked = {}, script = "", values = {}, tickTop = false } = {}) {
  await loadFormLib();
  const { PDFDocument, StandardFonts, rgb, TextAlignment, PDFName, PDFHexString } = window.PDFLib;
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  const form = doc.getForm(), pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const teal = rgb(0.06, 0.46, 0.43), white = rgb(1, 1, 1);
  const action = script ? doc.context.register(doc.context.obj({ Type: "Action", S: "JavaScript", JS: PDFHexString.fromText(script) })) : null;
  for (const m of marks) {
    const pg = pages[m.page]; if (!pg) continue;
    const H = pg.getHeight();
    if (m.key.startsWith("it")) {
      const size = 10, cb = form.createCheckBox(m.key);
      const cy = tickTop ? Math.min(m.h / 2, 11) : m.h / 2;     // tickTop: level with the item's first line
      cb.addToPage(pg, { x: m.x + (m.w - size) / 2, y: H - m.top - cy - size / 2, width: size, height: size, borderWidth: 1, borderColor: teal, backgroundColor: white, textColor: teal });
      if (checked[m.key.slice(2)]) cb.check();
      // the click runs the script: /A (Acrobat, Firefox) and mouse-up /AA /U (Chrome / Edge) — running twice is harmless
      if (action) cb.acroField.getWidgets().forEach((w) => { w.dict.set(PDFName.of("A"), action); w.dict.set(PDFName.of("AA"), doc.context.obj({ U: action })); });
    } else {
      const tf = form.createTextField("t_" + m.key), big = m.key === "grand", words = m.key === "words";
      tf.addToPage(pg, { x: m.x + 1, y: H - m.top - m.h + 1, width: Math.max(10, m.w - 2), height: Math.max(8, m.h - 2), borderWidth: 0, backgroundColor: white, font: big ? bold : font });
      tf.setAlignment(words ? TextAlignment.Left : TextAlignment.Right);
      // the text must fit even when ticking more items adds a digit (one spare character)
      const f = big ? bold : font, sample = String(values[m.key] ?? "") + "0", room = Math.max(8, m.w - 6);
      const fit = sample.length > 1 ? room / f.widthOfTextAtSize(sample, 1) : 99;
      tf.setFontSize(Math.max(5.5, Math.min(big ? 11 : 9, m.h * (big ? 0.55 : 0.6), fit)));
      tf.setText(String(values[m.key] ?? ""));
      tf.updateAppearances(big ? bold : font);
      tf.enableReadOnly();
    }
  }
  return new Blob([await doc.save({ updateFieldAppearances: false })], { type: "application/pdf" });
}
