/* Phish — thin fetch wrapper.
 * All API calls go through _phishFetch so we keep credentials handling,
 * 401 → redirect to login, and status messages centralised.
 */
(function() {
    "use strict";

    function _phishFetch(path, opts) {
        opts = opts || {};
        opts.credentials = "same-origin";
        opts.headers = Object.assign({}, opts.headers || {});
        if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof FormData)) {
            opts.headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(path, opts).then(function(r) {
            if (r.status === 401) {
                window.location.href = "login.html";
                return Promise.reject(new Error("unauthenticated"));
            }
            if (!r.ok) {
                return r.json().catch(function() { return { detail: r.statusText }; })
                    .then(function(err) { throw err; });
            }
            // 204 / empty
            if (r.status === 204) return null;
            var ct = r.headers.get("Content-Type") || "";
            return ct.indexOf("application/json") === 0 ? r.json() : r.text();
        });
    }

    function _phishGet(path) { return _phishFetch(path, { method: "GET" }); }
    function _phishPost(path, body) { return _phishFetch(path, { method: "POST", body: body }); }
    function _phishPut(path, body)  { return _phishFetch(path, { method: "PUT",  body: body }); }
    function _phishPatch(path, body){ return _phishFetch(path, { method: "PATCH", body: body }); }
    function _phishDel(path)        { return _phishFetch(path, { method: "DELETE" }); }

    window._phishFetch = _phishFetch;
    window._phishGet = _phishGet;
    window._phishPost = _phishPost;
    window._phishPut = _phishPut;
    window._phishPatch = _phishPatch;
    window._phishDel = _phishDel;

    // Status bar helper — mirrors what surface_api.js does.
    window.showStatus = function(msg, kind) {
        var el = document.getElementById("status-msg");
        if (!el) return;
        el.textContent = msg || "";
        el.className = "status" + (kind ? " status-" + kind : "");
        if (msg) {
            clearTimeout(window._phishStatusTimer);
            window._phishStatusTimer = setTimeout(function() {
                el.textContent = "";
                el.className = "status";
            }, kind === "error" ? 6000 : 3500);
        }
    };
})();
