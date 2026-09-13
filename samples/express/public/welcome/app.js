/**
 * LifeStack — Welcome page
 *
 * Scaffolded from demos/embed/app.js (the reference pattern for a real
 * product page — see samples/express/AGENTS.md): fixed target from
 * GET /api/config, no pickers, no chat UI here. The one deliberate
 * difference from Embed: initializeWithConnectKey() itself waits for the
 * "Enter" click rather than firing on page load. That single real user
 * gesture is what the browser's autoplay policy requires before any audio
 * can play — see resumeAudioPlayback below — so putting init behind it
 * guarantees the avatar's first spoken line is actually heard, not silent
 * (the risk with an unprompted auto-launch: see samples/express/public/
 * demos/studio/app.js's unlockAudioOnce for that trade-off elsewhere).
 *
 * Zero dependencies — plain ESM, no build step required.
 */

const presenter = document.getElementById("presenter");
const enterBtn = document.getElementById("enter-btn");
const enterBtnLabel = enterBtn.querySelector(".enter-btn-label");
const stagePlaceholder = document.getElementById("stage-placeholder");
const stageError = document.getElementById("stage-error");

const GREETING =
  "Welcome to LifeStack! I can help as a Senior Cloud Architect, a Driving Instructor, or an Equity Analyst. What would you like to explore?";

// Shown when start() itself fails (bad config, presenter engine unreachable,
// nothing to initialize with) — the real reason only ever goes to
// console.error, same rule Embed follows.
const STAGE_UNAVAILABLE = "The avatar isn't available right now. Please check back soon.";

/** GET-only helper — this page has no POST routes of its own. */
async function request(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.details ?? data.error ?? res.statusText;
    throw Object.assign(new Error(message), { status: res.status, data });
  }
  return data;
}

async function loadPresenterEngine(url) {
  // DEMO-ONLY: url is trusted without host validation — see Embed's app.js.
  await new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), {
      type: "module",
      src: url,
      onload: resolve,
      onerror: () => reject(new Error(`Presenter failed to load: ${url}`)),
    });
    document.head.append(script);
  });
}

// Attach before initializing: Ready is only ever an event, never readable state.
presenter.addEventListener("PRESENTER_STATUS", (event) => {
  if (event.detail?.status !== "Ready") return;
  stagePlaceholder.hidden = true;
  presenter.hidden = false;
  // A plain spoken line, no hand-authored [MOTION] tag — the Connect API
  // auto-selects motion for untagged text (see AGENTS.md), which is the
  // normal case here since this page has no fixed avatar to hand-pick a
  // verified motion id for.
  presenter.present?.(GREETING).then((result) => {
    if (!result?.success) {
      console.error(
        `Welcome: present() failed (${result?.code}): ${result?.message ?? ""}`,
      );
    }
  });
});

let config = null;
let connectKey = null;

/** Resolves everything up to (not including) initializeWithConnectKey — that
 * part waits for the Enter click below. */
async function prepare() {
  const cfg = await request("/api/config");
  const blocker =
    (cfg.mock && "mock mode cannot drive the presenter") ||
    (!cfg.fixedTarget && "no presenter target — see the server's startup log");
  if (blocker) throw new Error(blocker);
  await loadPresenterEngine(cfg.presenterUrl);
  const { connect_key } = await request("/api/connect-key");
  return { cfg, connect_key };
}

enterBtn.addEventListener("click", async () => {
  if (!config || !connectKey) return;
  enterBtn.disabled = true;
  enterBtnLabel.textContent = "Waking up…";
  try {
    // Must run inside this click handler's call stack — see the file header.
    await presenter.resumeAudioPlayback?.();
    await presenter.initializeWithConnectKey(connectKey, config.fixedTarget);
    // Status label from here on is driven by the PRESENTER_STATUS listener above.
  } catch (err) {
    stagePlaceholder.hidden = true;
    stageError.textContent = STAGE_UNAVAILABLE;
    stageError.hidden = false;
    console.error(`Welcome: ${err.message}`);
  }
});

prepare()
  .then(({ cfg, connect_key }) => {
    config = cfg;
    connectKey = connect_key;
    enterBtn.disabled = false;
    enterBtnLabel.textContent = "Meet Your Avatar";
  })
  .catch((err) => {
    stagePlaceholder.hidden = true;
    stageError.textContent = STAGE_UNAVAILABLE;
    stageError.hidden = false;
    console.error(`Welcome: ${err.message}`);
  });

// ── Ambient visuals ────────────────────────────────────────────────────────
//
// Parallax orbs (mousemove-driven) and per-card 3D tilt (per-card mousemove)
// — pure presentation, no presenter/API involvement below this line.

const orbs = document.querySelectorAll(".orb");
document.addEventListener("pointermove", (e) => {
  const xRatio = e.clientX / window.innerWidth - 0.5;
  const yRatio = e.clientY / window.innerHeight - 0.5;
  orbs.forEach((orb, i) => {
    const depth = (i + 1) * 14;
    orb.style.transform = `translate(${xRatio * depth}px, ${yRatio * depth}px)`;
  });
});

document.querySelectorAll(".service-card[data-tilt]").forEach((card) => {
  const maxTilt = 8; // degrees
  card.addEventListener("pointermove", (e) => {
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform =
      `perspective(700px) rotateX(${(-py * maxTilt).toFixed(2)}deg) ` +
      `rotateY(${(px * maxTilt).toFixed(2)}deg) translateY(-4px)`;
  });
  card.addEventListener("pointerleave", () => {
    card.style.transform = "";
  });
});
