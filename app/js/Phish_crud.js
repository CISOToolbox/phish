/* Phish — P3 CRUD wiring (templates, landings, groups+CSV, sending profiles).
 *
 * Each entity follows the same pattern:
 *   _load{Entity}s()   → GET list, render table, swap empty/table visibility
 *   _phishNew{Entity}() → open create modal
 *   _edit{Entity}(id)  → open edit modal
 *   _delete{Entity}(id, name) → confirm + DELETE + reload
 *
 * All modals are built with ct_modal.js. Mutations show a status toast
 * via showStatus(); 401s already redirect via _phishFetch.
 */
(function() {
    "use strict";

    // Most-recently-loaded campaign detail — backs the timeline's
    // click-to-detail (see renderCampaignTimeline / _phishCampaignEvent).
    var _campaignDetail = null;

    // ── Helpers ─────────────────────────────────────────────────

    function _phishTz() {
        try { return localStorage.getItem("phish.tz") || ""; } catch (e) { return ""; }
    }

    // Settings-drawer hook: persist the chosen display timezone.
    window._phishSetTz = function(tz) {
        try { localStorage.setItem("phish.tz", tz || ""); } catch (e) {}
        showStatus(tt("settings.tz_saved", "Fuseau horaire enregistré"));
    };

    function fmtDate(iso) {
        if (!iso) return "";
        try {
            var s = String(iso);
            // The backend stores UTC, but SQLite drops the tzinfo so the API
            // serialises tz-less ISO strings — they must be read as UTC, not
            // as the browser's local time.
            if (s.indexOf("T") > 0 && !/(Z|[+-]\d\d:?\d\d)$/.test(s)) s += "Z";
            var d = new Date(s);
            if (isNaN(d.getTime())) return String(iso);
            var tz = _phishTz();
            var dOpts = tz ? { timeZone: tz } : undefined;
            var tOpts = { hour: "2-digit", minute: "2-digit" };
            if (tz) tOpts.timeZone = tz;
            return d.toLocaleDateString(undefined, dOpts) + " " + d.toLocaleTimeString(undefined, tOpts);
        } catch (e) { return String(iso); }
    }

    function tt(key, fallback) {
        if (typeof window.t === "function") {
            var v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }

    function renderError(err) {
        var msg = (err && err.detail) ? err.detail : (err && err.message) ? err.message : tt("common.error", "Erreur");
        showStatus(msg, "error");
    }

    function actionBtns(editFn, delFn, id, name) {
        return ''
            + '<button class="btn btn-ghost btn-sm" data-click="' + editFn + '" data-args=\'' + _da(id) + '\' title="' + esc(tt("common.edit", "Modifier")) + '">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
            + '</button> '
            + '<button class="btn btn-ghost btn-sm" data-click="' + delFn + '" data-args=\'' + _da(id, name) + '\' title="' + esc(tt("common.delete", "Supprimer")) + '">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            + '</button>';
    }

    function formField(label, name, val, kind, attrs) {
        kind = kind || "text";
        var input;
        var common = 'name="' + name + '" id="fld-' + name + '" ' + (attrs || "");
        if (kind === "textarea") {
            input = '<textarea ' + common + ' style="width:100%;min-height:140px;font-family:monospace;font-size:12px">' + esc(val || "") + '</textarea>';
        } else if (kind === "checkbox") {
            input = '<label style="display:flex;align-items:center;gap:6px;font-weight:normal"><input type="checkbox" ' + common + (val ? " checked" : "") + '> ' + esc(label) + '</label>';
            return '<div style="margin-bottom:12px">' + input + '</div>';
        } else {
            input = '<input type="' + kind + '" ' + common + ' value="' + esc(val == null ? "" : val) + '" style="width:100%">';
        }
        return '<div style="margin-bottom:12px"><label for="fld-' + name + '" style="display:block;font-weight:600;margin-bottom:4px">' + esc(label) + '</label>' + input + '</div>';
    }

    function readField(name) {
        var el = document.getElementById("fld-" + name);
        if (!el) return undefined;
        if (el.type === "checkbox") return !!el.checked;
        return el.value;
    }

    // ── Sending profiles ───────────────────────────────────────

    // Shared list-table renderer — wires ct_table (sort-ready + bulk
    // checkbox column) and ct_bulkbar (bottom bulk-action bar). Every
    // list panel uses this so they match the other CISO Toolbox modules.
    function _renderEntityTable(scope, holderId, rows, columns, emptyKey, emptyFallback) {
        var holder = document.getElementById(holderId);
        if (!holder) return;
        ct_bulkbar.attach({
            scope: scope,
            label: tt("bulk.selected", "{n} sélectionné(s)"),
            actions: [{
                id: "delete",
                label: tt("bulk.delete", "Supprimer"),
                icon: "trash",
                danger: true,
                confirm: {
                    title: tt("bulk.delete", "Supprimer"),
                    message: tt("bulk.delete_q", "Supprimer les {n} élément(s) sélectionné(s) ?")
                },
                onClick: "_phishBulkDelete"
            }]
        });
        holder.innerHTML = ct_table.render({
            columns: columns,
            rows: rows || [],
            rowKey: "id",
            bulk: { scope: scope },
            emptyHtml: '<div class="ct-empty-state">' + esc(tt(emptyKey, emptyFallback)) + '</div>'
        });
        ct_bulkbar.update(scope);
    }

    function loadSendingProfiles() {
        ct_bulkbar.clear("sprofiles");
        return _phishGet("api/sending-profiles").then(function(rows) {
            _renderEntityTable("sprofiles", "sprofiles-table", rows, [
                { key: "name", label: tt("settings.col.name", "Nom") },
                { key: "from_address", label: tt("settings.col.from", "From") },
                { key: "host", label: tt("settings.col.host", "Hôte SMTP") },
                { key: "_act", label: tt("common.actions", "Actions"), width: "140px",
                  render: function(p) { return actionBtns("_editSendingProfile", "_deleteSendingProfile", p.id, p.name); } }
            ], "settings.empty", "Aucun profil SMTP configuré.");
        }).catch(renderError);
    }

    function sendingProfileForm(p) {
        p = p || {};
        return ''
            + formField(tt("settings.col.name", "Nom"), "sp_name", p.name)
            + formField(tt("settings.col.from", "From") + ' (Display Name <addr@example.com>)', "sp_from", p.from_address)
            + formField(tt("settings.col.host", "Hôte SMTP") + ' (smtp.example.com:587)', "sp_host", p.host)
            + formField(tt("settings.username", "Utilisateur"), "sp_user", p.username)
            + formField(tt("settings.password", "Mot de passe"), "sp_pass", "", "password",
                p.password_set ? 'placeholder="' + esc(tt("settings.password_set", "Défini — laisser vide pour conserver")) + '"' : "")
            + formField(tt("settings.ignore_cert", "Ignorer les erreurs de certificat"), "sp_ignore", p.ignore_cert_errors, "checkbox");
    }

    function readSendingProfileForm() {
        return {
            name: readField("sp_name"),
            from_address: readField("sp_from"),
            host: readField("sp_host"),
            username: readField("sp_user") || "",
            password: readField("sp_pass") || "",
            ignore_cert_errors: !!readField("sp_ignore"),
            headers: []
        };
    }

    window._testSendingProfile = function(profileId) {
        // Trigger a real SMTP send to a recipient supplied at click-time.
        // If profileId is null → use the (unsaved) form contents.
        var dest = window.prompt(tt("settings.test_prompt", "Adresse destinataire du test SMTP :"), "");
        if (!dest) return;
        var body = { to: dest };
        var url = "api/sending-profiles/test";
        if (profileId) {
            url = "api/sending-profiles/" + profileId + "/test";
        } else {
            var form = readSendingProfileForm();
            if (!form.from_address || !form.host) {
                showStatus(tt("settings.test_need_form", "Renseignez From et Host avant le test"), "error");
                return;
            }
            body.from_address = form.from_address;
            body.host = form.host;
            body.username = form.username;
            body.password = form.password;
            body.ignore_cert_errors = form.ignore_cert_errors;
        }
        showStatus(tt("settings.test_sending", "Envoi du test SMTP…"));
        _phishPost(url, body).then(function(r) {
            if (r && r.ok) {
                showStatus(tt("settings.test_ok", "Test SMTP réussi"), "success");
            } else {
                showStatus(tt("settings.test_fail", "Test SMTP échoué") + " : " + ((r && r.error) || ""), "error");
            }
        }).catch(renderError);
    };

    window._phishNewSendingProfile = function() {
        ct_modal.open({
            title: tt("settings.new", "Nouveau profil SMTP"),
            body: sendingProfileForm(),
            size: "lg",
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler") },
                { id: "test", label: tt("settings.test", "Tester"), result: function() {
                    window._testSendingProfile(null);
                    return false; // keep modal open
                }},
                { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                    var body = readSendingProfileForm();
                    if (!body.name || !body.from_address || !body.host) {
                        showStatus(tt("common.required_fields", "Champs requis manquants"), "error");
                        return false;
                    }
                    return _phishPost("api/sending-profiles", body)
                        .then(function() { showStatus(tt("settings.saved", "Profil SMTP enregistré")); loadSendingProfiles(); })
                        .catch(function(e) { renderError(e); return false; });
                }}
            ]
        });
    };

    window._editSendingProfile = function(id) {
        _phishGet("api/sending-profiles/" + id).then(function(p) {
            ct_modal.open({
                title: tt("settings.edit", "Modifier le profil SMTP"),
                body: sendingProfileForm(p),
                size: "lg",
                buttons: [
                    { id: "cancel", label: tt("common.cancel", "Annuler") },
                    { id: "test", label: tt("settings.test", "Tester"), result: function() {
                        window._testSendingProfile(id);
                        return false;
                    }},
                    { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                        var body = readSendingProfileForm();
                        return _phishPatch("api/sending-profiles/" + id, body)
                            .then(function() { showStatus(tt("settings.saved", "Profil SMTP enregistré")); loadSendingProfiles(); })
                            .catch(function(e) { renderError(e); return false; });
                    }}
                ]
            });
        }).catch(renderError);
    };

    window._deleteSendingProfile = function(id, name) {
        ct_modal.confirm({
            title: tt("settings.delete", "Supprimer le profil SMTP"),
            message: tt("settings.delete_q", "Supprimer") + " « " + name + " » ?",
            danger: true,
            confirmLabel: tt("common.delete", "Supprimer")
        }).then(function(ok) {
            if (!ok) return;
            _phishDel("api/sending-profiles/" + id)
                .then(function() { showStatus(tt("settings.deleted", "Profil supprimé")); loadSendingProfiles(); })
                .catch(renderError);
        });
    };

    // ── Templates ──────────────────────────────────────────────

    function loadTemplates() {
        ct_bulkbar.clear("templates");
        return _phishGet("api/templates").then(function(rows) {
            _renderEntityTable("templates", "templates-table", rows, [
                { key: "name", label: tt("templates.col.name", "Nom") },
                { key: "subject", label: tt("templates.col.subject", "Sujet") },
                { key: "updated_at", label: tt("templates.col.updated", "Mis à jour"),
                  render: function(p) { return esc(fmtDate(p.updated_at)); } },
                { key: "_act", label: tt("common.actions", "Actions"), width: "140px",
                  render: function(p) { return actionBtns("_editTemplate", "_deleteTemplate", p.id, p.name); } }
            ], "templates.empty", "Aucun modèle pour le moment.");
        }).catch(renderError);
    }

    function templateForm(t) {
        t = t || {};
        // Defer the AI injection until the modal is in the DOM.
        setTimeout(function() {
            if (typeof window._phishAiInjectButton === "function") {
                window._phishAiInjectButton("ai-slot-template", "template");
            }
        }, 0);
        return ''
            + '<div id="ai-slot-template" style="display:flex;justify-content:flex-end;margin-bottom:8px"></div>'
            + formField(tt("templates.col.name", "Nom"), "tpl_name", t.name)
            + formField(tt("templates.col.subject", "Sujet"), "tpl_subject", t.subject)
            + htmlEditorField("tpl", tt("templates.html", "HTML"), t.html,
                tt("templates.html_hint", "placeholders: {{.FirstName}} {{.LastName}} {{.Email}} {{.URL}} {{.TrackingURL}}"))
            + formField(tt("templates.text", "Texte brut (fallback)"), "tpl_text", t.text, "textarea");
    }

    function readTemplateForm() {
        return {
            name: readField("tpl_name"),
            subject: readField("tpl_subject") || "",
            html: readField("tpl_html") || "",
            text: readField("tpl_text") || "",
            attachments: []
        };
    }

    window._phishNewTemplate = function(prefill) {
        // Register a reopener so the AI assistant modal can come back
        // to this exact form (with merged AI output) on close.
        window._phishLastTemplateReopen = function(merged) {
            window._phishNewTemplate(merged);
        };
        ct_modal.open({
            title: tt("templates.new", "Nouveau modèle"),
            body: templateForm(prefill || {}),
            size: "lg",
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler") },
                { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                    var body = readTemplateForm();
                    if (!body.name) { showStatus(tt("common.required_fields", "Champs requis manquants"), "error"); return false; }
                    return _phishPost("api/templates", body)
                        .then(function() { showStatus(tt("templates.saved", "Modèle enregistré")); loadTemplates(); })
                        .catch(function(e) { renderError(e); return false; });
                }}
            ]
        });
    };

    window._editTemplate = function(id, prefill) {
        var open = function(item) {
            window._phishLastTemplateReopen = function(merged) {
                // Re-fetch is unnecessary — we already have `item`. Merge AI
                // output on top of it and reopen.
                window._editTemplate(id, Object.assign({}, item, merged || {}));
            };
            ct_modal.open({
                title: tt("templates.edit", "Modifier le modèle"),
                body: templateForm(prefill || item),
                size: "lg",
                buttons: [
                    { id: "cancel", label: tt("common.cancel", "Annuler") },
                    { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                        var body = readTemplateForm();
                        return _phishPatch("api/templates/" + id, body)
                            .then(function() { showStatus(tt("templates.saved", "Modèle enregistré")); loadTemplates(); })
                            .catch(function(e) { renderError(e); return false; });
                    }}
                ]
            });
        };
        if (prefill) {
            open(prefill);
        } else {
            _phishGet("api/templates/" + id).then(open).catch(renderError);
        }
    };

    window._deleteTemplate = function(id, name) {
        ct_modal.confirm({
            title: tt("templates.delete", "Supprimer le modèle"),
            message: tt("common.delete_q", "Supprimer") + " « " + name + " » ?",
            danger: true,
            confirmLabel: tt("common.delete", "Supprimer")
        }).then(function(ok) {
            if (!ok) return;
            _phishDel("api/templates/" + id)
                .then(function() { showStatus(tt("templates.deleted", "Modèle supprimé")); loadTemplates(); })
                .catch(renderError);
        });
    };

    // ── Landing pages ──────────────────────────────────────────

    function loadLandings() {
        ct_bulkbar.clear("landings");
        return _phishGet("api/landing-pages").then(function(rows) {
            _renderEntityTable("landings", "landings-table", rows, [
                { key: "name", label: tt("landings.col.name", "Nom") },
                { key: "capture", label: tt("landings.col.capture", "Capture formulaire"),
                  render: function(p) { return esc(p.capture_credentials ? tt("common.yes", "Oui") : tt("common.no", "Non")); } },
                { key: "redirect_url", label: tt("landings.col.redirect", "Redirection") },
                { key: "_act", label: tt("common.actions", "Actions"), width: "140px",
                  render: function(p) { return actionBtns("_editLanding", "_deleteLanding", p.id, p.name); } }
            ], "landings.empty", "Aucune page pour le moment.");
        }).catch(renderError);
    }

    function landingImportRow() {
        return ''
            + '<div style="margin-bottom:12px;padding:10px;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc">'
            + '<label for="fld-lp_import_url" style="display:block;font-weight:600;margin-bottom:4px">'
            + esc(tt("landings.import.label", "Cloner une page existante")) + '</label>'
            + '<div style="font-size:12px;color:#64748b;margin-bottom:6px">'
            + esc(tt("landings.import.hint", "Saisissez l'URL d'une page réelle pour copier son code HTML ci-dessous. À des fins de sensibilisation autorisée uniquement.")) + '</div>'
            + '<div style="display:flex;gap:8px;align-items:center">'
            + '<input type="url" id="fld-lp_import_url" placeholder="https://example.com/login" style="flex:1;min-width:0">'
            + '<button type="button" class="btn btn-secondary" id="btn-lp-import" data-click="_phishImportSite" data-pass-el="1">'
            + esc(tt("landings.import.btn", "Importer le HTML")) + '</button>'
            + '</div></div>';
    }

    // Shared HTML editor with a Code / Aperçu toggle. `prefix` namespaces
    // the element ids (lp → landing pages, tpl → email templates) so the
    // same widget — and _phishHtmlView — drives both modals.
    function htmlEditorField(prefix, label, value, hint) {
        return ''
            + '<div style="margin-bottom:12px">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">'
            + '<label for="fld-' + prefix + '_html" style="font-weight:600">' + esc(label) + '</label>'
            + '<div class="btn-group-sm">'
            + '<button type="button" class="btn btn-sm btn-primary" id="' + prefix + '-view-code" data-click="_phishHtmlView" data-args=\'' + _da(prefix, "code") + '\'>' + esc(tt("editor.code", "Code")) + '</button>'
            + '<button type="button" class="btn btn-sm" id="' + prefix + '-view-preview" data-click="_phishHtmlView" data-args=\'' + _da(prefix, "preview") + '\'>' + esc(tt("editor.preview", "Aperçu")) + '</button>'
            + '</div></div>'
            + (hint ? '<div style="font-size:12px;color:#64748b;margin-bottom:4px">' + esc(hint) + '</div>' : '')
            + '<textarea name="' + prefix + '_html" id="fld-' + prefix + '_html" style="width:100%;min-height:300px;font-family:monospace;font-size:12px">' + esc(value || "") + '</textarea>'
            + '<iframe id="' + prefix + '-preview-frame" name="' + prefix + '-preview-frame" sandbox="" title="' + esc(tt("editor.preview", "Aperçu")) + '" style="display:none;width:100%;height:440px;border:1px solid #cbd5e1;border-radius:6px;background:#fff"></iframe>'
            + '</div>';
    }

    function landingForm(l) {
        l = l || {};
        setTimeout(function() {
            if (typeof window._phishAiInjectButton === "function") {
                window._phishAiInjectButton("ai-slot-landing", "landing");
            }
        }, 0);
        return ''
            + '<div id="ai-slot-landing" style="display:flex;justify-content:flex-end;margin-bottom:8px"></div>'
            + formField(tt("landings.col.name", "Nom"), "lp_name", l.name)
            + landingImportRow()
            + htmlEditorField("lp", tt("landings.html", "HTML de la page"), l.html)
            + formField(tt("landings.col.capture", "Exposer un formulaire (n'enregistre PAS les valeurs)"), "lp_capture", l.capture_credentials, "checkbox")
            + formField(tt("landings.col.redirect", "URL de redirection après soumission"), "lp_redirect", l.redirect_url);
    }

    window._phishHtmlView = function(prefix, mode) {
        var ta = document.getElementById("fld-" + prefix + "_html");
        var frame = document.getElementById(prefix + "-preview-frame");
        var btnCode = document.getElementById(prefix + "-view-code");
        var btnPrev = document.getElementById(prefix + "-view-preview");
        if (!ta || !frame) return;
        if (mode === "preview") {
            // Submit the current (unsaved) HTML to the preview endpoint so
            // it renders from a real same-origin URL — a srcdoc/blob iframe
            // would inherit the admin SPA's strict CSP and break a cloned
            // page's external CSS/images.
            var form = document.createElement("form");
            form.method = "POST";
            form.action = "api/preview";
            form.target = prefix + "-preview-frame";
            var inp = document.createElement("input");
            inp.type = "hidden";
            inp.name = "html";
            inp.value = ta.value;
            form.appendChild(inp);
            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);
            ta.style.display = "none";
            frame.style.display = "";
            if (btnCode) btnCode.classList.remove("btn-primary");
            if (btnPrev) btnPrev.classList.add("btn-primary");
        } else {
            frame.style.display = "none";
            ta.style.display = "";
            if (btnPrev) btnPrev.classList.remove("btn-primary");
            if (btnCode) btnCode.classList.add("btn-primary");
        }
    };

    window._phishImportSite = function(btn) {
        var inp = document.getElementById("fld-lp_import_url");
        var ta = document.getElementById("fld-lp_html");
        if (!inp || !ta) return;
        var url = (inp.value || "").trim();
        if (!url) {
            showStatus(tt("landings.import.url_required", "Saisissez une URL à cloner."), "error");
            inp.focus();
            return;
        }
        var label = btn ? btn.textContent : "";
        if (btn) { btn.disabled = true; btn.textContent = tt("landings.import.loading", "Rendu de la page en cours…"); }
        showStatus(tt("landings.import.loading", "Rendu de la page en cours…"));
        _phishPost("api/landing-pages/import-site", { url: url })
            .then(function(res) {
                ta.value = (res && res.html) || "";
                if (typeof window._phishHtmlView === "function") window._phishHtmlView("lp", "code");
                showStatus(tt("landings.import.done", "Page importée — scripts neutralisés, formulaire câblé pour la capture. Relisez avant d'enregistrer."));
            })
            .catch(function(e) { renderError(e); })
            .then(function() {
                if (btn) { btn.disabled = false; btn.textContent = label; }
            });
    };

    function readLandingForm() {
        return {
            name: readField("lp_name"),
            html: readField("lp_html") || "",
            capture_credentials: !!readField("lp_capture"),
            redirect_url: readField("lp_redirect") || ""
        };
    }

    window._phishNewLanding = function(prefill) {
        window._phishLastLandingReopen = function(merged) {
            window._phishNewLanding(merged);
        };
        ct_modal.open({
            title: tt("landings.new", "Nouvelle page"),
            body: landingForm(prefill || {}),
            size: "lg",
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler") },
                { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                    var body = readLandingForm();
                    if (!body.name) { showStatus(tt("common.required_fields", "Champs requis manquants"), "error"); return false; }
                    return _phishPost("api/landing-pages", body)
                        .then(function() { showStatus(tt("landings.saved", "Page enregistrée")); loadLandings(); })
                        .catch(function(e) { renderError(e); return false; });
                }}
            ]
        });
    };

    window._editLanding = function(id, prefill) {
        var open = function(item) {
            window._phishLastLandingReopen = function(merged) {
                window._editLanding(id, Object.assign({}, item, merged || {}));
            };
            ct_modal.open({
                title: tt("landings.edit", "Modifier la page"),
                body: landingForm(prefill || item),
                size: "lg",
                buttons: [
                    { id: "cancel", label: tt("common.cancel", "Annuler") },
                    { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                        var body = readLandingForm();
                        return _phishPatch("api/landing-pages/" + id, body)
                            .then(function() { showStatus(tt("landings.saved", "Page enregistrée")); loadLandings(); })
                            .catch(function(e) { renderError(e); return false; });
                    }}
                ]
            });
        };
        if (prefill) {
            open(prefill);
        } else {
            _phishGet("api/landing-pages/" + id).then(open).catch(renderError);
        }
    };

    window._deleteLanding = function(id, name) {
        ct_modal.confirm({
            title: tt("landings.delete", "Supprimer la page"),
            message: tt("common.delete_q", "Supprimer") + " « " + name + " » ?",
            danger: true,
            confirmLabel: tt("common.delete", "Supprimer")
        }).then(function(ok) {
            if (!ok) return;
            _phishDel("api/landing-pages/" + id)
                .then(function() { showStatus(tt("landings.deleted", "Page supprimée")); loadLandings(); })
                .catch(renderError);
        });
    };

    // ── Groups + CSV import ────────────────────────────────────

    /* CSV parser — minimal RFC 4180 subset.
     * Recognised headers (case-insensitive, accent-stripped): email,
     * first_name | firstname | first, last_name | lastname | last,
     * position | role | title. Unknown columns go into ``extra``.
     */
    function parseCsv(text) {
        text = (text || "").replace(/\r\n?/g, "\n").trim();
        if (!text) return { rows: [], errors: ["empty"] };
        var lines = text.split(/\n/);
        var head = splitCsvLine(lines[0]).map(function(s) {
            return s.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9_]/g, "");
        });
        var idx = { email: -1, first_name: -1, last_name: -1, position: -1 };
        var extras = [];
        head.forEach(function(h, i) {
            if (h === "email" || h === "mail" || h === "adresse" || h === "adresseemail") idx.email = i;
            else if (h === "firstname" || h === "first" || h === "prenom") idx.first_name = i;
            else if (h === "lastname" || h === "last" || h === "nom") idx.last_name = i;
            else if (h === "position" || h === "role" || h === "title" || h === "poste") idx.position = i;
            else extras.push({ key: h, col: i });
        });
        if (idx.email < 0) return { rows: [], errors: ["csv_no_email_column"] };
        var rows = [];
        for (var i = 1; i < lines.length; i++) {
            var raw = lines[i];
            if (!raw.trim()) continue;
            var cells = splitCsvLine(raw);
            var email = (cells[idx.email] || "").trim();
            if (!email || email.indexOf("@") < 0) continue;
            var ex = {};
            extras.forEach(function(e) { ex[e.key] = (cells[e.col] || "").trim(); });
            rows.push({
                email: email,
                first_name: idx.first_name >= 0 ? (cells[idx.first_name] || "").trim() : "",
                last_name: idx.last_name >= 0 ? (cells[idx.last_name] || "").trim() : "",
                position: idx.position >= 0 ? (cells[idx.position] || "").trim() : "",
                extra: ex
            });
        }
        return { rows: rows, errors: [] };
    }

    function splitCsvLine(line) {
        var out = []; var cur = ""; var q = false;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (q) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') { q = false; }
                else { cur += c; }
            } else {
                if (c === '"') q = true;
                else if (c === ',' || c === ';' || c === '\t') { out.push(cur); cur = ""; }
                else cur += c;
            }
        }
        out.push(cur);
        return out;
    }

    function loadGroups() {
        ct_bulkbar.clear("groups");
        return _phishGet("api/groups").then(function(rows) {
            _renderEntityTable("groups", "groups-table", rows, [
                { key: "name", label: tt("groups.col.name", "Nom") },
                { key: "target_count", label: tt("groups.col.size", "Nombre de cibles"),
                  render: function(g) { return String(g.target_count || 0); } },
                { key: "updated_at", label: tt("groups.col.updated", "Mis à jour"),
                  render: function(g) { return esc(fmtDate(g.updated_at)); } },
                { key: "_act", label: tt("common.actions", "Actions"), width: "210px",
                  render: function(g) {
                    return '<button class="btn btn-ghost btn-sm" data-click="_viewGroup" data-args=\'' + _da(g.id) + '\' title="' + esc(tt("groups.view", "Voir les cibles")) + '">'
                        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                        + '</button> '
                        + actionBtns("_editGroup", "_deleteGroup", g.id, g.name);
                  } }
            ], "groups.empty", "Aucun groupe pour le moment.");
        }).catch(renderError);
    }

    function groupCreateForm() {
        return ''
            + formField(tt("groups.col.name", "Nom"), "g_name", "")
            + '<div style="margin-bottom:8px;font-weight:600">' + esc(tt("groups.csv", "Coller un CSV (optionnel)")) + '</div>'
            + '<div class="muted" style="font-size:0.85em;margin-bottom:6px">' + esc(tt("groups.csv_hint", "En-tête requise : email,first_name,last_name,position. Séparateur ',' ou ';'.")) + '</div>'
            + '<textarea id="fld-g_csv" style="width:100%;min-height:160px;font-family:monospace;font-size:12px" placeholder="email,first_name,last_name,position\nalice@ex.com,Alice,Martin,RH"></textarea>';
    }

    window._phishNewGroup = function() {
        ct_modal.open({
            title: tt("groups.new", "Nouveau groupe"),
            body: groupCreateForm(),
            size: "lg",
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler") },
                { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                    var name = readField("g_name");
                    if (!name) { showStatus(tt("common.required_fields", "Champs requis manquants"), "error"); return false; }
                    var csv = readField("g_csv") || "";
                    var targets = [];
                    if (csv.trim()) {
                        var parsed = parseCsv(csv);
                        if (parsed.errors.length) {
                            showStatus(tt("groups.csv_error", "CSV invalide") + ": " + parsed.errors.join(","), "error");
                            return false;
                        }
                        targets = parsed.rows;
                    }
                    return _phishPost("api/groups", { name: name, targets: targets })
                        .then(function(g) { showStatus(tt("groups.saved", "Groupe enregistré") + " (" + (g.targets || []).length + " " + tt("groups.targets", "cibles") + ")"); loadGroups(); })
                        .catch(function(e) { renderError(e); return false; });
                }}
            ]
        });
    };

    window._editGroup = function(id) {
        _phishGet("api/groups/" + id).then(function(g) {
            ct_modal.open({
                title: tt("groups.edit", "Modifier le groupe"),
                body: formField(tt("groups.col.name", "Nom"), "g_name", g.name),
                buttons: [
                    { id: "cancel", label: tt("common.cancel", "Annuler") },
                    { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                        return _phishPatch("api/groups/" + id, { name: readField("g_name") })
                            .then(function() { showStatus(tt("groups.saved", "Groupe enregistré")); loadGroups(); })
                            .catch(function(e) { renderError(e); return false; });
                    }}
                ]
            });
        }).catch(renderError);
    };

    window._deleteGroup = function(id, name) {
        ct_modal.confirm({
            title: tt("groups.delete", "Supprimer le groupe"),
            message: tt("common.delete_q", "Supprimer") + " « " + name + " » ?",
            danger: true,
            confirmLabel: tt("common.delete", "Supprimer")
        }).then(function(ok) {
            if (!ok) return;
            _phishDel("api/groups/" + id)
                .then(function() { showStatus(tt("groups.deleted", "Groupe supprimé")); loadGroups(); })
                .catch(renderError);
        });
    };

    window._viewGroup = function(id) {
        _phishGet("api/groups/" + id).then(function(g) {
            var rowsH = (g.targets || []).map(function(t) {
                return '<tr>'
                    + '<td>' + esc(t.email) + '</td>'
                    + '<td>' + esc(t.first_name || "") + '</td>'
                    + '<td>' + esc(t.last_name || "") + '</td>'
                    + '<td>' + esc(t.position || "") + '</td>'
                    + '<td><button class="btn btn-ghost btn-sm" data-click="_deleteTarget" data-args=\'' + _da(g.id, t.id) + '\' title="' + esc(tt("common.delete", "Supprimer")) + '">'
                    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>'
                    + '</button></td>'
                    + '</tr>';
            }).join("") || '<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:12px">' + esc(tt("groups.no_targets", "Aucune cible")) + '</td></tr>';

            var body = ''
                + '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">'
                +   '<strong>' + esc(g.name) + '</strong>'
                +   '<span class="muted">— ' + (g.targets || []).length + ' ' + esc(tt("groups.targets", "cibles")) + '</span>'
                +   '<span style="flex:1"></span>'
                +   '<button class="btn btn-secondary btn-sm" data-click="_importTargetsCsv" data-args=\'' + _da(g.id) + '\'>'
                +     esc(tt("groups.import_csv", "Importer CSV"))
                +   '</button>'
                + '</div>'
                + '<table class="ct-table" style="margin-top:0"><thead><tr>'
                + '<th>Email</th><th>' + esc(tt("groups.col_first", "Prénom")) + '</th>'
                + '<th>' + esc(tt("groups.col_last", "Nom")) + '</th>'
                + '<th>' + esc(tt("groups.col_position", "Poste")) + '</th>'
                + '<th style="width:60px"></th>'
                + '</tr></thead><tbody>' + rowsH + '</tbody></table>';

            ct_modal.open({
                title: tt("groups.view", "Cibles du groupe"),
                body: body,
                size: "lg",
                buttons: [{ id: "close", label: tt("common.close", "Fermer") }]
            });
        }).catch(renderError);
    };

    window._importTargetsCsv = function(gid) {
        ct_modal.open({
            title: tt("groups.import_csv", "Importer CSV"),
            body: ''
                + '<div class="muted" style="font-size:0.85em;margin-bottom:6px">' + esc(tt("groups.csv_hint", "En-tête requise : email,first_name,last_name,position.")) + '</div>'
                + '<textarea id="fld-g_csv2" style="width:100%;min-height:200px;font-family:monospace;font-size:12px"></textarea>'
                + '<div style="margin-top:8px"><label style="font-weight:normal"><input type="checkbox" id="fld-g_replace"> ' + esc(tt("groups.replace", "Remplacer les cibles existantes")) + '</label></div>',
            size: "lg",
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler") },
                { id: "import", label: tt("groups.import", "Importer"), primary: true, result: function() {
                    var csv = document.getElementById("fld-g_csv2").value;
                    var replace = document.getElementById("fld-g_replace").checked;
                    var parsed = parseCsv(csv);
                    if (parsed.errors.length) {
                        showStatus(tt("groups.csv_error", "CSV invalide") + ": " + parsed.errors.join(","), "error");
                        return false;
                    }
                    if (!parsed.rows.length) {
                        showStatus(tt("groups.csv_empty", "Aucune ligne valide"), "error");
                        return false;
                    }
                    return _phishPost("api/groups/" + gid + "/targets", { targets: parsed.rows, replace: replace })
                        .then(function(g) {
                            showStatus(tt("groups.imported", "Cibles importées") + " (" + (g.targets || []).length + ")");
                            loadGroups();
                        })
                        .catch(function(e) { renderError(e); return false; });
                }}
            ]
        });
    };

    window._deleteTarget = function(gid, tid) {
        _phishDel("api/groups/" + gid + "/targets/" + tid)
            .then(function() {
                showStatus(tt("groups.target_deleted", "Cible supprimée"));
                ct_modal.close();
                loadGroups();
            })
            .catch(renderError);
    };

    // ── Campaigns ──────────────────────────────────────────────

    /* Funnel rate helper — click rate is the canonical KPI but we
     * guard against div-by-zero (a campaign with 0 targets shouldn't
     * render NaN%).
     */
    function clickRate(c) {
        var n = c.target_count || 0;
        if (!n) return "—";
        var r = (c.clicked_count || 0) / n;
        return (r * 100).toFixed(0) + "%";
    }

    function statusBadge(c) {
        var s = c.status || "queued";
        var label = tt("campaigns.status." + s, s);
        var color;
        switch (s) {
            case "queued":      color = "#6b7280"; break;
            case "in_progress": color = "#2563eb"; break;
            case "completed":   color = "#059669"; break;
            case "cancelled":   color = "#9ca3af"; break;
            default:            color = "#6b7280";
        }
        return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;'
            + 'background:' + color + ';color:#fff;font-size:0.8em;font-weight:600">'
            + esc(label) + '</span>';
    }

    function resultStatusLabel(s) {
        return tt("campaigns.result." + s, s);
    }

    function campaignActionBtns(c) {
        var h = '';
        h += '<button class="btn btn-ghost btn-sm" data-click="_viewCampaign" data-args=\'' + _da(c.id) + '\' title="' + esc(tt("campaigns.view", "Voir les résultats")) + '">'
           + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
           + '</button> ';
        if (c.status === "queued") {
            h += '<button class="btn btn-primary btn-sm" data-click="_launchCampaign" data-args=\'' + _da(c.id, c.name) + '\' title="' + esc(tt("campaigns.launch", "Lancer")) + '">'
               + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
               + '</button> ';
        }
        if (c.status === "in_progress") {
            h += '<button class="btn btn-warning btn-sm" data-click="_cancelCampaign" data-args=\'' + _da(c.id, c.name) + '\' title="' + esc(tt("campaigns.cancel", "Annuler")) + '">'
               + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>'
               + '</button> ';
        }
        h += '<button class="btn btn-ghost btn-sm" data-click="_duplicateCampaign" data-args=\'' + _da(c.id) + '\' title="' + esc(tt("campaigns.duplicate", "Dupliquer")) + '">'
           + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
           + '</button> ';
        h += '<button class="btn btn-ghost btn-sm" data-click="_exportCampaignCsv" data-args=\'' + _da(c.id) + '\' title="' + esc(tt("campaigns.export_csv", "Exporter CSV")) + '">'
           + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
           + '</button> ';
        h += '<button class="btn btn-danger btn-sm" data-click="_deleteCampaign" data-args=\'' + _da(c.id, c.name) + '\' title="' + esc(tt("common.delete", "Supprimer")) + '">'
           + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
           + '</button>';
        return h;
    }

    function loadCampaigns() {
        showCampaignDetail(false);
        ct_bulkbar.clear("campaigns");
        return _phishGet("api/campaigns").then(function(rows) {
            _renderEntityTable("campaigns", "campaigns-table", rows, [
                { key: "name", label: tt("campaigns.col.name", "Nom") },
                { key: "status", label: tt("campaigns.col.status", "Statut"),
                  render: function(c) { return statusBadge(c); } },
                { key: "launch_date", label: tt("campaigns.col.launch", "Lancement"),
                  render: function(c) { return esc(fmtDate(c.launch_date)); } },
                { key: "target_count", label: tt("campaigns.col.targets", "Cibles"),
                  render: function(c) { return String(c.target_count || 0); } },
                { key: "rate", label: tt("campaigns.col.rate", "Taux click"),
                  render: function(c) { return esc(clickRate(c)); } },
                { key: "_act", label: tt("common.actions", "Actions"), width: "210px",
                  render: function(c) { return campaignActionBtns(c); } }
            ], "campaigns.empty", "Aucune campagne pour le moment.");
        }).catch(renderError);
    }

    function selectField(label, name, options, selectedId) {
        var opts = '<option value="">—</option>' + options.map(function(o) {
            var sel = (String(o.id) === String(selectedId)) ? ' selected' : '';
            return '<option value="' + esc(o.id) + '"' + sel + '>' + esc(o.name) + '</option>';
        }).join("");
        return '<div style="margin-bottom:12px">'
            + '<label for="fld-' + name + '" style="display:block;font-weight:600;margin-bottom:4px">' + esc(label) + '</label>'
            + '<select name="' + name + '" id="fld-' + name + '" style="width:100%">' + opts + '</select>'
            + '</div>';
    }

    function campaignForm(c, options) {
        c = c || {};
        return ''
            + formField(tt("campaigns.form.name", "Nom de la campagne"), "c_name", c.name)
            + selectField(tt("campaigns.form.sending_profile", "Profil SMTP"), "c_sp", options.sendingProfiles, c.sending_profile_id)
            + selectField(tt("campaigns.form.template", "Modèle d'email"), "c_tpl", options.templates, c.template_id)
            + selectField(tt("campaigns.form.landing", "Page d'atterrissage"), "c_lp", options.landings, c.landing_page_id)
            + selectField(tt("campaigns.form.group", "Groupe de cibles"), "c_grp", options.groups, c.group_id)
            + formField(tt("campaigns.form.url", "URL de base"), "c_url", c.url || window.location.origin);
    }

    function readCampaignForm() {
        return {
            name: readField("c_name"),
            sending_profile_id: readField("c_sp"),
            template_id: readField("c_tpl"),
            landing_page_id: readField("c_lp"),
            group_id: readField("c_grp"),
            url: readField("c_url") || ""
        };
    }

    function fetchCampaignOptions() {
        return Promise.all([
            _phishGet("api/sending-profiles"),
            _phishGet("api/templates"),
            _phishGet("api/landing-pages"),
            _phishGet("api/groups")
        ]).then(function(arr) {
            return {
                sendingProfiles: arr[0] || [],
                templates: arr[1] || [],
                landings: arr[2] || [],
                groups: arr[3] || []
            };
        });
    }

    window._phishNewCampaign = function() {
        fetchCampaignOptions().then(function(opts) {
            if (!opts.sendingProfiles.length || !opts.templates.length || !opts.landings.length || !opts.groups.length) {
                showStatus(tt("campaigns.form.missing_deps",
                    "Créez au moins un profil SMTP, un modèle, une page et un groupe avant de créer une campagne."), "error");
                return;
            }
            ct_modal.open({
                title: tt("campaigns.new", "Nouvelle campagne"),
                body: campaignForm(null, opts),
                size: "lg",
                buttons: [
                    { id: "cancel", label: tt("common.cancel", "Annuler") },
                    { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                        var body = readCampaignForm();
                        if (!body.name || !body.sending_profile_id || !body.template_id || !body.landing_page_id || !body.group_id) {
                            showStatus(tt("common.required_fields", "Champs requis manquants"), "error");
                            return false;
                        }
                        return _phishPost("api/campaigns", body)
                            .then(function() { showStatus(tt("campaigns.saved", "Campagne enregistrée")); loadCampaigns(); })
                            .catch(function(e) { renderError(e); return false; });
                    }}
                ]
            });
        }).catch(renderError);
    };

    window._duplicateCampaign = function(id) {
        // Pull the source campaign, then open the New-Campaign modal
        // pre-populated with the same dependency IDs and name + " (copie)".
        Promise.all([
            _phishGet("api/campaigns/" + id),
            fetchCampaignOptions()
        ]).then(function(arr) {
            var src = arr[0];
            var opts = arr[1];
            var seed = {
                name: (src.name || "") + " " + tt("campaigns.copy_suffix", "(copie)"),
                sending_profile_id: src.sending_profile_id,
                template_id: src.template_id,
                landing_page_id: src.landing_page_id,
                group_id: src.group_id,
                url: src.url
            };
            ct_modal.open({
                title: tt("campaigns.duplicate", "Dupliquer la campagne"),
                body: campaignForm(seed, opts),
                size: "lg",
                buttons: [
                    { id: "cancel", label: tt("common.cancel", "Annuler") },
                    { id: "save", label: tt("common.save", "Enregistrer"), primary: true, result: function() {
                        var body = readCampaignForm();
                        if (!body.name || !body.sending_profile_id || !body.template_id || !body.landing_page_id || !body.group_id) {
                            showStatus(tt("common.required_fields", "Champs requis manquants"), "error");
                            return false;
                        }
                        return _phishPost("api/campaigns", body)
                            .then(function() { showStatus(tt("campaigns.saved", "Campagne enregistrée")); loadCampaigns(); })
                            .catch(function(e) { renderError(e); return false; });
                    }}
                ]
            });
        }).catch(renderError);
    };

    window._exportCampaignCsv = function(id) {
        // Server returns text/csv with Content-Disposition; fetch as blob
        // so we keep the auth cookie attached (a bare <a download> would
        // hit a 401 on cross-origin / cookie-less browsers).
        fetch("api/campaigns/" + id + "/export.csv", { credentials: "same-origin" })
            .then(function(r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                var disp = r.headers.get("Content-Disposition") || "";
                var m = /filename="?([^";]+)"?/.exec(disp);
                var name = m ? m[1] : "campaign.csv";
                return r.blob().then(function(b) { return { blob: b, name: name }; });
            })
            .then(function(o) {
                var url = URL.createObjectURL(o.blob);
                var a = document.createElement("a");
                a.href = url; a.download = o.name;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showStatus(tt("campaigns.exported", "Export CSV téléchargé"));
            })
            .catch(function(e) { renderError(e); });
    };

    window._launchCampaign = function(id, name) {
        ct_modal.confirm({
            title: tt("campaigns.confirm_launch", "Lancer la campagne ?"),
            message: '« ' + name + ' » — ' + tt("campaigns.confirm_launch_msg",
                "Les e-mails seront envoyés immédiatement à toutes les cibles."),
            confirmLabel: tt("campaigns.launch", "Lancer")
        }).then(function(ok) {
            if (!ok) return;
            _phishPost("api/campaigns/" + id + "/launch", {})
                .then(function() { showStatus(tt("campaigns.launched", "Campagne lancée")); loadCampaigns(); })
                .catch(renderError);
        });
    };

    window._cancelCampaign = function(id, name) {
        ct_modal.confirm({
            title: tt("campaigns.confirm_cancel", "Annuler la campagne ?"),
            message: '« ' + name + ' » — ' + tt("campaigns.confirm_cancel_msg",
                "Les envois en cours seront stoppés."),
            danger: true,
            confirmLabel: tt("campaigns.cancel", "Annuler")
        }).then(function(ok) {
            if (!ok) return;
            _phishPost("api/campaigns/" + id + "/cancel", {})
                .then(function() { showStatus(tt("campaigns.cancelled", "Campagne annulée")); loadCampaigns(); })
                .catch(renderError);
        });
    };

    window._deleteCampaign = function(id, name) {
        ct_modal.confirm({
            title: tt("campaigns.delete", "Supprimer la campagne"),
            message: tt("common.delete_q", "Supprimer") + " « " + name + " » ?",
            danger: true,
            confirmLabel: tt("common.delete", "Supprimer")
        }).then(function(ok) {
            if (!ok) return;
            _phishDel("api/campaigns/" + id)
                .then(function() { showStatus(tt("campaigns.deleted", "Campagne supprimée")); loadCampaigns(); })
                .catch(renderError);
        });
    };

    function renderResultsTable(c) {
        var results = (c && c.results) || [];
        if (!results.length) {
            return '<p class="muted">' + esc(tt("campaigns.no_results", "Aucun résultat")) + '</p>';
        }
        var rows = results.map(function(r) {
            var name = [r.first_name, r.last_name].filter(Boolean).join(" ");
            var who = name ? (esc(name) + ' <span class="muted">&lt;' + esc(r.email) + '&gt;</span>') : esc(r.email);
            var reportCell = r.report_date ? esc(fmtDate(r.report_date)) : '<span class="muted">—</span>';
            return '<tr>'
                + '<td>' + who + '</td>'
                + '<td>' + esc(resultStatusLabel(r.status)) + '</td>'
                + '<td>' + fmtDate(r.send_date) + '</td>'
                + '<td>' + fmtDate(r.open_date) + '</td>'
                + '<td>' + fmtDate(r.click_date) + '</td>'
                + '<td>' + fmtDate(r.submit_date) + '</td>'
                + '<td>' + reportCell + '</td>'
                + '</tr>';
        }).join("");
        return '<table class="ct-table"><thead><tr>'
            + '<th>' + esc(tt("campaigns.col.email", "Email")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.status", "Statut")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.send_date", "Envoi")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.open_date", "Ouverture")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.click_date", "Clic")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.submit_date", "Soumission")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.report_date", "Signalement")) + '</th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderEventsList(events) {
        if (!events || !events.length) {
            return '<p class="muted">' + esc(tt("campaigns.no_events", "Aucun événement")) + '</p>';
        }
        // Most recent first.
        var sorted = events.slice().sort(function(a, b) {
            return (b.time || "").localeCompare(a.time || "");
        });
        var rows = sorted.map(function(ev) {
            var details = "";
            if (ev.details && typeof ev.details === "object") {
                try { details = JSON.stringify(ev.details); } catch (e) { details = ""; }
            }
            return '<tr>'
                + '<td style="white-space:nowrap">' + fmtDate(ev.time) + '</td>'
                + '<td>' + esc(eventTypeLabel(ev.message)) + '</td>'
                + '<td>' + esc(ev.email || "") + '</td>'
                + '<td style="font-family:monospace;font-size:0.85em;color:#6b7280">' + esc(details) + '</td>'
                + '</tr>';
        }).join("");
        return '<table class="ct-table"><thead><tr>'
            + '<th style="width:140px">' + esc(tt("campaigns.col.time", "Date")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.event", "Événement")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.email", "Email")) + '</th>'
            + '<th>' + esc(tt("campaigns.col.details", "Détails")) + '</th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    // Toggle the campaigns panel between the list and the full-page
    // campaign dashboard (both live inside #panel-campaigns).
    function showCampaignDetail(show) {
        var list = document.getElementById("campaigns-list-view");
        var detail = document.getElementById("campaign-detail-view");
        if (list) list.style.display = show ? "none" : "";
        if (detail) detail.style.display = show ? "" : "none";
    }

    // ── Campaign timeline (per-campaign dashboard) ─────────────
    // Swimlane SVG: one lane per target action, points on a shared time
    // axis. Each point is clickable and shows user / action / time in
    // the detail box below.
    var _TL_LANES = [
        { key: "email_opened",   color: "blue" },
        { key: "clicked_link",   color: "orange" },
        { key: "submitted_data", color: "red" },
        { key: "email_reported", color: "green" }
    ];

    function eventTypeLabel(msg) {
        var map = {
            campaign_created: tt("events.created", "Campagne créée"),
            email_sent: tt("events.sent", "Email envoyé"),
            email_send_error: tt("events.send_error", "Échec d'envoi"),
            email_opened: tt("events.opened", "Email ouvert"),
            clicked_link: tt("events.clicked", "Lien cliqué"),
            submitted_data: tt("events.submitted", "Données soumises"),
            email_reported: tt("events.reported", "Email signalé")
        };
        return map[msg] || msg;
    }

    function _resolveEventUser(c, ev) {
        var list = (c && c.results) || [], r = null, i;
        for (i = 0; i < list.length && !r; i++) {
            if (ev.result_id && list[i].id === ev.result_id) r = list[i];
        }
        for (i = 0; i < list.length && !r; i++) {
            if (ev.email && list[i].email === ev.email) r = list[i];
        }
        var name = r ? [r.first_name, r.last_name].filter(Boolean).join(" ") : "";
        var email = (r && r.email) || ev.email || "";
        if (name && email) return name + " <" + email + ">";
        return name || email || tt("campaigns.unknown_user", "Utilisateur inconnu");
    }

    function renderCampaignTimeline(c) {
        var laneIdx = {};
        _TL_LANES.forEach(function(l, i) { laneIdx[l.key] = i; });
        var evs = (c.events || []).filter(function(e) {
            return e.time && laneIdx[e.message] != null;
        }).sort(function(a, b) {
            return (a.time || "").localeCompare(b.time || "");
        });
        c._tlEvents = evs;
        if (!evs.length) {
            return '<p class="muted">' + esc(tt("campaigns.timeline_empty", "Aucune action des cibles pour le moment.")) + '</p>';
        }
        var W = 820, H = 200, LX = 130, RX = W - 24, topPad = 14, LH = 40;
        var t0 = new Date(evs[0].time).getTime();
        var t1 = new Date(evs[evs.length - 1].time).getTime();
        var span = t1 - t0;
        var laneLabels = [
            tt("campaigns.result.opened", "Ouvert"),
            tt("campaigns.result.clicked", "Cliqué"),
            tt("campaigns.result.submitted", "Soumis"),
            tt("campaigns.result.reported", "Signalé")
        ];
        var s = '<svg id="campaign-timeline" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;max-width:' + W + 'px">';
        _TL_LANES.forEach(function(lane, i) {
            var y = topPad + i * LH + LH / 2;
            var col = CT_COLORS[lane.color].vivid;
            s += '<line x1="' + LX + '" y1="' + y + '" x2="' + RX + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="2"/>';
            s += '<circle cx="14" cy="' + y + '" r="5" fill="' + col + '"/>';
            s += '<text x="26" y="' + (y + 4) + '" font-size="12" fill="#475569">' + _svgEsc(laneLabels[i]) + '</text>';
        });
        evs.forEach(function(ev, idx) {
            var li = laneIdx[ev.message];
            var y = topPad + li * LH + LH / 2;
            var frac = span > 0 ? (new Date(ev.time).getTime() - t0) / span : 0.5;
            var x = LX + frac * (RX - LX);
            var col = CT_COLORS[_TL_LANES[li].color].vivid;
            s += '<circle id="tl-pt-' + idx + '" class="ct-tl-pt" cx="' + x.toFixed(1) + '" cy="' + y + '" r="6" '
                + 'fill="' + col + '" stroke="#fff" stroke-width="2" '
                + 'data-click="_phishCampaignEvent" data-args=\'' + _da(idx) + '\'>'
                + '<title>' + _svgEsc(eventTypeLabel(ev.message) + " — " + fmtDate(ev.time)) + '</title></circle>';
        });
        var axisY = topPad + 4 * LH + 8;
        s += '<line x1="' + LX + '" y1="' + axisY + '" x2="' + RX + '" y2="' + axisY + '" stroke="#cbd5e1" stroke-width="1"/>';
        s += '<text x="' + LX + '" y="' + (axisY + 16) + '" font-size="11" fill="#64748b">' + _svgEsc(fmtDate(evs[0].time)) + '</text>';
        s += '<text x="' + RX + '" y="' + (axisY + 16) + '" font-size="11" fill="#64748b" text-anchor="end">' + _svgEsc(fmtDate(evs[evs.length - 1].time)) + '</text>';
        s += '</svg>';
        s += '<div id="campaign-event-detail" class="ct-tl-detail">'
            + esc(tt("campaigns.timeline_hint", "Cliquez un point pour voir le détail de l'action."))
            + '</div>';
        return s;
    }

    function renderCampaignDetail(c) {
        _campaignDetail = c;
        var funnelKpis = [
            { label: tt("campaigns.col.targets", "Cibles"), value: c.target_count || 0 },
            { label: tt("campaigns.result.sent", "Envoyé"), value: c.sent_count || 0 },
            { label: tt("campaigns.result.opened", "Ouvert"), value: c.opened_count || 0 },
            { label: tt("campaigns.result.clicked", "Cliqué"), value: c.clicked_count || 0 },
            { label: tt("campaigns.result.submitted", "Soumis"), value: c.submitted_count || 0 },
            { label: tt("campaigns.result.reported", "Signalé"), value: c.reported_count || 0 }
        ];
        var kpiH = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px">'
            + funnelKpis.map(function(k) {
                return '<div style="flex:1;min-width:90px;padding:8px 10px;background:#f3f4f6;border-radius:6px;text-align:center">'
                    + '<div style="font-size:1.4em;font-weight:700;color:#111827">' + k.value + '</div>'
                    + '<div style="font-size:0.75em;color:#6b7280;text-transform:uppercase">' + esc(k.label) + '</div>'
                    + '</div>';
            }).join("")
            + '</div>';
        return ''
            + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">'
            +   '<button class="btn btn-ghost btn-sm" data-click="_phishBackToCampaigns">← ' + esc(tt("campaigns.back", "Campagnes")) + '</button>'
            +   '<strong style="font-size:1.25em">' + esc(c.name) + '</strong>'
            +   statusBadge(c)
            +   '<span style="flex:1"></span>'
            +   '<button class="btn btn-secondary btn-sm" data-click="_phishDeclareReport" data-args=\'' + _da(c.id) + '\'>'
            +     esc(tt("campaigns.declare_report", "Déclarer un signalement")) + '</button>'
            +   '<button class="btn btn-ghost btn-sm" data-click="_refreshCampaignDetail" data-args=\'' + _da(c.id) + '\'>'
            +     esc(tt("campaigns.refresh", "Rafraîchir")) + '</button>'
            +   '<button class="btn btn-ghost btn-sm" data-click="_exportCampaignCsv" data-args=\'' + _da(c.id) + '\'>'
            +     esc(tt("campaigns.export_csv", "Exporter CSV")) + '</button>'
            + '</div>'
            + '<div class="muted" style="font-size:0.85em;margin-bottom:4px">' + esc(tt("campaigns.col.launch", "Lancement")) + ' : ' + fmtDate(c.launch_date) + '</div>'
            + kpiH
            + '<h4 style="margin:14px 0 6px">' + esc(tt("campaigns.timeline", "Déroulé de la campagne")) + '</h4>'
            + renderCampaignTimeline(c)
            + '<h4 style="margin:18px 0 6px">' + esc(tt("campaigns.results", "Résultats")) + '</h4>'
            + renderResultsTable(c)
            + '<h4 style="margin:18px 0 6px">' + esc(tt("campaigns.events", "Journal d'événements")) + '</h4>'
            + renderEventsList(c.events);
    }

    window._viewCampaign = function(id) {
        // The detail view lives inside #panel-campaigns — switch to that
        // panel first so a click from the dashboard actually shows it.
        if (typeof window.selectPanel === "function") window.selectPanel("campaigns");
        _phishGet("api/campaigns/" + id).then(function(c) {
            var holder = document.getElementById("campaign-detail-view");
            if (holder) holder.innerHTML = renderCampaignDetail(c);
            showCampaignDetail(true);
        }).catch(renderError);
    };

    window._refreshCampaignDetail = function(id) {
        _phishGet("api/campaigns/" + id).then(function(c) {
            var holder = document.getElementById("campaign-detail-view");
            if (holder) holder.innerHTML = renderCampaignDetail(c);
        }).catch(renderError);
    };

    window._phishBackToCampaigns = function() {
        showCampaignDetail(false);
        loadCampaigns();
    };

    // Click handler for a timeline point — fills the detail box with the
    // user, action type and time, and highlights the selected point.
    window._phishCampaignEvent = function(idx) {
        var c = _campaignDetail;
        if (!c || !c._tlEvents) return;
        var ev = c._tlEvents[idx];
        if (!ev) return;
        var box = document.getElementById("campaign-event-detail");
        if (box) {
            function cell(label, value) {
                return '<div style="min-width:150px">'
                    + '<div class="muted" style="font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em">' + esc(label) + '</div>'
                    + '<div style="font-weight:700;font-size:1.05em;margin-top:2px">' + esc(value) + '</div>'
                    + '</div>';
            }
            box.className = "ct-tl-detail ct-tl-detail--active";
            box.innerHTML = ''
                + '<div style="font-weight:700;color:#1e3a8a;margin-bottom:10px">'
                +   esc(tt("campaigns.tl.detail_title", "Détail de l'action")) + '</div>'
                + '<div style="display:flex;flex-wrap:wrap;gap:28px">'
                +   cell(tt("campaigns.tl.user", "Utilisateur"), _resolveEventUser(c, ev))
                +   cell(tt("campaigns.tl.action", "Action"), eventTypeLabel(ev.message))
                +   cell(tt("campaigns.tl.time", "Heure"), fmtDate(ev.time))
                + '</div>';
        }
        var prev = document.querySelector(".ct-tl-pt.sel");
        if (prev) prev.classList.remove("sel");
        var pt = document.getElementById("tl-pt-" + idx);
        if (pt) pt.classList.add("sel");
    };

    // Declare a report for the campaign — pick a target (searchable in
    // the campaign's own targets) and the date/time it was reported.
    window._phishRepFilter = function(query) {
        var c = _campaignDetail;
        var sel = document.getElementById("fld-rep_user");
        if (!c || !c.results || !sel) return;
        var q = (query || "").toLowerCase();
        sel.innerHTML = c.results.filter(function(r) {
            var hay = ((r.first_name || "") + " " + (r.last_name || "") + " " + (r.email || "")).toLowerCase();
            return !q || hay.indexOf(q) >= 0;
        }).map(function(r) {
            var name = [r.first_name, r.last_name].filter(Boolean).join(" ");
            var label = (name ? name + " <" + r.email + ">" : r.email) + (r.report_date ? "  ✓" : "");
            return '<option value="' + esc(r.id) + '">' + esc(label) + '</option>';
        }).join("");
    };

    window._phishDeclareReport = function(cid) {
        var c = _campaignDetail;
        if (!c || !c.results || !c.results.length) {
            showStatus(tt("campaigns.no_results", "Aucun résultat"), "error");
            return;
        }
        var n = new Date(), p = function(v) { return (v < 10 ? "0" : "") + v; };
        var nowLocal = n.getFullYear() + "-" + p(n.getMonth() + 1) + "-" + p(n.getDate())
            + "T" + p(n.getHours()) + ":" + p(n.getMinutes());
        ct_modal.open({
            title: tt("campaigns.declare_report", "Déclarer un signalement"),
            size: "md",
            body: ''
                + '<div style="margin-bottom:12px">'
                + '<label style="display:block;font-weight:600;margin-bottom:4px">' + esc(tt("campaigns.rep_user", "Utilisateur")) + '</label>'
                + '<input type="text" id="fld-rep_search" data-input="_phishRepFilter" data-pass-value autocomplete="off" placeholder="' + esc(tt("campaigns.rep_search", "Rechercher un utilisateur…")) + '" style="width:100%;margin-bottom:6px">'
                + '<select id="fld-rep_user" size="8" style="width:100%"></select>'
                + '</div>'
                + '<div>'
                + '<label for="fld-rep_when" style="display:block;font-weight:600;margin-bottom:4px">' + esc(tt("campaigns.rep_when", "Date et heure du signalement")) + '</label>'
                + '<input type="datetime-local" id="fld-rep_when" value="' + esc(nowLocal) + '" style="width:100%">'
                + '</div>',
            onOpen: function() { window._phishRepFilter(""); },
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler") },
                { id: "ok", label: tt("campaigns.declare_btn", "Déclarer"), primary: true, result: function() {
                    var sel = document.getElementById("fld-rep_user");
                    var rid = sel ? sel.value : "";
                    if (!rid) { showStatus(tt("campaigns.rep_pick", "Sélectionnez un utilisateur"), "error"); return false; }
                    var whenEl = document.getElementById("fld-rep_when");
                    var whenIso = null;
                    if (whenEl && whenEl.value) {
                        var d = new Date(whenEl.value);
                        if (!isNaN(d.getTime())) whenIso = d.toISOString();
                    }
                    return _phishPost("api/campaigns/" + cid + "/results/" + rid + "/report", { report_date: whenIso })
                        .then(function() {
                            showStatus(tt("campaigns.reported_ok", "Signalement enregistré"));
                            window._refreshCampaignDetail(cid);
                        })
                        .catch(function(e) { renderError(e); return false; });
                }}
            ]
        });
    };

    // ─── Dashboard (P6) ────────────────────────────────────────

    function kpiCard(label, value, sub) {
        return ''
            + '<div style="flex:1;min-width:120px;padding:10px 12px;background:#f3f4f6;border-radius:8px;text-align:center">'
            +   '<div style="font-size:1.6em;font-weight:700;color:#111827;line-height:1.1">' + esc(String(value)) + '</div>'
            +   '<div style="font-size:0.72em;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">' + esc(label) + '</div>'
            +   (sub ? '<div style="font-size:0.78em;color:#374151;margin-top:4px">' + esc(sub) + '</div>' : '')
            + '</div>';
    }

    function funnelBar(label, value, base, color) {
        var pct = base > 0 ? Math.round((value / base) * 100) : 0;
        var ratePct = base > 0 ? ((value / base) * 100).toFixed(1) : "0.0";
        return ''
            + '<div style="margin:6px 0">'
            +   '<div style="display:flex;justify-content:space-between;font-size:0.85em;margin-bottom:3px">'
            +     '<span>' + esc(label) + '</span>'
            +     '<span style="color:#6b7280">' + value + ' / ' + base + ' (' + ratePct + '%)</span>'
            +   '</div>'
            +   '<div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden">'
            +     '<div style="height:100%;width:' + pct + '%;background:' + color + ';transition:width 0.3s"></div>'
            +   '</div>'
            + '</div>';
    }

    function renderTimelineSVG(timeline) {
        // 30 daily buckets, one line per funnel stage on a shared scale.
        // Legend above, Y axis labelled (0 / max) so the count is clear.
        if (!timeline || !timeline.length) return '';
        var W = 600, H = 150, PL = 34, PR = 14, PT = 12, PB = 24;
        var N = timeline.length;
        var stages = [
            { key: "sent", color: "#3b82f6", label: tt("campaigns.result.sent", "Envoyé") },
            { key: "opened", color: "#8b5cf6", label: tt("campaigns.result.opened", "Ouvert") },
            { key: "clicked", color: "#f59e0b", label: tt("campaigns.result.clicked", "Cliqué") },
            { key: "submitted", color: "#ef4444", label: tt("campaigns.result.submitted", "Soumis") },
            { key: "reported", color: "#10b981", label: tt("campaigns.result.reported", "Signalé") }
        ];
        var maxV = 1;
        stages.forEach(function(s) {
            timeline.forEach(function(b) { if ((b[s.key] || 0) > maxV) maxV = b[s.key]; });
        });
        var plotW = W - PL - PR, plotH = H - PT - PB;
        var xStep = plotW / Math.max(1, N - 1);
        var yOf = function(v) { return PT + plotH - (v / maxV) * plotH; };
        var paths = stages.map(function(s) {
            var d = timeline.map(function(b, i) {
                return (i === 0 ? "M" : "L") + (PL + i * xStep).toFixed(1) + "," + yOf(b[s.key] || 0).toFixed(1);
            }).join(" ");
            return '<path d="' + d + '" stroke="' + s.color + '" stroke-width="2" fill="none" />';
        }).join("");
        var fmt = function(s) { return s ? s.slice(5) : ""; };
        var legend = stages.map(function(s) {
            return '<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:0.8em;white-space:nowrap">'
                + '<span style="display:inline-block;width:14px;height:3px;background:' + s.color + ';border-radius:2px"></span>'
                + esc(s.label) + '</span>';
        }).join("");
        return ''
            + '<div style="display:flex;flex-wrap:wrap;margin-bottom:6px">' + legend + '</div>'
            + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">'
            +   '<line x1="' + PL + '" y1="' + yOf(maxV) + '" x2="' + (W - PR) + '" y2="' + yOf(maxV) + '" stroke="#f1f5f9" stroke-width="1"/>'
            +   '<line x1="' + PL + '" y1="' + yOf(0) + '" x2="' + (W - PR) + '" y2="' + yOf(0) + '" stroke="#d1d5db" stroke-width="1"/>'
            +   '<text x="' + (PL - 6) + '" y="' + (yOf(maxV) + 3) + '" font-size="10" fill="#6b7280" text-anchor="end">' + maxV + '</text>'
            +   '<text x="' + (PL - 6) + '" y="' + (yOf(0) + 3) + '" font-size="10" fill="#6b7280" text-anchor="end">0</text>'
            +   paths
            +   '<text x="' + PL + '" y="' + (H - 6) + '" font-size="10" fill="#6b7280">' + esc(fmt(timeline[0].day)) + '</text>'
            +   '<text x="' + (PL + plotW / 2) + '" y="' + (H - 6) + '" font-size="10" fill="#6b7280" text-anchor="middle">' + esc(fmt(timeline[Math.floor(N / 2)].day)) + '</text>'
            +   '<text x="' + (W - PR) + '" y="' + (H - 6) + '" font-size="10" fill="#6b7280" text-anchor="end">' + esc(fmt(timeline[N - 1].day)) + '</text>'
            + '</svg>'
            + '<div class="muted" style="font-size:0.75em;margin-top:2px">' + esc(tt("dashboard.timeline_unit", "Nombre d'événements par jour")) + '</div>';
    }

    function renderTopTargets(items) {
        if (!items || !items.length) {
            return '<div class="muted" style="font-size:0.9em">' + esc(tt("dashboard.no_top_targets", "Aucun click détecté pour le moment.")) + '</div>';
        }
        var rows = items.map(function(t, i) {
            return ''
                + '<tr>'
                +   '<td style="color:#6b7280;width:24px">' + (i + 1) + '</td>'
                +   '<td>' + esc(t.email) + '</td>'
                +   '<td style="text-align:right">' + t.campaigns + '</td>'
                +   '<td style="text-align:right;color:#f59e0b;font-weight:600">' + t.clicked + '</td>'
                +   '<td style="text-align:right;color:#ef4444">' + t.submitted + '</td>'
                +   '<td style="text-align:right;color:#10b981">' + t.reported + '</td>'
                + '</tr>';
        }).join("");
        return ''
            + '<table class="ct-table" style="margin-top:6px">'
            +   '<thead><tr>'
            +     '<th></th>'
            +     '<th>' + esc(tt("campaigns.col.email", "Email")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("dashboard.col.campaigns", "Campagnes")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("campaigns.result.clicked", "Cliqué")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("campaigns.result.submitted", "Soumis")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("campaigns.result.reported", "Signalé")) + '</th>'
            +   '</tr></thead>'
            +   '<tbody>' + rows + '</tbody>'
            + '</table>';
    }

    function renderRecentCampaigns(items) {
        if (!items || !items.length) {
            return '<div class="muted" style="font-size:0.9em">' + esc(tt("campaigns.empty", "Aucune campagne pour le moment.")) + '</div>';
        }
        var rows = items.map(function(c) {
            return ''
                + '<tr>'
                +   '<td><a href="#" data-click="_viewCampaign" data-args=\'' + _da(c.id) + '\'>' + esc(c.name) + '</a></td>'
                +   '<td>' + statusBadge({ status: c.status }) + '</td>'
                +   '<td>' + fmtDate(c.launch_date || c.created_at) + '</td>'
                +   '<td style="text-align:right">' + (c.targets || 0) + '</td>'
                +   '<td style="text-align:right">' + (c.sent || 0) + '</td>'
                +   '<td style="text-align:right;color:#f59e0b;font-weight:600">' + (c.clicked || 0) + '</td>'
                +   '<td style="text-align:right">' + c.click_rate.toFixed(1) + '%</td>'
                + '</tr>';
        }).join("");
        return ''
            + '<table class="ct-table" style="margin-top:6px">'
            +   '<thead><tr>'
            +     '<th>' + esc(tt("campaigns.col.name", "Nom")) + '</th>'
            +     '<th>' + esc(tt("campaigns.col.status", "Statut")) + '</th>'
            +     '<th>' + esc(tt("campaigns.col.launch", "Lancement")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("campaigns.col.targets", "Cibles")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("campaigns.result.sent", "Envoyé")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("campaigns.result.clicked", "Cliqué")) + '</th>'
            +     '<th style="text-align:right">' + esc(tt("campaigns.col.rate", "Taux click")) + '</th>'
            +   '</tr></thead>'
            +   '<tbody>' + rows + '</tbody>'
            + '</table>';
    }

    function renderDashboard(d) {
        var f = d.funnel || {};
        var r = d.rates || {};
        var topKpis = ''
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px">'
            +   kpiCard(tt("dashboard.kpi.campaigns", "Campagnes"), d.campaigns.total,
                       d.campaigns.active + " " + tt("dashboard.kpi.active", "actives"))
            +   kpiCard(tt("campaigns.col.targets", "Cibles"), f.targets || 0)
            +   kpiCard(tt("campaigns.result.sent", "Envoyé"), f.sent || 0)
            +   kpiCard(tt("campaigns.result.opened", "Ouvert"), f.opened || 0, (r.open_rate || 0) + "%")
            +   kpiCard(tt("campaigns.result.clicked", "Cliqué"), f.clicked || 0, (r.click_rate || 0) + "%")
            +   kpiCard(tt("campaigns.result.submitted", "Soumis"), f.submitted || 0, (r.submit_rate || 0) + "%")
            +   kpiCard(tt("campaigns.result.reported", "Signalé"), f.reported || 0, (r.report_rate || 0) + "%")
            + '</div>';
        var base = f.sent || 0;
        var funnelH = ''
            + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:14px">'
            +   '<h3 style="margin:0 0 8px;font-size:0.95em">' + esc(tt("dashboard.funnel", "Entonnoir")) + '</h3>'
            +   funnelBar(tt("campaigns.result.opened", "Ouvert"),    f.opened || 0,    base, "#8b5cf6")
            +   funnelBar(tt("campaigns.result.clicked", "Cliqué"),   f.clicked || 0,   base, "#f59e0b")
            +   funnelBar(tt("campaigns.result.submitted", "Soumis"), f.submitted || 0, base, "#ef4444")
            +   funnelBar(tt("campaigns.result.reported", "Signalé"), f.reported || 0,  base, "#10b981")
            + '</div>';

        var timelineH = ''
            + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:14px">'
            +   '<h3 style="margin:0 0 8px;font-size:0.95em">' + esc(tt("dashboard.timeline", "Activité — 30 derniers jours")) + '</h3>'
            +   renderTimelineSVG(d.timeline)
            + '</div>';

        var twoCol = ''
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'
            +   '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px">'
            +     '<h3 style="margin:0 0 4px;font-size:0.95em">' + esc(tt("dashboard.top_targets", "Cibles les plus exposées")) + '</h3>'
            +     '<div class="muted" style="font-size:0.78em;margin-bottom:4px">' + esc(tt("dashboard.top_targets_hint", "Utiles pour cibler la sensibilisation complémentaire.")) + '</div>'
            +     renderTopTargets(d.top_targets)
            +   '</div>'
            +   '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px">'
            +     '<h3 style="margin:0 0 4px;font-size:0.95em">' + esc(tt("dashboard.recent", "Campagnes récentes")) + '</h3>'
            +     renderRecentCampaigns(d.recent_campaigns)
            +   '</div>'
            + '</div>';

        return topKpis + funnelH + timelineH + twoCol;
    }

    function loadDashboard() {
        var holder = document.getElementById("dashboard-body");
        if (!holder) return;
        return _phishGet("api/dashboard/overview").then(function(d) {
            // Empty state: no campaigns at all → keep the placeholder card.
            if (!d || !d.campaigns || d.campaigns.total === 0) {
                holder.innerHTML = ''
                    + '<div class="placeholder-card">'
                    +   '<p>' + esc(tt("dashboard.empty", "Aucune campagne lancée pour le moment.")) + '</p>'
                    + '</div>';
                return;
            }
            holder.innerHTML = renderDashboard(d);
        }).catch(function(e) {
            renderError(e);
            holder.innerHTML = '<div class="placeholder-card"><p>' + esc(tt("common.error", "Erreur")) + '</p></div>';
        });
    }

    window._phishRefreshDashboard = function() { loadDashboard(); };

    // ── M365 reporting connector card (Settings panel) ─────────

    function renderM365Card(s) {
        s = s || {};
        function fld(label, id, val, type, ph) {
            return '<div style="margin-bottom:10px">'
                + '<label for="' + id + '" style="display:block;font-weight:600;font-size:0.85em;margin-bottom:3px">' + esc(label) + '</label>'
                + '<input type="' + (type || "text") + '" id="' + id + '" value="' + esc(val || "") + '" '
                + (ph ? 'placeholder="' + esc(ph) + '" ' : '')
                + 'autocomplete="off" style="width:100%;max-width:480px">'
                + '</div>';
        }
        var secretPh = s.client_secret_set
            ? tt("m365.secret_set", "Secret enregistré — laisser vide pour conserver")
            : tt("m365.secret_ph", "Valeur du secret client Azure");
        var statusLine = (s.last_poll || s.last_status)
            ? '<div class="muted" style="font-size:0.82em;margin-top:10px">'
                + (s.last_poll ? esc(tt("m365.last_poll", "Dernière vérification")) + ' : ' + esc(fmtDate(s.last_poll)) + ' — ' : '')
                + esc(s.last_status || '') + '</div>'
            : '';
        return ''
            + '<p class="muted" style="font-size:0.85em;margin:0 0 12px;max-width:620px">'
            +   esc(tt("m365.help", "Vérifie toutes les 5 min, pendant une campagne active, la boîte de signalement M365 et marque comme « signalé » les cibles qui ont signalé l'email. Nécessite une app Azure AD (permission applicative Mail.Read) et une boîte dédiée alimentée par le bouton « Signaler un hameçonnage » d'Outlook."))
            + '</p>'
            + fld(tt("m365.tenant", "ID de locataire (tenant)"), "m365_tenant", s.tenant_id)
            + fld(tt("m365.client", "ID d'application (client)"), "m365_client", s.client_id)
            + fld(tt("m365.secret", "Secret client"), "m365_secret", "", "password", secretPh)
            + '<label style="display:flex;align-items:center;gap:6px;font-weight:normal;margin:6px 0 12px">'
            +   '<input type="checkbox" id="m365_enabled"' + (s.enabled ? " checked" : "") + '> '
            +   esc(tt("m365.enabled", "Activer le connecteur")) + '</label>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
            +   '<button class="btn btn-primary btn-sm" data-click="_phishSaveM365">' + esc(tt("common.save", "Enregistrer")) + '</button>'
            +   '<button class="btn btn-secondary btn-sm" data-click="_phishM365PollNow">' + esc(tt("m365.poll_now", "Vérifier maintenant")) + '</button>'
            + '</div>'
            + statusLine;
    }

    function loadM365Card() {
        var card = document.getElementById("m365-card");
        if (!card) return;
        _phishGet("api/m365/settings").then(function(s) {
            card.innerHTML = renderM365Card(s);
        }).catch(function() { /* connector is optional — leave the card empty */ });
    }

    // Exposed so the settings drawer (phish_ai.js) can host the M365 card.
    window._phishLoadM365Card = loadM365Card;

    window._phishSaveM365 = function() {
        function v(id) { var el = document.getElementById(id); return el ? el.value : ""; }
        var body = {
            tenant_id: v("m365_tenant"),
            client_id: v("m365_client"),
            enabled: !!(document.getElementById("m365_enabled") || {}).checked
        };
        var secret = v("m365_secret");
        if (secret) body.client_secret = secret;
        _phishPut("api/m365/settings", body).then(function() {
            showStatus(tt("m365.saved", "Connecteur M365 enregistré"));
            loadM365Card();
        }).catch(renderError);
    };

    window._phishM365PollNow = function() {
        showStatus(tt("m365.polling", "Vérification en cours…"));
        _phishPost("api/m365/poll", {}).then(function(r) {
            if (r && r.ok) {
                showStatus(tt("m365.poll_done", "Vérification terminée") + " — "
                    + (r.matched || 0) + " " + tt("m365.matches", "signalement(s)"));
            } else {
                showStatus((r && r.reason) || tt("m365.poll_fail", "Échec de la vérification"), "error");
            }
            loadM365Card();
        }).catch(renderError);
    };

    // ── Bulk actions (ct_bulkbar) ──────────────────────────────

    var _BULK = {
        campaigns: { api: "api/campaigns",      reload: loadCampaigns },
        templates: { api: "api/templates",      reload: loadTemplates },
        landings:  { api: "api/landing-pages",  reload: loadLandings },
        sprofiles: { api: "api/sending-profiles", reload: loadSendingProfiles },
        groups:    { api: "api/groups",         reload: loadGroups }
    };

    // Bulk-delete dispatcher — ct_bulkbar already ran the confirm.
    window._phishBulkDelete = function(scope) {
        var cfg = _BULK[scope];
        if (!cfg) return;
        var keys = [];
        ct_bulkbar.getSelection(scope).forEach(function(k) { keys.push(k); });
        if (!keys.length) return;
        Promise.all(keys.map(function(id) { return _phishDel(cfg.api + "/" + id); }))
            .then(function() { showStatus(tt("bulk.deleted", "Élément(s) supprimé(s)")); })
            .catch(function(e) { renderError(e); })
            .then(function() { ct_bulkbar.clear(scope); cfg.reload(); });
    };

    // ── Public hooks: re-fetch when entering a panel ──────────

    window._phishLoadPanel = function(name) {
        if (name === "dashboard") loadDashboard();
        else if (name === "campaigns") loadCampaigns();
        else if (name === "settings") loadSendingProfiles();
        else if (name === "templates") loadTemplates();
        else if (name === "landings") loadLandings();
        else if (name === "groups") loadGroups();
    };
})();
