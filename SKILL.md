---
name: bedrock-addon-combiner
description: "Combine multiple Minecraft Bedrock Edition add-ons into a single .mcaddon with ONE merged BP and ONE merged RP. Inventory every pack, deep-merge all BP and RP content, resolve all conflicts (namespace, ID, loot, ore Y-range, AI, scripts, textures, sounds, particles, render controllers, UI, animations, biomes, dimensions), cross-link everything (tree cutters fell modded trees including custom structures like beehives/nests/lanterns attached to them, ores in each other's loot, cross-smelting, tool-block interaction matrix, soil/crop cross-tilling, dimension portals, mob harmony, ore Y-bands, wandering trader, lang merge), validate all references after merge. Output: MergedPack_BP/ + MergedPack_RP/ in one .mcaddon — double-click to install, no load order."
---

# Bedrock Add-on Combiner Skill

You are a senior Minecraft Bedrock modpack engineer. When the user uploads two or more Bedrock add-ons, produce a **single `.mcaddon`** containing exactly **one BP folder** (`MergedPack_BP/`) and **one RP folder** (`MergedPack_RP/`) — every original add-on's content fully merged in, every conflict resolved, every cross-feature woven in, and every reference validated before packaging.

**Architecture:** No separate CompatLayer. Everything lives in `MergedPack_BP/` and `MergedPack_RP/`. Install one BP, one RP. Done.

**Prime directive:** The merged pack must be a strict superset of all inputs — every original feature works exactly as before, plus all new cross-features. If a feature worked in the original it must work in the merged output.

---

## Routing

| Condition | Action |
|-----------|--------|
| User uploads ≥2 `.mcaddon` / `.zip` Bedrock add-on files | **Use this skill** |
| Java Edition mods (`.jar`) | Redirect to `minecraft-modding` or `minecraft-datapack` |
| Only one add-on uploaded | Ask if they want a second; otherwise decline |
| User wants a brand-new add-on from scratch | Decline this skill |

---

## Phase 1 — Deep Inventory

### 1A. Extract all add-ons

```bash
mkdir -p /home/claude/addons /home/claude/merged/BP /home/claude/merged/RP

for addon in /mnt/user-data/uploads/*.mcaddon /mnt/user-data/uploads/*.zip; do
  [ -f "$addon" ] || continue
  name=$(basename "$addon" | sed 's/\.[^.]*$//' | tr ' ' '_' | tr -cd '[:alnum:]_')
  mkdir -p "/home/claude/addons/$name"
  unzip -q "$addon" -d "/home/claude/addons/$name"

  # Flatten single-root zips
  entries=$(ls "/home/claude/addons/$name" | wc -l)
  if [ "$entries" -eq 1 ]; then
    inner=$(ls "/home/claude/addons/$name")
    if [ -d "/home/claude/addons/$name/$inner" ]; then
      mv "/home/claude/addons/$name/$inner"/* "/home/claude/addons/$name/" 2>/dev/null
      rmdir "/home/claude/addons/$name/$inner" 2>/dev/null
    fi
  fi
done
```

### 1B. Classify BP vs RP per pack folder

```python
import json, os

def classify_pack(manifest_path):
    with open(manifest_path) as f:
        m = json.load(f)
    types = [mod.get("type","") for mod in m.get("modules", [])]
    is_bp = any(t in ["data","script","javascript","world_template"] for t in types)
    return ("BP" if is_bp else "RP"), m

for addon_name in os.listdir("/home/claude/addons"):
    for root, dirs, files in os.walk(f"/home/claude/addons/{addon_name}"):
        if "manifest.json" in files:
            pack_type, manifest = classify_pack(f"{root}/manifest.json")
            # ADDON_MAP[addon_name][pack_type] = { path: root, manifest: manifest }
```

### 1C. Full BP inventory

| Path | Extract |
|------|---------|
| `manifest.json` | `header.uuid`, `header.version`, `header.min_engine_version`, all dependency UUIDs, all module types, `@minecraft/server` version pin |
| `items/**/*.json` | Item ID, all components, `minecraft:tags[]`, tool components (`is_axe`/`is_pickaxe`/`is_hoe`/`is_shovel`/`is_sword`), `mining_speed`, `attack_damage`, `durability`, `repair_items`, `enchantable` slot/value, `food` nutrition/saturation, `on_use_on` events |
| `blocks/**/*.json` | Block ID, all tags, `destroy_time`, `explosion_resistance`, `material_instances`, `loot`, `geometry`, `crafting_table` (if custom station), `on_player_destroyed` event, `on_interact` event, `minecraft:unit_cube`/custom shape |
| `entities/**/*.json` | Entity ID, `type_family[]`, all component groups + their full contents, all events, all `behavior.*` goal keys+priorities, `loot.table`, `damage_sensor` filters, `target_nearby_entities` filters, `hurt_by_timestamp`, animations list, render_controllers list |
| `loot_tables/**/*.json` | Full path from BP root, all pools, all entries with `name`+`weight`+`functions`, all `conditions` |
| `recipes/**/*.json` | Identifier, type, all ingredient IDs + counts, output ID + count, `tags[]`, `priority` |
| `trading_tables/**/*.json` | All tiers → trades → wants/gives item IDs, quantities, `max_uses`, `trader_exp`, `reward_exp` |
| `scripts/**/*.js` | All `world.*Events.*subscribe` signatures, all `namespace:id` string literals, all `scoreboard.addObjective` names, all `dynamicProperties` key strings, all `import`/`require` paths, all `system.run`/`runInterval`/`runTimeout` usages |
| `features/**/*.json` | Identifier, feature type, `fill_with` block, `may_replace[]`, y distribution params, `count`, scatter params |
| `feature_rules/**/*.json` | Feature ref, `placement_pass`, biome filter, distribution |
| `biomes/**/*.json` | Biome ID, full `climate` object, full `surface_parameters`, all spawn entries, all feature attachments, `overworld_height`, `world_generation_rules` |
| `dimensions/**/*.json` | Dimension ID, generator, sea_level, build height min/max |
| `spawn_rules/**/*.json` | Entity ID, `population_control`, all conditions (biome filter, brightness, surface/underground, herd, permute_type) |
| `animation_controllers/**/*.json` | All controller IDs, all states, all transitions+conditions, all `on_entry`/`on_exit` commands |
| `animations/**/*.json` | All animation IDs, `loop`, `animation_length`, all bone channels |
| `structures/**/*.mcstructure` | Structure ID (from relative path) |
| `functions/**/*.mcfunction` | All commands — note every `/loot`/`/give`/`/summon`/`/setblock`/`/fill`/`/structure load` block+item+entity ID |
| `blocks/**/*.json` (tree-structure scan) | All blocks decorated ON logs: detect by `"minecraft:placement_filter"` targeting log surfaces, or `"minecraft:placement_direction"` with `face:side`, or ID containing `"nest"/"hive"/"lantern"/"vine"/"mushroom"/"moss"/"lichen"/"cocoon"/"web"/"fungus"` |

### 1D. Full RP inventory

| Path | Extract |
|------|---------|
| `manifest.json` | `header.uuid`, `header.version` |
| `textures/item_texture.json` | All `texture_data.<key>` → paths |
| `textures/terrain_texture.json` | All `texture_data.<key>` → paths |
| `textures/flipbook_textures.json` | All entries |
| `textures/**` (raw files) | All filenames and relative paths |
| `models/entity/**/*.json` | All `geometry.<id>` keys, all bone names |
| `render_controllers/**/*.json` | All `controller.render.<id>` keys, geometry/texture/material expressions |
| `animations/**/*.json` | All `animation.<id>` keys |
| `animation_controllers/**/*.json` | All `controller.animation.<id>` keys |
| `particles/**/*.json` | All `particle_identifier` values, emitter shape, texture ref |
| `sounds/**` | All `.ogg`/`.fsb` paths |
| `sounds/sound_definitions.json` | All event names → files/volume/pitch/category |
| `sounds/music_definitions.json` | All music event names |
| `texts/en_US.lang` | All `key=value` pairs |
| `texts/languages.json` | Language list |
| `ui/**/*.json` | All screen/namespace names, all control types |
| `attachables/**/*.json` | `identifier`, geometry ref, texture ref, render_controller ref |
| `fog/**/*.json` | Fog `identifier`, all distance/density/color settings |
| `biomesClient.json` | All per-biome color/fog client settings |

### 1E. ADDON_MAP structure

```
ADDON_MAP[addon_name] = {
  namespace, bp_uuid, rp_uuid, bp_version, rp_version,
  min_engine,           // [major, minor, patch]
  script_api_version,   // highest "@minecraft/server" version found

  // Items
  tools: { axe:[], pickaxe:[], hoe:[], shovel:[], sword:[], tree_cutter:[], shears:[] },
  armor: { helmet:[], chestplate:[], leggings:[], boots:[] },
  ingots:[], nuggets:[], raw_ores:[], foods:[], seeds:[], saplings:[],
  fertilizers:[],       // items that accelerate crop growth
  misc_items:[],

  // Blocks
  logs:[], stems:[], planks:[], leaves:[], stripped_logs:[], stripped_stems:[],
  ores:{ stone:[], deepslate:[], nether:[], end:[], custom_stone:[] },
  crops:[], soils:[],   // soils = tillable ground blocks
  custom_machines:[],   // crafting stations, smelters, etc.
  decorative_blocks:[],
  tree_decorations:[],  // blocks that attach to trees: beehives, nests, lanterns, vines, fungi, moss

  // World gen
  features:[{ id, type, fill_block, y_min, y_max, count, dimension, biome_filter }],
  feature_rules:[{ id, feature_ref, placement_pass, biome_filter }],
  biomes:[{ id, temperature, downfall, precipitation, surface_block, dimension_tag }],
  dimensions:[{ id, generator, sea_level, y_min, y_max }],

  // Entities
  mobs:[{ id, family_tags, behavior_keys, loot_table, spawn_biomes, spawn_dimension,
          is_passive, is_tameable, tame_items, breed_items }],

  // Data
  loot_tables:[{ path, context, item_ids, table_refs }],
  recipes:[{ type, id, inputs, output, recipe_tags, priority }],
  custom_station_tags:[], // recipe tags for this add-on's custom crafting stations
  trades:[{ tier, wants, gives, max_uses }],
  scoreboards:[], dynamic_props:[],
  functions:[{ path, entity_refs, item_refs, block_refs }],
  script_files:[{ path, event_subscriptions, id_refs, scoreboard_refs, import_paths }],

  // RP
  texture_keys:{ items:{key→path}, terrain:{key→path} },
  sounds:[{ event_name, files, category, volume, pitch }],
  music:[{ event_name, files }],
  particles:[{ identifier, texture_path }],
  render_ctrls:[{ id, geometry_expr, texture_expr }],
  geometries:[{ id, bones }],
  animations_rp:[{ id, length, loop }],
  anim_ctrls_rp:[{ id, states }],
  attachables:[{ identifier, geometry, texture, render_controller }],
  fog_ids:[{ identifier }],
  ui_screens:[{ namespace, screen_name }],
  lang_entries:{ key: value },
}
```

### 1F. Auto-categorization rules

| Signal | Category |
|--------|----------|
| `minecraft:is_axe` OR `"axe"` in ID | `tool → axe` |
| `minecraft:is_pickaxe` OR `"pickaxe"` in ID | `tool → pickaxe` |
| `minecraft:is_hoe` OR `"hoe"` in ID | `tool → hoe` |
| `minecraft:is_shovel` OR `"shovel"` in ID | `tool → shovel` |
| `minecraft:is_sword` OR `"sword"` in ID | `tool → sword` |
| `"lumber"/"tree_cut"/"lumberjack"/"feller"/"chainsaw"` in ID | `tool → tree_cutter` |
| `"shears"/"scissors"` in ID | `tool → shears` |
| `"fertilizer"/"bonemeal"/"growth"` in ID | `fertilizer` |
| Block tag `minecraft:logs` OR `"log"/"stem"/"wood"/"hyphae"` in ID | `log/stem` |
| `"stripped_log"/"stripped_stem"/"stripped_wood"` in ID | `stripped_log/stem` |
| Block tag `minecraft:leaves` OR `"leaves"/"foliage"` in ID | `leaves` |
| `"planks"/"board"` in ID | `planks` |
| `"sapling"/"seedling"/"sprout"` in ID | `sapling` |
| `"ore"` in ID + `"deepslate"` in ID | `ore → deepslate` |
| `"ore"` in ID + `"nether"` in ID | `ore → nether` |
| `"ore"` in ID + `"end_stone"/"end"` in ID | `ore → end` |
| `"ore"` in ID (other) | `ore → stone` |
| Block tag `minecraft:crop` OR `"crop"/"plant"/"wheat"` in ID | `crop` |
| `"soil"/"dirt"/"loam"/"peat"/"humus"` in ID + tillable | `soil` |
| `minecraft:food` component | `food` |
| `"ingot"` in ID | `ingot` |
| `"nugget"` in ID | `nugget` |
| `"raw_"` prefix OR `"raw"` in ID with ore sibling | `raw_ore` |
| `"seed"` in ID | `seed` |
| Block on `log` surface + `"hive"/"beehive"` in ID | `tree_decoration → beehive` |
| Block on `log` surface + `"nest"/"bird"/"egg"` in ID | `tree_decoration → nest` |
| Block on `log` surface + `"lantern"/"light"/"lamp"` in ID | `tree_decoration → lantern` |
| Block on `log` surface + `"vine"/"moss"/"lichen"/"web"` in ID | `tree_decoration → clinging` |
| Block on `log` surface + `"mushroom"/"fungus"/"shelf"` in ID | `tree_decoration → fungal` |
| Block on `log` surface + `"cocoon"/"chrysalis"/"pod"` in ID | `tree_decoration → cocoon` |
| Feature/biome with `"nether"` tag | `dimension → nether` |
| Feature/biome with `"the_end"` tag | `dimension → end` |
| Custom `dimensions/*.json` | `dimension → custom` |

---

## Phase 2 — Conflict Detection, Resolution, and Merge

Run ALL checks. Log every conflict into `CONFLICT_LOG[]`.

### 2A. Priority Order

Higher `header.version` = higher priority. Ties broken by upload order (first uploaded = higher priority). All merge decisions reference this order.

### 2B. Namespace and ID Conflicts

| Conflict | Detection | Resolution |
|----------|-----------|------------|
| Two add-ons share namespace string | Same prefix | Lower-priority namespace → `<name>_alt` in all compat cross-references. Originals unchanged. |
| Same block/item/entity ID | Identical `identifier` | Higher-priority definition is canonical. Lower-priority file copied as `<addon>_<filename>.json`. Both IDs remain in merged pack. |
| Same recipe identifier | Same `description.identifier` | Keep both. Rename lower-priority: append `_<addon_name>`. |
| Same scoreboard objective | Same `addObjective` string | Merged scripts use idempotent pattern: `world.scoreboard.getObjective(name) ?? world.scoreboard.addObjective(name, displayName)` |
| Same dynamic property key | Same key string | Each add-on uses its own key; compat never cross-reads. |

### 2C. BP File Merging Rules

#### items/ and blocks/
- Copy all files to `MergedPack_BP/items/` and `MergedPack_BP/blocks/`.
- On filename collision: rename lower-priority to `<addon>_<filename>.json`. Both definitions present.
- Update cross-references: `minecraft:repairable` repair item IDs, `minecraft:on_use_on` block targets updated to resolved IDs.

#### entities/
- Copy all files.
- On same `identifier`: **deep merge**:
  - `component_groups`: union; key collision → higher-priority wins, log it.
  - `events`: union; event name collision → merge `add.component_groups[]` (deduplicated).
  - Top-level `components`: higher-priority per key; log overrides.
  - `minecraft:behavior.*` goals: union; same goal key → keep higher-priority's `priority` value.
  - `damage_sensor.triggers`: merge arrays (union).
  - Write merged result.

#### loot_tables/
- Copy all files preserving relative paths.
- Path collision: merge `pools[]` from both; deduplicate entries by `name`; preserve all unique `functions`.
- Cap combined `rolls.max` to 8 if total entries > 40.

#### recipes/
- Copy all files.
- Output ID collision: keep both; rename lower-priority identifier.
- **Expand `tags[]`** on ALL furnace/smelting recipes to union of all recipe station tags found across all add-ons — so every ore works in every custom smelter.
- Assign correct `priority` field if missing (default 0).

#### trading_tables/
- Copy all files.
- Path collision: merge `tiers[]`; within same tier index merge `trades[]` (deduplicate by `gives[0].item`).

#### features/ and feature_rules/
- Copy all files.
- ID collision: higher-priority wins; log.
- After full copy, run **ore Y-band redistribution** (Phase 3F) and rewrite all affected feature files.

#### biomes/
- Copy all files.
- ID collision: **deep merge** — `climate` higher-priority wins; mob spawn entries unioned; feature attachments unioned (dedup by ref).
- After full copy, run **climate cross-injection** (Phase 3D).

#### dimensions/
- Copy all files.
- ID collision: higher-priority wins; log.
- After full copy, run **portal linkage** (Phase 3E).

#### spawn_rules/
- Copy all files.
- Entity ID collision: merge `conditions[]` with OR logic — entity spawns if ANY original condition is met.

#### animation_controllers/ (BP)
- Copy all files.
- Controller ID collision: rename lower-priority to `controller.animation.<addon>_<original>`. Update all entity JSON refs in `MergedPack_BP/entities/` to new name.

#### animations/ (BP)
- Copy all files.
- Animation ID collision: rename lower-priority to `animation.<addon>_<original>`. Update entity JSON refs.

#### functions/
- Copy all `.mcfunction` files preserving relative paths.
- Filename collision: rename lower-priority to `<addon>_<original>.mcfunction`. Update `/function` calls in all other merged functions.

#### structures/
- Copy all `.mcstructure` files.
- Filename collision: rename lower-priority to `<addon>_<original>.mcstructure`. Update `/structure load` commands.

#### scripts/
**Do NOT blindly concatenate.** Strategy:
1. Copy each add-on's scripts into `MergedPack_BP/scripts/addon_<name>/` (preserves internal relative imports).
2. Rewrite import paths inside copied scripts to be correct relative to their new subfolder location.
3. Generate `MergedPack_BP/scripts/main.js` (entry point) importing all original entries + all compat modules.
4. Wrap each original import in try/catch.

```js
// MergedPack_BP/scripts/main.js — AUTO-GENERATED
import "./compat/script_event_guard.js";   // MUST be first

try { await import("./addon_treecutter/main.js"); }  catch(e){ console.error("[Merge] treecutter:", String(e)); }
try { await import("./addon_custommetal/main.js"); }  catch(e){ console.error("[Merge] custommetal:", String(e)); }
// ... one line per add-on that has scripts

import "./compat/tree_cutter.js";
import "./compat/tool_block_matrix.js";
import "./compat/soil_crop.js";
import "./compat/loot_injector.js";
import "./compat/dimension_portals.js";
import "./compat/mob_harmony.js";
import "./compat/trade_injector.js";
```

### 2D. RP File Merging Rules

#### textures/item_texture.json and terrain_texture.json
- Merge all `texture_data` objects from all add-ons.
- Key collision: higher-priority wins; rename lower-priority key to `<key>_<addon>`. Update all RP JSON (render_controllers, attachables, entity client JSON) that referenced the old key.

#### textures/flipbook_textures.json
- Merge all entries. Deduplicate by `flipbook_texture` field.

#### textures/ (raw files)
- Copy all, preserving subdirectory structure.
- Filename collision: higher-priority wins; lower-priority renamed to `<addon>_<filename>`. Update referencing JSON.

#### models/entity/
- Copy all geometry JSON.
- Geometry ID collision (`"geometry.<id>"` key): rename lower-priority to `geometry.<addon>_<id>`. Update render_controllers and entity client JSON.

#### render_controllers/
- Copy all files.
- Controller ID collision: rename lower-priority to `controller.render.<addon>_<original>`. Update entity client JSON.

#### animations/ and animation_controllers/ (RP)
- Copy all files.
- ID collision: rename lower-priority with `<addon>_` prefix. Update entity client JSON.

#### particles/
- Copy all particle JSON.
- `particle_identifier` collision: rename lower-priority to `<namespace>_<addon>:<name>`. Update all scripts and entity JSON that reference the particle.

#### sounds/sound_definitions.json
- Merge all events from all add-ons.
- Event name collision: merge `sounds[]` file arrays (union); keep highest `volume`/`pitch`; keep `category` from higher-priority.

#### sounds/music_definitions.json + sounds/ (raw files)
- Merge event entries (collision → higher-priority wins).
- Raw file collision: rename lower-priority with `<addon>_` prefix; update `sound_definitions.json` accordingly.

#### texts/en_US.lang
- Union all `key=value` entries. Duplicate key → higher-priority value wins; log duplicate.
- Append compat-generated entries at bottom.
- Merge `languages.json` (union of language codes).

#### attachables/
- Copy all files.
- `identifier` collision: higher-priority wins; log.
- After texture/geometry renames above, update all attachable JSON refs.

#### fog/
- Copy all fog JSON.
- Fog identifier collision: rename lower-priority to `<namespace>_<addon>:<name>`. Update biome JSON refs.

#### ui/
- Copy all UI JSON.
- Screen namespace collision: **cannot safely auto-merge**. Higher-priority kept. Add "MANUAL REVIEW REQUIRED" entry to CONFLICT_LOG.

#### biomesClient.json
- Merge all per-biome entries. Collision → higher-priority wins.

### 2E. Script Event Guard

`MergedPack_BP/scripts/compat/script_event_guard.js` — **must be imported first** in `main.js`. Prevents double-firing when multiple original scripts subscribe to the same event for the same block/item:

```js
import { world, system } from "@minecraft/server";

// Tracks event keys already handled in the current game tick
// WeakMap not usable here (non-object keys), so use Map with auto-cleanup
const handled = new Map();  // key → tickCount when it was set
let currentTick = 0;

system.runInterval(() => {
  currentTick++;
  // Purge entries older than 1 tick
  for (const [k, t] of handled) {
    if (currentTick - t > 1) handled.delete(k);
  }
}, 1);

export function guardEvent(eventKey) {
  if (handled.has(eventKey)) return false;  // already handled
  handled.set(eventKey, currentTick);
  return true;  // caller should proceed
}

// Patch world events to use guard
const _breakSubs = [];
export function onPlayerBreakBlock(callback) {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const key = `break:${ev.block.typeId}:${ev.player.id}:${ev.block.location.x},${ev.block.location.y},${ev.block.location.z}`;
    if (!guardEvent(key)) return;
    callback(ev);
  });
}

export function onItemUseOn(callback) {
  world.afterEvents.itemUseOn.subscribe((ev) => {
    const key = `useOn:${ev.itemStack?.typeId}:${ev.source?.id}:${ev.block?.location.x},${ev.block?.location.y},${ev.block?.location.z}`;
    if (!guardEvent(key)) return;
    callback(ev);
  });
}
```

---

## Phase 3 — Cross-Add-on Feature Generation

All compat scripts → `MergedPack_BP/scripts/compat/`.
All compat data files → standard paths inside `MergedPack_BP/`.
All compat RP overrides → `MergedPack_RP/`.

### 3A. Tree Cutter — Enhanced with Custom Tree Structure Support

This is the most complex cross-feature. Trees from other add-ons may have **custom structures attached** to their logs or in their canopy: beehives, bird nests, lanterns, hanging vines, shelf mushrooms, silk cocoons, moss patches, etc. The tree cutter must handle all of these correctly.

#### 3A-i. Tree Scan and Structure Detection (BFS, not recursive)

Use **iterative BFS** — never recursive `system.run` chains, which overflow call stacks on large trees.

```js
// MergedPack_BP/scripts/compat/tree_cutter.js
import { world, system, ItemStack } from "@minecraft/server";
import { onPlayerBreakBlock } from "./script_event_guard.js";

// ── Generated from ADDON_MAP ──────────────────────────────────────
const TREE_CUTTER_TOOLS = new Set([
  "treecutter:lumber_axe", "treecutter:mega_axe",
  "custommetal:stellite_axe",   // iron+ axes from any add-on
]);

const ALL_LOG_BLOCKS = new Set([
  "treecutter:spirit_log", "treecutter:ash_log",
  "treecutter:spirit_wood", "treecutter:ash_wood",
]);

const ALL_LEAF_BLOCKS = new Set([
  "treecutter:spirit_leaves", "treecutter:ash_leaves",
]);

// Map: log_id → { sapling, saplingDropChance, strippedLog }
const LOG_DATA = {
  "treecutter:spirit_log": {
    sapling: "treecutter:spirit_sapling", saplingDropChance: 0.15,
    strippedLog: "treecutter:stripped_spirit_log"
  },
};

// Tree decoration handling:
// "drop"     → break block, spawn its loot as items
// "preserve" → leave block in place (don't fell it)
// "trigger"  → fire the block's on_player_destroyed event then remove
const TREE_DECORATIONS = {
  // beehive-type: preserve if occupied, drop if empty
  "custombees:modded_beehive":     { strategy: "preserve_if_occupied", dropItem: "custombees:honeycomb", checkTag: "occupied" },
  "custombees:modded_bee_nest":    { strategy: "preserve_if_occupied", dropItem: "custombees:honeycomb", checkTag: "occupied" },
  // nest-type: always drop contents as items
  "naturemobs:bird_nest":          { strategy: "drop", dropItem: "naturemobs:bird_egg", dropCount: [1,3] },
  // lantern-type: always drop as item
  "magicmod:glowing_lantern":      { strategy: "drop", dropItem: "magicmod:glowing_lantern", dropCount: [1,1] },
  // clinging vegetation: just remove silently (same as shearing leaves)
  "naturemobs:tree_moss":          { strategy: "remove" },
  "naturemobs:hanging_vine":       { strategy: "remove" },
  // fungal shelf: drop item
  "fungi:shelf_mushroom":          { strategy: "drop", dropItem: "fungi:shelf_mushroom", dropCount: [1,2] },
  // cocoon: trigger break event (may spawn entity)
  "insects:silk_cocoon":           { strategy: "trigger" },
};

// Any block ID containing these strings is auto-classified as a decoration
const DECORATION_KEYWORDS = ["nest","hive","lantern","vine","moss","lichen","mushroom","fungus","cocoon","web","pod","crystal"];

const MAX_FELL_BLOCKS = 256;
// ─────────────────────────────────────────────────────────────────

onPlayerBreakBlock((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held || !TREE_CUTTER_TOOLS.has(held.typeId)) return;

  const blockType = ev.block.typeId;
  const isLog = ALL_LOG_BLOCKS.has(blockType) || ev.block.hasTag("minecraft:logs");
  if (!isLog) return;

  // Capture values before event ends
  const origin = { ...ev.block.location };
  const dim = ev.player.dimension;
  const player = ev.player;

  system.run(() => {
    // Phase 1: BFS scan — find all connected logs + attached decorations
    const { logs, decorations } = scanTree(dim, origin);

    // Phase 2: Handle decorations first (before removing logs)
    for (const { pos, blockId } of decorations) {
      handleDecoration(dim, pos, blockId);
    }

    // Phase 3: Remove all logs in BFS order (bottom-up is already natural from BFS)
    let broken = 0;
    for (const { pos, blockId } of logs) {
      if (broken >= MAX_FELL_BLOCKS) break;
      const block = dim.getBlock(pos);
      if (!block || block.typeId !== blockId) continue;

      // Drop sapling from this log's data
      const logData = LOG_DATA[blockId];
      if (logData && Math.random() < logData.saplingDropChance) {
        dim.spawnItem(new ItemStack(logData.sapling, 1), { x: pos.x+.5, y: pos.y+1, z: pos.z+.5 });
      }

      block.setType("minecraft:air");
      broken++;
    }

    // Phase 4: Consume durability proportionally to blocks broken
    consumeDurability(player, broken);
  });
});

function scanTree(dim, origin) {
  const logs = [];
  const decorations = [];
  const visited = new Set();
  const queue = [origin];

  while (queue.length > 0 && logs.length < MAX_FELL_BLOCKS) {
    const pos = queue.shift();
    const key = `${pos.x},${pos.y},${pos.z}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const block = dim.getBlock(pos);
    if (!block) continue;

    const bType = block.typeId;
    const isLog = ALL_LOG_BLOCKS.has(bType) || block.hasTag("minecraft:logs");
    const isLeaf = ALL_LEAF_BLOCKS.has(bType) || block.hasTag("minecraft:leaves");
    const isDecoration = isTreeDecoration(bType);

    if (isLog) {
      logs.push({ pos, blockId: bType });
      // Check all 6 faces + 4 upper diagonals for connected logs
      const neighbours = [
        {x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:1,z:0},
        {x:1,y:1,z:0},{x:-1,y:1,z:0},{x:0,y:1,z:1},{x:0,y:1,z:-1},
        {x:1,y:1,z:1},{x:-1,y:1,z:1},{x:1,y:1,z:-1},{x:-1,y:1,z:-1},
      ];
      for (const o of neighbours) {
        queue.push({ x: pos.x+o.x, y: pos.y+o.y, z: pos.z+o.z });
      }
      // Also check all 4 horizontal faces for decorations attached to this log
      const sides = [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:-1,z:0}];
      for (const o of sides) {
        const adjPos = { x: pos.x+o.x, y: pos.y+o.y, z: pos.z+o.z };
        const adjKey = `${adjPos.x},${adjPos.y},${adjPos.z}`;
        if (!visited.has(adjKey)) {
          queue.push(adjPos);
        }
      }
    } else if (isLeaf) {
      // Leaves: scan their neighbours for more logs (for multi-canopy trees)
      const above = [{x:0,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}];
      for (const o of above) queue.push({ x: pos.x+o.x, y: pos.y+o.y, z: pos.z+o.z });
    } else if (isDecoration) {
      decorations.push({ pos, blockId: bType });
    }
    // Any other block: stop traversal at that face (solid ground, other structures)
  }

  return { logs, decorations };
}

function isTreeDecoration(blockId) {
  if (TREE_DECORATIONS[blockId]) return true;
  return DECORATION_KEYWORDS.some(kw => blockId.includes(kw));
}

function handleDecoration(dim, pos, blockId) {
  const block = dim.getBlock(pos);
  if (!block || block.typeId !== blockId) return;

  const rule = TREE_DECORATIONS[blockId];

  if (!rule || rule.strategy === "remove") {
    block.setType("minecraft:air");
    return;
  }

  if (rule.strategy === "preserve_if_occupied") {
    // Check block state tag for occupancy
    const permutation = block.permutation;
    const isOccupied = permutation.getState("honey_level") > 0 || permutation.getState("occupied");
    if (isOccupied) return;  // leave in place
    // Empty — drop item and remove
    if (rule.dropItem) {
      dim.spawnItem(new ItemStack(rule.dropItem, 1), { x: pos.x+.5, y: pos.y+.5, z: pos.z+.5 });
    }
    block.setType("minecraft:air");
    return;
  }

  if (rule.strategy === "drop") {
    if (rule.dropItem) {
      const count = rule.dropCount
        ? Math.floor(Math.random() * (rule.dropCount[1]-rule.dropCount[0]+1)) + rule.dropCount[0]
        : 1;
      dim.spawnItem(new ItemStack(rule.dropItem, count), { x: pos.x+.5, y: pos.y+.5, z: pos.z+.5 });
    }
    block.setType("minecraft:air");
    return;
  }

  if (rule.strategy === "trigger") {
    // Fire block destroy event via commands (Scripting API doesn't expose custom block events directly)
    dim.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} air destroy`);
    return;
  }
}

function consumeDurability(player, blocksBroken) {
  // Consume 1 durability per log broken (Scripting API >= 1.14 supports this)
  try {
    const eq = player.getComponent("minecraft:equippable");
    const item = eq?.getEquipment("Mainhand");
    if (!item) return;
    const durComp = item.getComponent("minecraft:durability");
    if (!durComp) return;
    durComp.damage = Math.min(durComp.maxDurability, durComp.damage + blocksBroken);
    eq.setEquipment("Mainhand", item);
  } catch (_) {
    // Durability API may not be available in all engine versions — fail silently
  }
}
```

#### 3A-ii. Stripping Cross-Compatibility

Any axe (not just tree_cutters) from any add-on should be able to strip any modded log from any other add-on, if the log has a `stripped` variant registered.

```js
// Appended to tree_cutter.js
const STRIP_MAP = {
  // log_id → stripped_log_id (generated from ADDON_MAP LOG_DATA)
  "treecutter:spirit_log":  "treecutter:stripped_spirit_log",
  "treecutter:ash_log":     "treecutter:stripped_ash_log",
};
const ALL_AXE_TOOLS = new Set([
  ...Array.from(TREE_CUTTER_TOOLS),
  "custommetal:stellite_axe",
  // all axe-type tools from all add-ons
]);

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held || !ALL_AXE_TOOLS.has(held.typeId)) return;

  const stripped = STRIP_MAP[ev.block.typeId];
  if (!stripped) return;

  ev.cancel = true;
  system.run(() => {
    ev.block.setType(stripped);
    // Play stripping sound
    ev.player.dimension.playSound("dig.wood", ev.block.location, { volume: 1, pitch: 0.8 });
  });
});
```

### 3B. Tool–Block Interaction Matrix

Every tool type from every add-on should correctly interact with every relevant block type from every other add-on.

```js
// MergedPack_BP/scripts/compat/tool_block_matrix.js
import { world, system } from "@minecraft/server";
import { onPlayerBreakBlock } from "./script_event_guard.js";

// ── Generated from ADDON_MAP ──────────────────────────────────────
// Pickaxe tier hierarchy (higher index = higher tier)
const TIER_ORDER = ["wood","stone","iron","gold","diamond","netherite"];

const PICKAXE_TOOLS = [
  { id: "custommetal:stellite_pickaxe", tier: "diamond" },
];

// Ores that require a specific tier to mine
const ORE_TIER_REQUIREMENTS = {
  "custommetal:stellite_ore":           "iron",
  "custommetal:deepslate_stellite_ore": "iron",
  // all ores from all add-ons, with their required tier
};

// Shovel-tillable soils from all add-ons (shovel from addon A works on soil from addon B)
const ALL_MODDED_SOILS = new Set([
  "customfarm:rich_soil", "customfarm:volcanic_soil",
]);

// Hoe-tillable soils → what they turn into when tilled
const HOE_TILL_MAP = {
  "customfarm:rich_soil":     "customfarm:tilled_rich_soil",
  "customfarm:volcanic_soil": "customfarm:tilled_volcanic_soil",
  "minecraft:dirt":           "minecraft:farmland",
  "minecraft:grass_block":    "minecraft:farmland",
};

const ALL_HOE_TOOLS = new Set([
  "customfarm:golden_hoe",
  // all hoe-type tools from all add-ons
]);

const ALL_SHOVEL_TOOLS = new Set([
  // all shovel-type tools from all add-ons
]);

const ALL_PICKAXE_TOOLS = new Map([
  // id → tier
  ["custommetal:stellite_pickaxe", "diamond"],
]);
// ─────────────────────────────────────────────────────────────────

// Cross-addon hoe tilling
onPlayerBreakBlock((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held || !ALL_HOE_TOOLS.has(held.typeId)) return;

  const tillResult = HOE_TILL_MAP[ev.block.typeId];
  if (!tillResult) return;

  ev.cancel = true;
  system.run(() => {
    ev.block.setType(tillResult);
    ev.player.dimension.playSound("use.grass", ev.block.location, { volume: 1, pitch: 1 });
  });
});

// Cross-addon ore tier enforcement — prevent mining if tool tier is too low
onPlayerBreakBlock((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held) return;

  const requiredTier = ORE_TIER_REQUIREMENTS[ev.block.typeId];
  if (!requiredTier) return;

  const toolTier = ALL_PICKAXE_TOOLS.get(held.typeId);
  if (!toolTier) return;  // not a registered pickaxe — let vanilla handle it

  const toolTierIndex = TIER_ORDER.indexOf(toolTier);
  const reqTierIndex  = TIER_ORDER.indexOf(requiredTier);

  if (toolTierIndex < reqTierIndex) {
    // Tool too weak: cancel break, play "clunk" sound
    ev.cancel = true;
    system.run(() => {
      ev.player.dimension.playSound("note.bass", ev.block.location, { volume: 0.5, pitch: 0.5 });
    });
  }
  // If tier is sufficient: allow break (don't cancel — let vanilla/original addon handle it)
});
```

### 3C. Cross-Addon Soil and Crop System

```js
// MergedPack_BP/scripts/compat/soil_crop.js
import { world, system, ItemStack } from "@minecraft/server";
import { onItemUseOn } from "./script_event_guard.js";

// ── Generated from ADDON_MAP ──────────────────────────────────────
// Seeds from add-on A can be planted on tilled soils from add-on B
// Key: soil_block_id, Value: array of seed item IDs that can be planted on it
const CROSS_PLANTABLE = {
  "customfarm:tilled_rich_soil": [
    "minecraft:wheat_seeds", "minecraft:carrot", "minecraft:potato",
    "customfarm:starwheat_seeds",
    // all seeds from all add-ons are plantable on any tilled soil
  ],
  "customfarm:tilled_volcanic_soil": [
    "customfarm:starwheat_seeds",
    "netherplants:ember_seed",
  ],
  "minecraft:farmland": [
    "customfarm:starwheat_seeds",
    "netherplants:ember_seed",
  ],
};

// Fertilizers from any add-on work on any registered crop
const ALL_FERTILIZERS = new Set([
  "minecraft:bone_meal",
  "customfarm:star_fertilizer",
  "naturemods:rich_compost",
]);

const ALL_CROP_BLOCKS = new Set([
  "customfarm:starwheat_crop",
  "netherplants:ember_crop",
]);

// Crop block → seed item mapping (for planting handler)
const SEED_TO_CROP = {
  "customfarm:starwheat_seeds": { targetBlock: "customfarm:starwheat_crop", growthStates: 7 },
  "netherplants:ember_seed":    { targetBlock: "netherplants:ember_crop",   growthStates: 5 },
};
// ─────────────────────────────────────────────────────────────────

// Planting cross-addon seeds on cross-addon soils
onItemUseOn((ev) => {
  const itemId = ev.itemStack?.typeId;
  const blockId = ev.block?.typeId;
  if (!itemId || !blockId) return;

  const compatibleSoils = Object.entries(CROSS_PLANTABLE).find(([soil, seeds]) =>
    soil === blockId && seeds.includes(itemId)
  );
  if (!compatibleSoils) return;

  const cropData = SEED_TO_CROP[itemId];
  if (!cropData) return;

  system.run(() => {
    const above = ev.block.above();
    if (!above || above.typeId !== "minecraft:air") return;
    above.setType(cropData.targetBlock);
    // Set initial growth state
    try { above.setPermutation(above.permutation.withState("growth", 0)); } catch(_) {}
    // Consume seed from player inventory
    const inv = ev.source.getComponent("minecraft:inventory")?.container;
    if (inv) {
      const slot = ev.source.selectedSlotIndex;
      const item = inv.getItem(slot);
      if (item && item.typeId === itemId && item.amount > 0) {
        item.amount -= 1;
        inv.setItem(slot, item.amount === 0 ? undefined : item);
      }
    }
  });
});

// Cross-addon fertilizer on cross-addon crops
onItemUseOn((ev) => {
  const itemId = ev.itemStack?.typeId;
  const blockId = ev.block?.typeId;
  if (!itemId || !blockId) return;
  if (!ALL_FERTILIZERS.has(itemId) || !ALL_CROP_BLOCKS.has(blockId)) return;

  system.run(() => {
    const block = ev.block;
    try {
      const currentGrowth = block.permutation.getState("growth") ?? 0;
      const maxGrowth = SEED_TO_CROP[
        Object.keys(SEED_TO_CROP).find(s => SEED_TO_CROP[s].targetBlock === blockId)
      ]?.growthStates ?? 7;
      const newGrowth = Math.min(maxGrowth, currentGrowth + Math.floor(Math.random() * 3) + 2);
      block.setPermutation(block.permutation.withState("growth", newGrowth));
      // Growth particles
      block.dimension.spawnParticle("minecraft:crop_growth_emitter", {
        x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5
      });
    } catch(_) {}
  });
});
```

### 3D. Climate-Gated Biome Cross-Injection

Generate `MergedPack_BP/feature_rules/compat/<addonb_feature>_in_<addona_dim>.json` for each climate-compatible pair:

**Climate compatibility matrix:**

| Add-on B biome temperature | Compatible injection targets |
|---------------------------|------------------------------|
| `< 0.15` (frozen) | Overworld frozen zones, custom cold dimensions |
| `0.15 – 0.5` (temperate) | Overworld, overworld-like custom dims |
| `> 0.5` (warm/hot) | Overworld warm zones, Nether-adjacent custom dims |
| `precipitation = none` | Desert zones, Nether, End-adjacent dims |
| Biome has `nether` tag | Nether and custom Nether-type dims only |
| Biome has `the_end` tag | End and custom End-type dims only |

Template:
```json
{
  "format_version": "1.13.0",
  "minecraft:feature_rules": {
    "description": {
      "identifier": "compat:inject_<addonb_feature>_into_<addona_dim>",
      "places_feature": "<addonb>:<feature_id>"
    },
    "conditions": {
      "placement_pass": "surface_pass",
      "minecraft:biome_filter": [
        { "test": "has_biome_tag", "value": "<addona_dimension_biome_tag>" }
      ]
    },
    "distribution": {
      "iterations": 1,
      "x": { "distribution": "uniform", "extent": [0, 16] },
      "y": "query.heightmap(v.worldx, v.worldz)",
      "z": { "distribution": "uniform", "extent": [0, 16] }
    }
  }
}
```

### 3E. Dimension Portal Linkage

`MergedPack_BP/scripts/compat/dimension_portals.js`:

```js
import { world, system } from "@minecraft/server";

const PORTAL_LINKS = [
  // Generated from ADDON_MAP dimensions
  {
    frameBlock: "addona:portal_frame",
    activatorItem: null,                    // null = vanilla flint_and_steel
    alternateActivator: "addonb:dim_key",   // hold this for alternate destination
    fromDimension: "minecraft:overworld",
    toDimension: "addona:custom_dim",
    alternateDimension: "addonb:other_dim",
    spawnY: 64,
    cooldownTicks: 80,                      // prevent re-fire for 4 seconds
    particle: "minecraft:portal_directional"
  },
];

const portalCooldowns = new Map();  // playerId → tick when cooldown expires

let tick = 0;
system.runInterval(() => tick++, 1);

world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  for (const link of PORTAL_LINKS) {
    if (ev.block.typeId !== link.frameBlock) continue;
    if (ev.player.dimension.id !== link.fromDimension) continue;

    // Cooldown check
    const cooldownEnd = portalCooldowns.get(ev.player.id) ?? 0;
    if (tick < cooldownEnd) continue;

    // Determine destination
    const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    const useAlternate = link.alternateActivator && held?.typeId === link.alternateActivator;
    const destination = useAlternate ? link.alternateDimension : link.toDimension;

    const loc = ev.player.location;
    system.run(() => {
      try {
        ev.player.teleport(
          { x: loc.x, y: link.spawnY, z: loc.z },
          { dimension: world.getDimension(destination) }
        );
        world.getDimension(destination).spawnParticle(
          link.particle, { x: loc.x, y: link.spawnY+1, z: loc.z }
        );
        portalCooldowns.set(ev.player.id, tick + link.cooldownTicks);
      } catch(e) {
        console.error("[Merge] Portal error:", String(e));
      }
    });
    break;
  }
});
```

### 3F. Ore Y-Band Redistribution

```
Algorithm (per dimension):
  1. Collect all ore features in this dimension from all add-ons.
  2. Sort ascending by tier: stone(0) iron(1) gold(2) diamond(3) netherite(4) custom(5+).
  3. Y ranges per dimension:
       overworld: [-64, 320]  (384 blocks)
       nether:    [0, 128]
       end:       [0, 256]
       custom:    [dimension.y_min, dimension.y_max]
  4. Allocate bands:
       available_range = y_max - y_min
       band_size = max(16, floor(available_range / ore_count))
       If band_size < 8: compress to 8; flag README with warning.
       ore[0] → y_min .. y_min+band_size
       ore[1] → y_min+band_size .. y_min+2*band_size
       etc.
  5. Rewrite each ore's feature JSON (fill_with, y_min, y_max) in MergedPack_BP/features/.
  6. Feature rules reference feature by ID — no changes needed there.
  7. Emit full ore Y-band table in embedded README.
```

### 3G. Cross-Loot Injection

Generate `MergedPack_BP/loot_tables/compat/cross_addon_pool.json` and inject into every add-on loot table via pool merge (per Phase 2C loot_tables rules). Items come from ALL other add-ons (never self-injection).

**Context → inject categories:**

| Path substring | Inject |
|----------------|--------|
| `mine`/`mineshaft`/`cave`/`shaft` | `ingot`, `raw_ore`, `nugget` |
| `village`/`farm`/`harvest`/`barn` | `food`, `seed`, `sapling` |
| `dungeon`/`castle`/`fortress`/`bastion` | `ingot`, `armor_piece`, `misc` |
| `forest`/`tree`/`hollow`/`nature` | `food`, `seed`, `sapling`, `misc` |
| `nether`/`hell`/`basalt` | `ingot`, `misc` |
| `end`/`chorus`/`city` | `ingot`, `misc` |
| `shipwreck`/`ocean`/`ruin` | `raw_ore`, `misc` |
| `temple`/`pyramid`/`jungle` | `food`, `ingot`, `misc` |
| fallback | `ingot`, `misc` |

**Weight + count per category:**

| Category | Weight | Count |
|----------|--------|-------|
| ingot | 10 | 1–3 |
| nugget | 18 | 2–8 |
| raw_ore | 12 | 1–4 |
| food | 10 | 1–3 |
| seed | 20 | 1–5 |
| sapling | 8 | 1–2 |
| armor_piece | 4 | 1–1 |
| misc | 6 | 1–2 |

### 3H. Cross-Smelting and Cross-Repair

- Expand `tags[]` on every `minecraft:recipe_furnace` to the union of all custom smelter recipe tags found across all add-ons. Add `blast_furnace` if missing.
- For every tool with `minecraft:repairable`, check if any other add-on has a same-tier material. If so, add it to `repair_items[]` in the merged item JSON.
- Generate Smithing upgrade recipes if an add-on has a netherite upgrade pattern and another add-on has diamond-equivalent items.

### 3I. Mob Harmony

`MergedPack_BP/scripts/compat/mob_harmony.js`:

```js
import { world, system, ItemStack } from "@minecraft/server";

// ── Generated from ADDON_MAP ──────────────────────────────────────
// Mobs classified as friendly across all add-ons
const FRIENDLY_MOBS = new Set([
  "customfarm:friendly_golem", "treecutter:wood_sprite",
]);

// Hostile mobs that should NOT attack friendly mobs from other add-ons
const HOSTILE_MOBS = new Set([
  "custommetal:ore_golem",
]);

// Cross-addon taming: item from add-on B can tame mob from add-on A
const CROSS_TAME_MAP = [
  { mob: "treecutter:spirit_wolf", tameItems: new Set(["custommetal:stellite_nugget","customfarm:starwheat"]) },
];

// Cross-addon breeding: item from add-on B breeds mob from add-on A
const CROSS_BREED_MAP = [
  { mob: "customfarm:giant_chicken", breedItems: new Set(["treecutter:spirit_sap"]) },
];
// ─────────────────────────────────────────────────────────────────

// Prevent cross-addon hostile mobs from attacking cross-addon friendly mobs
world.beforeEvents.entityHurt.subscribe((ev) => {
  if (!FRIENDLY_MOBS.has(ev.entity.typeId)) return;
  const src = ev.damageSource.damagingEntity;
  if (!src) return;

  const victimNs   = ev.entity.typeId.split(":")[0];
  const attackerNs = src.typeId.split(":")[0];

  // Only block attacks from modded hostile mobs in a different namespace
  if (attackerNs !== "minecraft" && attackerNs !== victimNs && HOSTILE_MOBS.has(src.typeId)) {
    ev.cancel = true;
  }
});

// Cross-addon taming
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player") return;
  const player = damagingEntity;

  for (const entry of CROSS_TAME_MAP) {
    if (hitEntity.typeId !== entry.mob) continue;
    const held = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    if (!held || !entry.tameItems.has(held.typeId)) continue;

    system.run(() => {
      hitEntity.addTag(`tamed_by_${player.id}`);
      hitEntity.nameTag = `${player.name}'s ${hitEntity.typeId.split(":")[1]}`;
      // Consume tame item
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (inv) {
        const slot = player.selectedSlotIndex;
        const item = inv.getItem(slot);
        if (item && item.amount > 0) {
          item.amount -= 1;
          inv.setItem(slot, item.amount === 0 ? undefined : item);
        }
      }
    });
    break;
  }
});

// Cross-addon spawning — generate cross-biome spawn_rules in Phase 3J
```

Also generate `MergedPack_BP/spawn_rules/compat/` files for mobs that should spawn in climate-compatible biomes from other add-ons (same climate compatibility matrix as biome injection in 3D).

### 3J. Wandering Trader Cross-Trades

Generate `MergedPack_BP/trading_tables/compat/wandering_trader_compat.json`. Price formula: `floor(lootWeight / 2)` clamped to `[1, 16]`. Include one trade per injectable item across all add-ons.

### 3K. Sound, Particle, Fog and Lang Merge

- **Sounds:** `MergedPack_RP/sounds/sound_definitions.json` = union of all add-ons' events (per 2D rules).
- **Music:** `MergedPack_RP/sounds/music_definitions.json` = union.
- **Particles:** All particle JSON copied; identifier collisions renamed; scripts+entity JSON updated.
- **Fog:** All fog JSON copied; identifier collisions renamed; biome JSON updated.
- **Lang:** `MergedPack_RP/texts/en_US.lang` = union, higher-priority wins on duplicate keys, compat entries appended.

---

## Phase 4 — Manifests

### MergedPack_BP/manifest.json

```json
{
  "format_version": 2,
  "header": {
    "name": "<AddonA> + <AddonB> + ... Merged Pack",
    "description": "Fully merged modpack. All add-on content combined. Auto-generated.",
    "uuid": "<new-uuid-bp-header>",
    "version": [1, 0, 0],
    "min_engine_version": [<highest across all addons>]
  },
  "modules": [
    { "type": "data",   "uuid": "<new-uuid-bp-data>",   "version": [1, 0, 0] },
    { "type": "script", "language": "javascript",
      "uuid": "<new-uuid-bp-script>", "version": [1, 0, 0],
      "entry": "scripts/main.js" }
  ],
  "dependencies": [
    { "uuid": "<MergedPack-RP-UUID>", "version": [1, 0, 0] },
    { "module_name": "@minecraft/server",    "version": "<highest across all addons>" },
    { "module_name": "@minecraft/server-ui", "version": "<highest across all addons>" }
  ],
  "capabilities": ["script_eval"]
}
```

**Note:** Original add-on UUIDs are NOT listed — their content is fully merged in.

### MergedPack_RP/manifest.json

```json
{
  "format_version": 2,
  "header": {
    "name": "<AddonA> + <AddonB> + ... Merged RP",
    "description": "Fully merged resource pack. All textures, sounds, models, lang from all add-ons.",
    "uuid": "<new-uuid-rp-header>",
    "version": [1, 0, 0],
    "min_engine_version": [<highest across all addons>]
  },
  "modules": [
    { "type": "resources", "uuid": "<new-uuid-rp-module>", "version": [1, 0, 0] }
  ],
  "dependencies": []
}
```

---

## Phase 5 — Validation Pass

**Run before packaging.** Fix all found issues silently; log anything that can't be auto-fixed.

### 5A. BP Reference Validation

| Check | Auto-fix |
|-------|----------|
| Item ID referenced in recipe doesn't exist in merged pack | Remove that ingredient entry; log warning |
| Block ID in loot table entry doesn't exist | Remove that entry; log warning |
| Entity ID in spawn_rules doesn't exist in entities/ | Remove spawn rule; log warning |
| Animation ID in entity JSON not found in animations/ | Try to find it under renamed `<addon>_` prefix; if still missing, remove the animation reference |
| Animation controller ID in entity JSON not found | Same as above |
| Feature ID in feature_rules doesn't exist in features/ | Remove feature_rule entry; log warning |
| Biome tag in feature_rules biome_filter doesn't match any biome | Log warning; leave as-is (may be a vanilla tag) |
| `/function` call in .mcfunction references non-existent function file | Log warning; comment out the line with `# [MERGE WARNING] function not found:` |
| `/structure load` references non-existent .mcstructure | Log warning; comment out the line |
| Loot table path in entity `minecraft:loot` doesn't exist | Log warning; remove the loot component |
| `scoreboard.addObjective` called on same name in two scripts | Wrap with idempotent pattern (already done in 2E guard) |

### 5B. RP Reference Validation

| Check | Auto-fix |
|-------|----------|
| Texture path in item_texture.json doesn't exist in textures/ | Log warning; point to `textures/misc/missing_texture` placeholder |
| Texture path in terrain_texture.json doesn't exist | Same as above |
| Geometry ID in render_controller doesn't exist in models/entity/ | Log warning; fall back to `geometry.humanoid` |
| Texture key in render_controller not in terrain_texture.json or item_texture.json | Log warning; use missing_texture |
| Render controller ID in entity client JSON not found in render_controllers/ | Log warning; remove that controller from entity |
| Animation ID in entity client JSON not found in animations/ | Log warning; remove that animation entry |
| Sound event in entity client JSON not found in sound_definitions.json | Log warning; remove that sound entry |
| Particle identifier in entity JSON not found in particles/ | Log warning; remove that particle entry |
| Attachable geometry/texture/render_controller ref not found | Log warning; skip that attachable |
| Fog ID in biome JSON not found in fog/ | Log warning; remove fog reference |

### 5C. Script Validation

| Check | Auto-fix |
|-------|----------|
| `import` path in a script resolves to a file that doesn't exist after remapping | Log warning; comment out that import in generated main.js |
| Script references block/item/entity ID not present in merged pack | Log warning in README (cannot fix at script level) |
| Two scripts both call `world.scoreboard.addObjective` with same name | Already wrapped idempotently in guard — no action needed |
| Script uses `@minecraft/server` API that's above the declared version | Log warning; update version pin in manifest to required version |

---

## Phase 6 — Package as Single `.mcaddon`

### Final layout

```
<AddonA>_<AddonB>_merged.mcaddon
├── MergedPack_BP/
│   ├── manifest.json
│   ├── items/
│   ├── blocks/
│   ├── entities/
│   ├── loot_tables/
│   │   └── compat/cross_addon_pool.json
│   ├── recipes/
│   ├── trading_tables/
│   │   └── compat/wandering_trader_compat.json
│   ├── features/
│   ├── feature_rules/
│   │   └── compat/
│   ├── biomes/
│   ├── dimensions/
│   ├── spawn_rules/
│   │   └── compat/
│   ├── animation_controllers/
│   ├── animations/
│   ├── structures/
│   ├── functions/
│   └── scripts/
│       ├── main.js
│       ├── addon_<name>/   (one per add-on with scripts)
│       └── compat/
│           ├── script_event_guard.js
│           ├── tree_cutter.js
│           ├── tool_block_matrix.js
│           ├── soil_crop.js
│           ├── loot_injector.js
│           ├── dimension_portals.js
│           ├── mob_harmony.js
│           └── trade_injector.js
│
├── MergedPack_RP/
│   ├── manifest.json
│   ├── textures/
│   │   ├── item_texture.json
│   │   ├── terrain_texture.json
│   │   ├── flipbook_textures.json
│   │   └── [all texture files]
│   ├── models/entity/
│   ├── render_controllers/
│   ├── animations/
│   ├── animation_controllers/
│   ├── particles/
│   ├── sounds/
│   │   ├── sound_definitions.json
│   │   └── music_definitions.json
│   ├── texts/
│   │   ├── en_US.lang
│   │   └── languages.json
│   ├── attachables/
│   ├── fog/
│   ├── ui/
│   └── biomesClient.json
│
└── README.md
```

### Packaging commands

```bash
WORK="/home/claude/merged"
OUTPUT_NAME="<AddonA>_<AddonB>_merged"
cp /home/claude/README.md "$WORK/README.md"
cd "$WORK"
zip -r "/mnt/user-data/outputs/${OUTPUT_NAME}.mcaddon" MergedPack_BP/ MergedPack_RP/ README.md
echo "✓ ${OUTPUT_NAME}.mcaddon — BP: $(find MergedPack_BP -type f | wc -l) files, RP: $(find MergedPack_RP -type f | wc -l) files, Size: $(du -sh /mnt/user-data/outputs/${OUTPUT_NAME}.mcaddon | cut -f1)"
```

Output naming: `<A>_<B>[_<C>]_merged.mcaddon` (max 3 names; `_and_N_more` if exceeded). Strip version numbers, spaces → underscores.

---

## Phase 7 — Embedded README.md

```markdown
# Merged Modpack: [AddonA] + [AddonB] + ...
Auto-generated by bedrock-addon-combiner.

## Install
Double-click `<filename>.mcaddon`.
Activate ONE BP + ONE RP in world settings. Nothing else needed.

## Add-ons merged
| Add-on | Version | Items | Blocks | Entities | Has Scripts |
|--------|---------|-------|--------|----------|-------------|

## Cross-features active
| Feature | Details |
|---------|---------|
| ✅ Tree Cutting | Tools: [...] cut logs: [...] with decoration handling: [...] |
| ✅ Log Stripping | All axes strip all modded logs to stripped variants |
| ✅ Tool–Block Matrix | Pickaxe tiers enforced across all add-on ores |
| ✅ Soil & Crops | All hoes till all modded soils; all seeds plant on all tilled soils |
| ✅ Cross-Fertilizing | All fertilizers accelerate all modded crops |
| ✅ Loot Injection | [N] items injected across [N] loot tables |
| ✅ Cross-Smelting | [N] recipes + [N] cross-repair entries |
| ✅ Ore Y-Bands | See table below |
| ✅ Dimension Portals | [list or "None"] |
| ✅ Mob Harmony | Protected: [...] — Cross-taming: [...] |
| ✅ Wandering Trader | [N] trades added |
| ✅ Lang | [N] entries merged |

## Conflicts resolved
| # | Type | Add-ons | Conflict | Resolution |
|---|------|---------|----------|------------|

## Validation warnings
| # | File | Issue | Action taken |
|---|------|-------|--------------|

## Manual review required
[UI screen conflicts that could not be auto-merged]

## Ore Y-band distribution
| Ore | Dimension | Y min | Y max | Band |
|-----|-----------|-------|-------|------|

## Tree decorations handled
| Block | Strategy | Notes |
|-------|----------|-------|

## Known limitations
- Scripting API features require Beta APIs enabled in world settings.
- Not available in Education Edition.
- Loot injection targets loot table paths known at generation time.
- UI screen merging requires manual review (see above).
```

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Add-on has no BP (RP-only) | Merge RP only; skip all BP logic for that add-on |
| Add-on uses legacy `format_version 1.10` items | Parse `"minecraft:item"` wrapper; preserve format in merged output |
| Add-on uses `format_version "1.16.100"` blocks | Parse component format; preserve as-is |
| No loot tables in add-on | Skip loot injection; note in README |
| Encrypted `.mcaddon` | Skip entirely; warn user; do not include |
| More than 2 add-ons | All logic is fully N-way throughout all phases |
| Tool tier undetectable | Default to `diamond` tier |
| Combined output > 200 MB | Warn user; proceed; suggest splitting if import fails |
| Conflicting `min_engine_version` | Use highest; warn if above current stable release |
| No declared script entry point | Scan `scripts/` root for `index.js` or `main.js`; import all root `.js` files if not found |
| Two add-ons pin different `@minecraft/server` versions | Use highest in merged manifest |
| Duplicate `.mcstructure` filename | Rename lower-priority to `<addon>_<original>.mcstructure`; update `/structure load` calls |
| Add-on references block/item from another add-on also being merged | Both are in merged pack — reference resolves natively; no action needed |
| `world_template` module in add-on | Extract settings as data module; warn user template features may need manual activation |
| Script imports third-party npm package | Cannot bundle; copy script as-is; note in README that package must be side-loaded |
| Tree with > 256 connected log blocks | Fell up to MAX_FELL_BLOCKS; leave remaining; note in README as "very large trees may not fully fell" |
| Tree decoration with unknown block ID matching decoration keywords | Apply `"remove"` strategy as safe default |
| Custom crafting station from add-on A used in add-on B recipe | Both in merged pack; recipe station tag is present; resolves natively |
| Add-on A ore requires add-on B pickaxe tier to mine | Tier enforcement in `tool_block_matrix.js` handles this automatically |
| Biome from add-on A uses surface block from add-on B | Both in merged pack; reference resolves natively |
