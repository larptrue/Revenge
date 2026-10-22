"use strict";

var V = (typeof vendetta !== "undefined" && vendetta) ||
        (typeof window !== "undefined" && window.vendetta);
if (!V) throw new Error("[FakeIdentity] API do Revenge nao encontrada");

var React  = V.metro.common.React;
var RN     = V.metro.common.ReactNative;
var Flux   = V.metro.common.FluxDispatcher;
var Forms  = (V.ui.components && V.ui.components.Forms) || {};

var storage = (V.plugin && V.plugin.storage) || {};
try { storage = V.storage.useProxy(storage); } catch (e) {}

var BADGES = {
    staff:               [1 << 0,  "Discord Staff"],
    partner:             [1 << 1,  "Parceiro"],
    hypesquad_events:    [1 << 2,  "HypeSquad Events"],
    bug_hunter_1:        [1 << 3,  "Cacador de Bugs Nv.1"],
    hypesquad_bravery:   [1 << 6,  "HypeSquad Bravery"],
    hypesquad_brilliance:[1 << 7,  "HypeSquad Brilliance"],
    hypesquad_balance:   [1 << 8,  "HypeSquad Balance"],
    early_supporter:     [1 << 9,  "Apoiador Antecipado"],
    bug_hunter_2:        [1 << 14, "Cacador de Bugs Nv.2"],
    verified_bot:        [1 << 16, "Bot Verificado (check)"],
    verified_developer:  [1 << 17, "Dev Verificado"],
    certified_moderator: [1 << 18, "Moderador Certificado"],
    active_developer:    [1 << 22, "Dev Ativo"]
};

var DEFAULTS = {
    active: true,
    everyone: false,
    patchMessages: true,
    newBadges: true,
    username: "",
    displayName: "",
    nitro: false,
    botTag: false,
    systemTag: false
};
for (var bk in BADGES) DEFAULTS["b_" + bk] = false;

var s = storage;
for (var dk in DEFAULTS) if (s[dk] === undefined) s[dk] = DEFAULTS[dk];

var cache = new Map();
var msgCache = new Map();
var ver = 0;
var unpatches = [];

var UserStore    = V.metro.findByStoreName("UserStore")    || V.metro.findByProps("getUser", "getCurrentUser");
var ProfileStore = V.metro.findByStoreName("UserProfileStore") || V.metro.findByProps("getUserProfile");
var MsgStore     = V.metro.findByProps("getMessage", "getMessages");

function isMine(u) {
    if (!u || !u.id) return false;
    if (s.everyone) return true;
    try { var me = UserStore && UserStore.getCurrentUser(); return !!me && me.id === u.id; }
    catch (e) { return false; }
}

function flagsFor(u) {
    var f = u.publicFlags || 0;
    for (var k in BADGES) if (s["b_" + k]) f |= BADGES[k][0];
    return f;
}

function txUser(u) {
    if (!u || typeof u !== "object" || !s.active || !isMine(u)) return u;
    var c = cache.get(u.id);
    if (c && c.src === u && c.v === ver) return c.out;

    var out = {};
    for (var p in u) out[p] = u[p];

    if (s.username) out.username = s.username;
    if (s.displayName) { out.globalName = s.displayName; out.global_name = s.displayName; }

    var f = flagsFor(u);
    if (f !== (u.publicFlags || 0)) { out.publicFlags = f; out.flags = (u.flags || 0) | f; }
    if (s.b_verified_bot) { out.flags = (out.flags || 0) | (1 << 16); out.verified = true; }
    if (s.botTag || s.b_verified_bot) out.bot = true;
    if (s.systemTag) out.system = true;
    if (s.nitro) out.premiumType = 2;

    cache.set(u.id, { src: u, out: out, v: ver });
    return out;
}

function txProfile(pr) {
    if (!pr || !pr.user || !s.active || !isMine(pr.user)) return pr;
    var out = {};
    for (var p in pr) out[p] = pr[p];
    out.user = txUser(pr.user);

    if (s.newBadges && Array.isArray(pr.badges)) {
        var list = [];
        for (var k in BADGES) if (s["b_" + k]) list.push({ id: k, description: BADGES[k][1], icon: k, link: null });
        if (s.nitro) list.push({ id: "premium", description: "Nitro", icon: "premium", link: null });
        out.badges = list;
    }
    return out;
}

function txMsg(m) {
    if (!m || !m.author || !s.active || !isMine(m.author)) return m;
    var c = msgCache.get(m.id);
    if (c && c.src === m && c.v === ver) return c.out;

    var out = {};
    for (var p in m) out[p] = m[p];
    out.author = txUser(m.author);
    if (s.displayName && m.member) {
        var mem = {};
        for (var q in m.member) mem[q] = m.member[q];
        mem.nick = s.displayName;
        out.member = mem;
    }
    msgCache.set(m.id, { src: m, out: out, v: ver });
    return out;
}

function refresh() {
    ver++;
    cache.clear();
    msgCache.clear();
    try {
        var me = UserStore && UserStore.getCurrentUser();
        if (me) Flux.dispatch({ type: "CURRENT_USER_UPDATE", user: me });
    } catch (e) {}
}

function hook(name, obj, fn) {
    if (obj && typeof obj[name] === "function") unpatches.push(V.patcher.after(name, obj, fn));
}

hook("getUser", UserStore, function (a, r) { return txUser(r); });
hook("getCurrentUser", UserStore, function (a, r) { return txUser(r); });
hook("getUserProfile", ProfileStore, function (a, r) { return txProfile(r); });
hook("getGuildMemberProfile", ProfileStore, function (a, r) { return txProfile(r); });
if (s.patchMessages) {
    hook("getMessage", MsgStore, function (a, r) { return txMsg(r); });
    hook("getMessages", MsgStore, function (a, r) { return Array.isArray(r) ? r.map(txMsg) : r; });
}

// ---------- tela de configuracao ----------
function row(label, key, note) {
    return React.createElement(Forms.FormSwitchRow, {
        key: key,
        label: label,
        note: note || "",
        value: !!s[key],
        onValueChange: function (v) { s[key] = v; refresh(); }
    });
}

function textRow(title, key, ph) {
    if (Forms.FormInput) {
        return React.createElement(Forms.FormInput, {
            key: key, title: title, value: s[key], placeholder: ph,
            onChange: function (v) { s[key] = v; refresh(); }
        });
    }
    return React.createElement(RN.View, { key: key, style: { padding: 12 } },
        React.createElement(RN.Text, { style: { opacity: 0.7, marginBottom: 6 } }, title),
        React.createElement(RN.TextInput, {
            value: s[key], placeholder: ph,
            onChangeText: function (v) { s[key] = v; refresh(); },
            style: { padding: 6, borderBottomWidth: 1, borderColor: "#666" }
        })
    );
}

function Settings() {
    var kids = [];

    kids.push(React.createElement(Forms.FormSection, { title: "Nome", key: "names" },
        textRow("Nome de usuario", "username", "ex: venice"),
        textRow("Nome de exibicao", "displayName", "ex: Venice")
    ));

    var badgeRows = [];
    for (var k in BADGES) badgeRows.push(row(BADGES[k][1], "b_" + k));
    kids.push(React.createElement.apply(null,
        [Forms.FormSection, { title: "Insignias", key: "badges" }].concat(badgeRows)));

    kids.push(React.createElement(Forms.FormSection, { title: "Extras", key: "extras" },
        row("Nitro", "nitro", "Mostra a insignia de Nitro"),
        row("Tag de BOT", "botTag", "Mostra BOT ao lado do nome"),
        row("Tag de SYSTEM", "systemTag", "Tag estilo Clyde"),
        row("Sistema novo de badges", "newBadges", "Desligue se alguma insignia aparecer quebrada")
    ));

    kids.push(React.createElement(Forms.FormSection, { title: "Aplicacao", key: "scope" },
        row("Aplicar em todos os usuarios", "everyone", "Senao, so na sua conta"),
        row("Reescrever nomes no chat", "patchMessages", "Afeta o autor das mensagens"),
        row("Ativado", "active", "Liga/desliga tudo")
    ));

    return React.createElement(RN.ScrollView, { style: { flex: 1 } },
        React.createElement(RN.View, null, kids));
}

// ---------- export (compativel com Revenge novo e legado) ----------
var EXPORTS = {
    onLoad: function () { V.logger.log("[FakeIdentity] carregado"); },
    onUnload: function () {
        unpatches.forEach(function (u) { u(); });
        unpatches = [];
        cache.clear();
        msgCache.clear();
        V.logger.log("[FakeIdentity] descarregado");
    },
    settings: Settings
};
EXPORTS.start = EXPORTS.onLoad;
EXPORTS.stop = EXPORTS.onUnload;

var plugin = Object.assign(
    (typeof plugin !== "undefined" && plugin) ? plugin : {},
    EXPORTS
);
if (!plugin.default) plugin.default = plugin;
if (typeof module !== "undefined" && module && module.exports) module.exports = plugin;
