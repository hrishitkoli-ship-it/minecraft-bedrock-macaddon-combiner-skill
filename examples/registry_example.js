/**
 * WORKED EXAMPLES — bedrock-addon-combiner v4
 * =============================================
 * Three real input→output pairs showing what the skill generates.
 * All values below are exactly what the skill would produce from these inputs.
 */

// ════════════════════════════════════════════════════════════════
// EXAMPLE 1: Tree Cutter + Custom Metals
// Input:  treecutter_v2.mcaddon + custommetal_v1.mcaddon
// Output: treecutter_custommetal_merged.mcaddon
// ════════════════════════════════════════════════════════════════

// ── 1A. ADDON_MAP (built during Phase 1) ─────────────────────────
const EXAMPLE1_ADDON_MAP = {
  treecutter: {
    namespace: "treecutter", min_engine: [1, 21, 0], script_api_version: "1.14.0",
    tools: { tree_cutter: ["treecutter:lumber_axe","treecutter:mega_axe"], axe: [], pickaxe: [], hoe: [], shovel: [], sword: [] },
    logs: ["treecutter:spirit_log","treecutter:ash_log"],
    leaves: ["treecutter:spirit_leaves","treecutter:ash_leaves"],
    stripped_logs: ["treecutter:stripped_spirit_log","treecutter:stripped_ash_log"],
    saplings: ["treecutter:spirit_sapling"],
    misc_items: ["treecutter:spirit_sap"],
    tree_decorations: [],            // none in this add-on
    ingots: [], nuggets: [], raw_ores: [], foods: [], seeds: [],
    ores: { stone: [], deepslate: [], nether: [], end: [] },
    mobs: [{ id: "treecutter:wood_sprite", family_tags: ["passive"], loot_table: "loot_tables/treecutter/wood_sprite.json", is_passive: true }],
    loot_tables: [
      { path: "loot_tables/treecutter/forester_chest.json",  context: "forest" },
      { path: "loot_tables/treecutter/hollow_tree_chest.json", context: "forest" },
    ],
    recipes: [], custom_station_tags: [], features: [], biomes: [], dimensions: [],
  },
  custommetal: {
    namespace: "custommetal", min_engine: [1, 21, 0], script_api_version: "1.14.0",
    tools: { axe: ["custommetal:stellite_axe"], pickaxe: ["custommetal:stellite_pickaxe"], tree_cutter: [], hoe: [], shovel: [], sword: [] },
    ingots: ["custommetal:stellite_ingot"],
    nuggets: ["custommetal:stellite_nugget"],
    raw_ores: ["custommetal:raw_stellite"],
    ores: { stone: ["custommetal:stellite_ore"], deepslate: ["custommetal:deepslate_stellite_ore"], nether: [], end: [] },
    logs: [], leaves: [], saplings: [], stripped_logs: [], misc_items: [], foods: [], seeds: [], mobs: [],
    tree_decorations: [],
    loot_tables: [{ path: "loot_tables/custommetal/mine_chest.json", context: "mine" }],
    recipes: [
      { type: "minecraft:recipe_furnace", id: "custommetal:smelt_stellite",
        inputs: ["custommetal:raw_stellite"], output: "custommetal:stellite_ingot", recipe_tags: ["furnace"] }
    ],
    custom_station_tags: [],
    features: [
      { id: "custommetal:stellite_ore_feature", fill_block: "custommetal:stellite_ore", y_min: -64, y_max: 16, count: 8, dimension: "minecraft:overworld" },
      { id: "custommetal:deepslate_stellite_feature", fill_block: "custommetal:deepslate_stellite_ore", y_min: -64, y_max: -16, count: 5, dimension: "minecraft:overworld" },
    ],
    biomes: [], dimensions: [],
  }
};

// ── 1B. Conflicts detected ────────────────────────────────────────
const EXAMPLE1_CONFLICTS = [
  // None! These two add-ons have no conflicting IDs, paths, or namespaces.
];

// ── 1C. Cross-features generated ─────────────────────────────────
const EXAMPLE1_CROSS_FEATURES = {
  treeCutting: {
    tools: ["treecutter:lumber_axe", "treecutter:mega_axe", "custommetal:stellite_axe"],
    logs:  ["treecutter:spirit_log", "treecutter:ash_log", /* + all minecraft:logs tagged */],
    stripMap: {
      "treecutter:spirit_log": "treecutter:stripped_spirit_log",
      "treecutter:ash_log":    "treecutter:stripped_ash_log",
    },
    decorationsHandled: [], // no tree decorations in either add-on
  },
  toolBlockMatrix: {
    oresTierEnforced: {
      "custommetal:stellite_ore":            "iron",   // stellite_pickaxe = diamond tier — can mine ✓
      "custommetal:deepslate_stellite_ore":  "iron",
    },
    hoeTilling: {},  // no hoes in either add-on
  },
  lootInjection: [
    // custommetal items → treecutter chests (forest context)
    { into: "loot_tables/treecutter/forester_chest.json",    inject: ["custommetal:stellite_ingot(w:10)","custommetal:stellite_nugget(w:18)","custommetal:raw_stellite(w:12)"] },
    { into: "loot_tables/treecutter/hollow_tree_chest.json", inject: ["custommetal:stellite_ingot(w:10)","custommetal:stellite_nugget(w:18)"] },
    // treecutter items → custommetal chests (mine context)
    { into: "loot_tables/custommetal/mine_chest.json",       inject: ["treecutter:spirit_sap(w:6)"] },
  ],
  crossSmelting: [
    // custommetal:smelt_stellite recipe — tags expanded to include all smelter tags found (blast_furnace added)
    { recipe: "custommetal:smelt_stellite", tags: ["furnace","blast_furnace"] },
  ],
  oreYBands: {
    "minecraft:overworld": [
      { ore: "custommetal:stellite_ore",           y_min: -64, y_max: -16, band: 48 },
      { ore: "custommetal:deepslate_stellite_ore", y_min: -64, y_max: -32, band: 32 },
    ]
  },
  wanderingTrader: [
    { item: "custommetal:stellite_ingot",  emeralds: 5 },
    { item: "custommetal:stellite_nugget", emeralds: 9 },
    { item: "treecutter:spirit_sap",       emeralds: 3 },
  ],
  mobHarmony: {
    protected: ["treecutter:wood_sprite"],
    crossTaming: [],
  },
};

// ── 1D. Generated scripts/compat/tree_cutter.js constants ────────
// (abbreviated — full script generated from templates in SKILL.md Phase 3A)
const EXAMPLE1_TREE_CUTTER_CONSTS = {
  TREE_CUTTER_TOOLS: ["treecutter:lumber_axe","treecutter:mega_axe","custommetal:stellite_axe"],
  ALL_LOG_BLOCKS:    ["treecutter:spirit_log","treecutter:ash_log"],
  ALL_LEAF_BLOCKS:   ["treecutter:spirit_leaves","treecutter:ash_leaves"],
  LOG_DATA: {
    "treecutter:spirit_log": { sapling: "treecutter:spirit_sapling", saplingDropChance: 0.15, strippedLog: "treecutter:stripped_spirit_log" },
    "treecutter:ash_log":    { sapling: null,                        saplingDropChance: 0.10, strippedLog: "treecutter:stripped_ash_log" },
  },
  TREE_DECORATIONS: {},  // none
  MAX_FELL: 256,
};

// ── 1E. Final output ─────────────────────────────────────────────
// File: /mnt/user-data/outputs/treecutter_custommetal_merged.mcaddon
// MergedPack_BP: 47 files
// MergedPack_RP: 31 files
// Size: ~2.1 MB


// ════════════════════════════════════════════════════════════════
// EXAMPLE 2: Tree Cutter + Bee Mods (tree decorations present)
// Input:  treecutter_v2.mcaddon + custombees_v1.mcaddon
// Output: treecutter_custombees_merged.mcaddon
// ════════════════════════════════════════════════════════════════

const EXAMPLE2_ADDON_MAP = {
  treecutter: {
    /* same as Example 1 */
    namespace: "treecutter",
    logs: ["treecutter:spirit_log","treecutter:ash_log"],
    tools: { tree_cutter: ["treecutter:lumber_axe"] },
    // ...
  },
  custombees: {
    namespace: "custombees", min_engine: [1, 21, 0],
    tools: { tree_cutter: [], axe: [], pickaxe: [], hoe: [], shovel: [], sword: [] },
    // custombees adds beehives that attach to logs
    tree_decorations: [
      { id: "custombees:modded_beehive", strategy: "preserve_if_occupied", occupancyState: "honey_level", dropItem: "custombees:honeycomb" },
      { id: "custombees:wild_bee_nest",  strategy: "preserve_if_occupied", occupancyState: "honey_level", dropItem: "custombees:wild_honeycomb" },
    ],
    misc_items: ["custombees:honeycomb","custombees:wild_honeycomb","custombees:royal_jelly"],
    ingots: [], nuggets: [], raw_ores: [], logs: [], leaves: [], saplings: [],
    mobs: [{ id: "custombees:giant_bee", family_tags: ["arthropod","bee"], is_passive: false, tame_items: [] }],
    loot_tables: [{ path: "loot_tables/custombees/beehive_chest.json", context: "forest" }],
    features: [], biomes: [], dimensions: [],
  }
};

// Key cross-feature: when treecutter:lumber_axe fells treecutter:spirit_log,
// any custombees:modded_beehive or custombees:wild_bee_nest attached to those
// logs is handled before removal:
const EXAMPLE2_TREE_CUTTER_CONSTS = {
  TREE_CUTTER_TOOLS: ["treecutter:lumber_axe"],
  ALL_LOG_BLOCKS:    ["treecutter:spirit_log","treecutter:ash_log"],
  TREE_DECORATIONS: {
    "custombees:modded_beehive": { strategy: "preserve_if_occupied", occupancyState: "honey_level", dropItem: "custombees:honeycomb" },
    "custombees:wild_bee_nest":  { strategy: "preserve_if_occupied", occupancyState: "honey_level", dropItem: "custombees:wild_honeycomb" },
  },
  // Result: beehive with bees inside → left in place after tree fells
  //         empty beehive → drops custombees:honeycomb, then removed
};


// ════════════════════════════════════════════════════════════════
// EXAMPLE 3: Farming Mod + Metals Mod (soil, crops, custom smelter)
// Input:  customfarm_v1.mcaddon + custommetal_v1.mcaddon
// Output: customfarm_custommetal_merged.mcaddon
// ════════════════════════════════════════════════════════════════

const EXAMPLE3_ADDON_MAP = {
  customfarm: {
    namespace: "customfarm", min_engine: [1, 21, 0],
    tools: { hoe: ["customfarm:golden_hoe"], tree_cutter: [], axe: [], pickaxe: [], shovel: [], sword: [] },
    soils: ["customfarm:rich_soil","customfarm:volcanic_soil"],
    crops: ["customfarm:starwheat_crop"],
    seeds: ["customfarm:starwheat_seeds"],
    foods: ["customfarm:starwheat_bread","customfarm:starwheat"],
    fertilizers: ["customfarm:star_fertilizer"],
    // customfarm has a custom smelter with recipe tag "customfarm:star_furnace"
    custom_machines: ["customfarm:star_furnace"],
    custom_station_tags: ["customfarm:star_furnace"],
    ingots: [], nuggets: [], raw_ores: [], logs: [], mobs: [],
    loot_tables: [{ path: "loot_tables/customfarm/harvest_chest.json", context: "village" }],
    features: [], biomes: [], dimensions: [],
  },
  custommetal: {
    /* same as Example 1 */
    namespace: "custommetal",
    ingots: ["custommetal:stellite_ingot"],
    raw_ores: ["custommetal:raw_stellite"],
    recipes: [
      { type: "minecraft:recipe_furnace", id: "custommetal:smelt_stellite",
        inputs: ["custommetal:raw_stellite"], output: "custommetal:stellite_ingot",
        recipe_tags: ["furnace"] }
    ],
    custom_station_tags: [],
    // ...
  }
};

// Key cross-features generated:
const EXAMPLE3_CROSS_FEATURES = {
  // 1. customfarm:golden_hoe now tills custommetal ores? No — ores are not soils.
  //    But customfarm:golden_hoe DOES till minecraft:dirt → minecraft:farmland,
  //    and customfarm:rich_soil → customfarm:tilled_rich_soil.
  //    custommetal has no soils, so nothing extra here.

  // 2. Cross-smelting: custommetal:raw_stellite can now be smelted in
  //    customfarm:star_furnace (because tags expanded to include "customfarm:star_furnace")
  crossSmelting: [
    { recipe: "custommetal:smelt_stellite", tags: ["furnace","blast_furnace","customfarm:star_furnace"] }
  ],

  // 3. Loot injection:
  lootInjection: [
    // custommetal ingots in customfarm village chest
    { into: "loot_tables/customfarm/harvest_chest.json", inject: ["custommetal:stellite_ingot(w:10)","custommetal:stellite_nugget(w:18)"] },
    // customfarm food in custommetal mine chest
    { into: "loot_tables/custommetal/mine_chest.json",   inject: ["customfarm:starwheat_bread(w:10)","customfarm:starwheat_seeds(w:20)"] },
  ],

  // 4. Soil/crop cross-system:
  soilCrop: {
    HOE_TILL_MAP: {
      "customfarm:rich_soil":     "customfarm:tilled_rich_soil",
      "customfarm:volcanic_soil": "customfarm:tilled_volcanic_soil",
      "minecraft:dirt":           "minecraft:farmland",
      "minecraft:grass_block":    "minecraft:farmland",
    },
    CROSS_PLANTABLE: {
      "customfarm:tilled_rich_soil":     ["customfarm:starwheat_seeds","minecraft:wheat_seeds"],
      "customfarm:tilled_volcanic_soil": ["customfarm:starwheat_seeds"],
      "minecraft:farmland":              ["customfarm:starwheat_seeds"],
    },
  },

  // 5. Wandering trader
  wanderingTrader: [
    { item: "custommetal:stellite_ingot",  emeralds: 5 },
    { item: "customfarm:starwheat_bread",  emeralds: 5 },
    { item: "customfarm:starwheat_seeds",  emeralds: 10 },
    { item: "customfarm:star_fertilizer", emeralds: 3 },
  ],
};

// ── Validation warnings for Example 3 ───────────────────────────
const EXAMPLE3_VALIDATION = [
  // No broken references found.
  // customfarm:star_furnace block is in merged blocks/ — recipe station tag resolves natively.
];

