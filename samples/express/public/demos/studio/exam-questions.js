/**
 * Driving exam question bank — Driving Instruction persona.
 *
 * Every question is grounded directly in the official traffic-light and
 * road-sign rule book the user supplied (traffic-light_english.pdf, now
 * also uploaded to this chatbot's knowledge base — see the PATCH/knowledge
 * upload noted in AGENTS.md's session history). Nothing here is invented:
 * each `explanation` paraphrases that document's own "Meaning" column for
 * the sign or light state being asked about.
 *
 * @typedef {Object} ExamQuestion
 * @property {string} id
 * @property {"traffic-light"|"regulatory"|"indication"} category
 * @property {string} question
 * @property {string[]} options
 * @property {number[]} correct - indices into options; length > 1 means a
 *   multi-select question (see `multiple`)
 * @property {boolean} multiple - true if more than one option must be
 *   selected to be correct
 * @property {string} explanation - shown after the question is submitted
 * @property {string} [signId] - matches a road-signs.js id when this
 *   question has a real rendered icon available (see renderExamQuestion()
 *   in app.js); omitted questions render as text-only
 */

/** @type {ExamQuestion[]} */
export const EXAM_QUESTIONS = [
  {
    id: "light-green",
    category: "traffic-light",
    question: "What can pedestrians do on a green traffic light?",
    options: [
      "Wait for a gap in traffic before crossing",
      "Proceed",
      "Cross only if no vehicles are turning",
      "Nothing — green is only for vehicles",
    ],
    correct: [1],
    multiple: false,
    explanation: "On a green light, pedestrians can proceed.",
  },
  {
    id: "light-yellow-vehicles",
    category: "traffic-light",
    question:
      "A vehicle is approaching its stopping point when the light turns yellow. What is the rule?",
    options: [
      "It must always stop immediately, no exceptions",
      "It must not proceed beyond its stopping point — unless it's already too close to stop safely, in which case it may continue",
      "It may proceed freely, same as green",
      "It must reverse away from the intersection",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Vehicles and streetcars must not proceed beyond their stopping point on yellow — except that if they're approaching the stopping point when the light turns yellow and can't stop safely, they may continue.",
  },
  {
    id: "light-red-multi",
    category: "traffic-light",
    question: "Which of these are true on a red light? (Select all that apply)",
    options: [
      "Pedestrians must not cross the road",
      "Vehicles and streetcars must not proceed beyond their stopping point",
      "A vehicle already turning left at the intersection may continue",
      "Every vehicle must reverse away from the intersection",
    ],
    correct: [0, 1, 2],
    multiple: true,
    explanation:
      "On red: pedestrians must not cross, vehicles/streetcars must not proceed past their stopping point, and vehicles already turning left (or right, without obstructing green-light traffic) may continue.",
  },
  {
    id: "light-green-arrow",
    category: "traffic-light",
    question:
      "The main light is red, but a green arrow is lit. What can vehicles do?",
    options: [
      "Nothing — they must still stop",
      "Proceed in the direction the arrow points (a right arrow also permits a U-turn)",
      "Only bicycles may move",
      "Only pedestrians may cross",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Vehicles can proceed in the direction of a lit arrow even if the main light is yellow or red; a right arrow also permits a U-turn.",
  },
  {
    id: "light-flashing-yellow",
    category: "traffic-light",
    question: "What does a flashing yellow light mean?",
    options: [
      "Come to a complete stop",
      "Pedestrians, vehicles, and streetcars can proceed while paying attention to other traffic",
      "Closed to all traffic",
      "Only emergency vehicles may proceed",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "A flashing yellow light means pedestrians, vehicles, and streetcars can proceed while paying attention to other traffic.",
  },
  {
    id: "light-flashing-red",
    category: "traffic-light",
    question: "At a flashing red light, what must vehicles and streetcars do?",
    options: [
      "Proceed without stopping if the way looks clear",
      "Come to a stop at their stopping point",
      "Sound their horn and proceed",
      "Only turn right",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "On a flashing red light, pedestrians may proceed while paying attention to other traffic, but vehicles and streetcars must come to a stop at their stopping point.",
  },
  {
    id: "light-yellow-arrow",
    category: "traffic-light",
    question: "A yellow-light arrow is lit. Who may proceed in the arrow's direction?",
    options: ["Pedestrians", "Vehicles", "Streetcars", "No one"],
    correct: [2],
    multiple: false,
    explanation:
      "On a yellow-light arrow, streetcars can proceed in the arrow's direction even though the main light is yellow or red — pedestrians and vehicles must not.",
  },
  {
    id: "light-red-turning-right",
    category: "traffic-light",
    question:
      "A vehicle is already turning right at an intersection when the light turns red. What must it do?",
    options: [
      "Stop immediately, mid-turn",
      "It may continue turning, but must not obstruct vehicles proceeding on a green light for the road it's entering",
      "Reverse back through the intersection",
      "Only light road vehicles may continue",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Vehicles already turning right may continue even on red, but must not obstruct traffic proceeding on a green light — light road vehicles and motorized bicycles doing a two-stage right turn must instead stop at that point.",
  },
  {
    id: "sign-road-closed",
    category: "regulatory",
    question: 'What does the "Road Closed" sign (a red circle with a diagonal bar) mean?',
    options: [
      "Closed to trucks only",
      "Closed to pedestrians, small/remote-controllable mobiles, vehicles, and streetcars",
      "Speed limit ahead",
      "One-way street",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Road Closed means closed to pedestrians, small and remote-controllable mobiles, vehicles, and streetcars — everyone, not just one category.",
  },
  {
    id: "sign-prohibition-entry",
    category: "regulatory",
    signId: "no-entry",
    question:
      'Where does the "Prohibition of Vehicle Entry" sign (a red circle with a white bar) typically appear?',
    options: [
      "At the entrance of a one-way street",
      "At the exit of a one-way street, prohibiting vehicles from entering from the opposite direction",
      "At a pedestrian crossing",
      "At a school zone",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "This sign marks the exit of a one-way street — it prohibits vehicles from entering it from the opposite direction.",
  },
  {
    id: "sign-load-capacity-plate",
    category: "regulatory",
    question:
      'A "Road Closed to Trucks with a Maximum Load Capacity" sign has an auxiliary plate reading "積3t". What does that mean?',
    options: [
      "The road is 3 km long",
      "Closed to trucks with a maximum load capacity larger than 3 tons",
      "Speed limit is 3 km/h",
      "Only 3 trucks may park here",
    ],
    correct: [1],
    multiple: false,
    explanation:
      'The auxiliary sign specifies the exact load-capacity threshold — "積3t" means the regulation applies to trucks whose maximum load capacity is larger than 3 tons.',
  },
  {
    id: "sign-no-crossing",
    category: "regulatory",
    question: '"No Crossing by Vehicles" prohibits which maneuver?',
    options: [
      "Parking on the road",
      "Crossing a road (e.g. cutting across oncoming lanes) — except to turn left into or out of a facility off the road",
      "Turning left at any intersection",
      "Driving in the rain",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "No Crossing by Vehicles prohibits crossing the road, excluding crossing that involves turning left to enter or leave facilities or places outside the road.",
  },
  {
    id: "sign-no-u-turn",
    category: "regulatory",
    question: 'What does the "No U-turn" sign mean?',
    options: ["No parking allowed", "No U-turn by vehicles", "No overtaking", "Minimum speed required"],
    correct: [1],
    multiple: false,
    explanation: "This sign simply prohibits vehicles from making a U-turn.",
  },
  {
    id: "sign-no-overtaking",
    category: "regulatory",
    question: 'What does the "No Overtaking" sign prohibit (often paired with a 追越し禁止 plate)?',
    options: ["Parking on the road", "Overtaking by vehicles", "Turning left", "Sounding the horn"],
    correct: [1],
    multiple: false,
    explanation: "This regulatory sign prohibits vehicles from overtaking.",
  },
  {
    id: "sign-right-side-overtake",
    category: "regulatory",
    question:
      'What does "Prohibited from Moving onto the Right Side of the Road for Overtaking" mean?',
    options: [
      "Vehicles may never turn right",
      "Vehicles are prohibited from moving onto the right side of the road in order to overtake",
      "Only buses may use the right lane",
      "Right-hand parking only",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Vehicles are prohibited from moving onto the right side of the road for the purpose of overtaking.",
  },
  {
    id: "sign-no-stopping-parking-vs-no-parking",
    category: "regulatory",
    question:
      "What is the difference between the \"No Stopping or Parking\" sign and the \"No Parking\" sign?",
    options: [
      "There is no difference, they mean the same thing",
      "\"No Stopping or Parking\" bans both stopping and parking; \"No Parking\" only bans parking, so a brief stop is still allowed",
      "\"No Parking\" is stricter and also bans stopping",
      "\"No Stopping or Parking\" only applies at night",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "No Stopping or Parking bans vehicles from stopping or parking at all. No Parking bans only parking — a vehicle may still make a brief stop.",
  },
  {
    id: "sign-time-restricted-parking-multi",
    category: "regulatory",
    question:
      "A Time-restricted Parking Area sign is showing. What does it tell a driver? (Select all that apply)",
    options: [
      "The area of road where vehicles can remain parked during a limited timeframe",
      "How long vehicles can remain parked",
      "The exact make of vehicles allowed to park there",
      "That parking is completely forbidden at all times",
    ],
    correct: [0, 1],
    multiple: true,
    explanation:
      "A Time-restricted Parking Area sign designates both the area of road where parking is allowed during a limited timeframe, and how long a vehicle may remain parked there.",
  },
  {
    id: "sign-hazardous-materials",
    category: "regulatory",
    question:
      'What does the "Road Closed to Vehicles Loaded with Hazardous Materials" sign (危険物) close the road to?',
    options: [
      "Vehicles loaded with hazardous materials, including gunpowder, explosives, poisonous substances, and deleterious substances",
      "Only vehicles carrying gasoline",
      "All commercial trucks",
      "Vehicles carrying more than 4 passengers",
    ],
    correct: [0],
    multiple: false,
    explanation:
      "This sign closes the road to vehicles loaded with hazardous materials — including gunpowder, explosives, poisonous substances, and deleterious substances.",
  },
  {
    id: "sign-weight-limit",
    category: "regulatory",
    question: 'What does a "Weight Limit" sign (e.g. showing 5.5t) close the road to?',
    options: [
      "Vehicles with a gross weight greater than the amount shown",
      "Vehicles built after a certain year",
      "Vehicles with fewer than 5 seats",
      "Only motorcycles",
    ],
    correct: [0],
    multiple: false,
    explanation:
      "A Weight Limit sign closes the road to vehicles with a gross weight greater than the number shown on the sign board.",
  },
  {
    id: "sign-overhead-clearance",
    category: "regulatory",
    question: 'An "Overhead Clearance" sign shows 3.3m. What does that close the road to?',
    options: [
      "Vehicles wider than 3.3m",
      "Vehicles of a height greater than 3.3m, including the height of any loaded cargo",
      "Vehicles slower than 3.3 km/h",
      "Vehicles longer than 3.3m",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Overhead Clearance closes the road to vehicles taller than the indicated height, including the height of loaded cargo.",
  },
  {
    id: "sign-max-speed",
    category: "regulatory",
    signId: "speed-limit",
    question: 'What does a "Maximum Speed" sign specify?',
    options: [
      "The minimum speed vehicles must maintain",
      "The maximum speed for motor vehicles/streetcars (and for motorized bicycles, capped further at 30 km/h or slower)",
      "The speed limit only applies at night",
      "A suggested, non-binding speed",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Maximum Speed specifies the maximum speed for motor vehicles and streetcars, and separately specifies the maximum speed — 30 km/h or slower — for motorized bicycles.",
  },
  {
    id: "sign-min-speed",
    category: "regulatory",
    question: 'What does a "Minimum Speed" sign specify?',
    options: [
      "The maximum speed allowed",
      "The minimum speed for motor vehicles",
      "The minimum distance between vehicles",
      "The minimum number of passengers required",
    ],
    correct: [1],
    multiple: false,
    explanation: "Minimum Speed specifies the minimum speed required for motor vehicles.",
  },
  {
    id: "sign-horn-section-multi",
    category: "regulatory",
    question:
      "A \"Horn Section\" sign marks a stretch of road where vehicles must sound their horn. Where does this apply? (Select all that apply)",
    options: ["Blind intersections", "Blind curves", "Blind summits", "Any straight, open road"],
    correct: [0, 1, 2],
    multiple: true,
    explanation:
      "Horn Section applies to blind intersections, blind curves, and blind summits — places where visibility is limited, not open straight roads.",
  },
  {
    id: "sign-slow",
    category: "regulatory",
    question: 'What does the "Slow" sign (徐行) designate?',
    options: [
      "Vehicles and streetcars must slow down",
      "Vehicles must stop completely",
      "Speed camera ahead",
      "School zone, no restriction",
    ],
    correct: [0],
    multiple: false,
    explanation: "The Slow sign designates that vehicles and streetcars must slow down.",
  },
  {
    id: "sign-priority-road-ahead",
    category: "regulatory",
    question: '"Priority Road Ahead" (with a 前方優先道路 plate) tells a driver what?',
    options: [
      "The road ahead, intersecting with the current road, has priority",
      "The current road always has priority everywhere",
      "A toll booth is ahead",
      "The road ahead is closed",
    ],
    correct: [0],
    multiple: false,
    explanation:
      "Priority Road Ahead indicates that the road ahead, which intersects with the road carrying this sign, has priority.",
  },
  {
    id: "sign-stop-regulatory",
    category: "regulatory",
    signId: "stop",
    question: 'What does the regulatory "Stop" sign (止まれ, red inverted triangle) require?',
    options: [
      "Slow down only, no full stop needed",
      "Vehicles and streetcars must come to a stop immediately in front of an intersection without traffic control",
      "Yield only to pedestrians",
      "Applies only to buses",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "Stop requires vehicles and streetcars to come to a stop immediately in front of an intersection that has no traffic control.",
  },
  {
    id: "sign-one-way",
    category: "regulatory",
    signId: "one-way",
    question: 'What does a "One Way" sign mean for vehicles?',
    options: [
      "Vehicles are prohibited from proceeding in the direction opposite to the arrow on the sign board",
      "Vehicles must alternate direction by the hour",
      "Only emergency vehicles may use this road",
      "The road is closed entirely",
    ],
    correct: [0],
    multiple: false,
    explanation:
      "One Way prohibits vehicles from proceeding in the direction opposite to the arrow shown on the sign board.",
  },
  {
    id: "sign-priority-road-indication",
    category: "indication",
    question:
      'The "Priority Road" indication sign (a blue shield/cross shape, not the triangular warning sign) indicates what?',
    options: ["A toll road", "A priority road", "A dead end", "A pedestrian-only zone"],
    correct: [1],
    multiple: false,
    explanation: "This indication sign simply indicates a priority road.",
  },
  {
    id: "sign-pedestrian-crossing-indication",
    category: "indication",
    signId: "pedestrian-crossing",
    question: 'What does the "Pedestrian Crossing" indication sign mark?',
    options: [
      "A pedestrian crossing",
      "A bus stop",
      "A no-parking zone",
      "A speed bump",
    ],
    correct: [0],
    multiple: false,
    explanation: "This sign indicates a pedestrian crossing.",
  },
  {
    id: "sign-safety-zone",
    category: "indication",
    question: 'What does a "Safety Zone" sign indicate?',
    options: [
      "A safety zone (e.g. a streetcar-stop island) that vehicles must not enter",
      "A speed limit zone",
      "A construction zone",
      "A fuel station",
    ],
    correct: [0],
    multiple: false,
    explanation: "This sign indicates a safety zone.",
  },
  {
    id: "sign-parking-allowed",
    category: "indication",
    signId: "parking-permitted",
    question: 'What does a blue square "P" sign indicate?',
    options: [
      "Parking of vehicles is allowed",
      "Parking is strictly forbidden",
      "Police station ahead",
      "Public restroom",
    ],
    correct: [0],
    multiple: false,
    explanation: "This indication sign shows that parking of vehicles is allowed.",
  },
  {
    id: "sign-stopping-allowed",
    category: "indication",
    question: 'What does a blue square "停" sign indicate?',
    options: [
      "Stopping of vehicles is allowed",
      "The road is permanently closed",
      "Toll payment required",
      "Reserved for streetcars only",
    ],
    correct: [0],
    multiple: false,
    explanation: "This indication sign shows that stopping of vehicles is allowed.",
  },
  {
    id: "sign-roundabout",
    category: "regulatory",
    question: "At a roundabout marked with the roundabout regulatory sign, which direction must vehicles travel?",
    options: ["Counter-clockwise", "Clockwise", "Either direction, driver's choice", "Straight through only"],
    correct: [1],
    multiple: false,
    explanation:
      "This sign designates that vehicles must proceed in a clockwise direction at the roundabout.",
  },
  {
    id: "sign-two-stage-right-turn",
    category: "regulatory",
    question:
      'What does "Method for Motorized Bicycles to Turn Right (in Two Stages)" require?',
    options: [
      "The motorized bicycle turns right directly across oncoming traffic, same as a car",
      "The motorized bicycle goes straight across the intersection first, then turns/changes direction at that far point instead of cutting across traffic",
      "Motorized bicycles may not turn right at all here",
      "The motorized bicycle must dismount and walk it across",
    ],
    correct: [1],
    multiple: false,
    explanation:
      "A two-stage right turn means the motorized bicycle proceeds straight through the intersection first and changes direction to complete the right turn at that point, rather than cutting diagonally across oncoming traffic.",
  },
];
