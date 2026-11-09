// Builds db.js: the small browser SDK every generated site uses to reach its own database.
// The server writes this file (the model never does), embeds the project's public key and API URL, and replaces it on
// every build. The output is plain ES5 and pure ASCII (Persian messages are \u-escaped), so it works in any page.

import { isSafeApiUrl } from "./preview-policy.ts";
import { KEY_PATTERN } from "./patterns.ts";

export const SDK_PATH = "db.js";

const MESSAGES: Record<string, string> = {
  NETWORK: "اتصال اینترنت برقرار نیست؛ دوباره امتحان کنید.",
  RATE_LIMITED: "درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.",
  LIMIT_REACHED: "ظرفیت ذخیره‌سازی پر شده است.",
  TOO_LARGE: "اطلاعات واردشده بیش از حد بزرگ است.",
  BAD_REQUEST: "اطلاعات واردشده کامل یا معتبر نیست.",
  FORBIDDEN: "اجازهٔ انجام این کار را ندارید.",
  NOT_OWNER: "فقط مواردی را می‌توانید تغییر دهید که با همین مرورگر ثبت کرده‌اید.",
  NOT_FOUND: "این مورد پیدا نشد.",
  DEFAULT: "خطایی رخ داد؛ دوباره امتحان کنید.",
};

function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u0080-\uffff]/g, (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
}

const TEMPLATE = `/* db.js - managed by the site builder and regenerated on every build. Do not edit. */
(function (window) {
  "use strict";
  var API_URL = __API_URL__;
  var KEY = __KEY__;
  var MESSAGES = __MESSAGES__;
  var STORE_KEY = "aib:tokens:" + KEY.slice(3, 13);
  var MAX_TOKENS = 500;
  var memory = {};

  function readTokens() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (e) { /* storage unavailable: fall back to memory */ }
    return memory;
  }
  function writeTokens(tokens) {
    var keys = Object.keys(tokens);
    while (keys.length > MAX_TOKENS) delete tokens[keys.shift()];
    memory = tokens;
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(tokens)); } catch (e) { /* keep the in-memory copy */ }
  }
  function fail(code, message, status) {
    var error = new Error(message);
    error.code = code;
    if (status) error.status = status;
    return error;
  }
  function call(body) {
    body.key = KEY;
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(
      function (res) {
        return res.json().then(function (out) { return out; }, function () { return null; }).then(function (out) {
          if (!out || !res.ok || out.ok !== true) {
            throw fail((out && out.code) || "ERROR", (out && out.error) || "Request failed", res.status);
          }
          return out;
        });
      },
      function () { throw fail("NETWORK", "Network error"); }
    );
  }

  function collection(name) {
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(name)) {
      throw fail("BAD_COLLECTION", "Invalid collection name");
    }
    function tokenKey(id) { return name + ":" + id; }
    return {
      create: function (data) {
        return call({ op: "create", collection: name, data: data }).then(function (out) {
          var tokens = readTokens();
          tokens[tokenKey(out.id)] = out.token;
          writeTokens(tokens);
          return { id: out.id, createdAt: out.created_at };
        });
      },
      list: function (options) {
        options = options || {};
        return call({ op: "list", collection: name, limit: options.limit, offset: options.offset }).then(function (out) {
          var tokens = readTokens();
          return {
            hasMore: out.has_more === true,
            records: out.records.map(function (record) {
              return {
                id: record.id,
                createdAt: record.created_at,
                updatedAt: record.updated_at,
                data: record.data,
                mine: Object.prototype.hasOwnProperty.call(tokens, tokenKey(record.id))
              };
            })
          };
        });
      },
      update: function (id, data) {
        var token = readTokens()[tokenKey(id)];
        if (!token) return Promise.reject(fail("NOT_OWNER", "Not created in this browser"));
        return call({ op: "update", collection: name, id: id, token: token, data: data }).then(function (out) {
          return { id: out.id };
        });
      },
      remove: function (id) {
        var token = readTokens()[tokenKey(id)];
        if (!token) return Promise.reject(fail("NOT_OWNER", "Not created in this browser"));
        return call({ op: "delete", collection: name, id: id, token: token }).then(function (out) {
          var tokens = readTokens();
          delete tokens[tokenKey(id)];
          writeTokens(tokens);
          return { id: out.id };
        });
      }
    };
  }

  function messageFor(error) {
    var code = error && error.code;
    return MESSAGES[code] || MESSAGES.DEFAULT;
  }

  window.db = Object.freeze({ collection: collection, messageFor: messageFor });
})(window);
`;

export function buildSdk(options: { apiUrl: string; key: string }): string {
  if (!isSafeApiUrl(options.apiUrl)) throw new Error("Unsafe API URL");
  if (!KEY_PATTERN.test(options.key)) throw new Error("Malformed project key");
  return TEMPLATE.replace("__API_URL__", () => asciiJson(options.apiUrl))
    .replace("__KEY__", () => asciiJson(options.key))
    .replace("__MESSAGES__", () => asciiJson(MESSAGES));
}

/** Reads the API URL back out of a db.js built by buildSdk (used by the preview to allow exactly that URL). */
export function apiUrlFromSdk(source: string): string | null {
  const match = source.match(/var API_URL = "([^"\\]+)";/);
  const candidate = match?.[1];
  return candidate && isSafeApiUrl(candidate) ? candidate : null;
}
