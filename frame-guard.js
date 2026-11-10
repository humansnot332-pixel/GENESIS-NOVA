// Clickjacking guard: the CRM must never run inside someone else's frame.
if (window.top !== window.self) { document.documentElement.style.display = "none"; window.top.location = window.self.location; }
