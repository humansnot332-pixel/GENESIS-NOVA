// =====================================================================
//  Genesis CRM — language: "hinglish" (source text) or "en".
//  The UI is written in Hinglish. In English mode every rendered text
//  node, placeholder, title and aria-label is translated on the fly
//  (MutationObserver), so pages, toasts, modals, notifications and
//  server messages all switch together. User data is never touched.
// =====================================================================
let LANG = "hinglish";
try { LANG = localStorage.getItem("crm_lang") === "en" ? "en" : "hinglish"; } catch { /* storage blocked */ }
export const getLang = () => LANG;
export const isEn = () => LANG === "en";
/** pick text by language inline: L("Hinglish", "English") */
export const L = (hi, en) => (LANG === "en" ? en : hi);

// [Hinglish, English] — whole text nodes AND multi-word fragments of sentences
const D = [
  // ---------- navigation / titles ----------
  ["Aaj ki calling", "Today's calls"], ["Inbox (replies)", "Inbox (replies)"], ["Follow-ups & tasks", "Follow-ups & tasks"],
  ["Email / WA templates", "Email / WA templates"], ["Lock requests", "Lock requests"], ["Audit log", "Audit log"],
  // ---------- login / auth ----------
  ["Har call, har lead, har RFQ — ek jagah.", "Every call, every lead, every RFQ — in one place."],
  ["Team ke liye secure CRM: auto leads, RFQ tracking, follow-ups aur live reports.", "A secure CRM for your team: auto leads, RFQ tracking, follow-ups and live reports."],
  ["✓ Naye leads har Mon / Wed / Fri apne aap", "✓ New leads automatically every Mon / Wed / Fri"],
  ["✓ IndiaMART & website RFQs seedha inbox mein", "✓ IndiaMART & website RFQs straight to your inbox"],
  ["✓ Role-based access, audit log", "✓ Role-based access, audit log"],
  ["Apne work email se login karo.", "Sign in with your work email."], ["Password bhool gaye?", "Forgot password?"],
  ["Email ya password galat hai", "Wrong email or password"], ["Bahut galat attempts.", "Too many wrong attempts."], ["sec ruko.", "seconds, then try again."],
  ["Email daalo — reset link bhejenge.", "Enter your email — we'll send a reset link."], ["Reset link bhejo", "Send reset link"],
  ["Email check karo", "Check your email"], ["Agar ye email registered hai to reset link aa jayega.", "If this email is registered, a reset link is on its way."],
  ["Naya password", "New password"], ["Kam se kam 10 characters, letters + number.", "At least 10 characters, letters + a number."],
  ["Dono password same nahi hain", "The two passwords don't match"], ["10+ characters, letters aur number dono", "10+ characters with letters and a number"],
  ["Password update ho gaya ✔", "Password updated ✔"], ["Account activate nahi hai", "Account not activated"],
  ["Aapka login ban gaya hai, par Admin ne abhi tak access nahi diya. Admin se bolo Team page se aapko activate kare.", "Your login exists, but an Admin hasn't given you access yet. Ask an Admin to activate you from the Team page."],
  ["Profile load nahi hua:", "Could not load profile:"], ["Inactivity ki wajah se logout", "Logged out due to inactivity"],
  ["Logout karna hai?", "Log out?"], ["Setup baaki hai", "Setup pending"],
  ["mein apna Supabase URL aur anon key daalo. Steps", "— add your Supabase URL and anon key. Steps are in"],
  ["App load nahi hua", "App failed to load"], ["File nahi mili:", "File not found:"],
  ["App start nahi hua. Browser console (Cmd+Option+J) ka screenshot bhejo.", "App did not start. Send a screenshot of the browser console (Cmd+Option+J)."],
  ["supabase.js load nahi hui — ise GitHub pe upload karo.", "supabase.js did not load — upload it to GitHub."],
  ["Check karo ki GitHub repo mein ye saari files hain: index.html, styles.css, main.js, core.js, data.js, config.js, supabase.js, 591.supabase.js, frame-guard.js.", "Check that the GitHub repo has all these files: index.html, styles.css, main.js, core.js, data.js, config.js, supabase.js, 591.supabase.js, frame-guard.js."],
  // ---------- dashboard ----------
  ["Namaste, main", "Hello, this is"], ["Namaste,", "Hello,"], ["Namaste", "Hello"],
  ["Calling shuru karo", "Start calling"], ["Meri calls aaj", "My calls today"], ["Team calls aaj", "Team calls today"], ["log online", "online"],
  ["Follow-ups (24 ghante)", "Follow-ups (24 hours)"], ["Mere active leads", "My active leads"], ["free pool mein · +", "in free pool · +"],
  ["is hafte", "this week"], ["Unread replies", "Unread replies"], ["emails aaj bheje", "emails sent today"],
  ["🙋 Lock requests", "🙋 Lock requests"], ["Koi aapka lead maang raha hai", "Someone is asking for your lead"],
  ["Meri calls", "My calls"], ["— last 14 din", "— last 14 days"], ["🏆 Aaj ka leaderboard", "🏆 Today's leaderboard"],
  ["Abhi koi employee nahi", "No employees yet"], ["Aane wale follow-ups", "Upcoming follow-ups"],
  ["Koi follow-up pending nahi 🎉", "No pending follow-ups 🎉"], ["Abhi koi RFQ nahi", "No RFQs yet"], ["Sab →", "All →"],
  ["📢 Sab ko announcement", "📢 Announcement to everyone"], ["Announcement bhej diya ✔", "Announcement sent ✔"],
  // ---------- today / queue ----------
  ["Aaj ka target", "Today's target"], ["Next lead call karo", "Call next lead"], ["⏰ Follow-ups due", "⏰ Follow-ups due"],
  ["Koi follow-up due nahi", "No follow-ups due"], ["🆕 Fresh leads", "🆕 Fresh leads"], ["Aapke naam koi fresh lead nahi", "No fresh leads assigned to you"],
  ["Neeche free pool se lo — ya \"Next lead\" dabao, system apne aap agla free lead lock kar dega.", "Pick one from the free pool below — or press \"Call next lead\" and the system will lock the next free lead for you."],
  ["🔓 Free pool — jo pehle lock kare uska (", "🔓 Free pool — first to lock gets it ("], ["Pool khaali hai", "Pool is empty"], ["— Automation se naye leads lao", "— bring new leads from Automation"],
  ["🔒 Lock & open", "🔒 Lock & open"], ["Abhi koi free lead nahi mila — refresh karke dekho", "No free lead available right now — try refreshing"], ["🎉 Queue khatam!", "🎉 Queue finished!"],
  // ---------- lead drawer ----------
  ["Aap is lead pe kaam kar rahe ho", "You are working on this lead"], ["permanent (won)", "permanent (won)"],
  ["· har call / email pe apne aap badhta hai", "· extends automatically with every call / email"],
  ["is lead pe kaam kar raha/rahi hai", "is working on this lead"], ["is RFQ pe kaam kar raha/rahi hai", "is working on this RFQ"],
  [". Aap dekh sakte ho, par call / email / edit sirf", ". You can view it, but only this person can call / email / edit:"],
  ["Aap dekh sakte ho, edit / quote / email sirf", "You can view it; only this person can edit / quote / email:"],
  ["karega.", ""], ["Free lead", "Free lead"], ["Jo pehle lock karega, wahi kaam karega. Lock karte hi number dikhega.", "Whoever locks it first works on it. The number appears once you lock it."],
  ["🔒 Lock karke shuru karo", "🔒 Lock & start"], ["🙋 Request access", "🙋 Request access"], ["Force release", "Force release"],
  ["Call ka result", "Call outcome"], ["Short note (optional) — kisse baat hui, kya bola…", "Short note (optional) — who you spoke to, what they said…"],
  ["Uthaya nahi", "No answer"], ["Busy, baad mein", "Busy, call later"], ["Interested nahi", "Not interested"], ["Galat number", "Wrong number"],
  ["Interested hai", "Interested"], ["Quote bheja", "Quote sent"], ["Demo / meeting fix", "Demo / meeting fixed"], ["Deal ho gayi 🎉", "Deal won 🎉"],
  ["Kal", "Tomorrow"], ["+3 din", "+3 days"], ["+1 hafta", "+1 week"], ["Skip → next lead", "Skip → next lead"],
  ["🎯 Call script", "🎯 Call script"], ["bol raha/rahi hoon", "calling from"], ["Poocho:", "Ask:"],
  ["Note add karo", "Add note"], ["RFQ banao", "Create RFQ"], ["Quotation banao", "Create quotation"], ["Abhi koi activity nahi", "No activity yet"],
  ["Koi open task nahi", "No open tasks"], ["bheje ·", "sent ·"], ["replies · last reply", "replies · last reply"],
  ["🔒 Lead aapke naam lock ho gaya", "🔒 Lead locked to you"], ["Lead release karna hai? Phir koi bhi isko le sakta hai.", "Release this lead? Anyone will be able to take it."],
  ["🔓 Lead release ho gaya — ab pool mein hai", "🔓 Lead released — it's back in the pool"], ["Release nahi hua", "Release failed"],
  ["ka lock hatana hai? Unhe notification jayega.", "— remove their lock? They will be notified."], ["ka lock hatana hai?", "— remove their lock?"],
  ["Lead ab aapke paas locked nahi hai", "This lead is no longer locked to you"], ["Follow-up hata diya", "Follow-up removed"],
  ["Date choose karo", "Choose a date"], ["Haan, karo", "Yes, do it"], ["Haan, badlo", "Yes, change it"],
  ["\" ko permanently delete karna hai?", "\" — delete permanently?"], ["ne ye lead lock kar liya", "locked this lead"],
  ["Naya lead", "New lead"], ["Company naam zaroori hai", "Company name is required"], ["Lead add ho gaya ✔", "Lead added ✔"],
  ["Ye lead aapke paas locked nahi hai", "This lead isn't locked to you"], ["Lock badal gaya — status update nahi hua", "Lock changed — status was not updated"],
  ["Card ko drag karke status badlo · har column max 100 dikhte hain", "Drag a card to change status · max 100 shown per column"],
  // ---------- leads table ----------
  ["Search company, contact, phone, city…", "Search company, contact, phone, city…"], ["Sab leads", "All leads"],
  ["🔒 Mere (locked by me)", "🔒 Mine (locked by me)"], ["🔒 Doosron ke paas", "🔒 Locked by others"], ["🔒 Aap", "🔒 You"],
  ["Koi lead nahi mila", "No leads found"], ["Filters badal ke dekho", "Try changing the filters"],
  ["✉️ Bulk email", "✉️ Bulk email"], ["Ek baar mein max 50 companies ko bulk email (Gmail limit) — kam select karo", "Bulk email is limited to 50 companies at a time (Gmail limit) — select fewer"],
  ["Bulk email sirf apne locked leads ko — pehle lock karo", "Bulk email only goes to leads locked by you — lock them first"],
  ["Selected leads mein kisi ka email address nahi hai", "None of the selected leads has an email address"],
  ["leads skip (doosron ke / free) — sirf aapke", "leads skipped (others' / free) — will go only to your"], ["leads ko jayega", "leads"],
  ["leads assign ho gaye ✔", "leads assigned ✔"], ["leads distribute hue", "leads distributed"],
  ["CSV se leads import", "Import leads from CSV"], ["Excel mein", "In Excel use"], ["karo. Columns (header row mein):", "Columns (in the header row):"],
  [". Duplicate phone numbers apne aap skip honge.", ". Duplicate phone numbers are skipped automatically."],
  ["File 5MB se badi hai", "File is larger than 5 MB"], ["CSV khaali hai", "CSV is empty"], ["Company column nahi mila", "Company column not found"],
  // ---------- RFQs ----------
  ["Naya RFQ", "New RFQ"], ["Ye RFQ aapke paas hai", "This RFQ is yours"], ["Free RFQ", "Free RFQ"],
  ["Lock karo — phir sirf aap is pe kaam karoge.", "Lock it — then only you can work on it."], ["🔒 Lock karo", "🔒 Lock"],
  ["🔒 RFQ aapke naam lock", "🔒 RFQ locked to you"], ["RFQ release karna hai?", "Release this RFQ?"],
  ["Company aur product zaroori", "Company and product are required"], ["Save nahi hua — RFQ ab aapke paas locked nahi hai", "Not saved — this RFQ is no longer locked to you"],
  ["Lead kholo", "Open lead"], ["Aap (save pe)", "You (on save)"], ["Koi RFQ nahi", "No RFQs"],
  ["IndiaMART / website se naye RFQ apne aap yahan aayenge.", "New RFQs from IndiaMART / your website will appear here automatically."],
  ["Website / Google Form se RFQ", "RFQs from your website / Google Form"], ["Apni website ke enquiry form ko is URL pe", "Point your website enquiry form to this URL with"],
  ["karo. RFQ + lead apne aap ban jayega aur sabko live notification jayega.", ". An RFQ + lead is created automatically and everyone gets a live notification."],
  [". Bot se bachne ke liye ek hidden field", ". To block bots, keep a hidden field"], ["khaali rakho. Website ka domain", "empty. Your website domain must be in the"],
  ["secret mein hona chahiye; server-to-server (Zapier / Apps Script) ke liye header", "secret; for server-to-server (Zapier / Apps Script) send the header"],
  // ---------- tasks / quotes ----------
  ["Mere", "Mine"], ["🔴 Overdue", "🔴 Overdue"], ["🟡 Aaj", "🟡 Today"], ["📅 Aage", "📅 Later"], ["Naya task", "New task"],
  ["Kya karna hai *", "What needs to be done *"], ["Kab", "When"], ["Kisko", "Assign to"], ["Title aur time daalo", "Enter a title and time"],
  ["GST quotations — CGST/SGST ya IGST state ke hisaab se apne aap.", "GST quotations — CGST/SGST or IGST applied automatically by state."],
  ["Abhi koi quotation nahi", "No quotations yet"], ["Lead ya RFQ se “Quotation banao” dabao.", "Press “Create quotation” on a lead or RFQ."],
  ["Nayi quotation", "New quotation"], ["Customer naam daalo", "Enter the customer name"],
  // ---------- reports / team / automation / audit ----------
  ["Meri performance", "My performance"], ["Naam", "Name"], ["Avg / din", "Avg / day"], ["Is period mein koi call nahi", "No calls in this period"],
  ["Emails bheje", "Emails sent"], ["Companies jinhone reply kiya", "Companies that replied"], ["Is period mein CRM se koi email nahi gaya", "No emails sent from the CRM in this period"],
  ["🔒 Disable karte hi user ka login band, aur uske pending (new/contacted) leads pool mein wapas. Har change Audit log mein record hota hai.", "🔒 Disabling a user stops their login immediately and returns their pending (new/contacted) leads to the pool. Every change is recorded in the Audit log."],
  ["Naya user", "New user"], ["Naam *", "Name *"], ["Kuch select nahi = saari categories", "Nothing selected = all categories"],
  ["User ko ye password do; wo login ke baad Profile se badal sakta hai.", "Give the user this password; they can change it from Profile after logging in."],
  ["Naam aur email daalo", "Enter name and email"], ["User ban gaya ✔ — email + password share karo", "User created ✔ — share the email + password"],
  ["ko permanently delete? Uske saare leads pool mein chale jayenge. (Disable karna behtar hai)", "— delete permanently? All their leads go back to the pool. (Disabling is better.)"],
  ["ko disable karna hai? Login turant band ho jayega.", "— disable? Their login stops immediately."],
  ["Read-only (Admin edit karega)", "Read-only (Admin can edit)"], ["Abhi chalao", "Run now"], ["Schedule ka wait kiye bina abhi naye leads/RFQs lao.", "Fetch new leads/RFQs now without waiting for the schedule."],
  ["Max naye leads per run", "Max new leads per run"], ["> Naye leads team mein apne aap baanto (least-loaded first, category match)", "Auto-distribute new leads to the team (least-loaded first, category match)"],
  ["Naye leads team mein apne aap baanto (least-loaded first, category match)", "Auto-distribute new leads to the team (least-loaded first, category match)"],
  ["Kam se kam ek din choose karo", "Choose at least one day"], ["Abhi tak koi run nahi", "No runs yet"], ["Chal raha hai… 1-2 minute lag sakte hain", "Running… this can take 1-2 minutes"],
  ["entries · 180 din tak rakhe jaate hain", "entries · kept for 180 days"],
  // ---------- profile ----------
  ["Mera profile", "My profile"], ["Naam (email signature mein jayega)", "Name (used in email signature)"], ["Email kholne ke liye", "Open emails in"],
  ["Computer ka mail app", "Computer mail app"], ["Password badlo", "Change password"], ["Password match nahi hua", "Passwords don't match"],
  // ---------- composer ----------
  ["— Blank (sirf signature) —", "— Blank (signature only) —"], ["Mere templates", "My templates"], ["Mere templates · English", "My templates · English"], ["Mere templates · Hinglish", "My templates · Hinglish"],
  ["Email address nahi hai — upar daal do (lead mein bhi save ho jayega).", "No email address — add one above (it will be saved to the lead too)."],
  ["Phone number nahi hai.", "No phone number."], ["Ye number landline lagta hai — WhatsApp shayad na chale.", "This looks like a landline — WhatsApp may not work."],
  ["email gaya tha — dobara bhejna hai?", "was emailed — send again?"],
  [") — har company ko alag dikhega, ek doosre ka email nahi dikhega", ") — each company sees it separately, nobody sees the others' email"],
  ["Koi valid email nahi", "No valid email"], ["leads skip (email nahi hai)", "leads skipped (no email)"],
  ["**text** = bold. Aap kuch bhi edit kar sakte ho — bhejne se pehle sab yahin badlo.", "**text** = bold. You can edit anything — change it here before sending."],
  ["3 din baad follow-up reminder set karo", "Set a follow-up reminder in 3 days"], ["mein kholo ↗", "↗"], ["mein kholo", ""],
  ["WhatsApp kholo", "Open WhatsApp"], ["Pehle text select karo", "Select some text first"],
  ["Template badalne se aapke changes chale jayenge. Continue?", "Changing the template will discard your edits. Continue?"],
  ["Copied ✔ — kahin bhi paste karo", "Copied ✔ — paste it anywhere"], ["Formatting ke saath copy", "Copy with formatting"], ["Copy nahi hua", "Copy failed"],
  ["Browser ne naya tab block kiya.", "The browser blocked the new tab."], ["Email galat hai:", "Invalid email:"], ["To mein email daalo", "Enter an email in To"],
  ["Kisi selected lead ka email nahi hai", "None of the selected leads has an email"], ["Subject daalo", "Enter a subject"],
  ["Message lamba tha — body clipboard mein copy hai, compose mein Ctrl+V / Cmd+V karo", "The message was long — the body is on your clipboard, press Ctrl+V / Cmd+V in the compose window"],
  ["mein draft ready — wahan Send dabao", "draft ready — press Send there"], ["Number nahi hai", "No number"],
  ["💬 WhatsApp khul raha hai — wahan Send dabao", "💬 Opening WhatsApp — press Send there"],
  ["🔒 Lock aapke naam — ab sirf aap is pe kaam karoge", "🔒 Locked to you — now only you work on it"],
  ["is pe kaam kar raha hai — pehle \"Request access\" karo", "is working on it — send a \"Request access\" first"],
  ["is pe kaam kar raha hai (till", "is working on it (till"], ["Aapke paas already", "You already have"],
  ["active locks hain — pehle kuch release karo", "active locks — release some first"], ["Lock nahi mil paya", "Could not get the lock"], ["Koi aur", "Someone else"],
  // ---------- templates ----------
  ["Template save karo", "Save template"], ["💾 Template save", "💾 Save template"], ["Poori team ke liye (company template)", "For the whole team (company template)"],
  ["Tip: company naam ki jagah", "Tip: instead of the company name write"], [", contact ke liye", ", for the contact"],
  ["likho — har lead ke liye apne aap bhar jayega.", "— it fills in automatically for every lead."], ["Naam daalo", "Enter a name"], ["Template saved ✔", "Template saved ✔"],
  ["Naya template", "New template"], ["Mera", "Mine"], ["Abhi koi template nahi", "No templates yet"], ["Preview sample data ke saath.", "Preview with sample data."],
  ["\" delete karna hai?", "\" — delete?"], ["Template edit", "Edit template"], ["Kahan use ho", "Use for"], ["Leads + RFQs", "Leads + RFQs"],
  ["Sirf leads", "Leads only"], ["Sirf RFQs", "RFQs only"], ["Auto-select stage", "Auto-select stage"], ["Naya lead", "New lead"],
  ["Follow-up (reply nahi aaya)", "Follow-up (no reply yet)"], ["Quote bheja", "Quote sent"], ["+ Variable daalo", "+ Insert variable"],
  ["= contact naam, nahi ho toh \"Sir/Madam\"", "= contact name, or \"Sir/Madam\" if missing"], ["Company template (poori team dekh payegi)", "Company template (visible to the whole team)"],
  ["Naam aur message zaroori hain", "Name and message are required"], ["Dono languages", "Both languages"],
  // ---------- inbox ----------
  ["setup nahi", "not set up"], ["connect nahi", "not connected"], ["Gmail setup dobara", "Set up Gmail again"],
  ["Saare replies", "All replies"], ["Search company, email, subject…", "Search company, email, subject…"],
  ["Abhi koi reply nahi", "No replies yet"], ["Jin companies ko CRM se mail kiya hai, unke reply yahan aayenge.", "Replies from companies you emailed through the CRM will appear here."],
  ["Pehle upar se Gmail / Outlook connect karo.", "Connect Gmail / Outlook above first."], ["← Koi reply select karo", "← Select a reply"],
  ["Bheja", "Sent"], ["✅ Reply aaya", "✅ Replied"], ["din, no reply", "days, no reply"], ["Follow-up bhejo", "Send follow-up"],
  ["Koi pending follow-up nahi 🎉", "No pending follow-ups 🎉"], ["Abhi tak CRM se koi email nahi gaya", "No emails sent from the CRM yet"],
  ["Message nahi mila", "Message not found"], ["🔥 Interested mark", "🔥 Mark interested"], ["⏰ Kal follow-up", "⏰ Follow-up tomorrow"],
  ["⏰ Kal ka follow-up set", "⏰ Follow-up set for tomorrow"], ["💰 Quote maanga", "💰 Quote requested"], ["Inbox mein wapas", "Back in inbox"],
  ["(email reply se)", "(from email reply)"], ["🔗 Gmail replies connect karo", "🔗 Connect Gmail replies"],
  ["Ye aapke", "This installs a small script in your"], ["apne Gmail", "own Gmail"],
  ["mein ek chhota script lagata hai jo har 10 minute mein check karta hai ki jin companies ko aapne CRM se mail kiya, unka reply aaya ya nahi — aur sirf wahi replies yahan dikhata hai. Koi aur email CRM mein nahi aata.", "that checks every 10 minutes whether the companies you emailed from the CRM have replied — and shows only those replies here. No other email ever comes into the CRM."],
  ["Neeche", "Click"], ["Code banao", "Generate code"], ["dabao aur code copy karo.", "below and copy the code."],
  ["kholo (usi Gmail account se jisse mail bhejte ho).", "(with the same Gmail account you send mail from)."],
  ["Wahan ka sara code hata ke ye code paste karo → 💾 Save.", "Delete everything there, paste this code → 💾 Save."],
  ["Upar function list mein", "In the function list at the top select"], ["select karke", "and press"], ["→ apna account →", "→ your account →"],
  ["Bas! 10 minute mein pehli sync ho jayegi. Status yahan Inbox mein dikhega.", "Done! The first sync happens within 10 minutes. The status shows here in the Inbox."],
  ["🔒 Code mein aapka personal token hai. Naya code banane se purana token band ho jata hai.", "🔒 The code contains your personal token. Generating new code disables the old token."],
  ["Naya code banao", "Generate new code"], ["Copy nahi hua — select karke copy karo", "Copy failed — select it and copy manually"],
  ["Outlook replies padhne ke liye Admin ko ek baar Microsoft (Azure) mein free app register karni hogi (5 minute). Steps", "To read Outlook replies an Admin must register a free app in Microsoft (Azure) once (5 minutes). Steps are in"],
  ["mein hain. Uske baad", ". After that, as soon as you add"], ["daalte hi yahan \"Outlook connect\" button aa jayega.", "to config.js an \"Outlook connect\" button appears here."],
  ["Gmail / Google Workspace wale abhi “Gmail connect” use kar sakte hain.", "Gmail / Google Workspace users can use “Gmail connect” right away."],
  ["Outlook login chahiye", "Outlook sign-in needed"], ["naye Outlook replies", "new Outlook replies"], ["naye replies", "new replies"],
  // ---------- notifications / requests ----------
  ["Sab read", "Mark all read"], ["Koi notification nahi", "No notifications"], ["✅ De do", "✅ Approve"], ["Mana karo", "Decline"], ["Mana", "Decline"],
  ["✅ Lock transfer ho gaya", "✅ Lock transferred"], ["Request decline ki", "Request declined"], ["Request ab pending nahi hai", "This request is no longer pending"],
  ["🙋 Mujhse maange gaye", "🙋 Requested from me"], ["📤 Maine maange", "📤 My requests"], ["👥 Team ke pending requests", "👥 Team's pending requests"],
  ["maang raha/rahi hai", "is requesting it"], ["se access maango", "— request access"],
  ["ke paas locked hai (till", "has it locked (till"], ["). Request bhejne pe unhe notification jayega; wo approve karenge toh lock aapke naam ho jayega.", "). They'll get a notification; if they approve, the lock moves to you."],
  ["Reason (optional)", "Reason (optional)"], ["e.g. Ye mera purana client hai / unhone mujhe call kiya", "e.g. This is my old client / they called me"],
  ["Request bhejo", "Send request"], ["Lead ab free hai — seedha lock kar lo", "The lead is free now — just lock it"],
  ["Request pehle se bheji hui hai", "Request already sent"], ["ko bhej di ✔", "— request sent ✔"],
  // ---------- server-side texts (DB notifications / activity / errors) ----------
  ["Lock hataya gaya", "Lock removed"], ["ne aapka lock release kiya", "released your lock"], ["ye lead maang raha/rahi hai", "is requesting this lead"],
  ["ye RFQ maang raha/rahi hai", "is requesting this RFQ"], ["✅ Access mil gaya", "✅ Access granted"], ["❌ Request decline hui", "❌ Request declined"],
  ["ne lock aapko de diya", "gave you the lock"], ["ne request mana ki", "declined your request"], ["lead aapko assign hue", "leads assigned to you"],
  ["naye leads aapko mile", "new leads for you"], ["📨 Naya RFQ:", "📨 New RFQ:"], ["🔒 Lock liya:", "🔒 Locked by:"], ["🔓 Release kiya:", "🔓 Released by:"],
  ["✉️ Email bheja →", "✉️ Email sent →"], ["delete ki", "deleted"], ["📩 Reply aaya:", "📩 Reply received:"], ["banayi —", "created —"],
  ["naye RFQs add hue", "new RFQs added"], ["naye leads,", "new leads,"], ["assign hue", "assigned"],
  ["Lead reassign sirf Manager/Admin kar sakta hai", "Only a Manager/Admin can reassign leads"], ["Admin apna khud ka role/active nahi hata sakta", "An Admin can't remove their own role / active status"],
  ["Lock badalne ke liye Claim / Release button use karo", "Use the Lock / Release buttons to change a lock"],
  ["Sirf Admin", "Admins only"], ["Password kam se kam 10 characters, letters + number", "Password needs at least 10 characters, letters + a number"],
  ["Role galat hai", "Invalid role"], ["User limit (40) poori ho gayi", "User limit (40) reached"], ["Khud ko disable nahi kar sakte", "You can't disable yourself"],
  ["Khud ko delete nahi kar sakte", "You can't delete yourself"], ["Not allowed (token galat ya user inactive)", "Not allowed (wrong token or inactive user)"],
  ["Aapko ye karne ki permission nahi hai", "You don't have permission to do this"], ["Ye phone number pehle se kisi lead mein hai", "This phone number already belongs to another lead"],
  ["Internet / server se connect nahi ho paya", "Could not connect to the internet / server"],
  ["Ye record ab aapke paas locked nahi hai (ya mila nahi) — refresh karo", "This record is no longer locked to you (or wasn't found) — refresh"],
  ["load nahi hui", "failed to load"], ["Data nahi hai", "No data"], ["Kuch nahi mila", "Nothing found"],
  ["Company, phone, RFQ… ya page ka naam", "Company, phone, RFQ… or a page name"], ["Search leads…", "Search leads…"],
  // ---------- business suite (server texts) ----------
  ["🛠 Ticket aapko assign hua:", "🛠 Ticket assigned to you:"], ["👁 Quotation kholi gayi:", "👁 Quotation opened:"],
  ["Pehli baar dekhi — abhi call karne ka sahi time hai!", "Opened for the first time — great moment to call!"], ["Dobara dekhi:", "Viewed again:"],
  ["✅ Quotation ACCEPT hui:", "✅ Quotation ACCEPTED:"], ["✏️ Customer ne changes maange:", "✏️ Customer requested changes:"],
  ["🔁 Renewal aaj:", "🔁 Renewal today:"], ["din mein:", "days:"], ["📊 Aaj ka report", "📊 Today's report"],
  ["👁 Customer ne quotation online dekhi:", "👁 Customer viewed quotation online:"], ["✅ Customer ne quotation online accept ki:", "✅ Customer accepted quotation online:"],
  ["duplicate lead(s) merge kiye", "duplicate lead(s) merged"], ["payment mila", "payment received"],
];

const EXACT = new Map(D.map(([a, b]) => [a.replace(/\s+/g, " ").trim(), b]));
// fragments used inside longer sentences: only multi-word, longest first
const FRAG = D.filter(([a]) => /\s/.test(a.trim()) && a.trim().length >= 6)
  .sort((x, y) => y[0].length - x[0].length)
  .map(([a, b]) => [new RegExp("(^|[^\\p{L}])" + a.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[^\\p{L}])", "gu"), b]);

/** translate one piece of UI text (no-op in Hinglish mode) */
export function tr(text) {
  if (LANG !== "en" || !text || !/[a-z]/i.test(text)) return text;
  const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0], core = text.trim().replace(/\s+/g, " ");
  if (EXACT.has(core)) return lead + EXACT.get(core) + tail;
  let out = core;
  for (const [re, en] of FRAG) if (re.test(out)) { re.lastIndex = 0; out = out.replace(re, (_, pre) => pre + en); }
  return out === core ? text : lead + out + tail;
}

// ---------- DOM translator ----------
const SKIP = "script,style,textarea,pre,code,[data-raw],.co,.ib-co,.ib-sub,.ib-body,.ib-snip,#cPreview,.qdoc";
const ATTRS = ["placeholder", "title", "aria-label", "label"];
function translateNode(n) {
  if (n.nodeType === 3) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) return;
    const t = tr(n.nodeValue);
    if (t !== n.nodeValue) n.nodeValue = t;
    return;
  }
  if (n.nodeType !== 1 || n.matches(SKIP)) return;
  for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
  const w = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (x) => (x.nodeType === 1 && x.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let x;
  while ((x = w.nextNode())) {
    if (x.nodeType === 3) { const t = tr(x.nodeValue); if (t !== x.nodeValue) x.nodeValue = t; }
    else for (const a of ATTRS) if (x.hasAttribute(a)) { const v = x.getAttribute(a), t = tr(v); if (t !== v) x.setAttribute(a, t); }
  }
}
let obs = null;
function startObserver() {
  if (obs || !document.body) return;
  obs = new MutationObserver((list) => {
    if (LANG !== "en") return;
    for (const m of list) {
      if (m.type === "characterData") translateNode(m.target);
      else if (m.type === "attributes") translateNode(m.target.nodeType === 1 ? m.target : m.target.parentNode);
      else m.addedNodes.forEach(translateNode);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
export function applyLangToDom() {
  document.documentElement.lang = LANG === "en" ? "en" : "hi-Latn";
  if (LANG === "en" && document.body) translateNode(document.body);
}
export function setLang(l) {
  LANG = l === "en" ? "en" : "hinglish";
  try { localStorage.setItem("crm_lang", LANG); } catch { /* ignore */ }
  applyLangToDom();
}
// native dialogs
const _prompt = window.prompt.bind(window), _confirm = window.confirm.bind(window);
window.prompt = (m, d) => _prompt(tr(m), d);
window.confirm = (m) => _confirm(tr(m));

if (document.body) { startObserver(); applyLangToDom(); }
else document.addEventListener("DOMContentLoaded", () => { startObserver(); applyLangToDom(); });
