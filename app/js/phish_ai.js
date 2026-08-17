/* Phish — AI assistant helper.
 *
 * Lazily checks /api/ai/runtime once per page load. If a provider is
 * configured, exposes:
 *
 *   window._phishAiAvailable() → Promise<boolean>
 *     resolves true if an Anthropic or OpenAI key is configured on the
 *     backend; cached for the lifetime of the page.
 *
 *   window._phishAiGenerate({kind, brief, language}) → Promise<{subject?, html, text?}>
 *
 *   window._phishOpenAiTemplateModal()
 *   window._phishOpenAiLandingModal()
 *     prompt the user for a short brief, call /api/ai/generate, and
 *     populate the surrounding template / landing form fields.
 *
 * The AI button is only injected into the templateForm / landingForm
 * when _phishAiAvailable() resolves true. If the backend has no key,
 * the button stays hidden and the rest of the form keeps working.
 */
(function() {
    "use strict";

    var _runtimePromise = null;

    function tt(key, fallback) {
        if (typeof window.t === "function") {
            var v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }

    function _showStatus(msg, kind) {
        if (typeof window.showStatus === "function") window.showStatus(msg, kind);
    }

    // Cover the open modal with a spinner + waiting message while an AI
    // generation request is in flight, and disable its footer buttons so
    // the user cannot fire a second parallel call. _ctNoop + data-stop
    // keep a click on the layer from reaching the backdrop dismiss.
    function _aiBusy(on) {
        var ov = document.querySelector(".ct-modal-overlay");
        if (!ov) return;
        var layer = document.getElementById("ai-busy-layer");
        var footerBtns = ov.querySelectorAll(".ct-modal-footer button");
        if (on) {
            footerBtns.forEach(function(b) { b.disabled = true; });
            if (layer) return;
            layer = document.createElement("div");
            layer.id = "ai-busy-layer";
            layer.className = "ai-busy-layer";
            layer.setAttribute("data-click", "_ctNoop");
            layer.setAttribute("data-stop", "");
            layer.innerHTML = '<div class="ai-busy-card">'
                + '<div class="ct-spinner"></div>'
                + '<div class="ai-busy-msg">' + esc(tt("ai.generating", "Génération en cours…")) + '</div>'
                + '<div class="ai-busy-hint">' + esc(tt("ai.generating_hint", "Cela peut prendre jusqu'à 30 secondes.")) + '</div>'
                + '</div>';
            ov.appendChild(layer);
        } else {
            if (layer) layer.remove();
            footerBtns.forEach(function(b) { b.disabled = false; });
        }
    }

    function loadRuntime() {
        if (_runtimePromise) return _runtimePromise;
        _runtimePromise = window._phishGet("api/ai/runtime")
            .then(function(r) { return r || { available: false }; })
            .catch(function() { return { available: false }; });
        return _runtimePromise;
    }

    window._phishAiAvailable = function() {
        return loadRuntime().then(function(r) { return !!(r && r.available); });
    };

    window._phishAiInjectButton = function(targetId, kind) {
        // Called from templateForm / landingForm after the modal mounts.
        // Inserts a ✨ button next to the form heading if the backend
        // has an AI key configured. No-op otherwise.
        loadRuntime().then(function(r) {
            if (!r || !r.available) return;
            var holder = document.getElementById(targetId);
            if (!holder) return;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn btn-ai btn-sm";
            btn.innerHTML = '✨ ' + esc(tt("ai.button", "Générer avec l'IA"));
            btn.setAttribute("data-click", kind === "template"
                ? "_phishOpenAiTemplateModal"
                : "_phishOpenAiLandingModal");
            holder.appendChild(btn);
        });
    };

    function _aiGenerate(kind, brief, language) {
        return window._phishPost("api/ai/generate", {
            kind: kind,
            brief: brief,
            language: language || (document.documentElement.lang || "fr")
        });
    }
    window._phishAiGenerate = _aiGenerate;

    function _setField(name, value) {
        var el = document.getElementById("fld-" + name);
        if (el && value != null) el.value = value;
    }

    // ── Context-rich brief builders ───────────────────────────────
    //
    // The user picks structured fields (persona, tone, action…) and
    // we assemble a multi-line brief that gives the LLM enough context
    // to produce a usable scenario. The freetext "Scénario" field is
    // still required — everything else just enriches it.

    function _readSelectVal(id) {
        var el = document.getElementById(id);
        return el ? el.value : "";
    }
    function _readCheckedVal(id) {
        var el = document.getElementById(id);
        return el ? !!el.checked : false;
    }
    function _readTextVal(id) {
        var el = document.getElementById(id);
        return el ? (el.value || "").trim() : "";
    }

    function _option(value, label, selected) {
        return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
    }

    function _selectField(id, label, options, defaultVal) {
        var opts = "";
        for (var i = 0; i < options.length; i++) {
            opts += _option(options[i][0], options[i][1], options[i][0] === defaultVal);
        }
        return ''
            + '<div style="margin-bottom:12px">'
            + '<label for="' + id + '" style="display:block;font-weight:600;margin-bottom:4px;font-size:0.88em">' + esc(label) + '</label>'
            + '<select id="' + id + '" style="width:100%">' + opts + '</select>'
            + '</div>';
    }

    function _textField(id, label, placeholder, defaultVal) {
        return ''
            + '<div style="margin-bottom:12px">'
            + '<label for="' + id + '" style="display:block;font-weight:600;margin-bottom:4px;font-size:0.88em">' + esc(label) + '</label>'
            + '<input type="text" id="' + id + '" placeholder="' + esc(placeholder || "") + '" value="' + esc(defaultVal || "") + '" style="width:100%">'
            + '</div>';
    }

    function _textareaField(id, label, placeholder, minHeight) {
        return ''
            + '<div style="margin-bottom:12px">'
            + '<label for="' + id + '" style="display:block;font-weight:600;margin-bottom:4px;font-size:0.88em">' + esc(label) + '</label>'
            + '<textarea id="' + id + '" placeholder="' + esc(placeholder || "") + '" style="width:100%;min-height:' + (minHeight || 90) + 'px;font-family:inherit;font-size:13px"></textarea>'
            + '</div>';
    }

    // Common pickers
    function _personaOptions() {
        return [
            ["it_interne", tt("ai.persona.it_interne", "Service informatique interne (DSI)")],
            ["rh_interne", tt("ai.persona.rh_interne", "Service RH interne")],
            ["direction", tt("ai.persona.direction", "Direction / Comité exécutif")],
            ["comptabilite", tt("ai.persona.comptabilite", "Comptabilité / Finance")],
            ["securite_it", tt("ai.persona.securite_it", "Équipe sécurité IT (SOC / RSSI)")],
            ["fournisseur_generique", tt("ai.persona.fournisseur_generique", "Fournisseur générique (anonyme)")],
            ["plateforme_generique", tt("ai.persona.plateforme_generique", "Plateforme SaaS générique")],
            ["autre", tt("ai.persona.autre", "Autre / précisé dans le scénario")]
        ];
    }
    function _toneOptions() {
        return [
            ["urgent", tt("ai.tone.urgent", "Urgent / pression temporelle")],
            ["officiel", tt("ai.tone.officiel", "Officiel et administratif")],
            ["informel", tt("ai.tone.informel", "Cordial / collègue")],
            ["alarmiste", tt("ai.tone.alarmiste", "Alarmiste (sécurité compromise)")],
            ["neutre", tt("ai.tone.neutre", "Neutre / informatif")]
        ];
    }
    function _actionOptions() {
        return [
            ["click_link", tt("ai.action.click_link", "Cliquer un lien")],
            ["submit_creds", tt("ai.action.submit_creds", "Saisir des identifiants sur la page")],
            ["open_attachment", tt("ai.action.open_attachment", "Ouvrir une pièce jointe")],
            ["reply", tt("ai.action.reply", "Répondre à l'expéditeur")],
            ["download", tt("ai.action.download", "Télécharger un fichier")]
        ];
    }
    function _difficultyOptions() {
        return [
            ["easy", tt("ai.diff.easy", "Facile (indices visibles : fautes, URL douteuse, ton incohérent)")],
            ["medium", tt("ai.diff.medium", "Moyen (quelques indices à repérer)")],
            ["hard", tt("ai.diff.hard", "Difficile (peu d'indices, scénario plausible)")]
        ];
    }

    function _langCode() {
        return (document.documentElement.lang || "fr").slice(0, 2);
    }

    // ── Template AI modal ─────────────────────────────────────────

    function _buildTemplateBrief(fields) {
        var lang = _langCode();
        var L = lang === "en" ? {
            scenario: "Scenario",
            persona: "Sender persona (no real brand impersonation)",
            audience: "Target audience",
            tone: "Tone",
            action: "Expected user action",
            difficulty: "Difficulty level",
            include_attachment: "Mention an attachment",
            placeholders: "Use Gophish placeholders ({{.FirstName}}, {{.Email}}, {{.URL}}, {{.TrackingURL}})",
            obvious: "Make obvious indicators (typos, broken sender, urgency triggers, suspicious URL hint)",
            balanced: "Make 1-2 subtle indicators a careful reader could catch",
            stealth: "Keep it stealthy — wording must look professional"
        } : {
            scenario: "Scénario",
            persona: "Persona de l'expéditeur (aucune marque réelle imitée)",
            audience: "Public cible",
            tone: "Ton",
            action: "Action attendue de l'utilisateur",
            difficulty: "Niveau de difficulté",
            include_attachment: "Mentionner une pièce jointe",
            placeholders: "Utiliser les placeholders Gophish ({{.FirstName}}, {{.Email}}, {{.URL}}, {{.TrackingURL}})",
            obvious: "Inclure des indices visibles (fautes, expéditeur incohérent, urgence factice, URL suspecte)",
            balanced: "Inclure 1 à 2 indices subtils qu'un lecteur attentif peut repérer",
            stealth: "Rester discret — la formulation doit paraître professionnelle"
        };
        var personaMap = {};
        _personaOptions().forEach(function(o) { personaMap[o[0]] = o[1]; });
        var toneMap = {};
        _toneOptions().forEach(function(o) { toneMap[o[0]] = o[1]; });
        var actionMap = {};
        _actionOptions().forEach(function(o) { actionMap[o[0]] = o[1]; });
        var difficultyHint = {
            easy: L.obvious,
            medium: L.balanced,
            hard: L.stealth
        }[fields.difficulty] || L.balanced;

        var lines = [];
        lines.push(L.scenario + " : " + fields.scenario);
        lines.push(L.persona + " : " + (personaMap[fields.persona] || fields.persona));
        if (fields.audience) lines.push(L.audience + " : " + fields.audience);
        lines.push(L.tone + " : " + (toneMap[fields.tone] || fields.tone));
        lines.push(L.action + " : " + (actionMap[fields.action] || fields.action));
        lines.push(L.difficulty + " : " + difficultyHint);
        if (fields.attachment) lines.push(L.include_attachment);
        lines.push(L.placeholders);
        return lines.join("\n");
    }

    window._phishOpenAiTemplateModal = function() {
        // Pre-fill: use the template name already typed as the scenario hint.
        var existingName = _readTextVal("fld-tpl_name");
        // Snapshot the parent template-form fields so we can restore them
        // after the AI modal closes (ct_modal is single-overlay so opening
        // the AI modal closes the parent modal otherwise).
        var parentSnapshot = {
            name: _readTextVal("fld-tpl_name"),
            subject: _readTextVal("fld-tpl_subject"),
            html: _readTextVal("fld-tpl_html"),
            text: _readTextVal("fld-tpl_text")
        };
        var reopenParent = window._phishLastTemplateReopen;
        var body = ''
            + '<p style="margin-top:0;color:#475569;font-size:0.88em">'
                + esc(tt("ai.template_hint", "Renseignez le contexte du scénario. Plus c'est précis, meilleur sera le rendu. Le contenu sera marqué exercice de formation."))
            + '</p>'
            + _textareaField("fld-ai_scenario",
                tt("ai.field.scenario", "Scénario") + " *",
                tt("ai.field.scenario_ph", "Ex: faux email d'alerte sécurité demandant de vérifier la session d'un utilisateur via un portail interne."),
                100)
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
                + _selectField("fld-ai_persona", tt("ai.field.persona", "Persona de l'expéditeur"), _personaOptions(), "it_interne")
                + _selectField("fld-ai_tone", tt("ai.field.tone", "Ton"), _toneOptions(), "officiel")
            + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
                + _selectField("fld-ai_action", tt("ai.field.action", "Action attendue"), _actionOptions(), "click_link")
                + _selectField("fld-ai_difficulty", tt("ai.field.difficulty", "Niveau de difficulté"), _difficultyOptions(), "medium")
            + '</div>'
            + _textField("fld-ai_audience",
                tt("ai.field.audience", "Public cible (optionnel)"),
                tt("ai.field.audience_ph", "Ex: équipe finance, tous les salariés, équipe IT"),
                existingName ? "" : "")
            + '<label style="display:flex;align-items:center;gap:6px;font-weight:normal;font-size:0.88em;margin-top:4px">'
                + '<input type="checkbox" id="fld-ai_attachment"> '
                + esc(tt("ai.field.attachment", "Mentionner une pièce jointe (ex: facture, rapport)"))
            + '</label>';

        ct_modal.open({
            title: tt("ai.template_title", "Assistant IA — modèle d'email"),
            body: body,
            size: "lg",
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler"), result: function() {
                    // Restore parent modal unchanged
                    if (typeof reopenParent === "function") {
                        setTimeout(function() { reopenParent(parentSnapshot); }, 0);
                    }
                    return null;
                }},
                { id: "go", label: tt("ai.generate", "Générer"), primary: true, result: function() {
                    var scenario = _readTextVal("fld-ai_scenario");
                    if (scenario.length < 4) {
                        _showStatus(tt("ai.too_short", "Description trop courte"), "error");
                        return false;
                    }
                    var fields = {
                        scenario: scenario,
                        persona: _readSelectVal("fld-ai_persona"),
                        tone: _readSelectVal("fld-ai_tone"),
                        action: _readSelectVal("fld-ai_action"),
                        difficulty: _readSelectVal("fld-ai_difficulty"),
                        audience: _readTextVal("fld-ai_audience"),
                        attachment: _readCheckedVal("fld-ai_attachment")
                    };
                    var brief = _buildTemplateBrief(fields);
                    _aiBusy(true);
                    _showStatus(tt("ai.generating", "Génération en cours…"));
                    // Kick off the call but keep the modal open until it
                    // settles — returning false prevents ct_modal from
                    // closing on the click event.
                    _aiGenerate("template", brief)
                        .then(function(r) {
                            var merged = Object.assign({}, parentSnapshot);
                            if (r.subject) merged.subject = r.subject;
                            if (r.html) merged.html = r.html;
                            if (r.text) merged.text = r.text;
                            _showStatus(tt("ai.done", "Contenu généré"));
                            ct_modal.close();
                            if (typeof reopenParent === "function") {
                                setTimeout(function() { reopenParent(merged); }, 0);
                            }
                        })
                        .catch(function(e) {
                            var msg = (e && e.detail) ? e.detail : (e && e.message) ? e.message : tt("ai.error", "Erreur de génération");
                            _aiBusy(false);
                            _showStatus(msg, "error");
                            // Modal stays open so the user can retry / cancel.
                        });
                    return false;
                }}
            ]
        });
    };

    // ── Settings modal (gear icon in toolbar) ─────────────────────

    function _resetRuntimeCache() { _runtimePromise = null; }

    function _providerLabel(p) {
        if (p === "anthropic") return tt("ai.settings.provider_anthropic", "Anthropic (Claude)");
        if (p === "openai") return tt("ai.settings.provider_openai", "OpenAI (GPT)");
        return p;
    }

    function _providerStateLabel(rt, p) {
        var configured = (p === "anthropic") ? rt.anthropic_configured : rt.openai_configured;
        var source = (p === "anthropic") ? rt.anthropic_source : rt.openai_source;
        if (!configured) return tt("ai.settings.not_configured", "non configurée");
        return source === "env"
            ? tt("ai.settings.configured_env", "configurée (env)")
            : tt("ai.settings.configured_db", "configurée (base)");
    }

    function _providerStateColor(rt, p) {
        var configured = (p === "anthropic") ? rt.anthropic_configured : rt.openai_configured;
        return configured ? "#15803d" : "#9ca3af";
    }

    function _renderProviderSelect(rt, selected) {
        var providers = Object.keys(rt.models || { anthropic: [], openai: [] });
        var opts = providers.map(function(p) {
            return '<option value="' + esc(p) + '"' + (p === selected ? ' selected' : '') + '>'
                + esc(_providerLabel(p)) + '</option>';
        }).join("");
        return '<select id="fld-ai_provider" style="width:100%">' + opts + '</select>';
    }

    function _renderModelSelect(rt, provider, selectedModel) {
        var models = (rt.models && rt.models[provider]) || [];
        var opts = models.map(function(m) {
            return '<option value="' + esc(m.id) + '"' + (m.id === selectedModel ? ' selected' : '') + '>'
                + esc(m.label || m.id) + '</option>';
        }).join("");
        return '<select id="fld-ai_model" style="width:100%">' + opts + '</select>';
    }

    function _renderKeyRow(rt, provider) {
        var configured = (provider === "anthropic") ? rt.anthropic_configured : rt.openai_configured;
        var source = (provider === "anthropic") ? rt.anthropic_source : rt.openai_source;
        var readOnly = source === "env";
        var placeholder = configured
            ? tt("ai.settings.key_placeholder_set", "Clé enregistrée — laissez vide pour conserver")
            : (provider === "anthropic" ? "sk-ant-…" : "sk-…");
        var clearBtn = (configured && !readOnly)
            ? '<button type="button" class="btn btn-ghost btn-sm" data-click="_phishAiClearKey" data-args=\'["' + esc(provider) + '"]\' title="' + esc(tt("ai.settings.clear_key", "Effacer la clé")) + '">✕</button>'
            : '';
        var envNote = readOnly
            ? '<div style="font-size:0.78em;color:#6b7280;margin-top:4px">🔒 ' + esc(tt("ai.settings.via_env", "via variable d'environnement (lecture seule)")) + '</div>'
            : '';
        return ''
            + '<div style="display:flex;gap:6px;align-items:center">'
                + '<input type="password" id="fld-ai_key" autocomplete="off"'
                    + ' placeholder="' + esc(placeholder) + '"'
                    + (readOnly ? ' disabled' : '')
                    + ' style="flex:1">'
                + '<button type="button" class="btn btn-ghost btn-sm" data-click="_phishAiToggleKey" title="' + esc(tt("ai.settings.show_key", "Afficher la clé")) + '">👁</button>'
                + clearBtn
            + '</div>'
            + envNote;
    }

    function _renderSettingsBody(rt) {
        rt = rt || { models: {} };
        var selectedProvider = rt.provider || "anthropic";

        // Status panel — one line per provider, regardless of selection
        var statusRows = ["anthropic", "openai"].map(function(p) {
            var color = _providerStateColor(rt, p);
            var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px"></span>';
            return '<div style="display:flex;justify-content:space-between;font-size:0.85em;padding:2px 0">'
                + '<span>' + dot + esc(_providerLabel(p)) + '</span>'
                + '<span style="color:' + color + ';font-weight:500">' + esc(_providerStateLabel(rt, p)) + '</span>'
            + '</div>';
        }).join("");

        return ''
            + '<p style="margin-top:0;color:#475569;font-size:0.9em">'
                + esc(tt("ai.settings.intro", "Saisissez une clé API pour activer l'assistant. La clé est stockée côté serveur (base SQLite locale) et n'est jamais renvoyée au navigateur. Laissez vide pour ne rien changer."))
            + '</p>'

            // Provider
            + '<div style="margin-bottom:14px">'
                + '<label for="fld-ai_provider" style="display:block;font-weight:600;margin-bottom:4px;font-size:0.9em">'
                    + esc(tt("ai.settings.provider", "Fournisseur")) + '</label>'
                + _renderProviderSelect(rt, selectedProvider)
            + '</div>'

            // Model (rebuilt when provider changes)
            + '<div style="margin-bottom:14px">'
                + '<label for="fld-ai_model" style="display:block;font-weight:600;margin-bottom:4px;font-size:0.9em">'
                    + esc(tt("ai.settings.model", "Modèle")) + '</label>'
                + '<div id="ai_model_container">'
                    + _renderModelSelect(rt, selectedProvider, rt.model)
                + '</div>'
            + '</div>'

            // Key for the selected provider (rebuilt when provider changes)
            + '<div style="margin-bottom:14px">'
                + '<label for="fld-ai_key" style="display:block;font-weight:600;margin-bottom:4px;font-size:0.9em">'
                    + esc(tt("ai.settings.key", "Clé API")) + '</label>'
                + '<div id="ai_key_container">' + _renderKeyRow(rt, selectedProvider) + '</div>'
            + '</div>'

            // Status of all providers
            + '<div style="border-top:1px solid #e5e7eb;padding-top:10px;margin-top:8px">'
                + '<div style="font-size:0.82em;color:#6b7280;font-weight:600;margin-bottom:6px">'
                    + esc(tt("ai.settings.other_providers", "État autres fournisseurs")) + '</div>'
                + statusRows
            + '</div>';
    }

    // Re-render model + key blocks when the user picks a different provider.
    window._phishAiProviderChanged = function() {
        var rt = window.__phishAiRt || {};
        var p = (document.getElementById("fld-ai_provider") || {}).value || "anthropic";
        var mc = document.getElementById("ai_model_container");
        var kc = document.getElementById("ai_key_container");
        if (mc) mc.innerHTML = _renderModelSelect(rt, p, (rt.models && rt.models[p] && rt.models[p][0] && rt.models[p][0].id) || "");
        if (kc) kc.innerHTML = _renderKeyRow(rt, p);
    };

    window._phishAiToggleKey = function() {
        var inp = document.getElementById("fld-ai_key");
        if (!inp) return;
        inp.type = inp.type === "password" ? "text" : "password";
    };

    window._phishAiClearKey = function(provider) {
        ct_modal.confirm({
            title: tt("ai.settings.clear_key", "Effacer la clé"),
            message: tt("ai.settings.clear_confirm", "Effacer la clé enregistrée pour ce fournisseur ?"),
            danger: true,
            confirmLabel: tt("common.delete", "Supprimer")
        }).then(function(ok) {
            if (!ok) return;
            var payload = {};
            payload[provider + "_key"] = "";
            window._phishPut("api/ai/settings", payload).then(function() {
                _resetRuntimeCache();
                _showStatus(tt("ai.settings.saved", "Paramètres IA enregistrés"));
                window.openSettings(); // re-render with fresh state
            }).catch(function(e) {
                var msg = (e && e.detail) ? e.detail : tt("ai.error", "Erreur");
                _showStatus(msg, "error");
            });
        });
    };

    function _readSettingsBody() {
        var providerEl = document.getElementById("fld-ai_provider");
        var modelEl = document.getElementById("fld-ai_model");
        var keyEl = document.getElementById("fld-ai_key");
        var body = {};
        if (providerEl) body.provider = providerEl.value;
        if (modelEl) body.model = modelEl.value;
        if (keyEl && !keyEl.disabled && keyEl.value) {
            // The key field always targets the SELECTED provider.
            body[(providerEl ? providerEl.value : "anthropic") + "_key"] = keyEl.value;
        }
        return body;
    }

    // ── Settings drawer (right-side slide-in panel) ───────────────
    // Same UX as the other CISO Toolbox modules: Language → AI assistant
    // → module-specific settings, in that order.

    function _ensureSettingsDrawer() {
        if (window.__phishDrawer) return window.__phishDrawer;
        var overlay = document.createElement("div");
        overlay.className = "ai-overlay";
        var md = null;
        overlay.addEventListener("mousedown", function(e) { md = e.target; });
        overlay.addEventListener("click", function(e) {
            if (e.target === overlay && md === overlay) _closeSettingsDrawer();
        });
        document.body.appendChild(overlay);
        var panel = document.createElement("div");
        panel.className = "ai-panel";
        panel.innerHTML = '<div class="ai-panel-header">'
            + '<span class="ai-panel-title"></span>'
            + '<button type="button" class="ai-panel-close">&times;</button>'
            + '</div><div class="ai-panel-body"></div>';
        document.body.appendChild(panel);
        panel.querySelector(".ai-panel-close").onclick = _closeSettingsDrawer;
        window.__phishDrawer = {
            overlay: overlay, panel: panel,
            title: panel.querySelector(".ai-panel-title"),
            body: panel.querySelector(".ai-panel-body")
        };
        return window.__phishDrawer;
    }

    function _closeSettingsDrawer() {
        var d = window.__phishDrawer;
        if (d) { d.overlay.classList.remove("open"); d.panel.classList.remove("open"); }
    }

    function _tzOptionsHTML() {
        var cur = "";
        try { cur = localStorage.getItem("phish.tz") || ""; } catch (e) {}
        var browserTz = "";
        try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
        var zones = [];
        try { zones = Intl.supportedValuesOf("timeZone") || []; } catch (e) {}
        var h = '<option value=""' + (cur === "" ? " selected" : "") + '>'
            + esc(tt("settings.tz_browser", "Navigateur") + (browserTz ? " (" + browserTz + ")" : ""))
            + '</option>';
        zones.forEach(function(z) {
            h += '<option value="' + esc(z) + '"' + (z === cur ? " selected" : "") + '>' + esc(z) + '</option>';
        });
        return h;
    }

    function _settingsDrawerHTML(rt) {
        var fr = (typeof _locale !== "undefined" ? _locale : "fr") === "fr";
        return ''
            + '<div class="settings-section">'
            +   '<div class="settings-label">' + esc(tt("settings.language", "Langue")) + '</div>'
            +   '<div style="display:flex;gap:8px">'
            +     '<button type="button" class="settings-lang-btn' + (fr ? " active" : "") + '" id="set-lang-fr">Français</button>'
            +     '<button type="button" class="settings-lang-btn' + (fr ? "" : " active") + '" id="set-lang-en">English</button>'
            +   '</div>'
            + '</div>'
            + '<div class="settings-section">'
            +   '<div class="settings-label">' + esc(tt("settings.timezone", "Fuseau horaire")) + '</div>'
            +   '<select id="set-tz" data-change="_phishSetTz" data-pass-value style="width:100%;max-width:360px">'
            +     _tzOptionsHTML()
            +   '</select>'
            + '</div>'
            + '<div class="settings-section">'
            +   '<div class="settings-label">' + esc(tt("settings.ai_section", "Assistant IA")) + '</div>'
            +   _renderSettingsBody(rt)
            +   '<button type="button" class="btn btn-primary btn-sm" data-click="_phishSaveAiSettings" style="margin-top:12px">'
            +     esc(tt("common.save", "Enregistrer")) + '</button>'
            + '</div>'
            + '<div class="settings-section">'
            +   '<div class="settings-label">' + esc(tt("m365.title", "Connecteur Microsoft 365")) + '</div>'
            +   '<div id="m365-card" class="m365-card"></div>'
            + '</div>';
    }

    window._phishSaveAiSettings = function() {
        var body = _readSettingsBody();
        window._phishPut("api/ai/settings", body)
            .then(function() {
                _resetRuntimeCache();
                _showStatus(tt("ai.settings.saved", "Paramètres IA enregistrés"));
            })
            .catch(function(e) {
                var msg = (e && e.detail) ? e.detail : (e && e.message) ? e.message : tt("ai.error", "Erreur");
                _showStatus(msg, "error");
            });
    };

    window.openSettings = function() {
        _resetRuntimeCache();
        loadRuntime().then(function(rt) {
            window.__phishAiRt = rt || { models: {} };
            var d = _ensureSettingsDrawer();
            d.title.textContent = tt("settings.drawer_title", "Réglages");
            d.body.innerHTML = _settingsDrawerHTML(window.__phishAiRt);
            d.overlay.classList.add("open");
            d.panel.classList.add("open");
            var sel = document.getElementById("fld-ai_provider");
            if (sel) sel.addEventListener("change", window._phishAiProviderChanged);
            var lf = document.getElementById("set-lang-fr");
            var le = document.getElementById("set-lang-en");
            if (lf) lf.onclick = function() { switchLang("fr", window.openSettings); };
            if (le) le.onclick = function() { switchLang("en", window.openSettings); };
            if (typeof window._phishLoadM365Card === "function") window._phishLoadM365Card();
        });
    };

    // ── Landing AI modal ──────────────────────────────────────────

    function _pageTypeOptions() {
        return [
            ["login", tt("ai.page.login", "Page de connexion (formulaire identifiants)")],
            ["otp", tt("ai.page.otp", "Validation OTP / 2FA")],
            ["document", tt("ai.page.document", "Téléchargement de document")],
            ["confirm_profile", tt("ai.page.confirm_profile", "Confirmation de profil utilisateur")],
            ["info", tt("ai.page.info", "Page d'information (sans formulaire)")],
            ["debrief", tt("ai.page.debrief", "Page de débriefing (révéler l'exercice)")]
        ];
    }
    function _brandStyleOptions() {
        return [
            ["intranet_generic", tt("ai.brand.intranet_generic", "Portail interne générique")],
            ["it_helpdesk", tt("ai.brand.it_helpdesk", "Helpdesk IT interne")],
            ["hr_portal", tt("ai.brand.hr_portal", "Portail RH interne")],
            ["saas_generic", tt("ai.brand.saas_generic", "SaaS générique (anonyme)")],
            ["doc_share", tt("ai.brand.doc_share", "Plateforme de partage de documents (anonyme)")],
            ["plain", tt("ai.brand.plain", "Mise en page sobre / sans branding")]
        ];
    }

    function _buildLandingBrief(fields) {
        var lang = _langCode();
        var L = lang === "en" ? {
            scenario: "Scenario",
            page_type: "Page type",
            brand_style: "Visual style (no real brand impersonation)",
            with_form: "Includes a form with action=\"{{.SubmitURL}}\" and method=POST",
            no_form: "No form on this page",
            form_fields: "Form fields to expose",
            redirect_msg: "After submit, show a clear training-debrief message explaining this was a phishing exercise",
            placeholders: "Personalise with {{.FirstName}} {{.LastName}} {{.Email}} where appropriate",
            no_storage: "Reminder: the backend never stores submitted values, only field names and lengths"
        } : {
            scenario: "Scénario",
            page_type: "Type de page",
            brand_style: "Style visuel (aucune marque réelle imitée)",
            with_form: "Inclure un formulaire avec action=\"{{.SubmitURL}}\" et method=POST",
            no_form: "Aucun formulaire sur cette page",
            form_fields: "Champs du formulaire à exposer",
            redirect_msg: "Après soumission, afficher un message clair de débriefing expliquant qu'il s'agit d'un exercice de sensibilisation",
            placeholders: "Personnaliser avec {{.FirstName}} {{.LastName}} {{.Email}} là où c'est pertinent",
            no_storage: "Rappel : le backend ne stocke jamais les valeurs saisies, seuls les noms de champs et leurs longueurs"
        };
        var pageMap = {};
        _pageTypeOptions().forEach(function(o) { pageMap[o[0]] = o[1]; });
        var brandMap = {};
        _brandStyleOptions().forEach(function(o) { brandMap[o[0]] = o[1]; });
        var lines = [];
        lines.push(L.scenario + " : " + fields.scenario);
        lines.push(L.page_type + " : " + (pageMap[fields.page_type] || fields.page_type));
        lines.push(L.brand_style + " : " + (brandMap[fields.brand_style] || fields.brand_style));
        if (fields.with_form) {
            lines.push(L.with_form);
            if (fields.form_fields) lines.push(L.form_fields + " : " + fields.form_fields);
            lines.push(L.no_storage);
        } else {
            lines.push(L.no_form);
        }
        if (fields.debrief) lines.push(L.redirect_msg);
        lines.push(L.placeholders);
        return lines.join("\n");
    }

    window._phishOpenAiLandingModal = function() {
        var captureChecked = _readCheckedVal("fld-lp_capture");
        var parentSnapshot = {
            name: _readTextVal("fld-lp_name"),
            html: _readTextVal("fld-lp_html"),
            capture_credentials: _readCheckedVal("fld-lp_capture"),
            redirect_url: _readTextVal("fld-lp_redirect")
        };
        var reopenParent = window._phishLastLandingReopen;
        var body = ''
            + '<p style="margin-top:0;color:#475569;font-size:0.88em">'
                + esc(tt("ai.landing_hint", "Renseignez le contexte de la page. Si un formulaire est exposé, son action sera {{.SubmitURL}} et le backend ne stockera jamais les valeurs."))
            + '</p>'
            + _textareaField("fld-ai_scenario",
                tt("ai.field.scenario", "Scénario") + " *",
                tt("ai.field.landing_scenario_ph", "Ex: portail interne demandant à l'utilisateur de revalider son mot de passe pour accéder à un document RH."),
                100)
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
                + _selectField("fld-ai_page_type", tt("ai.field.page_type", "Type de page"), _pageTypeOptions(), "login")
                + _selectField("fld-ai_brand_style", tt("ai.field.brand_style", "Style visuel"), _brandStyleOptions(), "intranet_generic")
            + '</div>'
            + '<label style="display:flex;align-items:center;gap:6px;font-weight:normal;font-size:0.88em;margin-top:4px">'
                + '<input type="checkbox" id="fld-ai_with_form"' + (captureChecked ? " checked" : "") + '> '
                + esc(tt("ai.field.with_form", "Inclure un formulaire (action = {{.SubmitURL}})"))
            + '</label>'
            + _textField("fld-ai_form_fields",
                tt("ai.field.form_fields", "Champs du formulaire (optionnel)"),
                tt("ai.field.form_fields_ph", "Ex: email, password — ou first_name, last_name, otp"),
                "")
            + '<label style="display:flex;align-items:center;gap:6px;font-weight:normal;font-size:0.88em">'
                + '<input type="checkbox" id="fld-ai_debrief"> '
                + esc(tt("ai.field.debrief", "Afficher un message de débriefing après soumission"))
            + '</label>';

        ct_modal.open({
            title: tt("ai.landing_title", "Assistant IA — page d'atterrissage"),
            body: body,
            size: "lg",
            buttons: [
                { id: "cancel", label: tt("common.cancel", "Annuler"), result: function() {
                    if (typeof reopenParent === "function") {
                        setTimeout(function() { reopenParent(parentSnapshot); }, 0);
                    }
                    return null;
                }},
                { id: "go", label: tt("ai.generate", "Générer"), primary: true, result: function() {
                    var scenario = _readTextVal("fld-ai_scenario");
                    if (scenario.length < 4) {
                        _showStatus(tt("ai.too_short", "Description trop courte"), "error");
                        return false;
                    }
                    var fields = {
                        scenario: scenario,
                        page_type: _readSelectVal("fld-ai_page_type"),
                        brand_style: _readSelectVal("fld-ai_brand_style"),
                        with_form: _readCheckedVal("fld-ai_with_form"),
                        form_fields: _readTextVal("fld-ai_form_fields"),
                        debrief: _readCheckedVal("fld-ai_debrief")
                    };
                    var brief = _buildLandingBrief(fields);
                    _aiBusy(true);
                    _showStatus(tt("ai.generating", "Génération en cours…"));
                    _aiGenerate("landing", brief)
                        .then(function(r) {
                            var merged = Object.assign({}, parentSnapshot);
                            if (r.html) merged.html = r.html;
                            // Auto-tick capture if the AI was told to include a form
                            if (fields.with_form) merged.capture_credentials = true;
                            _showStatus(tt("ai.done", "Contenu généré"));
                            ct_modal.close();
                            if (typeof reopenParent === "function") {
                                setTimeout(function() { reopenParent(merged); }, 0);
                            }
                        })
                        .catch(function(e) {
                            var msg = (e && e.detail) ? e.detail : (e && e.message) ? e.message : tt("ai.error", "Erreur de génération");
                            _aiBusy(false);
                            _showStatus(msg, "error");
                        });
                    return false;
                }}
            ]
        });
    };
})();
