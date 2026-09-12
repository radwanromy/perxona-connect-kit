/**
 * Perxona Connect Kit — Studio Demo
 *
 * The full client, for when you are building the application itself:
 *   1. Catalog pickers — browse avatars, scenes and voices
 *   2. Chatbot CRUD — create, read, update, delete via /api/chatbots proxy
 *   3. Multi-turn conversation, with interrupt and a send lock
 *   4. Each assistant reply is piped into sv-presenter for live speech playback
 *
 * A source switch chooses who runs the model — a Connect-hosted chatbot or your
 * own LLM_API_KEY — and can be flipped mid-conversation. That is why the history
 * is held provider-neutral as { role, text } and serialized only at the call
 * site: the Connect chat API takes a `parts` array,
 *   { role: "user"|"assistant", parts: [{ type: "text", text: "…" }] }
 * while /api/chat takes OpenAI's `content` string. See toConnectMessages /
 * toOpenAiMessages.
 *
 * Zero dependencies — plain ESM, no build step required.
 */

// ── Presenter engine bootstrap ───────────────────────────────────────────────

/**
 * Dynamically inject the presenter engine <script>. Resolved from the server's
 * PRESENTER_URL env var (GET /api/config → presenterUrl) so the same static
 * build can target any CDN by changing the env var alone.
 * @param {string} presenterUrl
 * @returns {Promise<void>}
 */
async function loadPresenterEngine(presenterUrl) {
  // DEMO-ONLY: presenterUrl is trusted without host validation. A production
  // integration should verify presenterUrl against a known CDN allowlist.
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = presenterUrl;
    script.onload = resolve;
    script.onerror = () =>
      reject(new Error(`Failed to load presenter engine from ${presenterUrl}`));
    document.head.append(script);
  });
}

const appConfig = await request("/api/config");
const isPresenterLaunchDisabled = appConfig.mock;

// Loaded in the bootstrap at the end, not here: a rejection in top-level await
// would abort module evaluation and leave every handler below unregistered.
// Launch waits on this flag; everything else works without the engine.
let presenterEngineReady = false;

// True for the span between the Launch click and the request settling
// (success or error), so a picker change mid-flight can't re-enable Launch
// and fire a second overlapping initializeWithConnectKey().
let isLaunching = false;

// ── DOM refs ───────────────────────────────────────────────────────────────

const avatarSelect = document.getElementById("avatar-select");
const sceneSelect = document.getElementById("scene-select");
const voiceSelect = document.getElementById("voice-select");
const avatarIcon = document.getElementById("avatar-icon");
const sceneIcon = document.getElementById("scene-icon");
const initBtn = document.getElementById("init-btn");
const statusMsg = document.getElementById("status-msg");
const stagePlaceholder = document.getElementById("stage-placeholder");

// Avatar/scene carousels + voice list — the visible pickers. avatarSelect/
// sceneSelect/voiceSelect above stay the real state; these just drive them.
const avatarCarousel = document.getElementById("avatar-carousel");
const avatarCarouselTrack = document.getElementById("avatar-carousel-track");
const sceneCarousel = document.getElementById("scene-carousel");
const sceneCarouselTrack = document.getElementById("scene-carousel-track");
const voiceListEl = document.getElementById("voice-list");
const hoverPreview = document.getElementById("hover-preview");
const hoverPreviewScene = document.getElementById("hover-preview-scene");
const hoverPreviewAvatar = document.getElementById("hover-preview-avatar");
const hoverPreviewLabel = document.getElementById("hover-preview-label");
const textVisibilityToggle = document.getElementById(
  "text-visibility-toggle",
);

// Header: theme switcher + sidebar collapse
const themeSelect = document.getElementById("theme-select");
const sidebarCollapseBtn = document.getElementById("sidebar-collapse-btn");
const sidebarEl = document.querySelector(".sidebar");

// Stage toolbar toggles
const stageToggleAvatar = document.getElementById("stage-toggle-avatar");
const stageToggleScene = document.getElementById("stage-toggle-scene");
const stageToggleVoice = document.getElementById("stage-toggle-voice");
const stageToggleText = document.getElementById("stage-toggle-text");
const stageToggleTimeline = document.getElementById("stage-toggle-timeline");

// Motion picker + framing select
const motionPickerToggle = document.getElementById("motion-picker-toggle");
const motionPickerPopup = document.getElementById("motion-picker-popup");
const motionPickerList = document.getElementById("motion-picker-list");
const framingSelect = document.getElementById("framing-select");

// Chatbot manager — custom bot picker (replaces native <select> to avoid
// Chrome's native-dropdown misposition bug inside scrolled overflow containers)
const botPickerBtn = document.getElementById("bot-picker-btn");
const botPickerLabel = document.getElementById("bot-picker-label");
const botPickerList = document.getElementById("bot-picker-list");
const botDeleteBtn = document.getElementById("bot-delete-btn");
const botEditor = document.getElementById("bot-editor");
const botEditorSummary = document.getElementById("bot-editor-summary");
const botNameInput = document.getElementById("bot-name");
const botInstructionsInput = document.getElementById("bot-instructions");
const botSaveBtn = document.getElementById("bot-save-btn");
const botCancelBtn = document.getElementById("bot-cancel-btn");
const botStatusMsg = document.getElementById("bot-status");
// Knowledge file
const botKnowledgeFileInput = document.getElementById("bot-knowledge-file");
const botKnowledgeFilename = document.getElementById("bot-knowledge-filename");
const botKnowledgeStatus = document.getElementById("bot-knowledge-status");
const botKnowledgeRemoveBtn = document.getElementById(
  "bot-knowledge-remove-btn",
);
const botKnowledgeIndicatorRow = document.getElementById(
  "bot-knowledge-indicator-row",
);
const botKnowledgeIndicator = document.getElementById(
  "bot-knowledge-indicator",
);
const botKnowledgeStalledNotice = document.getElementById(
  "bot-knowledge-stalled-notice",
);
const botKnowledgePollResumeBtn = document.getElementById(
  "bot-knowledge-poll-resume-btn",
);
// Function tools
const botToolsInput = document.getElementById("bot-tools");
const botToolsCount = document.getElementById("bot-tools-count");
const botToolsExampleBtn = document.getElementById("bot-tools-example-btn");
const botIdRow = document.getElementById("bot-id-row");
const botIdValue = document.getElementById("bot-id-value");
const botIdCopy = document.getElementById("bot-id-copy");
const botNewBtn = document.getElementById("bot-new-btn");

// Chat panel
const chatPlaceholder = document.getElementById("chat-placeholder");
const chatHintText = document.getElementById("chat-hint-text");
const chatContent = document.getElementById("chat-content");
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatStopBtn = document.getElementById("chat-stop-btn");
const micBtn = document.getElementById("mic-btn");
const micStatus = document.getElementById("mic-status");
const personaChips = document.getElementById("persona-chips");
const liveModeBtn = document.getElementById("live-mode-btn");
const audioListeningPanel = document.getElementById("audio-listening-panel");
const listeningStatusText = document.getElementById("listening-status-text");
const listeningInterimText = document.getElementById("listening-interim-text");
const stageListeningHud = document.getElementById("stage-listening-hud");
const stageHudText = document.getElementById("stage-hud-text");

// Source switch
const sourceRadios = document.querySelectorAll('input[name="source"]');
const sourceOwnRadio = document.getElementById("source-own");
const sourceOwnHint = document.getElementById("source-own-hint");
const sourceLabel = document.getElementById("active-source-label");
const chatbotManager = document.getElementById("chatbot-manager");

// ── Theming ──────────────────────────────────────────────────────────────
//
// One data-theme attribute on <html> drives everything via CSS custom
// properties — style.css's :root is "Normal" (unchanged, the default);
// theme.css layers the other four as [data-theme="…"] overrides. Adding a
// 6th theme later is exactly one more entry here plus one more CSS block in
// theme.css — no component needs to know theme names.
const THEMES = [
  { id: "normal", label: "Normal" },
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
  { id: "mild", label: "Mild" },
  { id: "compact", label: "Compact" },
];
const THEME_STORAGE_KEY = "studio.theme";

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(THEME_STORAGE_KEY, id);
}

themeSelect.replaceChildren(
  ...THEMES.map(({ id, label }) =>
    Object.assign(document.createElement("option"), {
      value: id,
      textContent: label,
    }),
  ),
);
// Default theme is "day" — a user's own choice (once stored) still wins on
// every later load; this only decides what a fresh browser starts on.
const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
const initialTheme = THEMES.some((t) => t.id === storedTheme)
  ? storedTheme
  : "day";
themeSelect.value = initialTheme;
applyTheme(initialTheme);
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

// ── Collapsible sidebar ──────────────────────────────────────────────────
//
// .sidebar's own width (not the #app grid track, which is just "auto") is
// what's animated — see style.css. The button lives in the always-visible
// app header, not inside .sidebar, so it's reachable in both states; it
// doubles as both collapse and expand, just relabeling itself.
const SIDEBAR_STORAGE_KEY = "studio.sidebarCollapsed";

function setSidebarCollapsed(collapsed) {
  sidebarEl.classList.toggle("collapsed", collapsed);
  sidebarCollapseBtn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  sidebarCollapseBtn.setAttribute(
    "aria-label",
    collapsed ? "Expand sidebar" : "Collapse sidebar",
  );
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  // The stage's own width just changed (the sidebar's width transition is
  // what actually drives that, over ~0.22s — see style.css), but the
  // presenter's internal canvas has been seen not always picking up a
  // container resize on its own. A window "resize" event is the generic
  // signal most canvas/WebGL widgets listen for to recompute their size;
  // firing one after the transition finishes nudges it to match the stage's
  // new dimensions instead of possibly still rendering at the old ones.
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 240);
}
sidebarCollapseBtn.addEventListener("click", () => {
  setSidebarCollapsed(!sidebarEl.classList.contains("collapsed"));
});
setSidebarCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");

// The one place this demo hand-writes motion markup, and the only kind of place
// that earns it: a specific action at a specific moment. Everything the chatbot
// replies with is sent as plain text, because the Connect API picks motions on
// its own — that is the normal case, not a fallback.
//
// Two things to know before copying this pattern:
//   1. A message containing ANY motion mark skips automatic motion selection for
//      the whole utterance. Markup is all-or-nothing per message, not a hint
//      layered on top of the automatic choice.
//   2. A motion id your Connect account cannot see is dropped, not rejected — the
//      line still speaks, it just carries no gesture. Combined with (1) that
//      means this greeting is silent-handed on any account but the one the id
//      came from. Replace it with an id from your own catalog; `tools/motion-browser`
//      composes these strings for you.
// The two ways the chat can be busy: a request is in flight, or a performance is
// open. Both are read by syncChatControls() and written nowhere but the two
// setters beside it — a third writer that knows only one of them is what this
// pair exists to prevent.
let isSpeaking = false;
let isAwaitingReply = false;

const GREETING =
  "Hello! [MOTION 01KRW97VSEA5G49W2YXWGV8JRV:1] I can assist as your Senior Cloud Architect, Interactive Driving Instructor, or Real-Time Equity Analyst. What would you like to explore?";

const TRI_PERSONA_INSTRUCTIONS =
  "You operate as a single assistant that switches between three expert personas depending on the user's question:\n\n" +
  "1. Senior Cloud Architect (questions on cloud infrastructure, system design, AWS/Azure/GCP, scalability, high availability, security, cost, Kubernetes, CI/CD, IaC):\n" +
  "- Focus on trade-offs (cost, latency, complexity, vendor lock-in), not tutorials. Assume user knows basics.\n" +
  "- Ground advice in specific concrete services (e.g. ALB with target-tracking auto scaling, Aurora PostgreSQL, SQS FIFO).\n" +
  "- Ask cloud provider/scale if it changes the answer materially.\n\n" +
  "2. Interactive Driving Instructor (questions on driving technique, traffic rules, licensing, vehicle handling):\n" +
  "- Always establish vehicle type (manual/automatic car, motorcycle, truck) and country/region before specific advice.\n" +
  "- Ask a short follow-up when vehicle or country is missing.\n" +
  "- Remind user that official handbooks and local laws take precedence.\n\n" +
  "3. Real-Time Equity Analyst (questions on stocks, indices, market conditions, earnings, financials):\n" +
  "- Fast, conversational, data-oriented reasoning through tickers/sectors.\n" +
  "- Do not state live prices as fact without a connected tool. Offer qualitative reasoning instead.\n" +
  "- Clearly separate facts from speculation, and always include a brief reminder that this is not personalized financial advice.\n\n" +
  "General Rules:\n" +
  "- Stay in character for whichever role is active for that turn. Switch roles as topic changes.\n" +
  "- If question fits none, answer as a helpful generalist assistant.\n" +
  "- CRITICAL AVATAR RULE: You are speaking out loud through a 3D avatar. Keep responses concise (maximum 2 to 3 sentences). NEVER use markdown formatting, asterisks, bullet points, or code blocks.";

// Prefilled so a new organization can reach a working avatar by pressing Save.
// Every reply is read aloud by present(), so the instructions ask for short
// sentences and no markdown — the two things that sound wrong through an avatar.
const NEW_BOT_DEFAULTS = {
  name: "LifeStack Multi-Persona Assistant",
  instructions:
    TRI_PERSONA_INSTRUCTIONS,
};

// Sent only on the own-LLM path. The Connect chatbot gets its persona from its
// own `custom_instructions` field instead, which is why there is no equivalent
// for that source — the difference in *where the persona lives* is part of what
// the switch is demonstrating.
const OWN_LLM_SYSTEM_PROMPT =
  TRI_PERSONA_INSTRUCTIONS;

let activePersona = null;

const PERSONA_CONFIGS = {
  cloud: {
    label: "Cloud Architect",
    placeholder: "Ask Cloud Architect… (e.g. system design, AWS/Azure/GCP, scaling)",
    prefix: "[Persona: Senior Cloud Architect] ",
  },
  driving: {
    label: "Driving Instruction",
    placeholder: "Ask Driving Instructor… (e.g. parking, road signs, vehicle handling)",
    prefix: "[Persona: Interactive Driving Instructor] ",
  },
  equity: {
    label: "Equity Analyst",
    placeholder: "Ask Equity Analyst… (e.g. stock analysis, margins, earnings)",
    prefix: "[Persona: Real-Time Equity Analyst] ",
  },
};

function setActivePersona(personaKey) {
  if (activePersona === personaKey) {
    activePersona = null;
    chatInput.placeholder = "Ask your Cloud Architect, Driving Instructor, or Equity Analyst…";
  } else {
    activePersona = personaKey;
    const cfg = PERSONA_CONFIGS[personaKey];
    if (cfg) {
      chatInput.placeholder = cfg.placeholder;
    }
  }

  if (personaChips) {
    for (const btn of personaChips.querySelectorAll(".persona-btn, .persona-chip")) {
      const key = btn.getAttribute("data-persona");
      btn.classList.toggle("active", key === activePersona);
    }
  }

  chatInput.disabled = false;
  chatInput.focus();
}

const CREDIT_EXHAUSTED_CODE = 1003;
const NO_SUBSCRIPTION_CODE = 14005;
// 1003 fires for two distinct backend conditions — credits run out, or the
// subscription's own status is no longer usable — and 400 either way. 14005
// is a third, separate condition with the same remedy (Console) but its own
// HTTP status (403): no subscription record exists for the org at all. All
// three share this one fixed, non-technical reply rather than naming one.
const isSubscriptionIssue = (code) =>
  code === CREDIT_EXHAUSTED_CODE || code === NO_SUBSCRIPTION_CODE;
// A plain string, not a function like embed's subscriptionIssueReply:
// appConfig is already resolved by top-level await above, so there is
// nothing to defer.
const subscriptionIssueReply =
  "Your organization's credits are used up or its subscription needs " +
  `attention. Check your usage at ${appConfig.subscriptionUrl}`;

// Debug timeline panel
const debugPanel = document.getElementById("debug-panel");
const debugLog = document.getElementById("debug-log");
const debugClearBtn = document.getElementById("debug-clear-btn");

/** @type {HTMLElement & import('@perxona/presenter-types').IPresentationWidget} */
const presenter = document.querySelector("sv-presenter");

// ── App state ──────────────────────────────────────────────────────────────

/**
 * Conversation history in this app's own shape — `{ role, text }`, belonging to
 * neither API. Each source serializes it at the boundary (see
 * toConnectMessages / toOpenAiMessages), which is the whole difference between
 * them: same conversation, two wire formats.
 * @type {{ role: "user"|"assistant", text: string }[]}
 */
let chatHistory = [];

/**
 * Which model answers. `"connect"` posts to the selected Connect chatbot;
 * `"own"` posts to /api/chat, which forwards to whatever LLM_API_KEY points at.
 * @type {"connect" | "own"}
 */
let source = "connect";

/** Whether LLM_API_KEY is configured — /api/chat 501s without it. */
const ownLlmAvailable = Boolean(appConfig.chat);
/** Auto-selected on first load (see loadChatbots) if a chatbot with this
 * exact name exists in the account — re-checked on every refresh, so
 * creating it later picks it up on the next load without any other change. */
const DEFAULT_CHATBOT_NAME = "Hackvatar Demo Assistant";
/** Set true the first time loadChatbots() runs and finds no chatbot named
 * DEFAULT_CHATBOT_NAME — surfaced once at the end of bootstrap, not on
 * every subsequent refresh. */
let defaultChatbotMissing = false;
/** ID of the currently selected chatbot, or null. */
let activeBotId = null;
/** Lightweight chatbot list from the last /api/chatbots call. */
let chatbotList = [];
/** Whether the presenter has reached Ready status. */
let presenterReady = false;
/** Catalog caches for thumbnail lookups. */
let avatars = [];
let scenes = [];

// Knowledge-file status polling. Upload/embedding is asynchronous on the
// backend (chunking + embedding via a queued job, can take from seconds to
// several minutes) — see startKnowledgePolling for the loop that surfaces its
// progress without a page reload.
/** How often to re-check knowledge status while it's "processing". */
const KNOWLEDGE_POLL_INTERVAL_MS = 5000;
/** How long to keep auto-polling before surfacing a manual "Check again". */
const KNOWLEDGE_POLL_TIMEOUT_MS = 5 * 60 * 1000;
/** `setTimeout` id for the active poll, or null when nothing is polling. */
let knowledgePollTimer = null;
/** `Date.now()`-based deadline for the active poll, or null. */
let knowledgePollDeadline = null;
/**
 * Bumped by stopKnowledgePolling() (which every startKnowledgePolling() call
 * runs first). A scheduled tick captures the generation it was born under; if
 * that no longer matches when the tick actually fires or its request
 * resolves, a stop or restart happened in between and the tick discards
 * itself instead of touching state that now belongs to a different poll (or
 * to nothing) — this is what an in-flight `await request()` can't otherwise
 * know once someone has clicked Remove or switched bots underneath it.
 */
let knowledgePollGeneration = 0;
/** Name of the file the active/most-recent poll concerns, for the stalled and resuming badge text. */
let knowledgePolledFileName = null;

// ── API helper ─────────────────────────────────────────────────────────────

/**
 * Thin fetch wrapper for JSON APIs. Throws a structured error on non-2xx.
 * 204 No Content resolves to null.
 * @param {string} path
 * @param {{ method?: string, body?: object }} [opts]
 * @returns {Promise<any>}
 */
async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // detail: FastAPI validation errors. details: the real Connect API's
    // Error schema, passed through unchanged by server.mjs's route(). error:
    // this server's own hand-rolled validation.
    const message =
      (Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail) ??
      data.details ??
      data.error ??
      res.statusText;
    throw Object.assign(new Error(message), { status: res.status, data });
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Catalog ────────────────────────────────────────────────────────────────

/**
 * Fill a picker and preselect one item (index 0 — the first — so Launch is
 * one click away, unless a different initial index is requested; falls
 * back toward index 0 if the catalog is shorter than that). `emptyLabel`
 * stays selectable — clearing the voice selects BYO-TTS.
 * @param {number} [initialIndex]
 */
function fillSelect(select, items, emptyLabel, initialIndex = 0) {
  select.replaceChildren(
    Object.assign(document.createElement("option"), {
      value: "",
      textContent: emptyLabel,
    }),
    ...items.map(({ id, name }) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = name;
      return opt;
    }),
  );
  select.value = (items[initialIndex] ?? items[0])?.id ?? "";
}

function updateAssetIcon(img, items, id, thumbnailKey) {
  const url = items.find((item) => item.id === id)?.thumbnail_urls?.[
    thumbnailKey
  ];
  if (!url) {
    img.hidden = true;
    img.removeAttribute("src");
    return;
  }
  img.onerror = () => {
    img.hidden = true;
  };
  img.src = url;
  img.hidden = false;
}

function updateInitBtn() {
  initBtn.disabled =
    isPresenterLaunchDisabled ||
    !presenterEngineReady ||
    !avatarSelect.value ||
    !sceneSelect.value ||
    isLaunching;
}

avatarSelect.addEventListener("change", () => {
  updateInitBtn();
  updateAssetIcon(avatarIcon, avatars, avatarSelect.value, "head");
  syncCarouselActive(avatarCarouselTrack, avatarSelect.value);
  // No-op unless the Avatar/Scene stage toggles have one turned off, in
  // which case the forced overlay needs to reflect the new selection too.
  renderPersistentStageOverlay();
});
sceneSelect.addEventListener("change", () => {
  updateInitBtn();
  updateAssetIcon(sceneIcon, scenes, sceneSelect.value, "default");
  syncCarouselActive(sceneCarouselTrack, sceneSelect.value);
  renderPersistentStageOverlay();
});
// voiceId is only read at initializeWithConnectKey() time, so switching
// voice must re-enable Launch the same way avatar/scene changes do.
voiceSelect.addEventListener("change", () => {
  updateInitBtn();
  syncVoiceListActive(voiceListEl, voiceSelect.value);
});

// ── Avatar / Scene carousels ─────────────────────────────────────────────
//
// The <select> elements above stay the real state (every existing .value
// read and "change" listener still targets them); a carousel click just sets
// select.value and dispatches "change" itself, same as a real picker would.

/**
 * @param {HTMLElement} track
 * @param {Array<{id: string, name: string, thumbnail_urls?: object}>} items
 * @param {HTMLSelectElement} select
 * @param {string} thumbnailKey  Key into thumbnail_urls, e.g. "head"/"default".
 * @param {"avatar"|"scene"} kind  Which half of the hover preview this card
 *   drives — see showHoverPreview().
 */
function fillCarousel(track, items, select, thumbnailKey, kind) {
  track.replaceChildren(
    ...items.map((item) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "carousel-card";
      card.dataset.id = item.id;
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", "false");

      const thumbUrl = item.thumbnail_urls?.[thumbnailKey];
      const thumb = document.createElement(thumbUrl ? "img" : "div");
      thumb.className = thumbUrl
        ? "carousel-card-thumb"
        : "carousel-card-thumb placeholder";
      if (thumbUrl) {
        thumb.src = thumbUrl;
        thumb.alt = "";
        // Swap to the placeholder glyph rather than leaving a broken-image icon.
        thumb.onerror = () => {
          thumb.remove();
          card.prepend(
            Object.assign(document.createElement("div"), {
              className: "carousel-card-thumb placeholder",
              textContent: "🖼",
            }),
          );
        };
      } else {
        thumb.textContent = "🖼";
      }

      const label = document.createElement("span");
      label.className = "carousel-card-label";
      label.textContent = item.name;

      card.append(thumb, label);
      card.addEventListener("click", () => {
        select.value = item.id;
        select.dispatchEvent(new Event("change"));
      });
      // mouseenter (not mouseover) so moving between sibling cards inside the
      // same track re-fires per card without the track's own mouseleave (see
      // wireCarouselNav below) triggering in between — only a hover, never a
      // click, so touch devices that never fire it just keep tap-to-select
      // working unchanged.
      card.addEventListener("mouseenter", () => {
        if (kind === "avatar") showHoverPreview(item.id, sceneSelect.value);
        else showHoverPreview(avatarSelect.value, item.id);
      });
      return card;
    }),
  );
  syncCarouselActive(track, select.value);
}

function syncCarouselActive(track, activeId) {
  track.querySelectorAll(".carousel-card").forEach((card) => {
    const active = card.dataset.id === activeId;
    card.classList.toggle("active", active);
    card.setAttribute("aria-selected", String(active));
    // Brings a non-default initial selection (e.g. the 6th avatar) into
    // view on load; a no-op for a card the user just clicked, since that's
    // already visible.
    if (active) card.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

/** Wired once at load — nav buttons scroll the (fixed) track element, not its children. */
function wireCarouselNav(carousel, track) {
  const cardWidth = () => (track.querySelector(".carousel-card")?.offsetWidth ?? 84) + 9; // + track gap
  carousel
    .querySelector(".carousel-prev")
    .addEventListener("click", () =>
      track.scrollBy({ left: -cardWidth(), behavior: "smooth" }),
    );
  carousel
    .querySelector(".carousel-next")
    .addEventListener("click", () =>
      track.scrollBy({ left: cardWidth(), behavior: "smooth" }),
    );
}
wireCarouselNav(avatarCarousel, avatarCarouselTrack);
wireCarouselNav(sceneCarousel, sceneCarouselTrack);

// ── Avatar / Scene hover preview ─────────────────────────────────────────
//
// A fast static image swap on the main stage — not a real presenter launch
// (that stays behind Launch Presenter, unchanged). Each card's mouseenter
// (above, in fillCarousel) says *which* avatar/scene to preview; hiding is
// wired once here on the track itself, not per card, so moving the mouse
// between sibling cards never fires it — mouseleave only fires when the
// pointer actually exits the whole track, exactly the "still hovering
// *a* card" case this needs to tell apart from "hovering nothing now".

/**
 * @param {string} avatarId
 * @param {string} sceneId
 */
function showHoverPreview(avatarId, sceneId) {
  const avatar = avatars.find((a) => a.id === avatarId);
  const scene = scenes.find((s) => s.id === sceneId);

  const avatarUrl = avatar?.thumbnail_urls?.head;
  hoverPreviewAvatar.hidden = !avatarUrl;
  if (avatarUrl) hoverPreviewAvatar.src = avatarUrl;

  const sceneUrl = scene?.thumbnail_urls?.default;
  hoverPreviewScene.hidden = !sceneUrl;
  if (sceneUrl) hoverPreviewScene.src = sceneUrl;

  hoverPreviewLabel.textContent = [avatar?.name, scene?.name]
    .filter(Boolean)
    .join("  ·  ");
  hoverPreview.hidden = false;
}

function hideHoverPreview() {
  hoverPreview.hidden = true;
}

// Leaving a hover reveals renderPersistentStageOverlay()'s state, not a bare
// hide — if the Avatar/Scene stage toggles below have either one turned off,
// that forced overlay should still be showing afterward, not the live view.
avatarCarouselTrack.addEventListener("mouseleave", renderPersistentStageOverlay);
sceneCarouselTrack.addEventListener("mouseleave", renderPersistentStageOverlay);

// ── Stage toolbar: Avatar / Scene / Voice / Text / Timeline ──────────────
//
// Avatar/Scene: the presenter's public API (@perxona/presenter-types) has no
// method to hide just one of the two within its own live 3D render —
// initializeWithConnectKey takes both together, and nothing else in the
// interface exposes per-layer visibility. So "off" falls back to the same
// static thumbnail overlay hover already uses, showing only the enabled
// layer(s) — a real, visible effect, just not decomposing the live canvas.
// Voice: presenter.muteAudio() is a real documented method — this one
// actually mutes the live spoken audio, not an approximation.
// Text: shares state with the "Conversation text" toggle near the chat
// input; the two checkboxes stay in sync either way they're flipped.
let stageAvatarVisible = true;
let stageSceneVisible = true;
let timelineVisible = false;

/**
 * Redraws the persistent (non-hover) stage overlay from the two visibility
 * flags above. Called on toggle change, when the presenter reaches Ready,
 * on avatar/scene selection change, and by mouseleave instead of an
 * unconditional hide.
 */
function renderPersistentStageOverlay() {
  if (stageAvatarVisible && stageSceneVisible) {
    hideHoverPreview();
    return;
  }
  showHoverPreview(
    stageAvatarVisible ? avatarSelect.value : "",
    stageSceneVisible ? sceneSelect.value : "",
  );
}

stageToggleAvatar.addEventListener("change", () => {
  stageAvatarVisible = stageToggleAvatar.checked;
  renderPersistentStageOverlay();
});
stageToggleScene.addEventListener("change", () => {
  stageSceneVisible = stageToggleScene.checked;
  renderPersistentStageOverlay();
});
stageToggleVoice.addEventListener("change", () => {
  presenter.muteAudio?.(!stageToggleVoice.checked);
});
// Two checkboxes, one piece of state: whichever changes drives chatLog via
// the original textVisibilityToggle listener (further down), and updates
// the other checkbox to match — dispatching "change" rather than duplicating
// the hide/show logic here.
stageToggleText.addEventListener("change", () => {
  textVisibilityToggle.checked = stageToggleText.checked;
  textVisibilityToggle.dispatchEvent(new Event("change"));
});
textVisibilityToggle.addEventListener("change", () => {
  stageToggleText.checked = textVisibilityToggle.checked;
});
stageToggleTimeline.addEventListener("change", () => {
  timelineVisible = stageToggleTimeline.checked;
  updateDebugPanelVisibility();
});

/** debugPanel is only ever visible once launched AND while the Timeline
 * toggle is on — both conditions gate it, so either one turning off hides it. */
function updateDebugPanelVisibility() {
  debugPanel.hidden = !presenterReady || !timelineVisible;
}

// ── Motion picker ─────────────────────────────────────────────────────────
//
// Real motion catalog via GET /api/avatars/:id/motions — an existing server
// route (see server.mjs) the frontend never called until now. Triggering
// reuses the same command pathway as every other presenter interaction: a
// direct presenter.playMotion() call, logged through appendDebug() exactly
// like present()/setThinking() elsewhere in this file.

/** Cache of the last-fetched motion list, keyed by avatar id so switching
 * avatars and switching back doesn't always re-fetch. */
let motionsForCurrentAvatar = [];
let motionsLoadedForAvatarId = null;

function closeMotionPicker() {
  motionPickerPopup.hidden = true;
  motionPickerToggle.setAttribute("aria-expanded", "false");
}

async function openMotionPicker() {
  motionPickerPopup.hidden = false;
  motionPickerToggle.setAttribute("aria-expanded", "true");
  const avatarId = avatarSelect.value;
  if (!avatarId) {
    renderMotionList([], "Select an avatar first.");
    return;
  }
  if (motionsLoadedForAvatarId === avatarId) {
    renderMotionList(motionsForCurrentAvatar);
    return;
  }
  renderMotionList([], "Loading…");
  try {
    const { items } = await request(
      `/api/avatars/${encodeURIComponent(avatarId)}/motions`,
    );
    motionsForCurrentAvatar = items ?? [];
    motionsLoadedForAvatarId = avatarId;
    // The picker may have been closed (or switched to a different avatar)
    // while this was in flight.
    if (avatarSelect.value !== avatarId || motionPickerPopup.hidden) return;
    renderMotionList(motionsForCurrentAvatar);
  } catch (err) {
    renderMotionList([], `Failed to load motions: ${err.message}`);
  }
}

/**
 * @param {Array<{motion_id: string, name: string}>} motions
 * @param {string} [emptyMessage] Shown instead of the list when motions is empty.
 */
/**
 * The Connect API's motion catalog is real, but not every entry has a
 * hand-authored name — some are raw internal identifiers ("2026-07-W501-077
 * - Derived Motion", "m_cc_talk_stand_05") that mean nothing to a person
 * picking a motion to trigger. Detects that case and builds a readable
 * label from the motion's semantic tags instead (intent/pose/category —
 * see the real /api/avatars/:id/motions response); a motion with a normal,
 * already-descriptive name (e.g. "Left Arm Presenting Gesture") passes
 * through untouched.
 * @param {{name: string, tags?: string[]}} motion
 */
function humanizeMotionName(motion) {
  const rawName = motion.name ?? "";
  const looksGeneric =
    /derived motion$/i.test(rawName) || /^[a-z]+_[a-z]+_/i.test(rawName);
  if (!looksGeneric) return rawName;

  const tags = motion.tags ?? [];
  const valuesFor = (prefix) =>
    tags
      .filter((t) => t.startsWith(`${prefix}:`))
      .map((t) => t.slice(prefix.length + 1));
  const titleCase = (s) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const intents = valuesFor("intent");
  if (intents.length) return intents.slice(0, 2).map(titleCase).join(" / ");

  const pose = valuesFor("pose")[0];
  if (pose) return titleCase(pose);

  const category = valuesFor("category")[0];
  if (category) return titleCase(category);

  // Last resort: humanize the raw slug itself — strip a leading
  // skeleton-id-style prefix (e.g. "m_cc_") and title-case what's left.
  return titleCase(rawName.replace(/^[a-z]+_[a-z]+_/i, "")) || rawName;
}

function renderMotionList(motions, emptyMessage = "No motions available.") {
  if (motions.length === 0) {
    motionPickerList.replaceChildren(
      Object.assign(document.createElement("li"), {
        className: "motion-picker-empty",
        textContent: emptyMessage,
      }),
    );
    return;
  }
  motionPickerList.replaceChildren(
    ...motions.map((motion) => {
      const li = document.createElement("li");
      li.className = "motion-picker-item";
      li.setAttribute("role", "option");
      li.textContent = humanizeMotionName(motion);
      li.addEventListener("click", () => triggerMotion(motion));
      return li;
    }),
  );
}

async function triggerMotion(motion) {
  // (b) minimize immediately on click, regardless of outcome — the toggle
  // button stays right where it was as the reopen affordance.
  closeMotionPicker();
  if (!presenterReady) {
    setStatus("Launch the presenter before triggering a motion.");
    return;
  }
  appendDebug(
    "cmd",
    `presenter.playMotion(${motion.motion_id}) — ${humanizeMotionName(motion)}`,
  );
  try {
    const result = await presenter.playMotion(motion.motion_id);
    if (!result?.success) {
      appendDebug(
        "err",
        `playMotion() failed: ${result?.code} — ${result?.message ?? ""}`,
      );
    } else {
      appendDebug("ok", "playMotion() accepted ✓");
    }
  } catch (err) {
    appendDebug("err", `playMotion() threw: ${err.message}`);
  }
}

motionPickerToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  if (motionPickerPopup.hidden) openMotionPicker();
  else closeMotionPicker();
});
motionPickerPopup.addEventListener("click", (e) => e.stopPropagation());
// Close on any outside click or Escape — same dismiss pattern as the
// chatbot picker above.
document.addEventListener("click", closeMotionPicker);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMotionPicker();
});
// Switching avatars invalidates the cached list so the next open re-fetches.
avatarSelect.addEventListener("change", () => {
  motionsLoadedForAvatarId = null;
});

// ── Avatar framing ────────────────────────────────────────────────────────
//
// presenter.updateCameraAngle() (a real, documented method) only has two
// built-in presets: "fullbody" and "halfbody" — nothing matching a
// head-and-neck close-up. Mid and Full map directly to those; Face has no
// SDK preset, so it also applies a CSS zoom (see .framing-face in
// style.css) cropping the halfbody frame down to head + neck within
// .stage's own overflow:hidden. Assumes "halfbody" is today's existing
// default framing, so selecting Mid is a no-op versus current behavior —
// correct that mapping here if this account's actual default differs.
const FRAMINGS = {
  mid: { angle: "halfbody", zoom: false },
  full: { angle: "fullbody", zoom: false },
  face: { angle: "halfbody", zoom: true },
};

function applyFraming(id) {
  const framing = FRAMINGS[id] ?? FRAMINGS.mid;
  presenter.classList.toggle("framing-face", framing.zoom);
  if (presenterReady) {
    appendDebug("cmd", `presenter.updateCameraAngle(${framing.angle})`);
    presenter.updateCameraAngle?.(framing.angle);
    // "Fullbody" in particular has been seen rendering outside .stage's
    // bounds — a resize nudge gives the internal canvas a chance to
    // recompute against the container's actual current dimensions rather
    // than whatever it last measured, which .stage's own overflow:hidden
    // and the max-width/max-height guards in style.css can't fix on their
    // own if the widget's internal render target itself is oversized.
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }
}

framingSelect.addEventListener("change", () => applyFraming(framingSelect.value));
// Applied (again) once the presenter is actually ready, in case the
// dropdown was changed before Launch — updateCameraAngle has nothing to
// act on until then, only the CSS zoom half of Face would have applied.
presenter.addEventListener("PRESENTER_STATUS", (e) => {
  if (e.detail.status === "Ready") applyFraming(framingSelect.value);
});

// ── Voice list + hover preview ───────────────────────────────────────────
//
// A selectable list rather than a carousel (voices have no image). Hovering
// a row plays a real synthesized preview — see scheduleVoicePreview below.

/**
 * @param {HTMLElement} listEl
 * @param {Array<{id: string, name: string}>} items
 * @param {HTMLSelectElement} select
 */
function fillVoiceList(listEl, items, select) {
  listEl.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement("li");
      li.className = "voice-item";
      li.dataset.id = item.id;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");

      const label = document.createElement("span");
      label.textContent = item.name;
      const previewIcon = document.createElement("span");
      previewIcon.className = "voice-item-preview-icon";
      previewIcon.textContent = "🔊";
      previewIcon.setAttribute("aria-hidden", "true");
      li.append(label, previewIcon);

      li.addEventListener("click", () => {
        select.value = item.id;
        select.dispatchEvent(new Event("change"));
      });
      li.addEventListener("mouseenter", () =>
        scheduleVoicePreview(li, item.id),
      );
      li.addEventListener("mouseleave", cancelPendingVoicePreview);
      return li;
    }),
  );
  syncVoiceListActive(listEl, select.value);
}

function syncVoiceListActive(listEl, activeId) {
  listEl.querySelectorAll(".voice-item").forEach((li) => {
    const active = li.dataset.id === activeId;
    li.classList.toggle("active", active);
    li.setAttribute("aria-selected", String(active));
  });
}

// Real synthesis via the server (see server.mjs), not a canned clip —
// debounced so sweeping across the list doesn't fire one request per row it
// passes over, and cached per voice so a repeat hover replays instantly
// instead of re-synthesizing (and re-spending the upstream TTS token call).
const VOICE_PREVIEW_DEBOUNCE_MS = 400;
const voicePreviewCache = new Map(); // voiceId -> Promise<string> (object URL)
let voicePreviewTimer = null;
let activePreviewItem = null;
const voicePreviewAudio = new Audio();

function clearPreviewIndicator() {
  activePreviewItem?.classList.remove("previewing");
  activePreviewItem = null;
}
voicePreviewAudio.addEventListener("ended", clearPreviewIndicator);
voicePreviewAudio.addEventListener("pause", clearPreviewIndicator);
voicePreviewAudio.addEventListener("error", clearPreviewIndicator);

function scheduleVoicePreview(li, voiceId) {
  clearTimeout(voicePreviewTimer);
  voicePreviewTimer = setTimeout(
    () => playVoicePreview(li, voiceId),
    VOICE_PREVIEW_DEBOUNCE_MS,
  );
}

/** Cancels a preview still waiting out the debounce. One already playing is
 * short enough to just let finish rather than cutting it off mid-word. */
function cancelPendingVoicePreview() {
  clearTimeout(voicePreviewTimer);
}

async function playVoicePreview(li, voiceId) {
  try {
    let urlPromise = voicePreviewCache.get(voiceId);
    if (!urlPromise) {
      urlPromise = fetch(
        `/api/voices/${encodeURIComponent(voiceId)}/preview`,
        { method: "POST" },
      ).then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? `Preview failed (${r.status})`);
        }
        return URL.createObjectURL(await r.blob());
      });
      voicePreviewCache.set(voiceId, urlPromise);
    }
    const url = await urlPromise;
    // Cuts off whatever was already playing, so hovering across rows quickly
    // never overlaps two voices' audio.
    clearPreviewIndicator();
    activePreviewItem = li;
    li.classList.add("previewing");
    voicePreviewAudio.pause();
    voicePreviewAudio.src = url;
    await voicePreviewAudio.play();
  } catch (err) {
    // Non-fatal — a failed preview must never block picking the voice.
    // Drop the cache entry so hovering again retries rather than replaying
    // the same failure forever.
    voicePreviewCache.delete(voiceId);
    clearPreviewIndicator();
    console.error("Voice preview failed:", err);
  }
}

async function loadCatalog() {
  setStatus("Loading catalog…");
  try {
    const [{ items: avatarList }, { items: sceneList }, { items: voiceList }] =
      await Promise.all([
        request("/api/avatars"),
        request("/api/scenes"),
        request("/api/voices"),
      ]);
    avatars = avatarList;
    scenes = sceneList;
    // Initial picks: 6th avatar, 2nd scene, 1st voice (indices 5/1/0) —
    // falls back toward index 0 in fillSelect if a catalog is shorter.
    fillSelect(avatarSelect, avatarList, "— select avatar —", 5);
    fillSelect(sceneSelect, sceneList, "— select scene —", 1);
    fillSelect(voiceSelect, voiceList, "— no voice —", 0);
    fillCarousel(avatarCarouselTrack, avatarList, avatarSelect, "head", "avatar");
    fillCarousel(sceneCarouselTrack, sceneList, sceneSelect, "default", "scene");
    fillVoiceList(voiceListEl, voiceList, voiceSelect);
    updateInitBtn();
    updateAssetIcon(avatarIcon, avatars, avatarSelect.value, "head");
    updateAssetIcon(sceneIcon, scenes, sceneSelect.value, "default");
    if (isPresenterLaunchDisabled) {
      stagePlaceholder.querySelector("p").textContent =
        "Mock mode supports catalog browsing only.";
      setStatus("Configure live credentials to launch the presenter.");
    } else {
      setStatus("");
    }
  } catch (err) {
    // Catalog reads need only asset:read and voice:read, which every key type
    // carries — so a wrong key *type* is never why these three failed.
    const credentialHint =
      err.status === 401 || err.status === 403
        ? " — the server's Connect key was refused: revoked, expired, or restricted to allowed domains (a server sends no Origin, so any domain restriction refuses it)"
        : "";
    setStatus(`Catalog error: ${err.message}${credentialHint}`);
  }
}

// ── Presenter events ───────────────────────────────────────────────────────

const STATUS_LABELS = {
  Uninitialized: "",
  Initializing: "Initializing…",
  Ready: "✓ Ready",
};

presenter.addEventListener("PRESENTER_STATUS", (e) => {
  const { status } = e.detail;
  setStatus(STATUS_LABELS[status] ?? status);
  if (status === "Ready") {
    presenterReady = true;
    isLaunching = false;
    stagePlaceholder.hidden = true;
    presenter.hidden = false;
    updateDebugPanelVisibility(); // reveals the timeline, unless toggled off
    presenter.muteAudio?.(!stageToggleVoice.checked); // apply any pre-launch mute
    renderPersistentStageOverlay(); // apply any pre-launch Avatar/Scene toggle
    updateChatUI();
    // Same rule the submit handler applies: a line that never queued has no
    // ALL_PERFORMANCE_FINISHED coming, so nothing else will release the controls.
    // Without this a failed greeting leaves the reader pressing Stop to type.
    speak(GREETING).then((queued) => {
      if (!queued) setSpeaking(false);
    });
  }
});

// A refused key has no refresh to fall back on — it is revoked, expired, or
// was never granted the scope, and presenting it again fails identically. The
// call that triggered this already failed; the reader has to fix the key and
// launch again.
presenter.addEventListener("CONNECT_KEY_REJECTED", () => {
  setStatus(
    "Connect key rejected — revoked, expired, or missing a scope. Check PERXONA_CONNECT_PUBLISHABLE_KEY.",
  );
  updateInitBtn();
});

// ── Presenter lifecycle events (debug timeline) ──────────────────────────
//
// These events expose the internal state machine of sv-presenter so the demo
// can show exactly what happens after present() is called.

presenter.addEventListener("PERFORMANCE_STATE", (e) => {
  const { state } = e.detail;
  appendDebug("sdk", `Presenter state → ${state}`);
});

presenter.addEventListener("PERFORMANCE_START", () => {
  appendDebug("sdk", "Performance started");
});

presenter.addEventListener("PERFORMANCE_END", () => {
  appendDebug("sdk", "Performance segment ended");
});

presenter.addEventListener("ALL_PERFORMANCE_FINISHED", () => {
  appendDebug("ok", "All performances finished — avatar returned to idle ✓");
  setSpeaking(false);
});

presenter.addEventListener("PLAYING_SPEECH_TEXT", (e) => {
  const raw = e.detail?.text ?? "";
  const preview = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
  appendDebug("sdk", `Speaking: “${preview}”`);
});

// ── Initialize presenter ───────────────────────────────────────────────────

async function fetchConnectKey() {
  const { connect_key } = await request("/api/connect-key");
  return connect_key;
}

/**
 * Shared by the Launch button and the auto-launch-on-load call in bootstrap
 * below — same steps either way.
 */
async function launchPresenter() {
  if (isPresenterLaunchDisabled) {
    setStatus("Configure live credentials to launch the presenter.");
    return;
  }
  isLaunching = true;
  initBtn.disabled = true;
  setStatus("Fetching connect key…");
  try {
    // resumeAudioPlayback must be called from a direct user gesture to satisfy
    // browser autoplay policy before the presenter attempts audio playback.
    // A programmatic auto-launch has no such gesture behind it, so this call
    // is a no-op in that case — see unlockAudioOnce() near the bootstrap,
    // which is what actually restores audio once the user does anything at
    // all on the page.
    await presenter.resumeAudioPlayback?.();
    const connectKey = await fetchConnectKey();
    setStatus("Initializing…");
    await presenter.initializeWithConnectKey(connectKey, {
      avatarId: avatarSelect.value,
      sceneId: sceneSelect.value,
      voiceId: voiceSelect.value || undefined,
    });
    // Status label is then driven by PRESENTER_STATUS events above.
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    isLaunching = false;
    updateInitBtn();
  }
}

initBtn.addEventListener("click", launchPresenter);

// ── Speak helper ──────────────────────────────────────────────────────────

/**
 * Send text to the presenter for speech synthesis and playback. Silently
 * skips if the presenter is not yet ready (chat still works as text-only).
 * @param {string} text
 * @returns {Promise<boolean>} whether a performance was queued — the caller
 * needs this to know whether to expect ALL_PERFORMANCE_FINISHED at all.
 */
async function speak(text) {
  if (!presenterReady || !text.trim()) return false;
  // Turn off "thinking" regardless of what happens next — the caller already
  // set it before the reply arrived, and every other exit from this function
  // clears it too. Doing it ahead of the document.hidden check below matters:
  // that check returns early, and it used to skip this line along with it,
  // leaving the avatar stuck mid-thinking-animation for a reply the user
  // will only see (as text) once they switch back, never spoken.
  appendDebug("cmd", "presenter.setThinking(false)");
  presenter.setThinking?.(false);
  // A reply can arrive after the tab was already backgrounded (sent, then
  // switched away before the response came back) — visibilitychange below
  // only fires on the hidden *transition*, so nothing is left to interrupt a
  // performance that starts out hidden. Skip queuing it instead of locking
  // isSpeaking with no event left that will ever release it. The reply stays
  // visible as text in the chat log either way; it just won't be spoken
  // retroactively on return — same trade-off the greeting below already
  // accepts, and treated as acceptable for the same reason: recovering the
  // lock matters more than guaranteeing every reply gets read aloud.
  if (document.hidden) {
    appendDebug("cmd", "Tab hidden — skipping present()");
    return false;
  }
  appendDebug("cmd", "presenter.present() — queuing speech + motion");
  // Lock from the moment the request goes in rather than from PERFORMANCE_START.
  // present() can resolve queued and then never start playing, and a Stop button
  // that only lights up once speech begins would leave that window with no event
  // coming and no control to press.
  setSpeaking(true);
  try {
    const result = await presenter.present(text.trim());
    if (!result?.success) {
      setStatus(`Playback failed (${result?.code}): ${result?.message ?? ""}`);
      appendDebug(
        "err",
        `present() failed: ${result?.code} — ${result?.message ?? ""}`,
      );
      setSpeaking(false);
      return false;
    }
    appendDebug("ok", "present() accepted — performance queued ✓");
    return true;
  } catch (err) {
    setStatus(`Playback error: ${err.message}`);
    appendDebug("err", `present() threw: ${err.message}`);
    setSpeaking(false);
    return false;
  }
}

// ── Chatbot Manager ────────────────────────────────────────────────────────

// ── Custom bot picker (replaces native <select>) ───────────────────────────
// Reason: native <select> dropdowns misposition when opened inside a scrolled
// overflow-y: auto container (Chrome). A custom absolute-positioned list avoids
// the issue entirely.

function openBotPicker() {
  botPickerList.hidden = false;
  botPickerBtn.setAttribute("aria-expanded", "true");
}

function closeBotPicker() {
  botPickerList.hidden = true;
  botPickerBtn.setAttribute("aria-expanded", "false");
}

/**
 * Rebuild the picker's option list from the current chatbotList array.
 * @param {Array<{ id: string, name: string, status: string }>} bots
 */
function populateBotPicker(bots) {
  function makeOption(id, label) {
    const li = document.createElement("li");
    li.role = "option";
    li.dataset.botId = id ?? "";
    li.className = `bot-picker-option${id ? "" : " empty-option"}`;
    li.setAttribute("aria-selected", (id === activeBotId).toString());
    li.textContent = label;
    return li;
  }
  botPickerList.replaceChildren(
    makeOption(null, bots.length ? "— select a chatbot —" : "— none yet —"),
    ...bots.map(({ id, name, status }) =>
      makeOption(id, status === "disabled" ? `${name} (disabled)` : name),
    ),
  );
}

/**
 * Update activeBotId, the picker label, and all dependent UI.
 * Resets conversation history when the active bot changes. Also refreshes
 * the knowledge indicator for whichever bot is now active — without this,
 * the indicator kept showing the *previous* bot's status after a switch,
 * which is worse than showing nothing.
 * @param {string|null} id
 */
async function selectChatbot(id) {
  const newId = id || null;
  const botChanged = newId !== activeBotId;
  if (botChanged) {
    stopKnowledgePolling();
    activeBotId = newId;
    chatHistory = [];
    chatLog.replaceChildren();
    // Clear immediately so the indicator never shows a stale bot's status
    // while the fetch below (if any) is still in flight.
    renderKnowledgeBadges(null);
  }
  const bot = chatbotList.find((b) => b.id === newId);
  botPickerLabel.textContent = bot
    ? bot.status === "disabled"
      ? `${bot.name} (disabled)`
      : bot.name
    : chatbotList.length
      ? "— select a chatbot —"
      : "— none yet —";
  // Sync aria-selected in the open list
  botPickerList.querySelectorAll(".bot-picker-option").forEach((li) => {
    li.setAttribute(
      "aria-selected",
      (li.dataset.botId === (newId ?? "")).toString(),
    );
  });
  botDeleteBtn.hidden = !activeBotId;
  if (activeBotId) {
    botIdValue.textContent = activeBotId;
    botIdRow.hidden = false;
  } else {
    botIdRow.hidden = true;
    botIdValue.textContent = "";
  }
  updateChatUI();

  if (!botChanged || !newId) return;
  try {
    const detail = await request(`/api/chatbots/${newId}`);
    if (newId !== activeBotId) return; // switched again while this was in flight
    showKnowledgeFor(newId, detail.knowledge ?? null);
  } catch (err) {
    // Non-fatal — the picker itself already switched. Leave the indicator
    // cleared rather than blocking the switch on this fetch.
    console.error("Failed to load knowledge status:", err);
  }
}

botPickerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  botPickerList.hidden ? openBotPicker() : closeBotPicker();
});

botPickerList.addEventListener("click", (e) => {
  e.stopPropagation();
  const option = e.target.closest(".bot-picker-option");
  if (!option) return;
  const id = option.dataset.botId || null;
  selectChatbot(id);
  closeBotPicker();
  botEditor.open = false;
  setBotStatus("");
});

// Close picker on any outside click or Escape key.
document.addEventListener("click", closeBotPicker);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeBotPicker();
});

/**
 * Fetch the chatbot list and refresh the picker.
 * Preserves the currently selected bot ID if it still exists after the refresh.
 */
async function loadChatbots() {
  try {
    const { items } = await request("/api/chatbots");
    chatbotList = items ?? [];
    populateBotPicker(chatbotList);
    // Restore previous selection, or fall back to the default chatbot (or
    // clear, if neither exists) if the bot was deleted or this is first load.
    const previousId = activeBotId;
    if (previousId && chatbotList.some((b) => b.id === previousId)) {
      selectChatbot(previousId);
    } else {
      const defaultBot = chatbotList.find(
        (b) => b.name === DEFAULT_CHATBOT_NAME,
      );
      if (defaultBot) {
        selectChatbot(defaultBot.id);
      } else {
        selectChatbot(null);
        defaultChatbotMissing = true;
      }
    }
    // A new organization has none; an empty picker on its own is a dead end.
    if (chatbotList.length === 0) {
      openNewBotForm(false);
      setBotStatus(
        "No chatbots yet — this form is filled in, just press Save.",
      );
    }
  } catch (err) {
    setBotStatus(`Failed to load chatbots: ${err.message}`);
  }
}

// Prefill editor when the <details> opens for an existing bot.
botEditor.addEventListener("toggle", async () => {
  if (!botEditor.open || !activeBotId) return;
  try {
    const detail = await request(`/api/chatbots/${activeBotId}`);
    botNameInput.value = detail.name ?? "";
    botInstructionsInput.value = detail.custom_instructions ?? "";
    // Show current knowledge status, resuming polling if it's still
    // processing (e.g. the page was reloaded mid-embedding).
    showKnowledgeFor(activeBotId, detail.knowledge ?? null);
    // Show tools count but leave textarea empty — the user only fills it
    // when they intend to replace tools (empty = leave unchanged per API semantics)
    const toolCount = detail.tools?.length ?? 0;
    botToolsCount.textContent =
      toolCount > 0
        ? `${toolCount} tool${toolCount === 1 ? "" : "s"} configured`
        : "";
    botToolsInput.value = "";
    // Reset file picker
    botKnowledgeFileInput.value = "";
    botKnowledgeFilename.textContent = "";
  } catch (err) {
    setBotStatus(`Failed to load chatbot details: ${err.message}`);
  }
});

/**
 * Open the create form, prefilled and ready to submit.
 * @param {boolean} focus false when opening unprompted — do not steal focus.
 */
function openNewBotForm(focus = true) {
  selectChatbot(null); // deselect any active bot
  botNameInput.value = NEW_BOT_DEFAULTS.name;
  botInstructionsInput.value = NEW_BOT_DEFAULTS.instructions;
  botToolsInput.value = "";
  botToolsCount.textContent = "";
  botKnowledgeFileInput.value = "";
  botKnowledgeFilename.textContent = "";
  renderKnowledgeBadges(null);
  botEditorSummary.textContent = "Create New Chatbot";
  botEditor.open = true;
  if (focus) botNameInput.focus();
}

botNewBtn.addEventListener("click", () => {
  openNewBotForm();
  setBotStatus("");
});

botCancelBtn.addEventListener("click", () => {
  botEditor.open = false;
  // Restore summary label to default
  botEditorSummary.textContent = "Create / Edit";
  setBotStatus("");
});

botSaveBtn.addEventListener("click", async () => {
  const name = botNameInput.value.trim();
  if (!name) {
    setBotStatus("Name is required.");
    return;
  }

  // Validate and parse tools JSON if the user provided any
  let tools = undefined; // undefined = "leave unchanged"
  const toolsRaw = botToolsInput.value.trim();
  if (toolsRaw) {
    try {
      tools = JSON.parse(toolsRaw);
      if (!Array.isArray(tools))
        throw new Error("Tools must be a JSON array — e.g. [] or [{...}].");
    } catch (parseErr) {
      setBotStatus(`Tools JSON error: ${parseErr.message}`);
      return;
    }
  }

  setBotStatus("Saving…");
  botSaveBtn.disabled = true;

  try {
    if (activeBotId) {
      // Update existing chatbot
      await request(`/api/chatbots/${activeBotId}`, {
        method: "PATCH",
        body: {
          name,
          custom_instructions: botInstructionsInput.value.trim() || null,
          tools,
        },
      });
      setBotStatus("Chatbot updated.");
    } else {
      // Create new chatbot
      const created = await request("/api/chatbots", {
        method: "POST",
        body: {
          name,
          custom_instructions: botInstructionsInput.value.trim() || null,
          tools,
        },
      });
      // Select the newly created bot right away
      activeBotId = created.id;
      setBotStatus("Chatbot created.");
    }

    // Upload knowledge file if the user selected one
    const knowledgeFile = botKnowledgeFileInput.files[0];
    if (knowledgeFile && activeBotId) {
      setBotStatus("Uploading knowledge file…");
      const base64 = await fileToBase64(knowledgeFile);
      const updated = await request(`/api/chatbots/${activeBotId}/knowledge`, {
        method: "POST",
        body: {
          filename: knowledgeFile.name,
          content_base64: base64,
          mime_type: knowledgeFile.type || "application/octet-stream",
        },
      });
      showKnowledgeFor(activeBotId, updated.knowledge ?? null);
      botKnowledgeFileInput.value = "";
      botKnowledgeFilename.textContent = "";
      setBotStatus("Chatbot saved with knowledge file.");
    }

    botEditor.open = false;
    botEditorSummary.textContent = "Create / Edit";

    const targetChatbotId = activeBotId;
    await loadChatbots();

    // Guard against upstream eventual consistency: if the just-created bot isn't
    // in the refreshed list yet, add it manually so the user sees it immediately.
    if (targetChatbotId && !chatbotList.some((b) => b.id === targetChatbotId)) {
      chatbotList.push({ id: targetChatbotId, name, status: "active" });
      populateBotPicker(chatbotList);
    }
    selectChatbot(targetChatbotId);
  } catch (err) {
    setBotStatus(`Save failed: ${err.message}`);
  } finally {
    botSaveBtn.disabled = false;
  }
});

botDeleteBtn.addEventListener("click", async () => {
  if (!activeBotId) return;
  const bot = chatbotList.find((b) => b.id === activeBotId);
  const botName = bot?.name ?? activeBotId;
  if (!confirm(`Delete chatbot "${botName}"?\n\nThis action cannot be undone.`))
    return;

  try {
    await request(`/api/chatbots/${activeBotId}`, { method: "DELETE" });
    stopKnowledgePolling();
    // activeBotId must already be null before this renders — the no-file
    // branch now keys the row's visibility on it, so clearing in the other
    // order would leave the row stuck showing "No file" for a chatbot that
    // no longer exists and isn't selected.
    activeBotId = null;
    renderKnowledgeBadges(null);
    chatHistory = [];
    chatLog.replaceChildren();
    await loadChatbots();
    setBotStatus("Chatbot deleted.");
  } catch (err) {
    setBotStatus(`Delete failed: ${err.message}`);
  }
});

// ── Chat ───────────────────────────────────────────────────────────────────

/**
 * Show or hide the chat UI depending on whether a bot is active and the
 * presenter is ready. If only one condition is met, show a contextual hint.
 */
function updateChatUI() {
  const ready = canSend();

  // Chat is available as soon as the active source can answer — no presenter
  // required. speak() already silently skips audio when the presenter isn't
  // ready, so the text conversation works independently of presenter state.
  chatContent.hidden = !ready;
  sourceLabel.textContent =
    source === "connect" ? "Connect Chatbot" : "Your own LLM";
  syncChatControls();

  if (ready) {
    chatPlaceholder.hidden = true;
    return;
  }

  chatPlaceholder.hidden = false;
  if (source === "connect") {
    // "Select" is the wrong verb when there is nothing to select from, which
    // is every brand-new organization.
    const verb = chatbotList.length ? "Select" : "Create";
    chatHintText.textContent = presenterReady
      ? `${verb} a chatbot to start chatting.`
      : `${verb} a chatbot to chat. Launch the presenter first to also hear the replies.`;
  } else {
    // The only way to land here: the own-LLM source is selected but the server
    // reported chat: false. Say which variable, not just "unavailable".
    chatHintText.textContent =
      "Set LLM_API_KEY in .env and restart the server to use your own model.";
  }
}

/**
 * Append a message bubble to the chat log.
 * @param {"user"|"assistant"|"error"} role
 * @param {string} text
 */
function appendChat(role, text) {
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;
  el.textContent = text;
  chatLog.append(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

/**
 * Cut the current performance short and release the Send lock. Shared by the
 * Stop button and by the tab going into the background (below) — the two
 * ways a performance can end without ALL_PERFORMANCE_FINISHED ever arriving.
 */
function interruptSpeaking() {
  appendDebug("cmd", "presenter.interruptPresentation()");
  presenter.interruptPresentation?.();
  // interruptPresentation() cancels the queue, so ALL_PERFORMANCE_FINISHED is
  // not coming for the performance we just cut short — leave the speaking state
  // here rather than waiting for an event that will never arrive.
  setSpeaking(false);
}

chatStopBtn.addEventListener("click", () => {
  interruptSpeaking();
  if (typeof isLiveMode !== "undefined" && isLiveMode) {
    toggleLiveMode(false);
  }
});

// Text visibility toggle. Hides the whole transcript element ([hidden] is
// display:none!important — see the reset at the top of style.css), not just
// each message's text: new replies still append underneath while off, so
// switching back on immediately shows the full conversation, not just what
// arrived after.
textVisibilityToggle.addEventListener("change", () => {
  chatLog.hidden = !textVisibilityToggle.checked;
});

// <sv-presenter> already interrupts itself when the tab backgrounds, but
// that only ever dispatches PERFORMANCE_END, never ALL_PERFORMANCE_FINISHED
// (that one only fires when the speech queue drains on its own). Studio's
// send lock is keyed on ALL_PERFORMANCE_FINISHED, so both Stop and the
// presenter's own auto-interrupt leave it stuck unless we release it here
// too. PERFORMANCE_END isn't a substitute to listen for instead: it fires
// once per queued clip, not once for the whole performance, so it would
// unlock mid-utterance.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSpeaking) interruptSpeaking();
});

// ── Wire formats ───────────────────────────────────────────────────────────
//
// The only place the two sources actually differ. Everything above and below
// this pair — the lock lifecycle, the history window, the presenter calls — is
// identical no matter which one is answering.

/** Connect's parts-based shape: `{ role, parts: [{ type, text }] }`. */
const toConnectMessages = (turns) =>
  turns.map(({ role, text }) => ({ role, parts: [{ type: "text", text }] }));

/** OpenAI's shape: `{ role, content }`. Used by /api/chat for both providers. */
const toOpenAiMessages = (turns) =>
  turns.map(({ role, text }) => ({ role, content: text }));

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitChatMessage(chatInput.value.trim());
});

personaChips?.addEventListener("click", (e) => {
  const btn = e.target.closest(".persona-btn, .persona-chip");
  if (!btn) return;
  const personaKey = btn.getAttribute("data-persona");
  if (personaKey) {
    setActivePersona(personaKey);
  }
});

/**
 * Send `text` through the active source (Connect chatbot or own LLM) and hand
 * the reply to the presenter. The one path both typed submissions and voice
 * input go through — voice input just populates chatInput and calls this same
 * function instead of getting its own copy of this flow.
 * @param {string} text
 */
async function submitChatMessage(text) {
  if (!text || !canSend()) return;

  if (isSpeaking) {
    interruptSpeaking();
  }

  chatInput.value = "";
  setAwaitingReply(true);
  let queued = false;

  // Add user message to history and display it
  appendChat("user", text);
  const promptText =
    activePersona && PERSONA_CONFIGS[activePersona]
      ? `${PERSONA_CONFIGS[activePersona].prefix}${text}`
      : text;
  chatHistory.push({ role: "user", text: promptText });

  // Signal "thinking" on the presenter while the LLM processes the request
  appendDebug("cmd", "presenter.setThinking(true)");
  presenter.setThinking?.(true);
  presenter.setListening?.(false);

  const route =
    source === "connect" ? `/api/chatbots/${activeBotId}/chat` : "/api/chat";
  appendDebug("cmd", `POST ${route}`);
  try {
    // Send only the last MAX_HISTORY_TURNS turns. Gemini (the LLM powering the
    // Connect chatbot) has a fixed backend deadline, and an unbounded history
    // grows the prompt until it exceeds it → 504 DEADLINE_EXCEEDED. The same
    // bound is applied on the own-LLM path: every provider has some ceiling,
    // and /api/chat enforces one server-side too. The full history stays in
    // chatHistory for display in the chat log.
    const MAX_HISTORY_TURNS = 20; // 10 user + 10 assistant messages
    const windowed = chatHistory.slice(-MAX_HISTORY_TURNS);

    // The one fork. Two routes, two wire formats, two response shapes —
    // and from `reply` onward the code is shared again.
    let reply = null;
    let failureReason = null;

    if (source === "connect") {
      // POST /api/chatbots/:id/chat → { id, status, reply_text }
      const res = await request(route, {
        method: "POST",
        body: { messages: toConnectMessages(windowed) },
      });
      if (res.status === "succeeded" && res.reply_text) {
        reply = res.reply_text;
      } else {
        failureReason =
          res.status === "failed"
            ? "The chatbot failed to generate a response."
            : `Unexpected response (status: ${res.status}).`;
      }
    } else {
      // POST /api/chat → OpenAI-compatible { choices: [{ message: { content } }] }
      const res = await request(route, {
        method: "POST",
        body: {
          messages: [
            { role: "system", content: OWN_LLM_SYSTEM_PROMPT },
            ...toOpenAiMessages(windowed),
          ],
        },
      });
      reply = res.choices?.[0]?.message?.content?.trim() || null;
      if (!reply) failureReason = "The model returned an empty reply.";
    }

    if (reply) {
      appendChat("assistant", reply);
      appendDebug(
        "ok",
        `Reply: “${reply.length > 60 ? reply.slice(0, 60) + "…" : reply}”`,
      );
      // Add assistant turn to history so follow-up messages have full context
      chatHistory.push({ role: "assistant", text: reply });
      // Hand the reply text to the presenter for speech + motion playback
      queued = await speak(reply);
    } else {
      // Roll back the user turn — no usable assistant reply was produced.
      // Without this pop, the orphaned user turn would be re-sent on every
      // subsequent message, producing consecutive role:"user" entries that
      // break the multi-turn format both APIs expect.
      chatHistory.pop();
      appendChat("error", failureReason);
      appendDebug("err", failureReason);
      presenter.setThinking?.(false);
    }
  } catch (err) {
    // Roll back the user turn so a retry doesn't send a duplicate.
    chatHistory.pop();
    const subscriptionIssue = isSubscriptionIssue(err.data?.code);
    const errorText = subscriptionIssue
      ? subscriptionIssueReply
      : `${err.message}`;
    appendChat("error", errorText);
    appendDebug(
      "err",
      // Only the subscription-issue reply is deliberately generic in the chat
      // bubble above — its raw `details` (org_id and all) goes to this panel
      // instead, which is why this branch reaches into err.data?.details
      // rather than reusing err.message. Every other failure's `details`
      // already reached the bubble via err.message (request() prioritizes it
      // — see the fallback chain there), so this just re-prefixes the same
      // string; Studio is a local dev tool, so that's fine here.
      subscriptionIssue
        ? `Subscription issue (code ${err.data?.code}): ${err.data?.details ?? ""}`
        : `API error: ${err.message}`,
    );
    presenter.setThinking?.(false);
  } finally {
    // Once a performance is queued, ALL_PERFORMANCE_FINISHED or Stop owns the
    // unlock — releasing here too is exactly what let the send button come back
    // while the avatar was still speaking. Every other path queued nothing, so
    // no such event is coming and this is the only place left to unlock.
    setAwaitingReply(false);
    if (!queued) setSpeaking(false);
  }
}

// ── Voice input (Web Speech API) & Live Mode ──────────────────────────────
//
// Connect Kit has no speech-to-text API of its own, so this uses the
// browser's native SpeechRecognition — free, no extra credentials, but
// Chrome/Edge only (not Firefox).
//
// Live Mode provides hands-free continuous conversation:
// 1. Audio input stays active in a turn-taking loop.
// 2. Microphone pauses while the avatar is speaking (preventing audio feedback).
// 3. Once the avatar finishes, listening automatically resumes.
// 4. A rich animated sound wave visualizer and stage HUD show listening state.

const SpeechRecognitionImpl =
  window.SpeechRecognition || window.webkitSpeechRecognition;
const micSupported = Boolean(SpeechRecognitionImpl);

/** True while recognition is actively listening. */
let isListening = false;
/** True when hands-free continuous Live Mode is enabled. */
let isLiveMode = false;
/** Accumulated final-result text for the current listening session. */
let finalTranscript = "";
/** Error code from the 'error' event. */
let micErrorCode = null;
/** Timer for restarting recognition in Live Mode. */
let liveModeRestartTimer = null;
/** SpeechRecognition instance. */
let recognition = null;

// Web Audio API for dynamic voice reactivity
let audioCtx = null;
let analyserNode = null;
let micStream = null;
let vizAnimFrameId = null;

function setMicStatus(text) {
  micStatus.textContent = text;
}

function showListeningVisualizer(status = "Listening…", interim = "Speak naturally") {
  if (audioListeningPanel) {
    audioListeningPanel.hidden = false;
  }
  if (listeningStatusText) {
    listeningStatusText.textContent = status;
  }
  if (listeningInterimText) {
    listeningInterimText.textContent = interim;
  }
  if (stageListeningHud) {
    stageListeningHud.hidden = false;
  }
  if (stageHudText) {
    stageHudText.textContent = status;
  }
  startAudioVisualizer();
}

function updateListeningStatus(status, interim) {
  if (listeningStatusText && status) {
    listeningStatusText.textContent = status;
  }
  if (listeningInterimText && interim !== undefined) {
    listeningInterimText.textContent = interim;
  }
  if (stageHudText && status) {
    stageHudText.textContent = status;
  }
}

function updateListeningInterim(text) {
  if (listeningInterimText) {
    listeningInterimText.textContent = text ? `“${text}”` : "Speak naturally";
  }
  if (stageHudText) {
    stageHudText.textContent = text ? `“${text.length > 25 ? "…" + text.slice(-22) : text}”` : "Listening…";
  }
}

function hideListeningVisualizer() {
  if (audioListeningPanel) {
    audioListeningPanel.hidden = true;
  }
  if (stageListeningHud) {
    stageListeningHud.hidden = true;
  }
  stopAudioVisualizer();
}

async function startAudioVisualizer() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    if (!micStream) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    if (!analyserNode && micStream) {
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 64;
      analyserNode.smoothingTimeConstant = 0.5;
      const source = audioCtx.createMediaStreamSource(micStream);
      source.connect(analyserNode);
    }
    drawAudioVisualizer();
  } catch {
    // If Web Audio API is restricted or not permitted, CSS keyframes animate smoothly
  }
}

function drawAudioVisualizer() {
  if (!isListening || !analyserNode) return;
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
  analyserNode.getByteFrequencyData(dataArray);

  const bars = document.querySelectorAll(".audio-wave-bars .wave-bar");
  if (bars.length > 0) {
    const step = Math.max(1, Math.floor(dataArray.length / bars.length));
    bars.forEach((bar, idx) => {
      const val = dataArray[idx * step] || 0;
      const height = Math.max(5, Math.min(24, Math.round((val / 255) * 24 + 4)));
      bar.style.height = `${height}px`;
    });
  }

  const hudBars = document.querySelectorAll(".stage-hud-bars .hud-bar");
  if (hudBars.length > 0) {
    const step = Math.max(1, Math.floor(dataArray.length / hudBars.length));
    hudBars.forEach((bar, idx) => {
      const val = dataArray[idx * step] || 0;
      const height = Math.max(4, Math.min(14, Math.round((val / 255) * 14 + 3)));
      bar.style.height = `${height}px`;
    });
  }

  vizAnimFrameId = requestAnimationFrame(drawAudioVisualizer);
}

function stopAudioVisualizer() {
  if (vizAnimFrameId) {
    cancelAnimationFrame(vizAnimFrameId);
    vizAnimFrameId = null;
  }
  const bars = document.querySelectorAll(".audio-wave-bars .wave-bar");
  bars.forEach((bar) => {
    bar.style.height = "";
  });
  const hudBars = document.querySelectorAll(".stage-hud-bars .hud-bar");
  hudBars.forEach((bar) => {
    bar.style.height = "";
  });
}

function scheduleLiveModeRestart(delayMs = 250) {
  if (liveModeRestartTimer) {
    clearTimeout(liveModeRestartTimer);
    liveModeRestartTimer = null;
  }
  liveModeRestartTimer = setTimeout(() => {
    liveModeRestartTimer = null;
    if (isLiveMode && !isListening && !isSpeaking && !isAwaitingReply && canSend()) {
      startSpeechRecognition();
    }
  }, delayMs);
}

function startSpeechRecognition() {
  if (!recognition || isListening) return;
  setMicStatus("");
  finalTranscript = "";
  try {
    recognition.start();
  } catch (err) {
    console.debug("Recognition start notice:", err);
  }
}

function stopSpeechRecognition() {
  if (!recognition || !isListening) return;
  try {
    recognition.stop();
  } catch (err) {
    console.debug("Recognition stop notice:", err);
  }
}

function toggleLiveMode(forceState) {
  const next = typeof forceState === "boolean" ? forceState : !isLiveMode;
  isLiveMode = next;

  if (liveModeBtn) {
    liveModeBtn.classList.toggle("active", isLiveMode);
    const label = liveModeBtn.querySelector(".live-text");
    if (label) {
      label.textContent = isLiveMode ? "Live: ON" : "Live Mode";
    }
  }

  if (isLiveMode) {
    setMicStatus("Live mode active — speak naturally. Audio input will keep running between turns.");
    if (isSpeaking) {
      interruptSpeaking();
    }
    if (!isListening && !isAwaitingReply && canSend()) {
      startSpeechRecognition();
    }
  } else {
    if (liveModeRestartTimer) {
      clearTimeout(liveModeRestartTimer);
      liveModeRestartTimer = null;
    }
    if (isListening) {
      stopSpeechRecognition();
    }
    hideListeningVisualizer();
    setMicStatus("");
  }
}

if (!micSupported) {
  micBtn.hidden = true;
  if (liveModeBtn) liveModeBtn.hidden = true;
  setMicStatus(
    "Voice input isn't supported in this browser — try Chrome or Edge. Typing still works.",
  );
} else {
  recognition = new SpeechRecognitionImpl();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.addEventListener("start", () => {
    isListening = true;
    micErrorCode = null;
    micBtn.classList.add("listening");
    micBtn.title = "Stop voice input";
    micBtn.setAttribute("aria-label", "Stop voice input");
    const status = isLiveMode ? "Live Mode: Listening…" : "Listening…";
    setMicStatus(status);
    showListeningVisualizer(status, "Speak naturally");
    syncChatControls();
  });

  recognition.addEventListener("result", (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) finalTranscript += result[0].transcript;
      else interim += result[0].transcript;
    }
    const current = (finalTranscript + interim).trim();
    chatInput.value = current;
    updateListeningInterim(current);
  });

  recognition.addEventListener("speechend", () => {
    recognition.stop();
  });

  recognition.addEventListener("error", (e) => {
    micErrorCode = e.error;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      setMicStatus(
        "Microphone access denied — allow it in your browser's site settings to use voice input.",
      );
      if (isLiveMode) {
        toggleLiveMode(false);
      }
    } else if (e.error === "no-speech") {
      if (!isLiveMode) {
        setMicStatus("No speech detected.");
      }
    } else if (e.error !== "aborted") {
      setMicStatus(`Voice input error: ${e.error}`);
    }
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.title = "Voice input";
    micBtn.setAttribute("aria-label", "Start voice input");
    stopAudioVisualizer();
    syncChatControls();

    const text = finalTranscript.trim();
    finalTranscript = "";

    if (micErrorCode && micErrorCode !== "no-speech") {
      micErrorCode = null;
      if (!isLiveMode) hideListeningVisualizer();
      return;
    }
    micErrorCode = null;

    if (text) {
      setMicStatus("");
      chatInput.value = text;
      submitChatMessage(text);
    } else if (isLiveMode && !isSpeaking && !isAwaitingReply && canSend()) {
      scheduleLiveModeRestart(200);
    } else if (!isLiveMode) {
      setMicStatus("");
      hideListeningVisualizer();
    }
  });

  micBtn.addEventListener("click", () => {
    if (isSpeaking) {
      interruptSpeaking();
    }
    if (isListening) {
      stopSpeechRecognition();
      if (isLiveMode) {
        toggleLiveMode(false);
      }
      return;
    }
    setMicStatus("");
    startSpeechRecognition();
  });

  liveModeBtn?.addEventListener("click", () => {
    toggleLiveMode();
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Record that a performance opened or closed, then re-derive the controls.
 * @param {boolean} speaking
 */
function setSpeaking(speaking) {
  isSpeaking = speaking;
  syncChatControls();
  if (speaking) {
    if (isLiveMode) {
      updateListeningStatus("Avatar speaking…", "Microphone paused during reply");
    }
  } else {
    chatInput.focus();
    if (isLiveMode && canSend()) {
      scheduleLiveModeRestart(350);
    }
  }
}

/**
 * Record that a chatbot request opened or closed, then re-derive the controls.
 * @param {boolean} awaiting
 */
function setAwaitingReply(awaiting) {
  isAwaitingReply = awaiting;
  syncChatControls();
  if (awaiting && isLiveMode) {
    updateListeningStatus("Thinking…", "Processing response");
  }
}

/**
 * The only place the chat controls' enabled state is computed. Both inputs are
 * read here — whether a performance is open, and whether a chatbot is selected —
 * because anything that writes one of these properties while knowing only one of
 * the two will silently undo the other. That is exactly how selecting a chatbot
 * mid-speech used to re-enable Send.
 */
/**
 * Whether the active source has everything it needs to answer. The asymmetry
 * is real and deliberate: Connect needs a chatbot picked first, the own-LLM
 * path needs only a key the server already confirmed.
 */
function canSend() {
  return source === "connect" ? Boolean(activeBotId) : ownLlmAvailable;
}

/**
 * Switch which model answers. Nothing about the conversation is reset — the
 * history carries across, so the next reply comes from the other provider with
 * the same context. That continuity is the point: it is the only way to see
 * the two sources answer the *same* conversation.
 */
function setSource(next) {
  source = next;
  // The chatbot picker is Connect-only machinery; hiding it keeps the sidebar
  // honest about what the active source actually uses.
  chatbotManager.hidden = next !== "connect";
  updateChatUI();
}

sourceRadios.forEach((radio) =>
  radio.addEventListener("change", () => {
    if (radio.checked) setSource(radio.value);
  }),
);

// /api/chat 501s without LLM_API_KEY, and appConfig.chat is how the server
// says so. Until this demo read that flag it was reported and ignored — the
// participant found out by sending a message and getting an error back.
if (!ownLlmAvailable) {
  sourceOwnRadio.disabled = true;
  sourceOwnHint.hidden = false;
}

function syncChatControls() {
  const busy = isSpeaking || isAwaitingReply;
  // Stop follows the performance alone: there is nothing to interrupt while a
  // request is merely in flight.
  chatStopBtn.disabled = !isSpeaking;
  chatSendBtn.disabled = isAwaitingReply || !canSend();
  chatInput.disabled = isAwaitingReply;
  // Same gate as Send, except while actively listening — that state must stay
  // clickable so the button can also act as Stop.
  if (micSupported) micBtn.disabled = !isListening && (isAwaitingReply || !canSend());
  if (personaChips) {
    for (const chip of personaChips.querySelectorAll(".persona-btn, .persona-chip")) {
      chip.disabled = isAwaitingReply;
    }
  }
  if (liveModeBtn) {
    liveModeBtn.disabled = !canSend();
  }
}

function setStatus(text) {
  statusMsg.textContent = text;
}

function setBotStatus(text) {
  botStatusMsg.textContent = text;
}

// ── Knowledge file helpers ────────────────────────────────────────────────

/** Mirrors KNOWLEDGE_MAX_FILE_BYTES in server.mjs, which is the real check. */
const KNOWLEDGE_MAX_FILE_BYTES = 1 * 1024 * 1024;

/** Knowledge status badge copy & CSS class map. */
const KNOWLEDGE_STATUS_MAP = {
  processing: { label: "Processing…", badgeClass: "processing" },
  ready: { label: "Ready", badgeClass: "ready" },
  error: { label: "Error", badgeClass: "error" },
  stalled: { label: "Stalled", badgeClass: "stalled" },
};

/**
 * Paint both knowledge badges from one status-map entry — the full badge
 * inside the editor (prefixed with the polled file's name when known) and
 * the compact indicator next to the bot picker (always a bare label). The
 * one place that knows this shared rendering rule; used by
 * renderKnowledgeBadges, showKnowledgeStalledNotice, and
 * startKnowledgePolling's own immediate "Processing…" repaint.
 * @param {string} label
 * @param {string} badgeClass
 */
function paintKnowledgeBadges(label, badgeClass) {
  const text = knowledgePolledFileName
    ? `${knowledgePolledFileName} — ${label}`
    : label;
  botKnowledgeStatus.textContent = text;
  botKnowledgeStatus.className = `knowledge-badge knowledge-badge--${badgeClass}`;
  botKnowledgeIndicator.textContent = text;
  botKnowledgeIndicator.className = `knowledge-badge knowledge-badge--${badgeClass}`;
}

/**
 * Render the knowledge badges, the Remove button, and the compact indicator
 * from a knowledge DO. Pure rendering — no side effects on polling. Called on
 * load, after upload, after removal, and on every tick of the poll loop.
 *
 * A caller that just learned a fresh status and wants polling armed when it's
 * still "processing" calls showKnowledgeFor(botId, knowledge) instead, which
 * wraps this. Kept as two separate functions on purpose: an optional botId
 * parameter here would be a silent footgun — the poll tick's own continuation
 * must repaint without ever re-arming itself, and "someone later passes botId
 * where this function is called" is exactly the kind of edit that looks like
 * a harmless fix.
 * @param {{ name: string, status: string } | null} knowledge
 */
function renderKnowledgeBadges(knowledge) {
  hideKnowledgeStalledNotice();
  if (!knowledge) {
    knowledgePolledFileName = null;
    paintKnowledgeBadges("No file", "none");
    botKnowledgeRemoveBtn.hidden = true;
    // Hide the compact row only when nothing is selected at all — a
    // selected chatbot with no knowledge file is exactly the common case
    // the row exists to answer at a glance, not one to disappear for.
    botKnowledgeIndicatorRow.hidden = !activeBotId;
    return;
  }
  knowledgePolledFileName = knowledge.name;
  const { label, badgeClass } = KNOWLEDGE_STATUS_MAP[knowledge.status] ?? {
    label: knowledge.status,
    badgeClass: "none",
  };
  paintKnowledgeBadges(label, badgeClass);
  botKnowledgeRemoveBtn.hidden = false;
  botKnowledgeIndicatorRow.hidden = false;
}

/**
 * Render a fresh knowledge status and arm polling when it's still
 * "processing". Only for callers establishing a *new* view of a bot's status
 * (an upload response, opening the editor, switching chatbots) — never for
 * the poll tick's own continuation, which calls renderKnowledgeBadges
 * directly instead: routing every tick through this would reset the deadline
 * and invalidate the tick's own generation on every single tick.
 * @param {string} botId
 * @param {{ name: string, status: string } | null} knowledge
 */
function showKnowledgeFor(botId, knowledge) {
  renderKnowledgeBadges(knowledge);
  if (knowledge?.status === "processing") {
    startKnowledgePolling(botId);
  }
}

/** Shown when a poll hits KNOWLEDGE_POLL_TIMEOUT_MS without reaching ready/error. */
function showKnowledgeStalledNotice() {
  botKnowledgeStalledNotice.hidden = false;
  // Painted through the shared helper (not just a color swap) — a badge
  // still reading "Processing…" in stalled gray reads as a mistake, not as
  // "waiting on you".
  const { label, badgeClass } = KNOWLEDGE_STATUS_MAP.stalled;
  paintKnowledgeBadges(label, badgeClass);
}

function hideKnowledgeStalledNotice() {
  botKnowledgeStalledNotice.hidden = true;
}

/**
 * Poll `GET /api/chatbots/:id` every KNOWLEDGE_POLL_INTERVAL_MS until its
 * knowledge status leaves "processing", or KNOWLEDGE_POLL_TIMEOUT_MS elapses.
 * Restarts cleanly if a poll for this or another bot is already running.
 * Uses a setTimeout chain rather than setInterval so a slow request can never
 * overlap with the next tick — the next poll is only ever scheduled after the
 * current one has fully resolved.
 * @param {string} botId
 */
function startKnowledgePolling(botId) {
  stopKnowledgePolling();
  hideKnowledgeStalledNotice();
  // Show "Processing…" immediately rather than leaving a stale "Stalled"
  // badge on screen for the ~5s gap before the first tick lands — this is
  // also what "Check again" resumes into.
  const { label, badgeClass } = KNOWLEDGE_STATUS_MAP.processing;
  paintKnowledgeBadges(label, badgeClass);
  knowledgePollDeadline = Date.now() + KNOWLEDGE_POLL_TIMEOUT_MS;
  scheduleKnowledgePoll(botId, knowledgePollGeneration);
}

/**
 * @param {string} botId
 * @param {number} generation the value of knowledgePollGeneration when this
 *   poll started — every reschedule threads the same value through so a tick
 *   can tell whether a stop/restart happened since it was scheduled.
 */
function scheduleKnowledgePoll(botId, generation) {
  knowledgePollTimer = setTimeout(async () => {
    // Superseded by a later stop or restart (Remove clicked, bot switched,
    // editor reopened) — bail without touching state that now belongs to a
    // different poll, or to nothing.
    if (generation !== knowledgePollGeneration) return;
    // The user may have switched bots without going through stop/restart.
    if (botId !== activeBotId) {
      stopKnowledgePolling();
      return;
    }
    // Checked on every tick — including ones that only ever hit the catch
    // below — so a run of failures still respects the ceiling instead of
    // retrying forever.
    if (Date.now() > knowledgePollDeadline) {
      stopKnowledgePolling();
      showKnowledgeStalledNotice();
      return;
    }
    let detail;
    try {
      detail = await request(`/api/chatbots/${botId}`);
    } catch (err) {
      console.error("Knowledge status poll failed:", err);
      // transient — retry next tick until the deadline, unless superseded
      // while this request was in flight.
      if (generation === knowledgePollGeneration) {
        scheduleKnowledgePoll(botId, generation);
      }
      return;
    }
    // ...and may have been superseded, or switched bots, while that request
    // was in flight.
    if (generation !== knowledgePollGeneration || botId !== activeBotId) return;
    renderKnowledgeBadges(detail.knowledge ?? null);
    if (detail.knowledge?.status === "processing") {
      scheduleKnowledgePoll(botId, generation);
    } else {
      stopKnowledgePolling();
    }
  }, KNOWLEDGE_POLL_INTERVAL_MS);
}

function stopKnowledgePolling() {
  // Invalidates any tick already scheduled or in flight under the current
  // generation — see scheduleKnowledgePoll's own comment.
  knowledgePollGeneration++;
  if (knowledgePollTimer !== null) {
    clearTimeout(knowledgePollTimer);
    knowledgePollTimer = null;
  }
  knowledgePollDeadline = null;
}

/**
 * Read a File as a base64-encoded data string (without the data-URL prefix).
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(/** @type {string} */ (reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Show selected file name next to the file picker, rejecting oversized files
// here so the user is not made to wait for a base64 upload the server refuses.
botKnowledgeFileInput.addEventListener("change", () => {
  const file = botKnowledgeFileInput.files[0];
  if (file && file.size > KNOWLEDGE_MAX_FILE_BYTES) {
    botKnowledgeFileInput.value = "";
    botKnowledgeFilename.textContent = "";
    setBotStatus(
      `"${file.name}" is too large. Maximum size is ${KNOWLEDGE_MAX_FILE_BYTES / (1024 * 1024)} MB.`,
    );
    return;
  }
  botKnowledgeFilename.textContent = file ? file.name : "";
});

// Remove knowledge file from the active chatbot
botKnowledgeRemoveBtn.addEventListener("click", async () => {
  if (!activeBotId) return;
  if (!confirm("Remove the knowledge file from this chatbot?")) return;
  try {
    setBotStatus("Removing knowledge file…");
    const updated = await request(`/api/chatbots/${activeBotId}/knowledge`, {
      method: "DELETE",
    });
    stopKnowledgePolling();
    renderKnowledgeBadges(updated.knowledge ?? null);
    setBotStatus("Knowledge file removed.");
  } catch (err) {
    setBotStatus(`Remove failed: ${err.message}`);
  }
});

// Resume auto-polling after startKnowledgePolling gave up at its timeout.
botKnowledgePollResumeBtn.addEventListener("click", () => {
  if (!activeBotId) return;
  startKnowledgePolling(activeBotId);
});

// ── Function tools helpers ────────────────────────────────────────────────

/**
 * A ready-to-use example tool: weather lookup via wttr.in (no API key needed).
 * Good for hackathon demos because it works immediately without any signup.
 */
const TOOL_EXAMPLE = [
  {
    name: "get_weather",
    description:
      "Look up the current weather for a city. Use this when the user asks about weather, temperature, or forecast.",
    settings: {
      request: {
        method: "get",
        url: "https://wttr.in",
        query_params: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name in English, e.g. Taipei",
            },
            format: {
              type: "string",
              description:
                "Response format. ALWAYS pass the literal string value '3'",
            },
          },
          required: ["location", "format"],
        },
      },
      auth: { secret_type: "no_auth" },
      response: { body_schema: {} },
    },
  },
];

// Load the example tool JSON into the tools textarea
botToolsExampleBtn.addEventListener("click", () => {
  botToolsInput.value = JSON.stringify(TOOL_EXAMPLE, null, 2);
  botToolsInput.focus();
});

/**
 * Append a timestamped entry to the debug timeline panel.
 *
 * Types and their meaning:
 *   user  — the user sent a message
 *   api   — an API call is in-flight
 *   bot   — chatbot reply received
 *   cmd   — a command sent to sv-presenter (present, setThinking…)
 *   sdk   — an event emitted by the sv-presenter SDK
 *   ok    — a successful outcome
 *   err   — an error
 *
 * @param {"user"|"api"|"bot"|"cmd"|"sdk"|"ok"|"err"} type
 * @param {string} message
 */
function appendDebug(type, message) {
  const now = new Date();
  const ts =
    [
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":") +
    "." +
    String(now.getMilliseconds()).padStart(3, "0");

  const li = document.createElement("li");
  li.className = `debug-entry debug-entry--${type}`;

  const tsEl = document.createElement("span");
  tsEl.className = "debug-ts";
  tsEl.textContent = ts;

  const msgEl = document.createElement("span");
  msgEl.className = "debug-msg";
  msgEl.textContent = message;

  li.append(tsEl, msgEl);
  debugLog.append(li);
  debugLog.scrollTop = debugLog.scrollHeight;
}

debugClearBtn.addEventListener("click", () => {
  debugLog.replaceChildren();
});

botIdCopy.addEventListener("click", () => {
  if (!activeBotId) return;
  navigator.clipboard.writeText(activeBotId).then(() => {
    const prev = botIdCopy.textContent;
    botIdCopy.textContent = "Copied!";
    setTimeout(() => {
      botIdCopy.textContent = prev;
    }, 1500);
  });
});

// ── Bootstrap ──────────────────────────────────────────────────────────────
//
// Runs last, once every handler above is attached, and swallows its own
// failures. The three calls are independent; only the presenter engine's
// absence is survivable, and Launch is disabled when it is.

await Promise.all([
  loadCatalog(),
  loadChatbots(),
  isPresenterLaunchDisabled
    ? Promise.resolve()
    : loadPresenterEngine(appConfig.presenterUrl).then(
        () => {
          presenterEngineReady = true;
          updateInitBtn();
        },
        (err) => {
          stagePlaceholder.querySelector("p").textContent =
            "Presenter engine unavailable — check PRESENTER_URL and the browser console. Chat still works as text.";
          setStatus(`Presenter engine failed to load: ${err.message}`);
          console.error(err);
        },
      ),
]);
if (defaultChatbotMissing) {
  console.warn(
    `Default chatbot "${DEFAULT_CHATBOT_NAME}" was not found in this account — none was auto-selected. Create one with this exact name to have it picked up automatically on the next load.`,
  );
}
updateChatUI();

// Auto-launch on load — avatar/scene both already default to a fixed choice
// (see the fillSelect calls in loadCatalog), so nothing else blocks this
// once the presenter engine itself has loaded.
if (
  !isPresenterLaunchDisabled &&
  presenterEngineReady &&
  avatarSelect.value &&
  sceneSelect.value
) {
  launchPresenter();
}

// Browser autoplay policy blocks resumeAudioPlayback() unless it runs from a
// real user gesture — which the automatic launch above doesn't have, so the
// avatar comes up but starts silent. This listens for the very first actual
// interaction anywhere on the page (a click, a tap, a keypress — typing a
// chat message included) and uses it to unlock audio retroactively, once, so
// speech starts working without the visitor needing to find and click
// anything in particular first.
function unlockAudioOnce() {
  presenter.resumeAudioPlayback?.();
  document.removeEventListener("pointerdown", unlockAudioOnce);
  document.removeEventListener("keydown", unlockAudioOnce);
}
document.addEventListener("pointerdown", unlockAudioOnce, { once: true });
document.addEventListener("keydown", unlockAudioOnce, { once: true });
