// Clickjacking guard: the CRM must never run inside someone else's frame.
if (window.top !== window.self) { document.documentElement.style.display = "none"; window.top.location = window.self.location; }

// Boot diagnostics: if a file fails to load, show WHICH one instead of an endless "Loading…".
(function () {
  function show(msg) {
    var r = document.getElementById("root");
    if (!r || !/Loading/.test(r.textContent) || r.dataset.err) return;
    r.dataset.err = "1";
    var box = document.createElement("div");
    box.style.cssText = "max-width:560px;margin:18vh auto;padding:20px 24px;border:1px solid #f3c2c2;background:#fdecec;color:#7f1d1d;border-radius:12px;font:14px/1.5 system-ui,sans-serif";
    var b = document.createElement("b"); b.textContent = "App load nahi hua"; box.appendChild(b);
    var p = document.createElement("div"); p.style.marginTop = "6px"; p.textContent = msg; box.appendChild(p);
    var h = document.createElement("div"); h.style.cssText = "margin-top:10px;color:#991b1b;font-size:13px";
    h.textContent = "Check karo ki GitHub repo mein ye saari files hain: index.html, styles.css, main.js, core.js, data.js, config.js, supabase.js, 591.supabase.js, frame-guard.js.";
    box.appendChild(h);
    r.innerHTML = ""; r.appendChild(box);
  }
  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && (t.src || t.href)) show("File nahi mili: " + (t.src || t.href).split("/").slice(-2).join("/"));
    else if (e.message) show((e.filename ? e.filename.split("/").pop() + ": " : "") + e.message);
  }, true);
  window.addEventListener("unhandledrejection", function (e) { show(String((e.reason && e.reason.message) || e.reason)); });
  setTimeout(function () {
    if (!window.supabase) show("supabase.js load nahi hui — ise GitHub pe upload karo.");
    else show("App start nahi hua. Browser console (Cmd+Option+J) ka screenshot bhejo.");
  }, 10000);
})();
