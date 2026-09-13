/**
 * Japanese road-sign library for the Driving Instruction persona's sign
 * panel — see app.js's `checkForRoadSigns()`. A minimum starting set per
 * the four official categories (規制/警戒/指示/案内) plus one supplementary
 * plate, each with a real shape+color rendering (not a text description),
 * Japanese text, romaji, and an English instruction. Extend this array to
 * cover more signs — nothing else needs to change to pick them up, since
 * detection and rendering both just iterate ROAD_SIGNS.
 *
 * Also carries the traffic *signal* (信号機) entries — legally a separate
 * category from road signs (標識) in Japan, kept in this same array/panel
 * because the app has exactly one "detect a topic → show its real image"
 * mechanism and building a parallel one just for signals would duplicate it
 * for no benefit. See the "Traffic Light Instructions" this module follows:
 * red/yellow/green always render as the actual three-lamp signal head
 * (`trafficLightSignal` in road-sign-svg.js), lit to match the color being
 * discussed — never a road-sign shape standing in for it.
 *
 * @typedef {Object} RoadSign
 * @property {string} id
 * @property {"regulatory"|"warning"|"indication"|"guide"|"supplementary"|"signal"} category
 * @property {string} shape - one of the SHAPE_RENDERERS keys below
 * @property {string} [glyph] - short text/number drawn inside the sign (e.g. "止まれ", "40")
 * @property {"red"|"yellow"|"green"} [lightColor] - signal entries only; which lamp is lit
 * @property {string} japanese
 * @property {string} romaji
 * @property {string} english
 * @property {string[]} keywords - lowercase match terms (english/romaji/japanese)
 */

const CATEGORY_LABELS = {
  regulatory: "規制標識 · Regulatory",
  warning: "警戒標識 · Warning",
  indication: "指示標識 · Indication",
  guide: "案内標識 · Guide",
  supplementary: "補助標識 · Supplementary",
  signal: "信号機 · Traffic Light",
};

/** @type {RoadSign[]} */
const ROAD_SIGNS = [
  // ── 信号機 — Traffic signal (red / yellow / green) ────────────────────
  {
    id: "traffic-light-red",
    category: "signal",
    shape: "trafficLightSignal",
    lightColor: "red",
    japanese: "赤信号",
    romaji: "Aka Shingō",
    english:
      "Red light — pedestrians must not cross; vehicles and streetcars must not proceed beyond their stopping point (a vehicle already turning left, or turning right without obstructing green-light traffic, may continue).",
    keywords: [
      "red light",
      "red traffic light",
      "the light is red",
      "light turns red",
      "light is red",
      "red signal",
      "when it's red",
      "aka shingo",
      "赤信号",
    ],
  },
  {
    id: "traffic-light-yellow",
    category: "signal",
    shape: "trafficLightSignal",
    lightColor: "yellow",
    japanese: "黄信号",
    romaji: "Ki Shingō",
    english:
      "Yellow light — pedestrians must not start crossing; vehicles and streetcars must not proceed beyond their stopping point, unless already approaching it and unable to stop safely.",
    keywords: [
      "yellow light",
      "amber light",
      "yellow traffic light",
      "the light is yellow",
      "light turns yellow",
      "light is yellow",
      "yellow signal",
      "amber signal",
      "when it's yellow",
      "ki shingo",
      "黄信号",
    ],
  },
  {
    id: "traffic-light-green",
    category: "signal",
    shape: "trafficLightSignal",
    lightColor: "green",
    japanese: "青信号",
    romaji: "Ao Shingō",
    english:
      "Green light — pedestrians can proceed; vehicles can go straight or turn left/right (light road vehicles turn left only, going straight before changing direction for a right turn).",
    keywords: [
      "green light",
      "green traffic light",
      "the light is green",
      "light turns green",
      "light is green",
      "green signal",
      "when it's green",
      "ao shingo",
      "青信号",
    ],
  },
  // Yellow-light sub-concept — shown ALONGSIDE the yellow signal above, not
  // instead of it, when the conversation narrows to this specific scenario
  // (Traffic Light Instructions, rule 3).
  {
    id: "yellow-light-prepare-to-stop",
    category: "indication",
    shape: "diamondYellowBrake",
    japanese: "停止準備",
    romaji: "Teishi Junbi",
    english:
      "Prepare to stop — on yellow, begin braking smoothly toward your stopping point, unless you're already too close to it to stop safely, in which case you may continue through.",
    keywords: [
      "prepare to stop",
      "get ready to stop",
      "start braking",
      "slow down before the light",
      "teishi junbi",
      "停止準備",
    ],
  },

  // ── 規制標識 — Regulatory (red) ──────────────────────────────────────
  {
    id: "stop",
    category: "regulatory",
    shape: "invertedTriangleRed",
    glyph: "止まれ",
    japanese: "止まれ",
    romaji: "Tomare",
    english:
      "Stop — come to a complete stop and check both directions before proceeding.",
    // Bare "stop" used to be a keyword here too, but it's a substring of
    // ordinary phrases like "prepare to stop" (see the yellow-light entry
    // above) and would pull in this unrelated regulatory sign any time a
    // traffic-light explanation happened to use the word — too broad for a
    // plain findMentionedSigns() substring match.
    keywords: ["stop sign", "tomare", "止まれ"],
  },
  {
    id: "no-entry",
    category: "regulatory",
    shape: "circleRedBar",
    japanese: "車両進入禁止",
    romaji: "Sharyō Shinnyū Kinshi",
    english: "No entry — vehicles may not enter from this direction.",
    keywords: [
      "no entry",
      "shinnyu kinshi",
      "shinnyū kinshi",
      "進入禁止",
      "do not enter",
    ],
  },
  {
    id: "speed-limit",
    category: "regulatory",
    shape: "circleRedBorder",
    glyph: "40",
    japanese: "最高速度（40）",
    romaji: "Saikō Sokudo (40)",
    english: "Maximum speed limit — 40 km/h shown here; the number changes per sign.",
    keywords: ["speed limit", "saikou sokudo", "最高速度", "kph", "km/h sign"],
  },
  {
    id: "no-parking-stopping",
    category: "regulatory",
    shape: "circleBlueBarRed",
    japanese: "駐停車禁止",
    romaji: "Chūteisha Kinshi",
    english: "No stopping or parking at any time along this stretch of road.",
    keywords: [
      "no parking",
      "no stopping",
      "chuteisha kinshi",
      "chūteisha kinshi",
      "駐停車禁止",
    ],
  },
  {
    id: "no-parking",
    category: "regulatory",
    shape: "circleBlueXRed",
    japanese: "駐車禁止",
    romaji: "Chūsha Kinshi",
    english: "No parking — stopping briefly to load/unload is still allowed.",
    keywords: ["no parking only", "chusha kinshi", "chūsha kinshi", "駐車禁止"],
  },
  {
    id: "one-way",
    category: "regulatory",
    shape: "rectBlueArrow",
    japanese: "一方通行",
    romaji: "Ippō Tsūkō",
    english: "One-way street — travel is permitted in the arrow's direction only.",
    keywords: ["one way", "ippo tsuko", "ippō tsūkō", "一方通行"],
  },

  // ── 警戒標識 — Warning (yellow diamond) ──────────────────────────────
  {
    id: "steep-grade",
    category: "warning",
    shape: "diamondYellowSlope",
    japanese: "急勾配あり",
    romaji: "Kyū Kōbai Ari",
    english: "Steep grade ahead — adjust speed and gear before the slope.",
    keywords: ["steep grade", "steep hill", "kyu kobai", "急勾配"],
  },
  {
    id: "curves-ahead",
    category: "warning",
    shape: "diamondYellowCurve",
    japanese: "屈曲あり",
    romaji: "Kukkyoku Ari",
    english: "Series of curves ahead — reduce speed and stay in your lane.",
    keywords: ["curves ahead", "winding road", "kukkyoku", "屈曲"],
  },
  {
    id: "pedestrian-crossing-ahead",
    category: "warning",
    shape: "diamondYellowPedestrian",
    japanese: "横断歩道あり",
    romaji: "Ōdanhodō Ari",
    english: "Pedestrian crossing ahead — slow down and watch for people crossing.",
    keywords: [
      "pedestrian crossing ahead",
      "crosswalk ahead",
      "odanhodou ari",
      "横断歩道あり",
    ],
  },
  {
    id: "railroad-crossing-ahead",
    category: "warning",
    shape: "diamondYellowRail",
    japanese: "踏切あり",
    romaji: "Fumikiri Ari",
    english:
      "Railroad crossing ahead — slow down, look both ways, and be ready to stop.",
    keywords: [
      "railroad crossing",
      "railway crossing",
      "level crossing",
      "fumikiri",
      "踏切",
    ],
  },

  // ── 指示標識 — Indication (blue) ─────────────────────────────────────
  {
    id: "priority-road",
    category: "indication",
    shape: "diamondBlue",
    japanese: "優先道路",
    romaji: "Yūsen Dōro",
    english: "Priority road — traffic on this road has right of way at the junction.",
    keywords: ["priority road", "yusen doro", "yūsen dōro", "優先道路"],
  },
  {
    id: "pedestrian-crossing",
    category: "indication",
    shape: "rectBluePedestrian",
    japanese: "横断歩道",
    romaji: "Ōdanhodō",
    english: "Pedestrian crossing — this is a designated crossing point.",
    keywords: ["pedestrian crossing", "crosswalk", "odanhodou", "横断歩道"],
  },
  {
    id: "parking-permitted",
    category: "indication",
    shape: "rectBlueP",
    glyph: "P",
    japanese: "駐車可",
    romaji: "Chūsha Ka",
    english: "Parking permitted in this area.",
    keywords: ["parking permitted", "parking allowed", "chusha ka", "駐車可"],
  },

  // ── 案内標識 — Guide (green / blue directional) ─────────────────────
  {
    id: "expressway-direction",
    category: "guide",
    shape: "rectGreenArrow",
    glyph: "Tokyo",
    japanese: "方面・方向",
    romaji: "Hōmen・Hōkō",
    english: "Expressway direction sign — shows destination and route number.",
    keywords: ["expressway sign", "highway direction", "houmen", "方面"],
  },
  {
    id: "route-direction",
    category: "guide",
    shape: "rectBlueArrowSign",
    glyph: "Route 1",
    japanese: "地点",
    romaji: "Chiten",
    english: "Regular-road direction sign — place name and distance.",
    keywords: ["route sign", "road direction", "chiten", "地点"],
  },

  // ── 補助標識 — Supplementary plate ────────────────────────────────────
  {
    id: "time-restriction-plate",
    category: "supplementary",
    shape: "plateWhite",
    glyph: "8–20時",
    japanese: "時間指定（8-20時）",
    romaji: "Jikan Shitei (8–20 ji)",
    english:
      "Supplementary time-restriction plate — the main sign above it only applies during these hours (e.g. 8:00–20:00).",
    keywords: [
      "time restriction",
      "supplementary plate",
      "jikan shitei",
      "時間指定",
      "hours plate",
    ],
  },
];

/** Signs mentioned generically ("show me the signs") return this whole set. */
const GENERIC_SIGN_REQUEST_PATTERNS = [
  /show (me )?(the |some |all )?(road )?signs/i,
  /what signs/i,
  /road signs?\b.*\b(know|cover|exam|test)/i,
];

/**
 * Finds every sign mentioned in `text` (case-insensitive keyword match), or
 * — if `text` is a generic "show me the signs" request with no specific sign
 * named — the entire library.
 * @param {string} text
 * @returns {RoadSign[]}
 */
export function findMentionedSigns(text) {
  const lower = text.toLowerCase();
  const matched = ROAD_SIGNS.filter((sign) =>
    sign.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  );
  if (matched.length > 0) return matched;
  if (GENERIC_SIGN_REQUEST_PATTERNS.some((re) => re.test(text))) {
    return ROAD_SIGNS;
  }
  return [];
}

export { ROAD_SIGNS, CATEGORY_LABELS };
