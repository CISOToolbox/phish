/* Phish — English strings (lazy-loaded). */
(function() {
    "use strict";
    var EN = {
        // Navigation
        "nav.dashboard": "Dashboard",
        "nav.campaigns": "Campaigns",
        "nav.templates": "Email templates",
        "nav.landings": "Landing pages",
        "nav.groups": "Groups & targets",
        "nav.settings": "SMTP profiles & settings",

        // Dashboard
        "dashboard.title": "Dashboard",
        "dashboard.empty": "No campaign launched yet. The dashboard will show KPIs (sends, opens, clicks, submissions, reports) as soon as a campaign is running.",
        "dashboard.kpi.campaigns": "Campaigns",
        "dashboard.kpi.active": "active",
        "dashboard.funnel": "Funnel",
        "dashboard.timeline": "Activity — last 30 days",
        "dashboard.top_targets": "Most-exposed targets",
        "dashboard.top_targets_hint": "Useful to focus follow-up awareness training.",
        "dashboard.recent": "Recent campaigns",
        "dashboard.no_top_targets": "No clicks recorded yet.",
        "dashboard.col.campaigns": "Campaigns",

        // Campaigns
        "campaigns.title": "Campaigns",
        "campaigns.new": "New campaign",
        "campaigns.empty": "No campaign yet.",
        "campaigns.col.name": "Name",
        "campaigns.col.status": "Status",
        "campaigns.col.launch": "Launched",
        "campaigns.col.targets": "Targets",
        "campaigns.col.rate": "Click rate",
        "campaigns.form.name": "Campaign name",
        "campaigns.form.sending_profile": "SMTP profile",
        "campaigns.form.template": "Email template",
        "campaigns.form.landing": "Landing page",
        "campaigns.form.group": "Target group",
        "campaigns.form.url": "Base URL (used for {{.URL}} / {{.TrackingURL}})",
        "campaigns.form.launch_date": "Launch date (optional)",
        "campaigns.form.missing_deps": "Create at least one SMTP profile, one template, one landing page and one group before creating a campaign.",
        "campaigns.edit": "Edit campaign",
        "campaigns.delete": "Delete campaign",
        "campaigns.view": "View results",
        "campaigns.launch": "Launch",
        "campaigns.cancel": "Cancel",
        "campaigns.saved": "Campaign saved",
        "campaigns.deleted": "Campaign deleted",
        "campaigns.launched": "Campaign launched",
        "campaigns.cancelled": "Campaign cancelled",
        "campaigns.confirm_launch": "Launch the campaign?",
        "campaigns.confirm_launch_msg": "E-mails will be sent immediately to all targets in the group. This action is final.",
        "campaigns.confirm_cancel": "Cancel the campaign?",
        "campaigns.confirm_cancel_msg": "Pending sends will be stopped. E-mails already sent cannot be recalled.",
        "campaigns.no_results": "No results",
        "campaigns.no_events": "No events",
        "campaigns.results": "Results",
        "campaigns.events": "Event log",
        "campaigns.back": "Campaigns",
        "campaigns.declare_report": "Declare a report",
        "campaigns.declare_btn": "Declare",
        "campaigns.rep_user": "User",
        "campaigns.rep_search": "Search a user…",
        "campaigns.rep_when": "Report date and time",
        "campaigns.rep_pick": "Select a user",
        "campaigns.reported_ok": "Report recorded",
        "m365.title": "Microsoft 365 connector",
        "m365.help": "Every 5 min, while a campaign is active, checks the reports raised to Microsoft Defender and flags the matching targets as reported. Requires an Azure AD app with the ThreatSubmission.Read.All application permission. Works when Defender's 'user reported settings' send reports to Microsoft (the default).",
        "m365.tenant": "Tenant ID",
        "m365.client": "Application (client) ID",
        "m365.secret": "Client secret",
        "m365.secret_set": "Secret stored — leave blank to keep",
        "m365.secret_ph": "Azure client secret value",
        "m365.enabled": "Enable the connector",
        "m365.poll_now": "Check now",
        "m365.last_poll": "Last check",
        "m365.saved": "M365 connector saved",
        "m365.polling": "Checking…",
        "m365.poll_done": "Check complete",
        "m365.matches": "report(s)",
        "m365.poll_fail": "Check failed",
        "bulk.selected": "{n} selected",
        "bulk.delete": "Delete",
        "bulk.delete_q": "Delete the {n} selected item(s)?",
        "bulk.deleted": "Item(s) deleted",
        "dashboard.timeline_unit": "Events per day",
        "settings.drawer_title": "Settings",
        "settings.language": "Language",
        "settings.ai_section": "AI assistant",
        "settings.timezone": "Time zone",
        "settings.tz_browser": "Browser",
        "settings.tz_saved": "Time zone saved",
        "help.tab_methodo": "Methodology",
        "help.tab_usage": "Using Phish",
        "help.methodo": ""
            + "<h1>Methodology — preparing a campaign</h1>"
            + "<p>A phishing-simulation campaign is prepared <strong>upfront</strong>, outside the application. Gather these prerequisites before configuring the campaign in Phish.</p>"
            + "<h2>Prior authorisation</h2>"
            + "<p>Only run a campaign with the written approval of the relevant stakeholders (management, HR, legal). Phish is an authorised awareness tool, not an attack tool.</p>"
            + "<h2>A mailbox able to send the emails</h2>"
            + "<p>You need a <strong>sending email address</strong> and an <strong>SMTP server</strong> able to send the campaign emails: an internal mail relay, a dedicated account, or a third-party sending service. This relay is entered in the SMTP profile (Settings). Without a working sending relay no campaign can go out. Prefer a sending domain you control and that is consistent with the scenario.</p>"
            + "<h2>Making sure the emails are not blocked</h2>"
            + "<p>Anti-spam protections and mail gateways can block simulation emails or move them to junk, which skews the campaign. Before launching:</p>"
            + "<ul>"
            + "<li>allow the <strong>domain</strong> and the <strong>sending IP address</strong> on the organisation's mail gateway;</li>"
            + "<li>notify the messaging and security teams to avoid a block or quarantine mid-campaign;</li>"
            + "<li>send a test email to a few real mailboxes and confirm delivery.</li>"
            + "</ul>"
            + "<h2>The Microsoft 365 case</h2>"
            + "<p>If the targets are on Microsoft 365, Defender must be prepared specifically. Otherwise the emails are filtered and — above all — the <strong>Safe Links</strong> feature rewrites URLs and <em>pre-opens them in a sandbox</em>: this records clicks and opens that no one actually made and <strong>skews the statistics</strong>.</p>"
            + "<h3>The Advanced delivery policy</h3>"
            + "<p>Microsoft provides an official mechanism to declare a third-party phishing simulation: the <strong>Advanced delivery</strong> policy.</p>"
            + "<ol>"
            + "<li>Open the Microsoft Defender portal (security.microsoft.com).</li>"
            + "<li>Go to <strong>Email &amp; collaboration → Policies &amp; rules → Threat policies → Advanced delivery</strong>.</li>"
            + "<li>Open the <strong>Phishing simulation</strong> tab, then <strong>Add</strong>.</li>"
            + "<li>Declare the three items:"
            + "<ul>"
            + "<li><strong>Domain</strong> — the domain(s) of your SMTP profile's from address.</li>"
            + "<li><strong>Sending IP</strong> — the public IP address of the relay sending the campaign.</li>"
            + "<li><strong>Simulation URLs to allow</strong> — the tracking URLs of this Phish instance (e.g. <code>phish.yourdomain.com/*</code>, or the campaign base URL followed by <code>/track/*</code>). This is what stops Safe Links from rewriting and pre-opening the links.</li>"
            + "</ul>"
            + "</li>"
            + "<li>Save. Propagation can take around thirty minutes: configure the policy <strong>before</strong> launching the campaign.</li>"
            + "</ol>"
            + "<p>Effect: covered messages are no longer filtered (not blocked, not junked), Safe Links does not rewrite or detonate the URLs, Safe Attachments does not detonate attachments, and zero-hour auto purge (ZAP) does not remove them.</p>"
            + "<h3>Verification</h3>"
            + "<p>Send a test email to a real M365 mailbox. In the received message, check that the tracking link is <strong>not</strong> rewritten to <code>*.safelinks.protection.outlook.com</code>. If it still is, the URL is not correctly declared in Advanced delivery.</p>"
            + "<h3>Reports</h3>"
            + "<p>Once the simulation is declared, user reports (Outlook's « Report Phishing » button) are recorded by Defender. That is what the M365 connector reads (Settings), automatically flagging the targets who reported.</p>"
            + "<h2>Campaign sequence</h2>"
            + "<p>Once these prerequisites are met, the campaign is built in this order: SMTP profile → email template → landing page → target group → campaign → launch → tracking. The detail of each step is in the <strong>Using Phish</strong> tab.</p>",
        "help.usage": ""
            + "<h1>Using Phish</h1>"
            + "<p>Once the campaign is prepared (see the <strong>Methodology</strong> tab), follow these steps in order.</p>"
            + "<h2>1. SMTP profile</h2>"
            + "<p>In <strong>Settings</strong>, create an SMTP profile: the relay that sends the emails (host, credentials, from address). The « Test » button validates sending.</p>"
            + "<h2>2. Email template</h2>"
            + "<p>In <strong>Templates</strong>, write the phishing email. The subject and body accept <strong>placeholders</strong>, substituted for each target at send time:</p>"
            + "<ul>"
            + "<li><code>{{.FirstName}}</code>, <code>{{.LastName}}</code>, <code>{{.Email}}</code>, <code>{{.Position}}</code> — personalise the message (e.g. « Hello {{.FirstName}}, »).</li>"
            + "<li><code>{{.URL}}</code> — <strong>the tracked link</strong>. Put it inside a link: <code>&lt;a href=&quot;{{.URL}}&quot;&gt;…&lt;/a&gt;</code>. This link leads to the landing page and records the click. <strong>Without <code>{{.URL}}</code>, no click is measured.</strong></li>"
            + "<li><code>{{.TrackingURL}}</code> — the open-tracking pixel. Optional: if you do not place it yourself, an invisible pixel is appended automatically before <code>&lt;/body&gt;</code>.</li>"
            + "</ul>"
            + "<p>Also fill the <strong>plain-text</strong> version (fallback for non-HTML clients), including at least <code>{{.URL}}</code>. The AI assistant can generate a full scenario; the « Preview » button shows the HTML rendering.</p>"
            + "<h2>3. Landing page</h2>"
            + "<p>In <strong>Landing pages</strong>, create the page shown when the target clicks the link. Write it by hand or <strong>clone an existing page</strong> from its URL (the JavaScript-rendered page is captured, then its scripts are stripped). Switch « Code » / « Preview » to check the rendering.</p>"
            + "<p><strong>To make the page work correctly:</strong></p>"
            + "<ul>"
            + "<li><strong>Display</strong> — a cloned page loads the origin site's images, CSS and fonts via a <code>&lt;base&gt;</code> tag inserted automatically at the top of the document. Do not remove it, or the styling no longer loads.</li>"
            + "<li><strong>Form capture</strong> — to measure a submission, the form must have <code>action=&quot;{{.SubmitURL}}&quot;</code> and <code>method=&quot;POST&quot;</code>. Cloning wires this automatically; on a hand-written page, add it yourself. Tick « Expose a form ».</li>"
            + "<li><strong>Privacy</strong> — on submit, the backend records only the <strong>name and length</strong> of each field, never the submitted values.</li>"
            + "<li><strong>Personalisation</strong> — the page also accepts <code>{{.FirstName}}</code>, <code>{{.LastName}}</code>, <code>{{.Email}}</code>.</li>"
            + "<li><strong>Redirect</strong> — set a « Redirect URL » to send the target to a debrief page after submission.</li>"
            + "</ul>"
            + "<h2>4. Group and targets</h2>"
            + "<p>In <strong>Groups</strong>, create a group and import targets (CSV or paste: email, first name, last name, position).</p>"
            + "<h2>5. Campaign</h2>"
            + "<p>In <strong>Campaigns</strong>, link an SMTP profile, template, landing page and group, set the <strong>base URL</strong> (the public address of this instance, used in the tracked links), then launch.</p>"
            + "<h2>6. Tracking</h2>"
            + "<p>Click a campaign to open its dashboard: funnel (sent, opened, clicked, submitted, reported), a <strong>timeline</strong> of activity (click a point for the detail of an action), the results table and the event log. The « Report » button on each target records a report received off-channel. CSV export is available.</p>"
            + "<h2>Privacy</h2>"
            + "<p>Phish never stores credentials entered by targets — only the count and length of the fields are recorded.</p>",
        "campaigns.timeline": "Campaign timeline",
        "campaigns.timeline_empty": "No target activity yet.",
        "campaigns.timeline_hint": "Click a point to see the action detail.",
        "campaigns.unknown_user": "Unknown user",
        "campaigns.tl.user": "User",
        "campaigns.tl.action": "Action",
        "campaigns.tl.time": "Time",
        "campaigns.tl.detail_title": "Action detail",
        "events.created": "Campaign created",
        "events.sent": "Email sent",
        "events.send_error": "Send failed",
        "events.opened": "Email opened",
        "events.clicked": "Link clicked",
        "events.submitted": "Data submitted",
        "events.reported": "Email reported",
        "campaigns.refresh": "Refresh",
        "campaigns.status.queued": "Queued",
        "campaigns.status.in_progress": "In progress",
        "campaigns.status.completed": "Completed",
        "campaigns.status.cancelled": "Cancelled",
        "campaigns.result.scheduled": "Scheduled",
        "campaigns.result.sending": "Sending…",
        "campaigns.result.sent": "Sent",
        "campaigns.result.send_failed": "Send failed",
        "campaigns.result.opened": "Opened",
        "campaigns.result.clicked": "Clicked",
        "campaigns.result.submitted": "Form submitted",
        "campaigns.result.reported": "Reported",
        "campaigns.col.email": "Email",
        "campaigns.col.send_date": "Sent",
        "campaigns.col.open_date": "Opened",
        "campaigns.col.click_date": "Clicked",
        "campaigns.col.submit_date": "Submitted",
        "campaigns.col.report_date": "Reported",
        "campaigns.col.event": "Event",
        "campaigns.col.time": "Time",
        "campaigns.col.details": "Details",

        // Templates
        "templates.title": "Email templates",
        "templates.new": "New template",
        "templates.empty": "Email templates will become editable in P3.",
        "templates.col.name": "Name",
        "templates.col.subject": "Subject",
        "templates.col.updated": "Updated",

        // Landings
        "landings.title": "Landing pages",
        "landings.new": "New page",
        "landings.empty": "Landing pages will become editable in P3.",
        "landings.no_password": "Design note: even when a page exposes a form, the backend never stores the submitted values — only the list of fields and their length.",
        "landings.col.name": "Name",
        "landings.col.capture": "Form capture",
        "landings.col.redirect": "Redirect",

        // Groups
        "groups.title": "Groups & targets",
        "groups.new": "New group",
        "groups.empty": "Group creation and CSV import will be added in P3.",
        "groups.col.name": "Name",
        "groups.col.size": "Targets count",
        "groups.col.updated": "Updated",

        // Settings
        "settings.title": "SMTP profiles & settings",
        "settings.empty": "SMTP profiles and relay configuration will be added in P3.",
        "settings.col.name": "Name",
        "settings.col.from": "From",
        "settings.col.host": "SMTP host",

        // Toolbar
        "menu_file": "File",

        // Common
        "common.actions": "Actions",
        "common.edit": "Edit",
        "common.delete": "Delete",
        "common.delete_q": "Delete",
        "common.save": "Save",
        "common.cancel": "Cancel",
        "common.close": "Close",
        "common.error": "Error",
        "common.required_fields": "Missing required fields",
        "common.yes": "Yes",
        "common.no": "No",

        // Templates — form
        "templates.html": "HTML",
        "templates.html_hint": "placeholders: {{.FirstName}} {{.LastName}} {{.Email}} {{.URL}} {{.TrackingURL}}",
        "templates.text": "Plain text (fallback)",
        "templates.edit": "Edit template",
        "templates.delete": "Delete template",
        "templates.saved": "Template saved",
        "templates.deleted": "Template deleted",

        // Landings — form
        "landings.html": "Page HTML",
        "landings.edit": "Edit landing page",
        "landings.delete": "Delete landing page",
        "landings.saved": "Landing page saved",
        "landings.deleted": "Landing page deleted",
        "landings.import.label": "Clone an existing page",
        "landings.import.hint": "Enter the URL of a real page to copy its HTML code below. For authorised awareness training only.",
        "landings.import.btn": "Import HTML",
        "landings.import.loading": "Rendering the page… (a few seconds)",
        "landings.import.done": "Page imported — scripts neutralised, form wired for capture. Review before saving.",
        "landings.import.url_required": "Enter a URL to clone.",
        "editor.code": "Code",
        "editor.preview": "Preview",

        // Groups — form + CSV
        "groups.edit": "Edit group",
        "groups.delete": "Delete group",
        "groups.view": "View targets",
        "groups.saved": "Group saved",
        "groups.deleted": "Group deleted",
        "groups.targets": "targets",
        "groups.no_targets": "No targets",
        "groups.csv": "Paste a CSV (optional)",
        "groups.csv_hint": "Required header: email,first_name,last_name,position. Separator ',' or ';'.",
        "groups.csv_error": "Invalid CSV",
        "groups.csv_empty": "No valid rows",
        "groups.import_csv": "Import CSV",
        "groups.import": "Import",
        "groups.imported": "Targets imported",
        "groups.replace": "Replace existing targets",
        "groups.target_deleted": "Target removed",
        "groups.col_first": "First name",
        "groups.col_last": "Last name",
        "groups.col_position": "Position",

        // Settings (sending profiles) — form
        "settings.new": "New SMTP profile",
        "settings.edit": "Edit SMTP profile",
        "settings.delete": "Delete SMTP profile",
        "settings.delete_q": "Delete",
        "settings.saved": "SMTP profile saved",
        "settings.deleted": "Profile deleted",
        "settings.username": "Username",
        "settings.password": "Password",
        "settings.password_set": "Set — leave empty to keep it",
        "settings.ignore_cert": "Ignore certificate errors",

        // AI assistant
        "ai.button": "Generate with AI",
        "ai.generate": "Generate",
        "ai.template_title": "AI assistant — email template",
        "ai.template_hint": "Provide scenario context. The more precise, the better the output. The content will be flagged as a training exercise.",
        "ai.landing_title": "AI assistant — landing page",
        "ai.landing_hint": "Provide page context. If a form is included, its action will be {{.SubmitURL}} and the backend will never store submitted values.",

        // AI form fields
        "ai.field.scenario": "Scenario",
        "ai.field.scenario_ph": "E.g. fake security alert email asking the user to verify their session via an internal portal.",
        "ai.field.landing_scenario_ph": "E.g. internal portal asking the user to re-validate their password to access an HR document.",
        "ai.field.persona": "Sender persona",
        "ai.field.tone": "Tone",
        "ai.field.action": "Expected action",
        "ai.field.difficulty": "Difficulty level",
        "ai.field.audience": "Target audience (optional)",
        "ai.field.audience_ph": "E.g. finance team, all employees, IT team",
        "ai.field.attachment": "Mention an attachment (e.g. invoice, report)",
        "ai.field.page_type": "Page type",
        "ai.field.brand_style": "Visual style",
        "ai.field.with_form": "Include a form (action = {{.SubmitURL}})",
        "ai.field.form_fields": "Form fields (optional)",
        "ai.field.form_fields_ph": "E.g. email, password — or first_name, last_name, otp",
        "ai.field.debrief": "Show a debrief message after submission",

        // AI personas / tones / actions / difficulty
        "ai.persona.it_interne": "Internal IT department",
        "ai.persona.rh_interne": "Internal HR department",
        "ai.persona.direction": "Executive committee / Management",
        "ai.persona.comptabilite": "Accounting / Finance",
        "ai.persona.securite_it": "IT security team (SOC / CISO)",
        "ai.persona.fournisseur_generique": "Generic vendor (anonymous)",
        "ai.persona.plateforme_generique": "Generic SaaS platform",
        "ai.persona.autre": "Other / specified in scenario",
        "ai.tone.urgent": "Urgent / time pressure",
        "ai.tone.officiel": "Official / administrative",
        "ai.tone.informel": "Casual / colleague",
        "ai.tone.alarmiste": "Alarming (security compromise)",
        "ai.tone.neutre": "Neutral / informational",
        "ai.action.click_link": "Click a link",
        "ai.action.submit_creds": "Submit credentials on the page",
        "ai.action.open_attachment": "Open an attachment",
        "ai.action.reply": "Reply to the sender",
        "ai.action.download": "Download a file",
        "ai.diff.easy": "Easy (visible indicators: typos, suspicious URL, inconsistent tone)",
        "ai.diff.medium": "Medium (a few indicators to spot)",
        "ai.diff.hard": "Hard (few indicators, plausible scenario)",
        "ai.page.login": "Login page (credentials form)",
        "ai.page.otp": "OTP / 2FA validation",
        "ai.page.document": "Document download",
        "ai.page.confirm_profile": "User profile confirmation",
        "ai.page.info": "Information page (no form)",
        "ai.page.debrief": "Debrief page (reveals the exercise)",
        "ai.brand.intranet_generic": "Generic internal portal",
        "ai.brand.it_helpdesk": "Internal IT helpdesk",
        "ai.brand.hr_portal": "Internal HR portal",
        "ai.brand.saas_generic": "Generic SaaS (anonymous)",
        "ai.brand.doc_share": "Document sharing platform (anonymous)",
        "ai.brand.plain": "Plain layout / no branding",
        "ai.too_short": "Description too short",
        "ai.generating": "Generating…",
        "ai.generating_hint": "This can take up to 30 seconds.",
        "ai.done": "Content generated",
        "ai.error": "Generation error",
        "ai.settings.title": "Settings — AI assistant",
        "ai.settings.intro": "Paste an API key to activate the assistant. Keys are stored server-side (local SQLite database) and never sent back to the browser. Leave blank to keep the current value.",
        "ai.settings.priority": "Anthropic is preferred when both providers are configured.",
        "ai.settings.set": "configured",
        "ai.settings.not_set": "not configured",
        "ai.settings.from_env": "environment variable",
        "ai.settings.from_db": "database",
        "ai.settings.active_provider": "Active provider",
        "ai.settings.none_active": "No provider configured — the AI assistant is disabled.",
        "ai.settings.saved": "AI settings saved",
        "ai.settings.clear_hint": "Tip: enter a single space then Save to clear the stored key.",
        "ai.settings.provider": "Provider",
        "ai.settings.model": "Model",
        "ai.settings.key": "API key",
        "ai.settings.key_placeholder_set": "Stored key — leave blank to keep",
        "ai.settings.key_placeholder_empty": "Paste an API key",
        "ai.settings.show_key": "Show key",
        "ai.settings.hide_key": "Hide key",
        "ai.settings.clear_key": "Clear key",
        "ai.settings.clear_confirm": "Clear the stored key for this provider?",
        "ai.settings.via_env": "from environment variable (read-only)",
        "ai.settings.other_providers": "Other providers status",
        "ai.settings.configured_db": "configured (db)",
        "ai.settings.configured_env": "configured (env)",
        "ai.settings.not_configured": "not configured",
        "ai.settings.provider_anthropic": "Anthropic (Claude)",
        "ai.settings.provider_openai": "OpenAI (GPT)",
        "ai.settings.model_invalid": "Invalid model for this provider",
        "ai.settings.no_key_for_provider": "No API key configured for this provider",
        "common.close": "Close",
        "matrix.significant": "Significant",
        "matrix.high": "High",
        "matrix.x": "Impact",
        "matrix.critical": "Critical",
        "matrix.moderate": "Moderate",
        "matrix.y": "Likelihood",
        "matrix.extreme": "Extreme",
        "matrix.low": "Low",
    };

    if (typeof window._registerTranslations === "function") {
        window._registerTranslations("en", EN);
    } else {
        window._I18N = window._I18N || {};
        window._I18N.en = Object.assign(window._I18N.en || {}, EN);
    }
})();
