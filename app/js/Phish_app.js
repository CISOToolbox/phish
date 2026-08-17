/* Phish — main app shell.
 * P2 scope: bootstrap, auth gate, panel switching, i18n boot, toolbar
 * profile. CRUD wiring lands in P3 (per-panel files).
 */
(function() {
    "use strict";

    var PANELS = ["dashboard", "campaigns", "templates", "landings", "groups", "settings"];

    function selectPanel(name) {
        if (PANELS.indexOf(name) < 0) return;
        PANELS.forEach(function(p) {
            var el = document.getElementById("panel-" + p);
            if (el) el.style.display = (p === name) ? "" : "none";
        });
        var items = document.querySelectorAll(".sidebar-item");
        items.forEach(function(it) {
            var args = it.getAttribute("data-args");
            var match = args && args.indexOf('"' + name + '"') >= 0;
            it.classList.toggle("active", !!match);
        });
        try { localStorage.setItem("phish.activePanel", name); } catch (e) {}
        if (typeof window._phishLoadPanel === "function") window._phishLoadPanel(name);
    }

    function toggleSidebar() {
        var sb = document.getElementById("sidebar");
        if (sb) sb.classList.toggle("collapsed");
    }
    function _toggleSidebarMobile() {
        var sb = document.getElementById("sidebar");
        if (sb) sb.classList.toggle("open");
    }

    function _renderUserMenu(user) {
        var el = document.getElementById("toolbar-right");
        if (!el || !user) return;
        var label = user.name || user.email || "user";
        var gear = (typeof window._getSettingsButtonHTML === "function")
            ? window._getSettingsButtonHTML()
            : '';
        el.innerHTML =
            gear +
            '<span class="user-chip" title="' + _esc(user.email || "") + '">' +
                _esc(label) +
                (user.role === "admin" ? ' <span class="user-role">admin</span>' : '') +
            '</span>' +
            '<button class="btn btn-ghost" data-click="_phishLogout" title="Sign out">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
            '</button>';
        // Re-purpose the shared gear icon tooltip for AI settings.
        var gearBtn = document.getElementById("btn-settings");
        if (gearBtn && typeof window.t === "function") {
            var ti = window.t("settings.drawer_title");
            if (ti && ti !== "settings.drawer_title") gearBtn.title = ti;
        }
    }

    function _phishLogout() {
        _phishPost("auth/logout", {}).finally(function() {
            window.location.href = "login.html";
        });
    }

    function _esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function boot() {
        // Shared i18n apply — handles data-i18n, data-i18n-html (help
        // content), data-i18n-title and data-i18n-placeholder.
        if (typeof _applyStaticTranslations === "function") _applyStaticTranslations();

        // Auth gate: any 401 inside _phishFetch already redirects, so a
        // bare /auth/me here is enough to confirm the session.
        _phishGet("auth/me").then(function(user) {
            _renderUserMenu(user);

            // Restore last active panel; default to dashboard.
            var last = "dashboard";
            try { last = localStorage.getItem("phish.activePanel") || last; } catch (e) {}
            selectPanel(last);
        }).catch(function() {
            // _phishFetch already handled the redirect on 401.
        });
    }

    // Re-render the active panel. switchLang() calls renderAll() so a
    // language change refreshes the dynamically-rendered content (tables,
    // panels), not only the static data-i18n chrome.
    window.renderAll = function() {
        var p = "dashboard";
        try { p = localStorage.getItem("phish.activePanel") || p; } catch (e) {}
        if (typeof window._phishLoadPanel === "function") window._phishLoadPanel(p);
    };

    // Expose for data-click dispatch
    window.selectPanel = selectPanel;
    window.toggleSidebar = toggleSidebar;
    window._toggleSidebarMobile = _toggleSidebarMobile;
    window._phishLogout = _phishLogout;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
