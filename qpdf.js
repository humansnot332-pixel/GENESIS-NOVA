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

let libs = null;
const loadLibs = () => (libs ||= Promise.all([loadScript("html2canvas.min.js"), loadScript("jspdf.umd.min.js")])
  .then(() => { if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error("PDF library not loaded"); })
  .catch((e) => { libs = null; throw e; }));

/**
 * fill(root) puts the document's HTML into root (a .qdoc box at A4 width).
 * → { blob, pages, bytes }
 */
export async function htmlToPdf(fill, { title = "Document", linkSel = null, url = null } = {}) {
  await loadLibs();
  const stage = document.createElement("div");
  stage.className = "pdf-stage"; stage.setAttribute("aria-hidden", "true");
  const root = document.createElement("div"); root.style.width = A4W + "px";
  stage.append(root); document.body.append(stage);
  try {
    await fill(root);
    await document.fonts?.ready;
    await Promise.all([...root.querySelectorAll("img")].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    const top0 = root.getBoundingClientRect().top, total = Math.ceil(root.scrollHeight);
    const rel = (el) => { const r = el.getBoundingClientRect(); return { top: r.top - top0, bottom: r.bottom - top0, left: r.left - root.getBoundingClientRect().left, width: r.width, height: r.height }; };
    const cuts = [...new Set([...root.querySelectorAll(BREAK_AT)].map((el) => Math.round(rel(el).bottom)))].filter((y) => y > 0 && y < total).sort((a, b) => a - b);
    const forced = [...root.querySelectorAll(".qannex, [data-pdf-break]")].map((el) => Math.round(rel(el).top)).filter((y) => y > 0 && y < total);
    const link = linkSel && url ? root.querySelector(linkSel) : null, lr = link ? rel(link) : null;

    const canvas = await window.html2canvas(root, { scale: SCALE, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: A4W });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    pdf.setProperties({ title, creator: "Genesis Nova CRM" });
    const pw = pdf.internal.pageSize.getWidth(), k = pw / A4W, room = A4H - 2 * PAD_Y;
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
      pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", 0, PAD_Y * k, pw, h * k, undefined, "FAST");
      // the online link stays clickable in the PDF
      if (lr && lr.top >= y && lr.bottom <= cut) pdf.link(lr.left * k, (PAD_Y + lr.top - y) * k, lr.width * k, lr.height * k, { url });
      y = cut; page++;
    }
    const blob = pdf.output("blob");
    return { blob, pages: page, bytes: blob.size };
  } finally { stage.remove(); }
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
