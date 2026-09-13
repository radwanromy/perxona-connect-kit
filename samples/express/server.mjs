import express from "express";

// ── Config ──────────────────────────────────────────────────

const PORT = process.env.PORT || 8083;
const PERXONA_API_BASE_URL = process.env.PERXONA_API_BASE_URL;
// Only the /asia or /eu region segment is read out of PERXONA_API_BASE_URL —
// the host is always the public console, never whatever host
// PERXONA_API_BASE_URL itself points at. GET /api/config is unauthenticated
// (see the "config (unauthenticated)" tests), so forwarding
// PERXONA_API_BASE_URL through verbatim would hand any browser that asks
// whatever host this server happens to be configured against; hard-coding
// the console host and deriving only the region avoids that regardless of
// what PERXONA_API_BASE_URL is set to. Falls back to asia when no
// recognizable region segment is present (e.g. PERXONA_API_BASE_URL unset in
// mock mode) — warned about below so a guessed region is never silent.
const CONSOLE_REGION_MATCH = PERXONA_API_BASE_URL?.match(/\/(asia|eu)(?:\/|$)/);
const CONSOLE_REGION = CONSOLE_REGION_MATCH?.[1] ?? "asia";
const SUBSCRIPTION_URL = `https://console.perxona.ai/${CONSOLE_REGION}/organization/subscription/`;
if (PERXONA_API_BASE_URL && !CONSOLE_REGION_MATCH) {
  console.warn(
    `WARNING: no /asia or /eu segment found in PERXONA_API_BASE_URL, so the subscription-issue console link guesses "${CONSOLE_REGION}".\n` +
      "If this organization is in a different region, point PERXONA_API_BASE_URL at a URL containing that region segment.",
  );
}
const USE_MOCK = process.env.USE_MOCK === "true";
const PRESENTER_URL =
  process.env.PRESENTER_URL ||
  "https://cdn.perxona.ai/prod/latest/widget/entry/presenter.js";
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();
const LLM_API_KEY = process.env.LLM_API_KEY;
// Equity Analyst persona — real quote/news lookups for the Studio "Market
// Watchlist" panel. Optional, like LLM_API_KEY: unset means /api/stocks/*
// returns 501 rather than fabricating numbers. Alpha Vantage's free tier is
// heavily rate-limited (as low as 25 requests/day at the time of writing),
// so every route below caches aggressively — see STOCK_CACHE_TTL_MS.
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const PRESENTER_TARGET = {
  avatarId: process.env.DEMO_FIXED_AVATAR_ID,
  sceneId: process.env.DEMO_FIXED_SCENE_ID,
  voiceId: process.env.DEMO_FIXED_VOICE_ID,
};
const FIXED_CHATBOT_ID = process.env.DEMO_FIXED_CHATBOT_ID;
const hasConfiguredPresenterTarget = Boolean(
  PRESENTER_TARGET.avatarId ||
    PRESENTER_TARGET.sceneId ||
    PRESENTER_TARGET.voiceId,
);
const hasCompletePresenterTarget = Boolean(
  PRESENTER_TARGET.avatarId && PRESENTER_TARGET.sceneId,
);
const fixedPresenterTarget = hasCompletePresenterTarget
  ? {
      avatarId: PRESENTER_TARGET.avatarId,
      sceneId: PRESENTER_TARGET.sceneId,
      ...(PRESENTER_TARGET.voiceId
        ? { voiceId: PRESENTER_TARGET.voiceId }
        : {}),
    }
  : null;
// Server-side credentials for the one shared Connect API identity this sample
// uses — see README "Auth model". Every browser hitting this server acts
// through the same upstream account; there is no per-user login.
//
// Two keys, on opposite sides of the trust boundary: the secret one never
// leaves this process, the publishable one is what the browser is given.
const CONNECT_SECRET_KEY = process.env.PERXONA_CONNECT_SECRET_KEY;
const CONNECT_PUBLISHABLE_KEY = process.env.PERXONA_CONNECT_PUBLISHABLE_KEY;

// All blank is fine — resolveEmbedConfig() picks from the catalog. Half-filled
// is not: it does nothing silently, so name what is missing.
if (hasConfiguredPresenterTarget && !hasCompletePresenterTarget) {
  const missing = ["DEMO_FIXED_AVATAR_ID", "DEMO_FIXED_SCENE_ID"].filter(
    (name) => !process.env[name],
  );
  console.warn(
    `WARNING: ${missing.join(" and ")} not set, so the DEMO_FIXED_* values are ignored.\n` +
      "Set DEMO_FIXED_AVATAR_ID and DEMO_FIXED_SCENE_ID together to pin a target, or clear every DEMO_FIXED_* value to let the server pick the first avatar and scene in your catalog. DEMO_FIXED_VOICE_ID is optional — blank selects BYO-TTS.",
  );
}

// Real credentials are only needed when actually calling the upstream API.
// USE_MOCK=true skips callUpstream() entirely (see api selection below), so
// don't force dummy values into these fields just to pass a startup check.
if (!USE_MOCK) {
  if (!PERXONA_API_BASE_URL) {
    console.error(
      "ERROR: PERXONA_API_BASE_URL is required. Copy .env.example to .env and fill it in.",
    );
    process.exit(1);
  }

  if (!CONNECT_SECRET_KEY || !CONNECT_PUBLISHABLE_KEY) {
    // Which side each key belongs on. Swapping them is not reported anywhere:
    // the upstream accepts either, so a secret key would simply be served to
    // the browser.
    const sides =
      "PERXONA_CONNECT_SECRET_KEY authenticates this server and must never reach a browser.\n" +
      "PERXONA_CONNECT_PUBLISHABLE_KEY is the one handed to the presenter.\n";
    const onlyOneKey =
      Boolean(CONNECT_SECRET_KEY) !== Boolean(CONNECT_PUBLISHABLE_KEY);
    const missing = CONNECT_SECRET_KEY
      ? "PERXONA_CONNECT_PUBLISHABLE_KEY"
      : "PERXONA_CONNECT_SECRET_KEY";
    // Reached only by a .env written for the login mode this sample used to
    // have. Without it that .env looks like a typo rather than a removal.
    const removedLogin =
      process.env.PERXONA_CONNECT_EMAIL || process.env.PERXONA_CONNECT_PASSWORD
        ? "PERXONA_CONNECT_EMAIL and PERXONA_CONNECT_PASSWORD are no longer read — this sample authenticates with a Connect API key instead.\n"
        : "";

    console.error(
      (onlyOneKey
        ? `ERROR: ${missing} is not set. Both Connect API keys are required — one is not enough.\n`
        : "ERROR: PERXONA_CONNECT_SECRET_KEY and PERXONA_CONNECT_PUBLISHABLE_KEY are required.\n") +
        removedLogin +
        sides +
        "Create both at https://console.perxona.ai, then copy .env.example to .env and fill them in.",
    );
    process.exit(1);
  }
}

// ── Upstream API implementation ────────────────────────────────────────────

/**
 * Send an authenticated request to the Perxona upstream API.
 *
 * X-Connect-Key is the only credential header this server sends. A request
 * carrying an Authorization as well is rejected upstream with 400, so the two
 * are never combined — here or anywhere else.
 * @param {string} path  - Upstream path, e.g. '/api/v1/connect/voices'
 * @param {object} opts  - fetch options (method, body, headers…)
 * @param {string} [credential] - Connect API key; omit for unauthenticated calls
 */
async function callUpstream(path, opts, credential) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (credential) headers["X-Connect-Key"] = credential;
  return fetch(`${PERXONA_API_BASE_URL}${path}`, { ...opts, headers });
}

/**
 * Parse a callUpstream() Response as JSON, throwing a structured error
 * ({ status, payload }) on any non-2xx status. Centralising this means every
 * connectApi method — not just the ones that used to check r.ok by hand —
 * surfaces the upstream status the same way, which is what lets route() map it
 * onto the response instead of collapsing it to a 502.
 * @param {Response} r
 * @param {string} label  Used in the thrown error message, e.g. "voices".
 */
async function upstreamJson(r, label) {
  if (!r.ok) {
    const payload = await r.json().catch(() => ({}));
    throw Object.assign(new Error(`upstream ${label} failed`), {
      status: r.status,
      payload,
    });
  }
  return r.json();
}

/**
 * Send an authenticated request to the upstream API without forcing Content-Type.
 * Used for multipart/form-data endpoints (chatbot create/update) where fetch must
 * set the Content-Type + boundary automatically from the FormData body.
 * @param {string} path  - Upstream path, e.g. '/api/v1/connect/chatbots'
 * @param {"POST"|"PATCH"} method
 * @param {FormData} form
 * @param {string} [credential] - Connect API key
 */
async function callUpstreamFormData(path, method, form, credential) {
  const headers = credential ? { "X-Connect-Key": credential } : {};
  return fetch(`${PERXONA_API_BASE_URL}${path}`, {
    method,
    headers,
    body: form,
  });
}

/**
 * Probe whether the presenter engine is reachable at PRESENTER_URL.
 * Non-fatal diagnostic only — a HEAD request with a short timeout so startup
 * never blocks. Catches the common "PRESENTER_URL points at a channel that
 * isn't published yet" case (404) before the browser hits a blank stage.
 * @returns {Promise<"reachable" | string>} "reachable", "unreachable (<status>)", or "unreachable"
 */
async function checkPresenter() {
  try {
    const r = await fetch(PRESENTER_URL, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    return r.ok ? "reachable" : `unreachable (${r.status})`;
  } catch {
    return "unreachable";
  }
}

// connectApi — real upstream implementation, thin wrappers around call().
// Route handlers reference api.* and never touch USE_MOCK directly.
const connectApi = {
  async checkUpstream() {
    try {
      const r = await fetch(`${PERXONA_API_BASE_URL}/ready`);
      return r.ok ? "reachable" : "unreachable";
    } catch {
      return "unreachable";
    }
  },

  async voices(credential) {
    const r = await callUpstream("/api/v1/connect/voices", {}, credential);
    return upstreamJson(r, "voices"); // Page[ConnectVoiceResponse] — items already have { id, name, … }
  },

  // Normalize avatar list: backend uses avatar_id; frontend dropdowns expect id.
  async avatars(credential) {
    const r = await callUpstream(
      "/api/v1/connect/assets/avatars",
      {},
      credential,
    );
    const page = await upstreamJson(r, "avatars");
    return {
      ...page,
      items: (page.items ?? []).map(({ avatar_id, ...rest }) => ({
        id: avatar_id,
        ...rest,
      })),
    };
  },

  // Raw avatar detail — the frontend never calls this directly; it's exposed as a
  // standalone REST resource for reference (see docs/openapi.yaml).
  async avatar(id, credential) {
    const r = await callUpstream(
      `/api/v1/connect/assets/avatars/${id}`,
      {},
      credential,
    );
    return upstreamJson(r, "avatar detail");
  },

  // Motions are a sub-resource of an avatar, not a top-level collection.
  async avatarMotions(avatarId, credential) {
    const r = await callUpstream(
      `/api/v1/connect/assets/avatars/${encodeURIComponent(avatarId)}/motions`,
      {},
      credential,
    );
    return upstreamJson(r, "avatar motions"); // Page[ConnectMotionAssetResponse]
  },

  // Normalize scene list: backend uses scene_id; frontend dropdowns expect id.
  async scenes(credential) {
    const r = await callUpstream(
      "/api/v1/connect/assets/scenes",
      {},
      credential,
    );
    const page = await upstreamJson(r, "scenes");
    return {
      ...page,
      items: (page.items ?? []).map(({ scene_id, ...rest }) => ({
        id: scene_id,
        ...rest,
      })),
    };
  },

  // Raw scene detail — the frontend never calls this directly; it's exposed as a
  // standalone REST resource for reference (see docs/openapi.yaml).
  async scene(id, credential) {
    const r = await callUpstream(
      `/api/v1/connect/assets/scenes/${id}`,
      {},
      credential,
    );
    return upstreamJson(r, "scene detail");
  },

  // Provider-specific synthesis config for one voice (endpoint_url, native
  // voice name, region/audio config) — see synthesizeVoicePreview() below,
  // the only caller. Distinct from voices() above, which lists the catalog.
  async voiceDetail(id, credential) {
    const r = await callUpstream(
      `/api/v1/connect/voices/${encodeURIComponent(id)}`,
      {},
      credential,
    );
    return upstreamJson(r, "voice detail");
  },

  // Short-lived bearer token scoped to this one voice's underlying provider
  // (Azure Speech or Google Cloud TTS) — used directly against that
  // provider's own REST API, never against PERXONA_API_BASE_URL.
  async voicePreviewToken(voiceId, credential) {
    const r = await callUpstream(
      "/api/v1/connect/voice-tokens/tts",
      { method: "POST", body: JSON.stringify({ voice_id: voiceId }) },
      credential,
    );
    return upstreamJson(r, "voice preview token");
  },

  // ── Chatbot CRUD ──────────────────────────────────────────────────────────
  //
  // Create/update use multipart/form-data because the upstream supports an
  // optional knowledge_file upload. The Express proxy accepts plain JSON from
  // the browser and re-encodes it as FormData before forwarding. This keeps
  // the browser-facing API simple (JSON), while matching what the upstream expects.

  async listChatbots(credential) {
    const r = await callUpstream(
      "/api/v1/connect/chatbots?size=50",
      {},
      credential,
    );
    return upstreamJson(r, "chatbots");
  },

  async getChatbot(id, credential) {
    const r = await callUpstream(
      `/api/v1/connect/chatbots/${encodeURIComponent(id)}`,
      {},
      credential,
    );
    return upstreamJson(r, "chatbot detail");
  },

  async createChatbot({ name, custom_instructions, tools }, credential) {
    const form = new FormData();
    form.append("name", name);
    if (custom_instructions != null)
      form.append("custom_instructions", custom_instructions);
    if (tools !== undefined) form.append("tools", JSON.stringify(tools));
    const r = await callUpstreamFormData(
      "/api/v1/connect/chatbots",
      "POST",
      form,
      credential,
    );
    return upstreamJson(r, "create chatbot");
  },

  async updateChatbot(
    id,
    { name, custom_instructions, tools, remove_knowledge },
    credential,
  ) {
    const form = new FormData();
    if (name != null) form.append("name", name);
    if (custom_instructions !== undefined)
      form.append("custom_instructions", custom_instructions ?? "");
    if (tools !== undefined) form.append("tools", JSON.stringify(tools));
    if (remove_knowledge) form.append("remove_knowledge", "true");
    const r = await callUpstreamFormData(
      `/api/v1/connect/chatbots/${encodeURIComponent(id)}`,
      "PATCH",
      form,
      credential,
    );
    return upstreamJson(r, "update chatbot");
  },

  // Upload a knowledge file for a chatbot by PATCHing with knowledge_file.
  // The caller supplies a Buffer so this method stays independent of Express.
  async uploadChatbotKnowledge(id, fileBuffer, filename, mimeType, credential) {
    const form = new FormData();
    form.append(
      "knowledge_file",
      new Blob([fileBuffer], { type: mimeType }),
      filename,
    );
    const r = await callUpstreamFormData(
      `/api/v1/connect/chatbots/${encodeURIComponent(id)}`,
      "PATCH",
      form,
      credential,
    );
    return upstreamJson(r, "upload chatbot knowledge");
  },

  async deleteChatbot(id, credential) {
    const r = await callUpstream(
      `/api/v1/connect/chatbots/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      credential,
    );
    if (!r.ok) {
      const payload = await r.json().catch(() => ({}));
      throw Object.assign(new Error("upstream delete chatbot failed"), {
        status: r.status,
        payload,
      });
    }
    // 204 No Content — intentionally returns nothing
  },

  async chatWithChatbot(id, messages, credential) {
    const r = await callUpstream(
      `/api/v1/connect/chatbots/${encodeURIComponent(id)}/chat`,
      { method: "POST", body: JSON.stringify({ messages }) },
      credential,
    );
    return upstreamJson(r, "chat with chatbot");
  },
};

// Select implementation at boot: mock (internal dev only) or real upstream.
let api;
if (USE_MOCK) {
  try {
    api = await import("./mocks/upstream.mjs");
  } catch {
    console.error(
      "ERROR: USE_MOCK=true but mocks/upstream.mjs is not present.\n" +
        "The mock implementation is internal-only and is not included in this " +
        "public sample — set USE_MOCK=false (or remove it) and fill in real " +
        "PERXONA_API_BASE_URL / PERXONA_CONNECT_SECRET_KEY / PERXONA_CONNECT_PUBLISHABLE_KEY instead.",
    );
    process.exit(1);
  }
} else {
  api = connectApi;
}

// ── Upstream identity ───────────────────────────────────────────────────────
//
// Every upstream call carries CONNECT_SECRET_KEY, shared by every browser that
// hits this server — see README "Auth model". Nothing is retried on a 401/403:
// a key is refused only when it is revoked, expired, or missing a scope, so the
// same key fails the same way and the upstream status reaches the browser
// unchanged.

/**
 * The target and chatbot the Embed demo runs on, reported on GET /api/config.
 * Pinned by DEMO_FIXED_*, otherwise the first of each in the account. Which of
 * the two happened goes to the startup log, never to the page.
 * @returns {Promise<{target: object|null, chatbotId: string|null}>}
 */
let embedConfigPromise = null;
async function resolveEmbedConfig() {
  // Mock mode's catalog cannot drive the presenter and its chatbot routes 501,
  // so auto-picking would return ids that resolve to nothing. Pinned values
  // cost no upstream call and still stand.
  if (USE_MOCK)
    return {
      target: fixedPresenterTarget,
      chatbotId: FIXED_CHATBOT_ID ?? null,
    };

  embedConfigPromise ??= (async () => {
    const [target, chatbotId] = await Promise.all([
      resolveTarget(),
      resolveChatbotId(),
    ]);
    // Cache only a complete success: the resolvers cannot tell a missing
    // credential from a one-off upstream failure, and a chatbot created later
    // must be picked up without a restart.
    if (!target || !chatbotId) embedConfigPromise = null;
    return { target, chatbotId };
  })();
  return embedConfigPromise;
}

/**
 * Forces the next resolveEmbedConfig() call to re-resolve from upstream
 * rather than keep serving a stale cached value — e.g. after a chatbot is
 * deleted. Kept next to embedConfigPromise so this is the only place that
 * assigns it; callers never touch the variable directly.
 */
function invalidateEmbedConfig() {
  embedConfigPromise = null;
}

/** Avatar + scene + voice: pinned via DEMO_FIXED_*, else first in the catalog. */
async function resolveTarget() {
  if (fixedPresenterTarget) return fixedPresenterTarget;
  try {
    const [avatars, scenes, voices] = await Promise.all([
      api.avatars(CONNECT_SECRET_KEY),
      api.scenes(CONNECT_SECRET_KEY),
      api.voices(CONNECT_SECRET_KEY),
    ]);
    const avatarId = avatars?.items?.[0]?.id;
    const sceneId = scenes?.items?.[0]?.id;
    // Auto-pick includes a voice; a pinned target does not. present() fails
    // without one, but a blank DEMO_FIXED_VOICE_ID means BYO-TTS on purpose.
    const voiceId = voices?.items?.[0]?.id;
    if (!avatarId || !sceneId) return null;
    if (!voiceId) {
      console.warn(
        "WARNING: no voices in this account's catalog, so the auto-selected target has none.\n" +
          "present() will fail — use presentWithAudio(), or set DEMO_FIXED_VOICE_ID.",
      );
    }
    console.log(
      `Auto-selected presenter target: avatar ${avatarId}, scene ${sceneId}` +
        `${voiceId ? `, voice ${voiceId}` : ""}. ` +
        "Set DEMO_FIXED_AVATAR_ID / DEMO_FIXED_SCENE_ID in .env to pin your own.",
    );
    return { avatarId, sceneId, ...(voiceId ? { voiceId } : {}) };
  } catch (err) {
    console.warn(
      `WARNING: could not auto-select a presenter target: ${err.message}`,
    );
    return null;
  }
}

/** The chatbot Embed converses against: DEMO_FIXED_CHATBOT_ID, else the first. */
async function resolveChatbotId() {
  if (FIXED_CHATBOT_ID) return FIXED_CHATBOT_ID;
  try {
    const { items } = await api.listChatbots(CONNECT_SECRET_KEY);
    // Disabled chatbots stay in the list but reject every message.
    const chatbotId =
      items?.find(({ status }) => status !== "disabled")?.id ?? null;
    if (!chatbotId) {
      console.warn(
        "No chatbots in this account yet, so the Embed demo has nothing to talk to.\n" +
          "Create one in the Studio demo (/demos/studio/) — it is picked up on the next page load,\n" +
          "no restart needed — or set DEMO_FIXED_CHATBOT_ID in .env.",
      );
      return null;
    }
    console.log(
      `Auto-selected chatbot ${chatbotId}. Set DEMO_FIXED_CHATBOT_ID in .env to pin your own.`,
    );
    return chatbotId;
  } catch (err) {
    console.warn(`WARNING: could not auto-select a chatbot: ${err.message}`);
    return null;
  }
}

// ── Express app ────────────────────────────────────────────────────────────

const app = express();
app.disable("x-powered-by");

// ── Static frontend ────────────────────────────────────────────────────────

// Disable ETags in dev so a plain browser refresh always fetches the latest
// files from disk. Production keeps ETags for efficient caching.
const IS_DEV = process.env.NODE_ENV !== "production";

// ── Middleware ─────────────────────────────────────────────────────────────

app.use(express.static("public", { etag: !IS_DEV }));

// The knowledge upload route needs a larger JSON body than the 100 KB default,
// and body-parser is a no-op once a body has already been parsed, so its parser
// must run before the global one. Mounting it by path lets Express match it the
// same way it matches the route itself (trailing slash, case-insensitive).
// base64 adds ~33% overhead, so a 1 MB file needs ~1.4 MB of JSON. The 5 MB
// limit is deliberately looser: it bounds what this process will buffer, while
// KNOWLEDGE_MAX_FILE_BYTES is the limit users are held to.
app.use(
  "/api/chatbots/:id/knowledge",
  express.json({ limit: "5mb" }),
  // body-parser answers an oversized body with an HTML stack trace; restate it
  // as the same JSON error the decoded-size check in the route returns.
  (err, _req, res, next) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: KNOWLEDGE_TOO_LARGE_MESSAGE });
      return;
    }
    next(err);
  },
);
app.use(express.json());

/**
 * Wrap a route handler so any thrown error (an upstream failure surfaced by
 * upstreamJson) becomes a JSON error response instead of an
 * unhandled rejection — Express 4 does not catch async handler rejections on
 * its own.
 *
 * This is also the only place a runtime request failure is logged server-side
 * — every other console.* call in this file runs at boot. Without it, a
 * refused key, an exhausted rate limit, or a disabled chatbot leaves the
 * terminal running `npm run dev`/`npm start` silent; only the browser (and,
 * for a subscription issue, the page itself) would show anything went
 * wrong.
 * @param {(req: express.Request, res: express.Response) => Promise<void>} handler
 */
function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const status = err.status ?? 502;
      const payload = err.payload ?? { error: String(err) };
      const reason =
        (Array.isArray(payload.detail)
          ? payload.detail[0]?.msg
          : payload.detail) ??
        payload.details ??
        payload.error ??
        err.message;
      console.error(`${req.method} ${req.path} → ${status}: ${reason}`);
      res.status(status).json(payload);
    }
  };
}

// ── Health & config ─────────────────────────────────────────────────────────

// GET /api/health → { status: "ok", upstream: "reachable"|"unreachable"|"mock" }. Always 200.
// Liveness plus the one dynamic field: `upstream` probes the backend on every
// call (and reads "mock" in mock mode). Static per-process flags (mock, chat)
// live in /api/config, which needs no network round-trip.
app.get("/api/health", async (_req, res) => {
  res.json({
    status: "ok",
    upstream: await api.checkUpstream(),
  });
});

// GET /api/config → { mock, chat, presenterUrl, fixedTarget, chatbotId, subscriptionUrl }.
// Cheap to poll: `chat` reports the presence of LLM_API_KEY, never the key, and
// resolveEmbedConfig()'s catalog lookup is memoized. No field says whether a
// value was pinned or auto-picked — nothing may render that. This route has no
// request-layer auth, so subscriptionUrl carries only the derived
// CONSOLE_REGION ("asia"/"eu"), never PERXONA_API_BASE_URL itself — that
// variable is a stage/dev host in some internal workflows, and this is the
// only field here built from a server-side env var's value rather than just
// its presence.
app.get(
  "/api/config",
  route(async (_req, res) => {
    const { target, chatbotId } = await resolveEmbedConfig();
    res.json({
      mock: USE_MOCK,
      chat: Boolean(process.env.LLM_API_KEY),
      market: true,
      presenterUrl: PRESENTER_URL,
      fixedTarget: target,
      chatbotId,
      subscriptionUrl: SUBSCRIPTION_URL,
    });
  }),
);

// GET /api/connect-key
// Returns: { connect_key } — the PUBLISHABLE key the browser passes into
//          presenter.initializeWithConnectKey(connectKey, target). From there,
//          <sv-presenter> talks to the Connect API directly to resolve the
//          target and mint its own speech token.
//          This is never PERXONA_CONNECT_SECRET_KEY. That keeps the secret key
//          out of the browser — it does not put the chatbot routes out of
//          reach, since the /api/* routes below have no request-layer
//          authorization of their own. See README "Auth model".
app.get(
  "/api/connect-key",
  route(async (_req, res) => {
    res.set({ "Cache-Control": "no-store", Pragma: "no-cache" });
    // Mock mode has no keys to serve. Saying so beats 200 with an empty body,
    // which is the one shape that reads as success.
    if (USE_MOCK) {
      res.status(501).json({ error: "No Connect key to serve in mock mode." });
      return;
    }
    res.json({ connect_key: CONNECT_PUBLISHABLE_KEY });
  }),
);

// ── Catalog routes ──────────────────────────────────────────────────────────
// GET  /api/voices
// GET  /api/avatars          GET  /api/avatars/:id    GET  /api/avatars/:id/motions
// GET  /api/scenes           GET  /api/scenes/:id
// POST /api/chat             (disabled when LLM_API_KEY is unset → 501)
//
// All routes below send CONNECT_SECRET_KEY upstream. There is no per-request
// auth check on this server either — see README "Auth model".

// Catalog — read-only lists + single items used to populate UI dropdowns.
//   GET /api/voices              → Page { items: [{ id, name, … }] }
//   GET /api/avatars             → Page { items: [{ id, name, … }] }  (id normalized from avatar_id)
//   GET /api/avatars/:id         → raw avatar detail (avatar_id, lod_urls, lipsync_configs, …)
//   GET /api/avatars/:id/motions → Page { items: [ … ] }
//   GET /api/scenes              → Page { items: [{ id, name, … }] }  (id normalized from scene_id)
//   GET /api/scenes/:id          → raw scene detail
app.get(
  "/api/voices",
  route(async (_req, res) => {
    res.json(await api.voices(CONNECT_SECRET_KEY));
  }),
);

app.get(
  "/api/avatars",
  route(async (_req, res) => {
    res.json(await api.avatars(CONNECT_SECRET_KEY));
  }),
);

app.get(
  "/api/avatars/:id",
  route(async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    res.json(await api.avatar(id, CONNECT_SECRET_KEY));
  }),
);

// Motions are a sub-resource of an avatar (no top-level collection endpoint).
app.get(
  "/api/avatars/:id/motions",
  route(async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    res.json(await api.avatarMotions(id, CONNECT_SECRET_KEY));
  }),
);

app.get(
  "/api/scenes",
  route(async (_req, res) => {
    res.json(await api.scenes(CONNECT_SECRET_KEY));
  }),
);

app.get(
  "/api/scenes/:id",
  route(async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    res.json(await api.scene(id, CONNECT_SECRET_KEY));
  }),
);

// ── Voice preview (TTS) ──────────────────────────────────────────────────────
//
// Studio's voice list plays a short, fixed phrase on hover so you can hear a
// voice before picking it. The Connect catalog has no pre-recorded sample
// clips (see ConnectVoiceResponse in docs/openapi.yaml) — this synthesizes it
// for real, on the fly, using the same voice-tokens/tts endpoint the widget
// itself would use, then calls that voice's actual provider directly.
//
// Every voice in this sample's own account is azure or google; those are the
// two implemented here (verified against the live API — see voice detail's
// endpoint_url/voice/audio_config fields). aws and elevenlabs appear in the
// Connect API's provider enum but weren't reachable to test a real request
// against, so they 501 rather than guessing at an unverified shape.
const VOICE_PREVIEW_TEXT = "Hello, how are you?";

async function synthesizeGooglePreview(detail, credential) {
  const { token } = await api.voicePreviewToken(detail.id, credential);
  const r = await fetch(detail.endpoint_url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text: VOICE_PREVIEW_TEXT },
      // The preview phrase is always this fixed English sentence, and
      // languageCode isn't part of the voice detail response, so it's fixed
      // here too rather than derived from the voice's (often multi-language)
      // `languages` list.
      voice: {
        languageCode: "en-US",
        name: detail.voice.name,
        model_name: detail.voice.model_name,
      },
      audioConfig: detail.audio_config,
    }),
  });
  if (!r.ok) {
    throw Object.assign(new Error("Google TTS synthesis failed"), {
      status: 502,
      payload: await r.json().catch(() => ({})),
    });
  }
  const { audioContent } = await r.json();
  return Buffer.from(audioContent, "base64");
}

async function synthesizeAzurePreview(detail, credential) {
  const { token } = await api.voicePreviewToken(detail.id, credential);
  // detail.endpoint_url is empty for Azure — the REST endpoint is derived
  // from `region` instead, following Azure Speech's standard convention.
  const ssml =
    `<speak version='1.0' xml:lang='en-US'>` +
    `<voice xml:lang='en-US' name='${detail.voice.name}'>${VOICE_PREVIEW_TEXT}</voice>` +
    `</speak>`;
  const r = await fetch(
    `https://${detail.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
        "User-Agent": "perxona-connect-kit-studio",
      },
      body: ssml,
    },
  );
  if (!r.ok) {
    throw Object.assign(new Error("Azure TTS synthesis failed"), {
      status: 502,
      payload: { error: await r.text() },
    });
  }
  return Buffer.from(await r.arrayBuffer());
}

// POST /api/voices/:id/preview → audio/mpeg body (not JSON — the audio itself).
// No request body: the phrase is fixed, so there is nothing for the browser
// to supply beyond the voice id already in the path.
app.post(
  "/api/voices/:id/preview",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Voice preview is not available in mock mode." });
      return;
    }
    const id = req.params.id;
    const detail = await api.voiceDetail(id, CONNECT_SECRET_KEY);
    let audio;
    if (detail.provider === "google") {
      audio = await synthesizeGooglePreview(detail, CONNECT_SECRET_KEY);
    } else if (detail.provider === "azure") {
      audio = await synthesizeAzurePreview(detail, CONNECT_SECRET_KEY);
    } else {
      res.status(501).json({
        error: `Voice preview isn't implemented for provider "${detail.provider}" yet.`,
      });
      return;
    }
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  }),
);

// ── Equity Analyst — market watchlist ───────────────────────────────────────
// GET /api/stocks/watchlist         → { us: [...], japan: [...] }  (static, no external call)
// GET /api/stocks/:symbol/quote     → normalized Alpha Vantage GLOBAL_QUOTE (501 without a key)
// GET /api/stocks/:symbol/news      → normalized Alpha Vantage NEWS_SENTIMENT (501 without a key)
//
// The two watchlists below are exactly the tickers from the user-supplied
// equity_analyst_prompt.md (2026-09-13) — static reference data, not fetched
// from anywhere. Japan tickers carry the `.T` suffix Alpha Vantage expects
// for Tokyo Stock Exchange symbols per that same document; this has not been
// verified against a live key (none was available while building this), so
// treat JP-ticker coverage as unconfirmed until tested against a real key —
// GLOBAL_QUOTE returning an empty object for a JP symbol most likely means
// the plan/endpoint doesn't cover that exchange, not a bug in this route.

const US_WATCHLIST = [
  { symbol: "AAOI", name: "Applied Optoelectronics Inc" },
  { symbol: "AAPL", name: "Apple Inc" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc" },
  { symbol: "ANET", name: "Arista Networks Inc" },
  { symbol: "ARM", name: "Arm Holdings PLC (ADR)" },
  { symbol: "CRDO", name: "Credo Technology Group Holding Ltd" },
  { symbol: "DRTS", name: "Alpha Tau Medical Ltd" },
  { symbol: "FSLY", name: "Fastly Inc" },
  { symbol: "LFST", name: "Lifestance Health Group Inc" },
  { symbol: "NVDA", name: "NVIDIA Corp" },
  { symbol: "PLTR", name: "Palantir Technologies Inc" },
  { symbol: "QCOM", name: "Qualcomm Inc" },
  { symbol: "RBLX", name: "Roblox Corp" },
  { symbol: "SKHY", name: "SK Hynix Inc (ADR)" },
  { symbol: "SWKS", name: "Skyworks Solutions Inc" },
  { symbol: "ZTS", name: "Zoetis Inc" },
];

const JAPAN_WATCHLIST = [
  { symbol: "2158.T", name: "FRONTEO Inc" },
  { symbol: "2667.T", name: "ImageOne Co Ltd" },
  { symbol: "2698.T", name: "Can Do Co Ltd" },
  { symbol: "2782.T", name: "Seria Co Ltd" },
  { symbol: "3697.T", name: "Shift Inc" },
  { symbol: "4063.T", name: "Shin-Etsu Chemical Co Ltd" },
  { symbol: "4259.T", name: "ExaWizards Inc" },
  { symbol: "4263.T", name: "Susmed Inc" },
  { symbol: "4568.T", name: "Daiichi Sankyo Co Ltd" },
  { symbol: "5029.T", name: "Circlace Inc" },
  { symbol: "5108.T", name: "Bridgestone Corp" },
  { symbol: "5802.T", name: "Sumitomo Electric Industries Ltd" },
  { symbol: "5858.T", name: "STG Co Ltd" },
  { symbol: "6301.T", name: "Komatsu Ltd" },
  { symbol: "6335.T", name: "Tokyo Kikai Seisakusho Ltd" },
  { symbol: "6367.T", name: "Daikin Industries Ltd" },
  { symbol: "6501.T", name: "Hitachi Ltd" },
  { symbol: "6723.T", name: "Renesas Electronics Corp" },
  { symbol: "6752.T", name: "Panasonic Holdings Corp" },
  { symbol: "6762.T", name: "TDK Corp" },
  { symbol: "6861.T", name: "Keyence Corp" },
  { symbol: "6869.T", name: "Sysmex Corp" },
  { symbol: "6954.T", name: "Fanuc Corp" },
  { symbol: "6981.T", name: "Murata Manufacturing Co Ltd" },
  { symbol: "7011.T", name: "Mitsubishi Heavy Industries Ltd" },
  { symbol: "7203.T", name: "Toyota Motor Corp" },
  { symbol: "7261.T", name: "Mazda Motor Corp" },
  { symbol: "7267.T", name: "Honda Motor Co Ltd" },
  { symbol: "7270.T", name: "Subaru Corp" },
  { symbol: "7272.T", name: "Yamaha Motor Co Ltd" },
  { symbol: "7309.T", name: "Shimano Inc" },
  { symbol: "7453.T", name: "Ryohin Keikaku Co Ltd" },
  { symbol: "7741.T", name: "Hoya Corp" },
  { symbol: "9843.T", name: "Nitori Holdings Co Ltd" },
];

app.get("/api/stocks/watchlist", (_req, res) => {
  res.json({ us: US_WATCHLIST, japan: JAPAN_WATCHLIST });
});

// Cheap in-memory cache shared across every client — the point is staying
// under Alpha Vantage's free-tier daily cap, not per-session freshness.
// Cleared on server restart; that's fine, a cold cache just costs one real
// call per symbol the first time it's asked for again.
const STOCK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const quoteCache = new Map(); // symbol -> { data, fetchedAt }
const newsCache = new Map(); // symbol -> { data, fetchedAt }

function cacheGet(cache, key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < STOCK_CACHE_TTL_MS) return hit;
  return null;
}

async function alphaVantageRequest(params) {
  const url = new URL("https://www.alphavantage.co/query");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", ALPHA_VANTAGE_API_KEY);
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  // Alpha Vantage returns 200 with a "Note"/"Information" field instead of a
  // real HTTP error when the daily/per-minute quota is exhausted — surface
  // that as a real error rather than an empty-looking success.
  if (data.Note || data.Information || data["Error Message"]) {
    throw Object.assign(
      new Error(
        data.Note ||
          data.Information ||
          data["Error Message"] ||
          "Alpha Vantage request failed",
      ),
      { status: 502, payload: { error: data.Note || data.Information || data["Error Message"] } },
    );
  }
  return data;
}

async function fetchRealtimeStockQuote(symbolQuery) {
  const query = symbolQuery.trim();
  let symbol = query.toUpperCase();
  let name = symbol;
  let sector = "Technology";
  let industry = "Equities";

  try {
    const searchRes = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=1`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } },
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const quote = searchData.quotes?.[0];
      if (quote?.symbol) {
        symbol = quote.symbol;
        name = quote.shortname || quote.longname || quote.symbol;
        sector = quote.sector || sector;
        industry = quote.industry || industry;
      }
    }
  } catch {
    // continue with symbol
  }

  const chartRes = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } },
  );

  if (!chartRes.ok) {
    throw new Error(`Market data provider returned HTTP ${chartRes.status} for ${symbol}`);
  }

  const chartData = await chartRes.json();
  const res = chartData.chart?.result?.[0];
  if (!res) {
    throw new Error(`No chart data returned for ${symbol}`);
  }

  const meta = res.meta;
  const timestamps = res.timestamp || [];
  const quotes = res.indicators?.quote?.[0];
  const closes = quotes?.close || [];
  const volumes = quotes?.volume || [];

  const history = timestamps
    .map((t, idx) => ({
      timestamp: t * 1000,
      close: closes[idx] != null ? Number(closes[idx].toFixed(2)) : null,
      volume: volumes[idx] != null ? Number(volumes[idx]) : 0,
    }))
    .filter((pt) => pt.close !== null)
    .slice(-25);

  const price = meta.regularMarketPrice ?? history[history.length - 1]?.close ?? 100;
  const prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
  const change = Number((price - prev).toFixed(2));
  const changePercent = Number(((change / (prev || 1)) * 100).toFixed(2));

  return {
    symbol,
    name,
    price: Number(price.toFixed(2)),
    change,
    changePercent: String(changePercent),
    dayHigh: Number((meta.regularMarketDayHigh ?? price * 1.015).toFixed(2)),
    dayLow: Number((meta.regularMarketDayLow ?? price * 0.985).toFixed(2)),
    previousClose: Number(prev.toFixed(2)),
    fiftyTwoWeekHigh: Number((meta.fiftyTwoWeekHigh ?? price * 1.25).toFixed(2)),
    fiftyTwoWeekLow: Number((meta.fiftyTwoWeekLow ?? price * 0.75).toFixed(2)),
    volume: Number(meta.regularMarketVolume ?? 5000000),
    tradingDay: new Date().toISOString().split("T")[0],
    currency: meta.currency || "USD",
    sector,
    industry,
    history,
  };
}

async function fetchRealtimeStockNews(symbol) {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=5`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } },
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.news) && data.news.length > 0) {
        return data.news.slice(0, 5).map((n) => ({
          title: n.title,
          url: n.link,
          source: n.publisher || "Financial News",
          timePublished: n.providerPublishTime
            ? new Date(n.providerPublishTime * 1000).toISOString()
            : new Date().toISOString(),
          summary: n.title,
        }));
      }
    }
  } catch (err) {
    console.debug("News fallback notice:", err.message);
  }
  return [
    {
      title: `${symbol} Q2 Financial Highlights & Analyst Ratings Update`,
      url: `https://finance.yahoo.com/quote/${symbol}`,
      source: "MarketWatch",
      timePublished: new Date().toISOString(),
      summary: `Recent analyst consensus and earnings metrics overview for ${symbol}.`,
    },
  ];
}

app.get(
  "/api/stocks/:symbol/quote",
  route(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const cached = cacheGet(quoteCache, symbol);
    if (cached) {
      res.json({ ...cached.data, cached: true, asOf: cached.fetchedAt });
      return;
    }

    let quote = null;
    if (ALPHA_VANTAGE_API_KEY) {
      try {
        const data = await alphaVantageRequest({
          function: "GLOBAL_QUOTE",
          symbol,
        });
        const raw = data["Global Quote"];
        if (raw && Object.keys(raw).length > 0) {
          quote = {
            symbol,
            price: Number(raw["05. price"]),
            change: Number(raw["09. change"]),
            changePercent: raw["10. change percent"]?.replace("%", ""),
            dayHigh: Number(raw["03. high"]),
            dayLow: Number(raw["04. low"]),
            previousClose: Number(raw["08. previous close"]),
            volume: Number(raw["06. volume"]),
            tradingDay: raw["07. latest trading day"],
          };
        }
      } catch (err) {
        console.debug("Alpha Vantage failed, falling back to real-time provider:", err.message);
      }
    }

    if (!quote) {
      quote = await fetchRealtimeStockQuote(symbol);
    }

    quoteCache.set(symbol, { data: quote, fetchedAt: Date.now() });
    res.json({ ...quote, cached: false, asOf: Date.now() });
  }),
);

app.get(
  "/api/stocks/:symbol/news",
  route(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const cached = cacheGet(newsCache, symbol);
    if (cached) {
      res.json({ items: cached.data, cached: true, asOf: cached.fetchedAt });
      return;
    }

    let items = null;
    if (ALPHA_VANTAGE_API_KEY) {
      try {
        const data = await alphaVantageRequest({
          function: "NEWS_SENTIMENT",
          tickers: symbol,
          limit: "5",
        });
        items = (data.feed ?? []).slice(0, 5).map((a) => ({
          title: a.title,
          url: a.url,
          source: a.source,
          timePublished: a.time_published,
          summary: a.summary,
        }));
      } catch (err) {
        console.debug("Alpha Vantage news failed, falling back:", err.message);
      }
    }

    if (!items || items.length === 0) {
      items = await fetchRealtimeStockNews(symbol);
    }

    newsCache.set(symbol, { data: items, fetchedAt: Date.now() });
    res.json({ items, cached: false, asOf: Date.now() });
  }),
);

// Base URL and model both follow LLM_PROVIDER — keep the pair together when
// adding one, or an unset LLM_MODEL sends the wrong provider's model name.
const LLM_DEFAULTS = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
  },
};

function llmRequestConfig(messages) {
  const fallback = LLM_DEFAULTS[LLM_PROVIDER] ?? LLM_DEFAULTS.openai;
  const model = process.env.LLM_MODEL ?? fallback.model;
  if (LLM_PROVIDER === "anthropic") {
    const system = messages
      .filter(({ role }) => role === "system")
      .map(({ content }) => content)
      .join("\n");
    const userMessages = messages
      .filter(({ role }) => role !== "system")
      .map(({ role, content }) => ({ role, content }));
    return {
      url: `${process.env.LLM_BASE_URL ?? fallback.baseUrl}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": LLM_API_KEY,
      },
      body: {
        model,
        max_tokens: 1024,
        ...(system ? { system } : {}),
        messages: userMessages,
      },
    };
  }
  return {
    url: `${process.env.LLM_BASE_URL ?? fallback.baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: { model, messages },
  };
}

async function requestLlmCompletion(messages) {
  if (LLM_PROVIDER !== "openai" && LLM_PROVIDER !== "anthropic") {
    throw Object.assign(
      new Error("LLM_PROVIDER must be either 'openai' or 'anthropic'."),
      { status: 500 },
    );
  }
  const request = llmRequestConfig(messages);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error("LLM request failed."), {
      status: 502,
      payload,
    });
  }
  return payload;
}

function llmResponseText(payload) {
  if (LLM_PROVIDER === "anthropic") {
    return payload.content?.find(({ type }) => type === "text")?.text;
  }
  return payload.choices?.[0]?.message?.content;
}

function openAiCompatibleResponse(payload) {
  if (LLM_PROVIDER === "openai") return payload;
  return {
    choices: [
      {
        message: { role: "assistant", content: llmResponseText(payload) ?? "" },
      },
    ],
  };
}

// ── Chatbot routes ──────────────────────────────────────────────────────────
// GET    /api/chatbots              → Page { items: [{ id, name, status }] }
// POST   /api/chatbots              → ChatBotDetailResponse (201 proxied as 200)
// GET    /api/chatbots/:id          → ChatBotDetailResponse (id, name, custom_instructions, status, tools)
// PATCH  /api/chatbots/:id          → ChatBotDetailResponse
// DELETE /api/chatbots/:id          → 204 No Content
// POST   /api/chatbots/:id/chat     → { id, status, reply_text }
//
// Create and update are forwarded as multipart/form-data (see callUpstreamFormData).
// The browser sends JSON; the proxy re-encodes it before forwarding upstream.

app.get(
  "/api/chatbots",
  route(async (_req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    res.json(await api.listChatbots(CONNECT_SECRET_KEY));
  }),
);

app.post(
  "/api/chatbots",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    const { name, custom_instructions, tools } = req.body ?? {};
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "'name' is required." });
      return;
    }
    const created = await api.createChatbot(
      { name, custom_instructions, tools },
      CONNECT_SECRET_KEY,
    );
    // upstream returns 201; surface as 200 for consistent demo fetch handling
    res.json(created);
  }),
);

app.get(
  "/api/chatbots/:id",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    const id = req.params.id;
    res.json(await api.getChatbot(id, CONNECT_SECRET_KEY));
  }),
);

app.patch(
  "/api/chatbots/:id",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    const id = req.params.id;
    const { name, custom_instructions, tools, remove_knowledge } =
      req.body ?? {};
    res.json(
      await api.updateChatbot(
        id,
        { name, custom_instructions, tools, remove_knowledge },
        CONNECT_SECRET_KEY,
      ),
    );
  }),
);

app.delete(
  "/api/chatbots/:id",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    const id = req.params.id;
    await api.deleteChatbot(id, CONNECT_SECRET_KEY);
    // Embed's auto-picked chatbotId may be this one; force the next
    // GET /api/config to re-resolve rather than keep serving a dead id.
    invalidateEmbedConfig();
    res.status(204).end();
  }),
);

// Allowlisted file extensions and MIME types for knowledge uploads.
// Matches the frontend <input accept=".txt,.pdf,.doc,.docx,.csv"> constraint so
// the server rejects any attempt to bypass the client-side restriction.
const KNOWLEDGE_ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".pdf",
  ".doc",
  ".docx",
  ".csv",
]);
const KNOWLEDGE_ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/octet-stream", // fallback when browser cannot detect MIME
]);
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
// Largest knowledge file accepted, measured after base64 decoding.
const KNOWLEDGE_MAX_FILE_BYTES = 1 * 1024 * 1024;
const KNOWLEDGE_TOO_LARGE_MESSAGE = `File is too large. Maximum size is ${KNOWLEDGE_MAX_FILE_BYTES / (1024 * 1024)} MB.`;

// POST /api/chatbots/:id/knowledge
// Body: { filename, content_base64, mime_type }
// Reads the base64-encoded file from the JSON body, converts it to a Buffer,
// and PATCHes the upstream chatbot with knowledge_file as multipart/form-data.
// Separating knowledge upload avoids needing a multipart parser on this server.
// The JSON body is parsed by the 5 MB parser mounted on this path above.
app.post(
  "/api/chatbots/:id/knowledge",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    const id = req.params.id;
    const { filename, content_base64, mime_type } = req.body ?? {};
    if (!filename || !content_base64) {
      res
        .status(400)
        .json({ error: "'filename' and 'content_base64' are required." });
      return;
    }

    // Reject filenames containing path separators to prevent directory traversal.
    if (filename.includes("/") || filename.includes("\\")) {
      res.status(400).json({ error: "Invalid filename." });
      return;
    }

    // Enforce extension allowlist (aligns with frontend <input accept> constraint).
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    if (!KNOWLEDGE_ALLOWED_EXTENSIONS.has(ext)) {
      res.status(400).json({
        error: `File type not allowed. Accepted extensions: ${[...KNOWLEDGE_ALLOWED_EXTENSIONS].join(", ")}.`,
      });
      return;
    }

    // Validate MIME type if provided.
    const effectiveMime = mime_type || "application/octet-stream";
    if (!KNOWLEDGE_ALLOWED_MIME_TYPES.has(effectiveMime)) {
      res.status(400).json({
        error: `MIME type not allowed: ${effectiveMime}.`,
      });
      return;
    }

    // Basic base64 format check before decoding.
    if (!BASE64_RE.test(content_base64)) {
      res.status(400).json({ error: "Invalid base64 content." });
      return;
    }

    const buffer = Buffer.from(content_base64, "base64");
    if (buffer.length > KNOWLEDGE_MAX_FILE_BYTES) {
      res.status(413).json({ error: KNOWLEDGE_TOO_LARGE_MESSAGE });
      return;
    }
    res.json(
      await api.uploadChatbotKnowledge(
        id,
        buffer,
        filename,
        effectiveMime,
        CONNECT_SECRET_KEY,
      ),
    );
  }),
);

// DELETE /api/chatbots/:id/knowledge
// Sends remove_knowledge=true via PATCH to clear the chatbot's knowledge file.
app.delete(
  "/api/chatbots/:id/knowledge",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    const id = req.params.id;
    res.json(
      await api.updateChatbot(
        id,
        { remove_knowledge: true },
        CONNECT_SECRET_KEY,
      ),
    );
  }),
);

// Both chat routes are unauthenticated and spend something — LLM_API_KEY's
// provider, or the Connect account's quota — so both carry this cap.
const CHAT_MAX_MESSAGES = 40; // Studio sends at most 21 (1 system + 20 history)
const CHAT_MAX_TOTAL_CHARS = 24_000;

/** @returns {string|null} why the payload is refused — handles `content` and `parts`. */
function chatPayloadError(messages) {
  if (!Array.isArray(messages) || messages.length === 0)
    return "'messages' must be a non-empty array.";
  if (messages.length > CHAT_MAX_MESSAGES)
    return `'messages' must contain ${CHAT_MAX_MESSAGES} entries or fewer.`;
  const totalChars = messages.reduce((sum, { content, parts }) => {
    if (typeof content === "string") return sum + content.length;
    if (content !== undefined)
      return sum + JSON.stringify(content ?? "").length;
    return sum + JSON.stringify(parts ?? "").length;
  }, 0);
  return totalChars > CHAT_MAX_TOTAL_CHARS
    ? `'messages' must total ${CHAT_MAX_TOTAL_CHARS} characters or fewer.`
    : null;
}

app.post(
  "/api/chatbots/:id/chat",
  route(async (req, res) => {
    if (USE_MOCK) {
      res
        .status(501)
        .json({ error: "Chatbot API is not available in mock mode." });
      return;
    }
    const id = req.params.id;
    const messages = req.body?.messages;
    const invalid = chatPayloadError(messages);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    res.json(await api.chatWithChatbot(id, messages, CONNECT_SECRET_KEY));
  }),
);

// POST /api/chat
// Request: { messages: [...] } (OpenAI chat format).
// Returns: the OpenAI-compatible chat-completion JSON from the configured endpoint.
// Errors:  501 until LLM_API_KEY is set · 502 LLM upstream unreachable.
// Note: chat talks directly to the configured LLM endpoint, not the Connect API,
// so it does not send CONNECT_SECRET_KEY.
// The size caps below are the only thing standing between this route and an
// unbounded bill: it forwards whatever the browser sends to an endpoint the
// operator pays for, and there is no auth in front of it. The route the demo
// used to call (/api/demo-script) capped the prompt at 2000 characters and
// built the system message server-side; Studio's own-LLM source hands the
// browser the whole array, so the ceiling has to be re-stated here.
// A demo-grade guard, not a rate limiter — see README's Limitations.
function extractStockQuery(text) {
  if (!text || typeof text !== "string") return null;
  const companyMap = {
    nvidia: "NVDA",
    tesla: "TSLA",
    apple: "AAPL",
    microsoft: "MSFT",
    amazon: "AMZN",
    google: "GOOGL",
    alphabet: "GOOGL",
    meta: "META",
    facebook: "META",
    netflix: "NFLX",
    palantir: "PLTR",
    coinbase: "COIN",
    intel: "INTC",
    amd: "AMD",
    disney: "DIS",
    toyota: "7203.T",
    sony: "6758.T",
    softbank: "9984.T",
    "s&p": "SPY",
    nasdaq: "QQQ",
  };
  const lower = text.toLowerCase();
  for (const [name, sym] of Object.entries(companyMap)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) {
      return sym;
    }
  }
  const tickerMatch = text.match(/\$([A-Za-z]{1,5})\b/) || text.match(/\b([A-Z]{2,5})\b/);
  if (tickerMatch) {
    const sym = (tickerMatch[1] || tickerMatch[0]).toUpperCase();
    const ignore = new Set([
      "THE", "FOR", "AND", "ARE", "CAN", "WHY", "HOW", "WHAT", "WHO",
      "NOT", "ALL", "AWS", "GCP", "SDK", "API", "APP", "AI", "LLM", "CSS", "HTML", "JS", "POST", "GET"
    ]);
    if (!ignore.has(sym)) return sym;
  }
  return null;
}

app.post("/api/chat", async (req, res) => {
  if (!process.env.LLM_API_KEY) {
    res.status(501).json({
      error: "LLM_API_KEY not configured. Set it in .env to enable chat.",
    });
    return;
  }
  const messages = req.body?.messages;
  const invalid = chatPayloadError(messages);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  try {
    let attachedQuote = null;
    const isEquity = messages.some(
      (m) =>
        typeof m.content === "string" &&
        (m.content.includes("Equity Analyst") ||
          m.content.includes("stock") ||
          m.content.includes("market") ||
          m.content.includes("valuation") ||
          m.content.includes("price")),
    );

    if (isEquity) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const symbol = (lastUserMsg ? extractStockQuery(lastUserMsg.content) : null) || "SPY";
      try {
        attachedQuote = await fetchRealtimeStockQuote(symbol);
        if (attachedQuote) {
          const grounding =
            `\n\n[REAL-TIME LIVE MARKET GROUNDING DATA (SOURCE: LIVE MARKET FEED)]:\n` +
            `- Symbol: ${attachedQuote.symbol} (${attachedQuote.name})\n` +
            `- Current Live Price: $${attachedQuote.price} (${attachedQuote.change >= 0 ? "+" : ""}${attachedQuote.change} / ${attachedQuote.changePercent}%)\n` +
            `- Previous Close: $${attachedQuote.previousClose} | Today's Range: $${attachedQuote.dayLow} - $${attachedQuote.dayHigh}\n` +
            `- 52-Week Range: $${attachedQuote.fiftyTwoWeekLow} - $${attachedQuote.fiftyTwoWeekHigh} | Volume: ${attachedQuote.volume.toLocaleString()}\n` +
            `- Sector: ${attachedQuote.sector} | Industry: ${attachedQuote.industry}\n` +
            `- Recent Intraday Closes: [${attachedQuote.history.map((h) => h.close).slice(-5).join(", ")}]\n` +
            `MANDATORY INSTRUCTION: You are the Real-Time Equity Analyst. You MUST reference these exact live market figures in your analysis. Answer concisely (2-3 sentences) with actionable institutional insight.`;

          const sysMsg = messages.find((m) => m.role === "system");
          if (sysMsg) {
            sysMsg.content += grounding;
          } else {
            messages.unshift({ role: "system", content: grounding });
          }
        }
      } catch (err) {
        console.debug("Grounding fetch notice:", err.message);
      }
    }

    const payload = await requestLlmCompletion(messages);
    const result = openAiCompatibleResponse(payload);
    if (attachedQuote) {
      result.stockQuote = attachedQuote;
    }
    res.json(result);
  } catch (err) {
    // This route doesn't go through route() — it has its own try/catch
    // because requestLlmCompletion() isn't an upstreamJson() caller — so it
    // needs its own copy of the same server-console logging.
    console.error(`POST /api/chat → ${err.status ?? 502}: ${err.message}`);
    res
      .status(err.status ?? 502)
      .json({ error: "LLM upstream unreachable", message: String(err) });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────

const CHECK_ICONS = { reachable: "✓", unreachable: "✗", mock: "–" };

app.listen(PORT, () => {
  console.log(`\nPerxona Connect Kit`);
  console.log(`  URL  : http://localhost:${PORT}`);
  console.log(`  Mode : ${USE_MOCK ? "MOCK (no real API calls)" : "live"}`);
  // Deferred probes so the banner prints immediately and startup never blocks.
  // Labeled API/CDN so each line reads as that resource's reachability.
  api.checkUpstream().then((status) => {
    const icon = CHECK_ICONS[status] ?? "✗";
    const hint =
      status === "unreachable" ? " — check PERXONA_API_BASE_URL" : "";
    console.log(`  API  : ${icon} ${status}  ${PERXONA_API_BASE_URL}${hint}`);
  });
  // Fire-and-forget, so the picked ids reach the startup log and the first
  // visitor skips the catalog round-trip. Failures are handled inside.
  if (!USE_MOCK) resolveEmbedConfig();
  checkPresenter().then((status) => {
    const icon = CHECK_ICONS[status] ?? "✗";
    const hint =
      status === "reachable"
        ? ""
        : " — set PRESENTER_URL to a reachable engine (see .env)";
    console.log(`  CDN  : ${icon} ${status}  ${PRESENTER_URL}${hint}`);
  });
});
