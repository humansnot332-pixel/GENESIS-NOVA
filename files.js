// =====================================================================
//  Files that came with mail, and files on support tickets
//  (private bucket "crm-files" — every link is a signed link, valid 1 hour)
//   • pictures → thumbnails; tap = big view (swipe with ‹ ›)
//   • everything else → a chip; tap = download
//   • tickets: add photos / files from the phone (photos are made smaller first)
// =====================================================================
import { sb, S, h, toast } from "./core.js";
import { L } from "./i18n.js";

const BUCKET = "crm-files";
const MAX = 20 * 1048576;
const isPic = (f) => !!f.path && /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(f.mime || "");
export const fsize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : (n || 0) + " B");
const icon = (f) => {
  const m = f.mime || "", n = f.name || "";
  if (/pdf/i.test(m) || /\.pdf$/i.test(n)) return "📕";
  if (/sheet|excel|csv/i.test(m) || /\.(xlsx?|csv)$/i.test(n)) return "📗";
  if (/word|msword|document/i.test(m) || /\.docx?$/i.test(n)) return "📘";
  if (/presentation|powerpoint/i.test(m) || /\.pptx?$/i.test(n)) return "📙";
  if (/zip|rar|7z|compressed/i.test(m) || /\.(zip|rar|7z)$/i.test(n)) return "🗜️";
  if (/\.(dwg|dxf|rvt|rfa|skp|ifc|nwd|3ds|max)$/i.test(n)) return "📐";
  if (/^image\//i.test(m)) return "🖼️";
  if (/^video\//i.test(m)) return "🎞️";
  if (/^audio\//i.test(m)) return "🎧";
  return "📄";
};

// rows of crm_files → HTML (thumbnails get their link in wireFiles)
export function filesHtml(rows, title = "") {
  if (!rows?.length) return "";
  const pics = rows.filter(isPic), docs = rows.filter((f) => !isPic(f));
  return `<div class="files">${title ? `<div class="files-t">${title}</div>` : ""}
    ${pics.length ? `<div class="fpics">${pics.map((f) => `<button type="button" class="fpic" data-fp="${f.id}" title="${h(f.name)}"><img alt="${h(f.name)}" data-fimg="${f.id}"></button>`).join("")}</div>` : ""}
    ${docs.length ? `<div class="fdocs">${docs.map((f) => f.path
      ? `<button type="button" class="fdoc" data-fd="${f.id}"><span class="fi">${icon(f)}</span><span class="fn">${h(f.name)}</span><small>${fsize(f.size)}</small></button>`
      : `<span class="fdoc off" title="${h(L("Bahut badi file — mail (Gmail) mein kholo", "Too big to copy — open it in the mail (Gmail)"))}"><span class="fi">${icon(f)}</span><span class="fn">${h(f.name)}</span><small>${fsize(f.size)} · ${L("Gmail mein", "in Gmail")}</small></span>`).join("")}</div>` : ""}
  </div>`;
}

// signed links: thumbnails now, a download when a file is tapped, a picture opens big
export async function wireFiles(root, rows) {
  if (!root || !rows?.length) return;
  const by = new Map(rows.map((f) => [String(f.id), f]));
  const pics = rows.filter(isPic);
  if (pics.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(pics.map((f) => f.path), 3600);
    (data || []).forEach((d, i) => {
      const f = pics[i]; if (!f || !d?.signedUrl) return;
      f.url = d.signedUrl;
      const im = root.querySelector(`[data-fimg="${f.id}"]`); if (im) im.src = d.signedUrl;
    });
  }
  root.querySelectorAll("[data-fp]").forEach((b) => b.onclick = () => { const f = by.get(b.dataset.fp); if (f?.url) lightbox(f, pics.filter((p) => p.url)); });
  root.querySelectorAll("[data-fd]").forEach((b) => b.onclick = async () => {
    const f = by.get(b.dataset.fd); if (!f) return;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 600, { download: f.name });
    if (error || !data?.signedUrl) return toast(L("File nahi khuli: ", "Couldn't open the file: ") + (error?.message || ""), true);
    const a = document.createElement("a"); a.href = data.signedUrl; a.target = "_blank"; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
  });
}

// a picture full size, ‹ › for the others, Esc / ✕ / tap outside closes
function lightbox(f, pics) {
  let i = Math.max(0, pics.indexOf(f));
  const box = document.createElement("div"); box.className = "lbox"; box.tabIndex = -1;
  box.setAttribute("role", "dialog"); box.setAttribute("aria-label", L("Photo", "Picture"));
  const show = () => {
    const p = pics[i];
    box.innerHTML = `<img src="${h(p.url)}" alt="${h(p.name)}"><div class="lbox-bar"><span class="fn">${h(p.name)} · ${fsize(p.size)}</span><span style="flex:1"></span>
      ${pics.length > 1 ? `<button type="button" data-lb="-1" aria-label="Previous">‹</button><span>${i + 1}/${pics.length}</span><button type="button" data-lb="1" aria-label="Next">›</button>` : ""}
      <a href="${h(p.url)}" target="_blank" rel="noopener" aria-label="Open">↗</a><button type="button" data-lb="x" aria-label="Close">✕</button></div>`;
  };
  const step = (d) => { i = (i + d + pics.length) % pics.length; show(); };
  const close = () => { box.remove(); removeEventListener("keydown", key, true); };
  const key = (e) => {
    if (!["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Escape") close(); else step(e.key === "ArrowRight" ? 1 : -1);
  };
  let x0 = null;
  box.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => { if (x0 == null || pics.length < 2) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); });
  box.onclick = (e) => {
    const b = e.target.closest("[data-lb]");
    if (b) return b.dataset.lb === "x" ? close() : step(+b.dataset.lb);
    if (e.target === box) close();
  };
  show(); addEventListener("keydown", key, true);
  document.body.append(box); box.focus();
}

// phone photos are big → about 1600 px JPEG before upload (keeps the storage small and uploads fast)
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 1.5 * 1048576) return { blob: file, name: file.name };
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    if (out && out.size < file.size) return { blob: out, name: file.name.replace(/\.[A-Za-z0-9]+$/, "") + ".jpg" };
  } catch { /* keep the original */ }
  return { blob: file, name: file.name };
}

// add files to a ticket → number added
export async function uploadTicketFiles(ticketId, list) {
  let n = 0;
  for (const file of [...(list || [])]) {
    if (file.size > MAX) { toast(`${file.name}: ${L("20 MB se badi file nahi ja sakti", "files over 20 MB can't be added")}`, true); continue; }
    const { blob, name } = await shrink(file);
    const mime = (blob.type || file.type || "application/octet-stream").slice(0, 120);
    const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+/, "").slice(-80) || "file";
    const path = `ticket/${ticketId}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
    if (error) { toast(`${name}: ${error.message}`, true); continue; }
    const { error: e2 } = await sb.from("crm_files").insert({ path, name: name.slice(0, 200), mime, size: blob.size, ticket_id: ticketId, user_id: S.me.id });
    if (e2) { toast(`${name}: ${e2.message}`, true); continue; }
    n++;
  }
  return n;
}

export const loadFiles = async (col, id) => {
  const { data } = await sb.from("crm_files").select("id, path, name, mime, size, inline, note, user_id, created_at").eq(col, id).order("inline", { ascending: false }).order("id");
  return data || [];
};
