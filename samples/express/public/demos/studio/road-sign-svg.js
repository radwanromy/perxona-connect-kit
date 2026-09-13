/**
 * Renders one Japanese road sign as an inline SVG string — real shape and
 * color per the sign's `shape` key (see road-signs.js), not a text
 * description. Pictograms are simplified geometric approximations (this
 * demo has no icon library), but shape, color scheme, and any glyph text
 * printed on the sign are accurate to the real sign.
 */

const svg = (inner, viewBox = "0 0 100 100") =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${inner}</svg>`;

// ── Base shape primitives ────────────────────────────────────────────────

const triangleDown = (fill, stroke) =>
  `<polygon points="50,92 4,14 96,14" fill="${fill}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>`;

const circleShape = (fill, stroke) =>
  `<circle cx="50" cy="50" r="43" fill="${fill}" stroke="${stroke}" stroke-width="8"/>`;

const diamondShape = (fill, stroke) =>
  `<polygon points="50,4 96,50 50,96 4,50" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/>`;

const plateShape = (fill, stroke) =>
  `<rect x="6" y="26" width="88" height="48" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;

const glyphText = (text, size = 26, fill = "#1a1a1a", y = 58) =>
  `<text x="50" y="${y}" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle" font-family="system-ui, sans-serif">${text}</text>`;

// ── Small pictogram fragments (approximations) ───────────────────────────

const barDiagonal = (stroke = "#e02020") =>
  `<line x1="18" y1="82" x2="82" y2="18" stroke="${stroke}" stroke-width="9" stroke-linecap="round"/>`;

const barHorizontal = (stroke = "#ffffff") =>
  `<rect x="18" y="44" width="64" height="12" fill="${stroke}"/>`;

const crossX = (stroke = "#1a3fbf") =>
  `<line x1="26" y1="26" x2="74" y2="74" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>` +
  `<line x1="74" y1="26" x2="26" y2="74" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>`;

const arrowUp = (fill = "#ffffff") =>
  `<polygon points="50,22 72,54 58,54 58,80 42,80 42,54 28,54" fill="${fill}"/>`;

const slopeArrow = (stroke = "#1a1a1a") =>
  `<path d="M20 70 L55 32 L55 46 L78 46" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<polygon points="78,38 90,46 78,54" fill="${stroke}"/>`;

const curveArrow = (stroke = "#1a1a1a") =>
  `<path d="M22 70 C 22 30, 55 30, 55 50 C 55 70, 82 70, 82 34" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round"/>` +
  `<polygon points="76,24 90,34 74,42" fill="${stroke}"/>`;

const pedestrianFigure = (fill = "#1a1a1a") =>
  `<circle cx="50" cy="34" r="8" fill="${fill}"/>` +
  `<path d="M50 44 L50 66 M50 50 L34 58 M50 50 L66 44 M50 66 L38 84 M50 66 L64 82" ` +
  `stroke="${fill}" stroke-width="6" stroke-linecap="round" fill="none"/>`;

const railCross = (stroke = "#1a1a1a") =>
  `<line x1="20" y1="80" x2="80" y2="20" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>` +
  `<line x1="20" y1="20" x2="80" y2="80" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>` +
  glyphText("R", 22, stroke, 40).replace('x="50"', 'x="28"') +
  glyphText("R", 22, stroke, 40).replace('x="50"', 'x="72"');

const brakePedal = (stroke = "#1a1a1a") =>
  `<path d="M50 18 L50 56" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>` +
  `<rect x="26" y="56" width="48" height="14" rx="4" fill="${stroke}"/>`;

// The standard three-lamp red/yellow/green signal head — see the "Traffic
// Light Instructions" this app follows: whenever the conversation is about a
// traffic light, this is the only image that should represent it (never a
// road sign shape), and it must be lit to match the color being discussed.
// `sign.lightColor` ("red"|"yellow"|"green") selects which lamp is lit; the
// other two render dim. A soft glow ring behind the lit lamp is the "on"
// cue, separate from color alone.
const TRAFFIC_LIGHT_ON = { red: "#e02020", yellow: "#ffcc33", green: "#1a8a4a" };
const TRAFFIC_LIGHT_OFF = { red: "#5a2422", yellow: "#5c4f26", green: "#20402c" };
const TRAFFIC_LIGHT_LAMP_Y = { red: 34, yellow: 80, green: 126 };

const trafficLightLamp = (color, activeColor) => {
  const isOn = color === activeColor;
  const cy = TRAFFIC_LIGHT_LAMP_Y[color];
  const glow = isOn
    ? `<circle cx="50" cy="${cy}" r="30" fill="${TRAFFIC_LIGHT_ON[color]}" opacity="0.3"/>`
    : "";
  const fill = isOn ? TRAFFIC_LIGHT_ON[color] : TRAFFIC_LIGHT_OFF[color];
  return (
    glow +
    `<circle cx="50" cy="${cy}" r="22" fill="${fill}" stroke="#111" stroke-width="3"/>`
  );
};

const trafficLightHousing = (activeColor) =>
  `<rect x="12" y="4" width="76" height="152" rx="16" fill="#1c1c1c" stroke="#000" stroke-width="3"/>` +
  trafficLightLamp("red", activeColor) +
  trafficLightLamp("yellow", activeColor) +
  trafficLightLamp("green", activeColor);

// ── Full-sign renderers, keyed by `shape` in road-signs.js ───────────────

const SHAPE_RENDERERS = {
  // Regulatory — red
  invertedTriangleRed: (sign) =>
    svg(
      triangleDown("#ffffff", "#e02020") +
        glyphText(sign.glyph ?? "", 18, "#1a1a1a", 60),
    ),
  circleRedBar: () =>
    svg(circleShape("#ffffff", "#e02020") + barDiagonal()),
  circleRedBorder: (sign) =>
    svg(
      circleShape("#ffffff", "#e02020") +
        glyphText(sign.glyph ?? "", 30, "#1a1a1a", 62),
    ),
  circleBlueBarRed: () =>
    svg(circleShape("#2b5fd9", "#e02020") + barDiagonal("#ffffff")),
  circleBlueXRed: () => svg(circleShape("#2b5fd9", "#e02020") + crossX("#ffffff")),
  rectBlueArrow: () => svg(plateShape("#2b5fd9", "#1a3fbf") + arrowUp()),

  // Warning — yellow diamond
  diamondYellowSlope: () =>
    svg(diamondShape("#ffcc33", "#1a1a1a") + slopeArrow()),
  diamondYellowCurve: () =>
    svg(diamondShape("#ffcc33", "#1a1a1a") + curveArrow()),
  diamondYellowPedestrian: () =>
    svg(diamondShape("#ffcc33", "#1a1a1a") + pedestrianFigure()),
  diamondYellowRail: () => svg(diamondShape("#ffcc33", "#1a1a1a") + railCross()),

  // Indication — blue
  diamondBlue: () => svg(diamondShape("#2b5fd9", "#1a3fbf")),
  rectBluePedestrian: () =>
    svg(plateShape("#2b5fd9", "#1a3fbf") + pedestrianFigure("#ffffff")),
  rectBlueP: (sign) =>
    svg(plateShape("#2b5fd9", "#1a3fbf") + glyphText(sign.glyph ?? "P", 40, "#ffffff", 66)),

  // Guide — green / blue directional
  rectGreenArrow: (sign) =>
    svg(
      plateShape("#1a8a4a", "#0f5c30") +
        arrowUp() +
        glyphText(sign.glyph ?? "", 14, "#ffffff", 24),
    ),
  rectBlueArrowSign: (sign) =>
    svg(
      plateShape("#2b5fd9", "#1a3fbf") +
        arrowUp() +
        glyphText(sign.glyph ?? "", 14, "#ffffff", 24),
    ),

  // Supplementary plate — white, black text/border
  plateWhite: (sign) =>
    svg(plateShape("#ffffff", "#1a1a1a") + glyphText(sign.glyph ?? "", 20, "#1a1a1a", 58)),

  // Traffic signal — the three-lamp red/yellow/green head, not a road sign
  // shape at all (see road-signs.js's "signal" category). Uses its own
  // taller viewBox (housing is vertical) instead of the 0 0 100 100 default.
  trafficLightSignal: (sign) =>
    svg(trafficLightHousing(sign.lightColor ?? "red"), "0 0 100 160"),

  // Yellow-light sub-concept ("prepare to stop") — see rule 3 of the
  // Traffic Light Instructions: shown *alongside* the yellow signal image,
  // never instead of it, when the conversation branches into this specific
  // scenario.
  diamondYellowBrake: () => svg(diamondShape("#ffcc33", "#1a1a1a") + brakePedal()),
};

/**
 * @param {import('./road-signs.js').RoadSign} sign
 * @returns {string} inline SVG markup
 */
export function renderSignSVG(sign) {
  const renderer = SHAPE_RENDERERS[sign.shape];
  if (!renderer) {
    // Unknown shape — a plain placeholder rather than a broken render.
    return svg(plateShape("#ffffff", "#1a1a1a") + glyphText("?", 40, "#1a1a1a", 64));
  }
  return renderer(sign);
}
