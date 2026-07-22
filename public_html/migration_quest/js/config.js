/* Migration Quest — game content & tuning.
 * All authored content lives here (the BIRDS_BASE_DATA dataset has no route
 * geography, so the roster's map routes / flyways / legs / hazards /
 * campaigns are authored, while the live dataset supplies each species'
 * fact card via BirdDetail where available).
 *
 * ── Roster & Migration Map (added 2026-07-17, see ref/design_bird_migration_game.md §12) ──
 * cfg.roster is the five birds shown on the Migration Map. Exactly one
 * (`playable: true`) has a real journey; the rest are explore-only ("Journey
 * coming soon"). cfg.species / cfg.flyway are then DERIVED from the playable
 * roster entry below, so engine.js / state.js / ui.js keep the exact same
 * shape they always had — no engine changes needed for multi-bird support.
 *
 * Map coordinates are pixel positions on the real `img/americas_map.jpg`
 * illustration (1100×1649) — see ref/design_bird_migration_game.md §12.2.
 * They're hand-placed to land in the right region/coastline for each species
 * (verified against a gridded copy of the map image), not surveyed GPS
 * tracks, so treat them as illustrative-but-grounded rather than precise.
 * `genus`/`species` map each roster bird to its photo at
 * `../base_res/img/birds/{genus}_{species}.jpg` for the Migration Map
 * thumbnail rail (see map.js buildThumbnails).
 */
window.FLYWAY = window.FLYWAY || {};

FLYWAY.config = (function () {
  "use strict";

  // ── Roster: the five Migration Map birds ───────────────────────────────
  const roster = [
    {
      id: "hummingbird",
      commonName: "Ruby-throated Hummingbird",
      shortName: "Hummingbird",
      genus: "Archilochus",
      species: "colubris",
      playable: true,
      modeLabel: "Agility Mode",
      modeBlurb: "High-frequency fueling, then a dangerous, inescapable open-water crossing.",
      tagline: "Less than a nickel. A 500-mile, ~20-hour nonstop flight over the open Gulf.",
      distance: "1,500–2,000 mi one-way",
      flywayName: "Gulf Coast Flyway",
      origin: { x: 480, y: 420 },
      // marker photo is pulled off-land to an open-water anchor, connected
      // to the true origin by a thin leader line (see map.js buildMarkers)
      markerAnchor: { x: 880, y: 360 },
      markerSize: { w: 150, h: 131 },
      route: {
        points: [
          [480, 420],
          [440, 520],
          [400, 590],
          [420, 615],
          [450, 640],
          [480, 710],
        ],
        // segment index [a,b] drawn dashed = the open-water Gulf crossing
        waterSegment: [2, 4],
      },
      calloutFacts: [
        {
          title: "The Gulf Marathon",
          text: "Despite weighing less than a nickel, it flies 500 miles non-stop across the open Gulf of Mexico — with nowhere to land, a 20-hour test of pure endurance.",
        },
        {
          title: "Hyper-Fueling",
          text: "Before the crossing it enters hyperphagia, eating so much nectar and insects that it roughly doubles its body weight in fat reserves.",
        },
      ],
      // gameplay tuning (only meaningful for the playable bird)
      flockSize: 14,
      fatCapacity: 100, // stamina units
      agility: 1.3, // quick, twitchy — hummingbirds are the most agile flier here
      silhouette: "hummingbird",
      accent: "#e0517a",
      journey: {
        legs: [
          {
            id: "leg1",
            title: "Gathering at the Coast",
            subtitle: "Feeding hard in coastal gardens before the crossing",
            time: "day",
            length: 5200,
            hazards: ["glass"],
            warg: false,
          },
          {
            id: "leg2",
            title: "The Gulf Marathon",
            subtitle: "500 miles of open water — day fading into night, nowhere to land",
            time: "night",
            length: 8600,
            hazards: [],
            noRescue: true,
            fatDrainMult: 1.55,
            hyperfuelNote:
              "Hyperfueling: eat until you've doubled your weight in fat — the next 500 miles have nowhere to land.",
            warg: true, // star-compass set-piece fires mid-crossing
            wargAt: 0.55,
          },
          {
            id: "leg3",
            title: "Landfall",
            subtitle: "Dawn over the Central American coast",
            time: "dawn",
            length: 5000,
            hazards: ["glass", "turbines"],
            warg: false,
          },
        ],
      },
    },

    {
      id: "broadwing",
      commonName: "Broad-winged Hawk",
      shortName: "Broad-winged Hawk",
      genus: "Buteo",
      species: "platypterus",
      playable: false,
      modeLabel: "Strategy Mode",
      modeBlurb: "The route relies entirely on following landmass contours to catch wind thermals.",
      tagline: "Travels in massive, swirling kettles — over 100,000 hawks can pass Veracruz in a day.",
      distance: "≈4,300 mi one-way (≈69 mi/day)",
      flywayName: "Central Flyway (Mesoamerican land bridge)",
      origin: { x: 520, y: 380 },
      markerAnchor: { x: 900, y: 560 },
      markerSize: { w: 150, h: 145 },
      route: {
        points: [
          [520, 380],
          [460, 480],
          [380, 560],
          [350, 650],
          [420, 750],
          [500, 830],
          [600, 900],
          [650, 950],
        ],
        // index of the Veracruz, MX bottleneck ("River of Raptors"), marked node
        stagingIndex: 3,
        stagingLabel: "Veracruz, MX",
      },
      calloutFacts: [
        {
          title: "River of Raptors",
          text: "They travel in massive, swirling social groups called kettles. At bottlenecks like Veracruz, Mexico, over 100,000 hawks can pass by in a single day.",
        },
        {
          title: "Thermal Gliders",
          text: "They almost never flap their wings during migration, riding rising columns of warm air to coast effortlessly around the Gulf.",
        },
      ],
    },

    {
      id: "peregrine",
      commonName: "Peregrine Falcon",
      shortName: "Peregrine Falcon",
      genus: "Falco",
      species: "peregrinus",
      playable: false,
      modeLabel: "Hard Mode",
      modeBlurb: "A massive coast-to-coast visual track across two hemispheres, high stamina drain over ocean.",
      tagline: "The fastest animal on the planet — dives exceed 240 mph chasing prey mid-air.",
      distance: "7,000–9,000 mi one-way",
      flywayName: "Pacific Flyway",
      origin: { x: 150, y: 90 },
      markerAnchor: { x: 60, y: 60 },
      markerSize: { w: 100, h: 94 },
      route: {
        points: [
          [150, 90],
          [165, 250],
          [180, 400],
          [195, 530],
          [230, 620],
          [300, 730],
          [390, 800],
          [460, 850],
          [540, 890],
          [590, 970],
          [605, 1100],
          [600, 1300],
          [605, 1500],
          [610, 1580],
        ],
      },
      calloutFacts: [
        {
          title: "The Wanderer",
          text: "Its name — Peregrine — literally means \"wanderer\" or \"pilgrim.\"",
        },
        {
          title: "Super Speeder",
          text: "The fastest animal on the planet. It travels steadily in migration, but its hunting dive exceeds 240 mph (386 km/h).",
        },
      ],
    },

    {
      id: "crane",
      commonName: "Whooping Crane",
      shortName: "Whooping Crane",
      genus: "Grus",
      species: "americana",
      playable: false,
      modeLabel: "Precision Mode",
      modeBlurb: "No safety in numbers — a family of two or three navigating a closely monitored corridor.",
      tagline: "Down to just 15 birds in 1941, North America's tallest bird now makes a 2,500-mile comeback journey each way.",
      distance: "≈2,500 mi one-way",
      flywayName: "Central Flyway",
      origin: { x: 380, y: 330 },
      markerAnchor: { x: 95, y: 330 },
      markerSize: { w: 150, h: 100 },
      route: {
        points: [
          [380, 330],
          [390, 430],
          [400, 510],
          [400, 570],
          [370, 610],
          [330, 640],
        ],
        // index of the Quivira NWR (KS) stopover, drawn as a marked node
        stagingIndex: 3,
        stagingLabel: "Quivira NWR, KS",
      },
      calloutFacts: [
        {
          title: "Back from the Brink",
          text: "In 1941 only 15 Whooping Cranes remained on Earth. Decades of protection have brought this population back to roughly 500–800 birds today — one of North America's great conservation recoveries.",
        },
        {
          title: "Tallest Bird in North America",
          text: "Standing nearly 5 feet tall with a 7-foot wingspan, it's the continent's tallest bird — and still one of its rarest, migrating in small family groups rather than massive flocks.",
        },
      ],
    },

    {
      id: "osprey",
      commonName: "Osprey",
      shortName: "Osprey",
      genus: "Pandion",
      species: "haliaetus",
      playable: false,
      modeLabel: "Hard Mode",
      modeBlurb: "Massive coast-to-coast visual tracks across two hemispheres, high stamina drain over ocean.",
      tagline: "Hunts strictly live fish, rotating each catch head-first in flight, torpedo-style.",
      distance: "3,000–5,000 mi one-way",
      flywayName: "Atlantic Flyway",
      origin: { x: 570, y: 300 },
      markerAnchor: { x: 900, y: 190 },
      markerSize: { w: 150, h: 124 },
      route: {
        points: [
          [570, 300],
          [530, 430],
          [510, 560],
          [545, 700],
          [610, 800],
          [650, 900],
          [700, 1050],
          [730, 1220],
          [700, 1380],
        ],
        waterSegment: [3, 5],
      },
      calloutFacts: [
        {
          title: "Fish-Only Flying",
          text: "Ospreys hunt strictly for live fish. In flight, they dynamically rotate the catch to be head-first — aerodynamic, like a torpedo.",
        },
        {
          title: "Waterproof Plumage",
          text: "Oily, water-repellent feathers and closable nostrils let them dive completely submerged into lakes and oceans.",
        },
      ],
    },
  ];

  // playable roster entry — engine.js / state.js / ui.js / main.js all read
  // cfg.species / cfg.flyway exactly as before; only this lookup is new.
  const species = roster.find((r) => r.playable);

  // ── Hazards, each with a Rescue (now) and a Campaign (permanent) ───────
  const hazards = {
    turbines: {
      id: "turbines",
      name: "Wind Turbines & Power Lines",
      short: "Turbines",
      icon: "🌀",
      time: "day",
      desc: "Spinning blades and unmarked wires strike birds crossing in daylight.",
      rescue: {
        name: "Emergency Diversion",
        verb: "Thread the gap",
        blurb:
          "Time slows. You steer the flock through a gap between the blades. The turbines keep turning — this saves them now, not next time.",
      },
      campaign: {
        name: "Radar-Timed Shutdowns",
        goal: "Get the wind farm to pause its blades during peak passage.",
        steps: [
          {
            label: "Rally the community",
            detail:
              "Gather local birders and residents who have watched the strikes pile up beneath the towers.",
          },
          {
            label: "Petition the utility",
            detail:
              "Bring BirdCast radar data to the operator, showing exactly which nights the sky fills with migrants.",
          },
          {
            label: "Win radar-backed shutdowns",
            detail:
              "The operator agrees to feather the blades when the radar lights up. The wind farm goes quiet for the flock.",
          },
        ],
        reward: "Turbines on this flyway now pause during peak passage.",
      },
    },

    light: {
      id: "light",
      name: "Light Pollution & Night Disorientation",
      short: "Light Pollution",
      icon: "💡",
      time: "night",
      desc: "City glow traps night-migrating songbirds, draining them and pulling them off course.",
      rescue: {
        name: "Steer to Darkness",
        verb: "Break the glare",
        blurb:
          "Time slows. You pull the dazzled flock up out of the light dome before exhaustion takes hold. The glow still burns below.",
      },
      campaign: {
        name: "“Lights Out” Initiative",
        goal: "Darken the city's non-essential lights during migration season.",
        steps: [
          {
            label: "Rally the community",
            detail:
              "Show residents the dawn tally of grounded, circling birds beneath the brightest towers.",
          },
          {
            label: "Petition building owners",
            detail:
              "Ask downtown owners to pledge to dim non-essential lighting on peak migration nights.",
          },
          {
            label: "Win a Lights Out program",
            detail:
              "The city commits to going dark in migration season. The trap goes cold.",
          },
        ],
        reward: "The city dims its lights on peak migration nights.",
      },
    },

    glass: {
      id: "glass",
      name: "Glass Window Collisions",
      short: "Glass",
      icon: "🪟",
      time: "any",
      desc: "Reflective and transparent glass is invisible to birds — a fatal, silent barrier.",
      rescue: {
        name: "Veer the Reflection",
        verb: "Veer off",
        blurb:
          "Time slows. You bank the flock away from the mirrored facade at the last second. The glass stays invisible to the next flock.",
      },
      campaign: {
        name: "Bird-Safe Glass Treatment",
        goal: "Make the city's glass visible to birds.",
        steps: [
          {
            label: "Rally the community",
            detail:
              "Collect the record of strikes at the worst buildings — the evidence is on the pavement each morning.",
          },
          {
            label: "Petition for bird-safe design",
            detail:
              "Push owners and the city toward UV-reflective, fritted, or patterned glass.",
          },
          {
            label: "Win visible-glass retrofits",
            detail:
              "A fritted-dot grid goes up across the worst facades. The birds can finally see the wall.",
          },
        ],
        reward: "The city's worst facades now carry a bird-visible pattern.",
      },
    },
  };

  // ── The flyway and its legs — derived from the playable roster entry ───
  const flyway = {
    id: species.id,
    name: species.flywayName,
    legs: species.journey.legs,
  };

  // ── Champion standing (private self-progression) ───────────────────────
  // Score = number of Campaign steps completed (persists across runs).
  const ranks = [
    { min: 0, name: "Fledgling Steward" },
    { min: 2, name: "Flyway Friend" },
    { min: 5, name: "Route Guardian" },
    { min: 9, name: "Migration Steward Champion" },
  ];

  // ── Palettes per time-of-day (sky gradient stops, top → horizon) ───────
  const skies = {
    day: {
      sky: ["#2b6fb0", "#4f97cf", "#8fc0e0", "#cfe4ee"],
      horizon: "#dfeaf0",
      land: ["#3c5a3a", "#2c4a34"],
      sea: null,
      star: 0,
      sun: { x: 0.78, y: 0.2, color: "#fff4d0", glow: "#ffe6a8", r: 46 },
      light: 1.0,
      tint: "#eaf4ff",
    },
    night: {
      sky: ["#070b1c", "#0d1430", "#182347", "#243a5e"],
      horizon: "#2a3f63",
      land: ["#0a1122", "#060a16"],
      sea: ["#0c1730", "#0a1226"],
      star: 1,
      moon: { x: 0.2, y: 0.22, color: "#eef2ff", glow: "#9fb4e8", r: 30 },
      light: 0.22,
      tint: "#5b6aa0",
      cityGlow: "#e9a94a",
    },
    dawn: {
      sky: ["#20284f", "#5a4a86", "#c9648a", "#f2a25a"],
      horizon: "#f7c98a",
      land: ["#3a3550", "#241f36"],
      sea: ["#6a5a86", "#4a3f64"],
      star: 0.25,
      sun: { x: 0.16, y: 0.34, color: "#fff0c8", glow: "#ff9e5a", r: 40 },
      light: 0.6,
      tint: "#ffd9b0",
    },
  };

  return { roster, species, hazards, flyway, ranks, skies };
})();
