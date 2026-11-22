// =====================================================================
//  Tick-in-the-PDF: the customer ticks / unticks items inside the PDF and
//  Sub Total, GST, Round off, Grand Total and the amount in words change.
//  The SAME functions below make the first values (in the CRM) and run inside
//  the PDF (embedded as their source text), so both always agree.
//  They are written in plain old JavaScript on purpose: PDF viewers
//  (Adobe Reader, Chrome, Edge, Firefox) run older JavaScript than browsers.
// =====================================================================

/* D: [[taxable, gstRate]] per item index · N: shown item indices · on: {index: ticked}
   R: GST rates in the table (sorted, > 0) · I: inter-state (IGST) · O: round off */
export function calcPick(D, N, on, R, I, O) {
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var sub = 0, base = {}, k, i;
  for (k = 0; k < N.length; k++) { i = N[k]; if (!on[i]) continue; sub += D[i][0]; base[D[i][1]] = (base[D[i][1]] || 0) + D[i][0]; }
  var lines = [], tax = 0;
  for (k = 0; k < R.length; k++) {
    var rt = R[k], t = r2((base[rt] || 0) * rt / 100); tax += t;
    if (I) lines.push(t); else { var c = r2(t / 2); lines.push(c, r2(t - c)); }
  }
  var raw = r2(r2(sub) + r2(tax)), grand = O ? Math.round(raw) : raw;
  return { sub: r2(sub), lines: lines, round: r2(grand - raw), grand: grand };
}

/* 1234567.5 → "12,34,567.50" */
export function fmtIN(v) {
  var neg = v < 0, s = Math.abs(v).toFixed(2), p = s.split("."), x = p[0], l = x.slice(-3), r = x.slice(0, -3);
  if (r) l = "," + l;
  r = r.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (neg ? "-" : "") + r + l + "." + p[1];
}
export function fmtRound(v) { return v > 0 ? "+" + v.toFixed(2) : v < 0 ? "-" + Math.abs(v).toFixed(2) : "0.00"; }

/* 200600 → "Two Lakh Six Hundred Rupees Only" (Indian system) */
export function amountWords(v) {
  var W1 = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  var W2 = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function w2(n) { return n < 20 ? W1[n] : W2[Math.floor(n / 10)] + (n % 10 ? " " + W1[n % 10] : ""); }
  function w3(n) { return (n >= 100 ? W1[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? w2(n % 100) : ""); }
  function wi(n) {
    if (!n) return "Zero";
    var p = [], cr = Math.floor(n / 1e7); n %= 1e7; var la = Math.floor(n / 1e5); n %= 1e5; var th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) p.push(wi(cr) + " Crore"); if (la) p.push(w2(la) + " Lakh"); if (th) p.push(w2(th) + " Thousand"); if (n) p.push(w3(n));
    return p.join(" ");
  }
  v = Math.round(v * 100) / 100; var r = Math.floor(v), ps = Math.round((v - r) * 100);
  return wi(r) + " Rupees" + (ps ? " and " + w2(ps) + " Paise" : "") + " Only";
}

/** everything the PDF needs for one quotation → { D, N, on, R, I, O, labels, T } */
export function pickData(items, { inter, roundOff, showOptional }) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const D = items.map((it) => [r2((+it.qty || 0) * (+it.price || 0)), +it.tax || 0]);
  const main = [], opt = [];
  items.forEach((it, i) => { if (!it.opt) main.push(i); else if (showOptional !== false) opt.push(i); });
  const N = [...main, ...opt], on = {};
  N.forEach((i) => { on[i] = !items[i].opt; });
  const R = [...new Set(N.map((i) => D[i][1]).filter((r) => r > 0))].sort((a, b) => a - b);
  const labels = [];
  R.forEach((r) => { if (inter) labels.push(`IGST ${r}%`); else labels.push(`CGST ${r / 2}%`, `SGST ${r / 2}%`); });
  const O = roundOff !== false;
  return { D, N, on, R, I: !!inter, O, labels, T: calcPick(D, N, on, R, !!inter, O) };
}

/** the JavaScript put inside the PDF (runs when a box is ticked / unticked) */
export function pickScript(p) {
  const C = JSON.stringify({ D: p.D, N: p.N, R: p.R, I: p.I, O: p.O });
  return [calcPick, fmtIN, fmtRound, amountWords].map((f) => f.toString()).join("\n") + `
var C = ${C};
var doc = this;
if (!doc || typeof doc.getField != "function") doc = event.target.doc;
var on = {}, k, f;
for (k = 0; k < C.N.length; k++) { f = doc.getField("it" + C.N[k]); on[C.N[k]] = !!(f && f.value != "Off"); }
var T = calcPick(C.D, C.N, on, C.R, C.I, C.O);
function put(n, v) { var g = doc.getField("t_" + n); if (g) g.value = v; }
put("sub", fmtIN(T.sub));
for (k = 0; k < T.lines.length; k++) put("l" + k, fmtIN(T.lines[k]));
if (C.O) put("round", fmtRound(T.round));
put("grand", fmtIN(T.grand));
put("words", amountWords(T.grand));
`;
}
