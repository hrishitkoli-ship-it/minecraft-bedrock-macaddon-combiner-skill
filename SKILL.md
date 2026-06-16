---
name: bedrock-addon-combiner
description: "Combine multiple Minecraft Bedrock Edition add-ons into a single .mcaddon containing ONE merged BP and ONE merged RP. When the user uploads .mcaddon or .zip files, inventory every pack, deep-merge all BP content (items, blocks, entities, loot tables, recipes, scripts, features, biomes, dimensions, spawn rules, animations) and all RP content (textures, models, sounds, particles, lang, UI, fog, render controllers) into one unified pair, resolve all conflicts (namespace, ID, loot table, Y-range ore overlap, entity AI, script events, texture keys, sound events, particle IDs, render controllers, geometry, UI, animation controllers, biome, dimension, climate), and weave in cross-linking (tree cutters fell all modded trees, ores in each other's loot, cross-smelting, dimension portals, mob harmony, ore Y-band redistribution, wandering trader trades, lang merge). Output: MergedPack_BP/ + MergedPack_RP/ inside one .mcaddon — double-click to install, no load order needed."
---

# Bedrock Add-on Combiner Skill

You are a senior Minecraft Bedrock modpack engineer. When the user uploads two or more Bedrock add-ons, produce a **single `.mcaddon`** containing exactly **one BP folder** and **one RP folder** — every original add-on's content fully merged in, conflicts resolved, and all cross-add-on features woven directly into the unified pack.

**Architecture:** No separate CompatLayer pack. Everything lives in `MergedPack_BP/` and `MergedPack_RP/`. The user installs one BP and one RP. Done.

**Prime directive:** The merged pack must be a strict superset of all input add-ons — every original feature still works, plus all new cross-features.

---

## Routing

| Condition | Action |
|-----------|--------|
| User uploads ≥2 `.mcaddon` / `.zip` Bedrock add-on files | **Use this skill** |
| Java Edition mods (.jar) | Redirect to `minecraft-modding` or `minecraft-datapack` |
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

  # Flatten single-root zips: addon_name/BP/ + addon_name/RP/ → BP/ + RP/ at root
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

### 1B. Identify BP and RP folders per add-on

For each extracted add-on, scan every subfolder's `manifest.json` and classify:

```python
import json, os

def classify_pack(manifest_path):
    with open(manifest_path) as f:
        m = json.load(f)
    types = [mod.get("type","") for mod in m.get("modules",[])]
    is_bp = any(t in ["data","script","javascript","world_template"] for t in types)
    is_rp = any(t in ["resources"] for t in types)
    return ("BP" if is_bp else "RP"), m

# Walk each addon dir looking for manifest.json files
for addon_name in os.listdir("/home/claude/addons"):
    addon_path = f"/home/claude/addons/{addon_name}"
    for root, dirs, files in os.walk(addon_path):
        if "manifest.json" in files:
            pack_type, manifest = classify_pack(f"{root}/manifest.json")
            # register: ADDON_MAP[addon_name][pack_type] = { path: root, manifest: manifest }
```

### 1C. Full inventory checklist — extract from EVERY BP

| Path | Extract |
|------|---------|
| `manifest.json` | `header.uuid`, `header.version`, `header.min_engine_version`, all dependency UUIDs, all module types |
| `items/**/*.json` | Item ID, all component keys, `minecraft:tags` list, tool type components, `minecraft:food`, `minecraft:durability`, `minecraft:repairable.repair_items` |
| `blocks/**/*.json` | Block ID, all tags, `minecraft:destroy_time`, `minecraft:material_instances`, `minecraft:loot`, `minecraft:geometry`, all event triggers |
| `entities/**/*.json` | Entity ID, `minecraft:type_family.family[]`, all component groups keyed by name, all event names, all `minecraft:behavior.*` goal keys and priorities, `minecraft:loot.table`, spawn dimension hints |
| `loot_tables/**/*.json` | Relative path from BP root, full pool array, every `entries[].name` item/table reference, every `functions[]` entry |
| `recipes/**/*.json` | Recipe identifier, recipe type (`shaped`/`shapeless`/`furnace`/`brewing`/`smithing`), all ingredient item IDs, output item ID, `tags[]` array |
| `trading_tables/**/*.json` | All tier entries, all `wants[].item`, all `gives[].item`, `max_uses`, price ranges |
| `scripts/**/*.js` | All `world.*Events.*subscribe(...)` call signatures, all string literals matching `namespace:id` pattern (block/item/entity refs), all `scoreboard.addObjective` name args, all `dynamicProperties` key strings, all `import` statements |
| `features/**/*.json` | Feature identifier, type (`ore_feature`/`tree_feature`/`scatter_feature`/etc.), `fill_with` block ID, `may_replace[]`, `y_distribution_type`, `y_min`, `y_max`, `count` |
| `feature_rules/**/*.json` | Feature ref, `placement_pass`, biome filter conditions |
| `biomes/**/*.json` | Biome ID, `minecraft:climate` (temperature, downfall, precipitation), `minecraft:surface_parameters` (top_material, mid_material, sea_floor_material), all mob spawn entries, all feature refs |
| `dimensions/**/*.json` | Dimension ID, generator type, chunk generator settings, sea level, height range |
| `spawn_rules/**/*.json` | Entity ID, `population_control`, all biome filter conditions, `minecraft:herd` size, all spawn condition component keys |
| `animation_controllers/**/*.json` | Controller identifier, all state names, all `transitions[]`, all `on_entry[]`/`on_exit[]` Molang/command strings |
| `animations/**/*.json` | Animation identifier, `loop`, `animation_length`, bone channel names |
| `structures/**/*.mcstructure` | Structure ID derived from relative path |
| `functions/**/*.mcfunction` | All command strings, any `/loot`, `/give`, `/summon` entity/item IDs referenced |

### 1D. Full inventory checklist — extract from EVERY RP

| Path | Extract |
|------|---------|
| `manifest.json` | `header.uuid`, `header.version` |
| `textures/item_texture.json` | Every `texture_data.<key>.textures` path |
| `textures/terrain_texture.json` | Every `texture_data.<key>.textures` path |
| `textures/flipbook_textures.json` | Every `flipbook_texture`, `atlas_tile`, `ticks_per_frame` |
| `textures/blocks/**` | All filenames |
| `textures/items/**` | All filenames |
| `textures/entity/**` | All filenames |
| `textures/particle/**` | All filenames |
| `textures/ui/**` | All filenames |
| `models/entity/**/*.json` | `geometry.<id>` keys, bone names used by render controllers |
| `render_controllers/**/*.json` | `controller.render.<id>` keys, geometry/texture/material array expressions |
| `animations/**/*.json` | `animation.<id>` keys |
| `animation_controllers/**/*.json` | `controller.animation.<id>` keys |
| `particles/**/*.json` | `particle_identifier` values |
| `sounds/**` | All `.ogg`/`.fsb` relative paths |
| `sounds/sound_definitions.json` | Every event name → files/volume/pitch mapping |
| `sounds/music_definitions.json` | Every music event name |
| `texts/en_US.lang` | Every `key=value` line |
| `texts/languages.json` | Language list |
| `ui/**/*.json` | Screen/namespace names, all `"type"` control values |
| `attachables/**/*.json` | Attachable `identifier`, geometry ref, texture ref, render controller ref |
| `fog/**/*.json` | Fog `identifier`, all distance/density settings |
| `biomesClient.json` | All client biome color/fog overrides |

### 1E. Build ADDON_MAP

```
ADDON_MAP[addon_name] = {
  namespace,
  bp_uuid, rp_uuid, bp_version, rp_version,
  min_engine,                     // [major, minor, patch]
  script_api_version,             // e.g. "1.14.0"

  // BP items by category
  tools: { axe, pickaxe, hoe, shovel, sword, tree_cutter },
  armor: { helmet, chestplate, leggings, boots },
  ingots, nuggets, raw_ores, foods, seeds, saplings, misc_items,

  // BP blocks by category
  logs, stems, planks, leaves, ores: { stone, deepslate, nether, end },
  crops, soils, custom_machines, decorative_blocks,

  // World gen
  features:      [{ id, type, fill_block, y_min, y_max, count, dimension, biome_filter }],
  feature_rules: [{ id, feature_ref, placement_pass, biome_filter }],
  biomes:        [{ id, temperature, downfall, precipitation, surface_block, dimension_tag }],
  dimensions:    [{ id, generator, sea_level, y_min, y_max }],

  // Entities
  mobs: [{ id, family_tags, behavior_keys, loot_table, spawn_biomes, spawn_dimension }],

  // Data
  loot_tables:   [{ path, context, item_ids, table_refs }],
  recipes:       [{ type, id, inputs, output, recipe_tags }],
  trades:        [{ tier, wants, gives, max_uses }],
  scoreboards:   [],
  dynamic_props: [],
  functions:     [{ path, entity_refs, item_refs }],

  // Scripts
  script_files:  [{ path, event_subscriptions, id_refs, scoreboard_refs, dynprop_refs }],

  // RP
  texture_keys:  { items: {key→path}, terrain: {key→path} },
  sounds:        [{ event_name, files, category }],
  music:         [{ event_name, files }],
  particles:     [{ identifier, texture_path }],
  render_ctrls:  [{ id, geometry_expr, texture_expr }],
  geometries:    [{ id, bones }],
  animations:    [{ id, length, loop }],
  anim_ctrls_rp: [{ id, states }],
  attachables:   [{ identifier, geometry, texture, render_controller }],
  fog_ids:       [{ identifier, settings }],
  ui_screens:    [{ namespace, screen_name }],
  lang_entries:  { key: value },
}
```

### 1F. Auto-categorization rules

| Signal in item/block JSON | Category assigned |
|---------------------------|-------------------|
| `minecraft:is_axe` component OR `"axe"` in ID | `tool → axe` |
| `minecraft:is_pickaxe` OR `"pickaxe"` in ID | `tool → pickaxe` |
| `minecraft:is_hoe` OR `"hoe"` in ID | `tool → hoe` |
| `minecraft:is_shovel` OR `"shovel"` in ID | `tool → shovel` |
| `minecraft:is_sword` OR `"sword"` in ID | `tool → sword` |
| `"lumber"/"tree_cut"/"lumberjack"/"feller"` in ID | `tool → tree_cutter` |
| `"helmet"/"cap"/"hood"` in ID | `armor → helmet` |
| `"chestplate"/"tunic"/"shirt"` in ID | `armor → chestplate` |
| `"leggings"/"pants"` in ID | `armor → leggings` |
| `"boots"/"shoes"` in ID | `armor → boots` |
| Block tag `minecraft:logs` OR `"log"/"stem"/"wood"/"hyphae"` in ID | `log/stem` |
| Block tag `minecraft:leaves` OR `"leaves"/"foliage"` in ID | `leaves` |
| `"planks"/"board"` in ID | `planks` |
| `"sapling"/"seedling"` in ID | `sapling` |
| `"ore"` in ID + `"deepslate"` in ID | `ore → deepslate` |
| `"ore"` in ID + `"nether"/"netherrack"` in ID | `ore → nether` |
| `"ore"` in ID + `"end_stone"/"end"` in ID | `ore → end` |
| `"ore"` in ID (otherwise) | `ore → stone` |
| Block tag `minecraft:crop` OR `"crop"/"plant"/"bush"` in ID | `crop` |
| `minecraft:food` component | `food` |
| `"ingot"` in ID | `ingot` |
| `"nugget"` in ID | `nugget` |
| `"raw_"` prefix OR (`"raw"` in ID AND ore sibling exists) | `raw_ore` |
| `"seed"` in ID | `seed` |
| Feature/biome in `dimensions/the_nether` path OR `"nether"` biome tag | `dimension → nether` |
| Feature/biome in `dimensions/the_end` path OR `"the_end"` biome tag | `dimension → end` |
| Custom `dimensions/<id>.json` | `dimension → custom` |

---

## Phase 2 — Conflict Detection, Resolution, and Merge Strategy

Run every check below. Log every conflict into `CONFLICT_LOG[]`. All merges write into `MergedPack_BP/` and `MergedPack_RP/` — never back to originals.

### 2A. File-level Merge Order

Process add-ons in **priority order**: higher `header.version` = higher priority. When two files produce the same output path, the higher-priority add-on's content wins the base, and lower-priority content is merged in according to the rules below.

```
Priority 1 (highest): highest version add-on
Priority 2: next highest
...
Priority N (lowest): lowest version add-on
Cross-compat additions: always appended last, never override original content
```

### 2B. Namespace and ID Conflicts

| Conflict | Detection | Resolution |
|----------|-----------|------------|
| Two add-ons share namespace string | Same prefix before `:` | Lower-priority add-on's namespace → `<name>_compat` in all merged cross-references. Original files keep original IDs; only compat-generated cross-references use the renamed form. Log warning. |
| Same block/item/entity ID in two add-ons | Identical `identifier` string | Higher-priority wins. Lower-priority file copied to merged pack under renamed path `<addon>_<original_filename>`. Both IDs remain accessible; compat layer references the higher-priority one. |
| Same recipe identifier | Same `description.identifier` | Keep both. Rename lower-priority: append `_<addon_name>` to identifier. |
| Same scoreboard objective name in two scripts | Same `addObjective` name string | Merged script wraps all objective accesses: `world.scoreboard.getObjective(name) ?? world.scoreboard.addObjective(name, displayName)` — idempotent, safe regardless of which script runs first. |
| Same dynamic property key across add-ons | Same key string | Each add-on continues using its own key; compat layer never reads or writes a key from the wrong add-on. |

### 2C. BP File Merging Rules

#### items/ and blocks/
- Copy all item/block JSON files from all add-ons into `MergedPack_BP/items/` and `MergedPack_BP/blocks/`.
- On filename collision: rename lower-priority file to `<addon_name>_<original_filename>.json`. Both definitions are present.
- Update any internal cross-references (e.g. `minecraft:repairable` repair item IDs) to use the correct merged ID.

#### entities/
- Copy all entity JSON files.
- On entity ID collision (same `identifier`): **deep merge** the two JSON objects:
  - `component_groups`: union of all groups; on key collision keep higher-priority value, log it.
  - `events`: union; on event name collision merge `add.component_groups[]` arrays (deduplicate).
  - `components` (top-level): higher-priority wins per key; log any overridden key.
  - `minecraft:behavior.*` goals: union; on same goal key keep higher-priority priority value.
  - Write merged result to `MergedPack_BP/entities/<identifier>.json`.

#### loot_tables/
- Copy all loot table files preserving relative paths.
- On path collision: **merge pools** — combine `pools[]` arrays from both files, deduplicate entries by `name` field, write single merged file.
- Cap combined `rolls.max` at 8 if merged pool entry count > 40.

#### recipes/
- Copy all recipe files.
- On recipe output ID collision: keep both, rename lower-priority identifier as `<addon>_<id>`.
- For all furnace recipes (`minecraft:recipe_furnace`): expand `tags[]` to union of all recipe tags found across all add-ons (so any custom smelter from any add-on can process any ore).

#### trading_tables/
- Copy all trading table files.
- On path collision: merge `tiers[]` arrays; within same tier index, merge `trades[]` arrays (deduplicate by `gives[0].item`).

#### features/ and feature_rules/
- Copy all feature and feature_rule files.
- On ID collision: higher-priority wins. Log conflict.
- After merge, run **ore Y-band redistribution** (Phase 3F) and rewrite all affected `feature_rules` files in `MergedPack_BP/feature_rules/`.

#### biomes/
- Copy all biome files.
- On biome ID collision: **deep merge**:
  - `minecraft:climate`: higher-priority wins.
  - `minecraft:surface_parameters`: higher-priority wins; log.
  - Mob spawn entries: union (deduplicate by entity type).
  - Feature attachments: union (deduplicate by feature ref).
- Run **climate compatibility check** (Phase 3D) to inject cross-add-on biome features.

#### dimensions/
- Copy all dimension files.
- On dimension ID collision: higher-priority wins. Log.
- After merge, run **dimension portal linkage** (Phase 3E).

#### spawn_rules/
- Copy all spawn rule files.
- On entity ID collision: **merge conditions[]** with OR logic — the merged entity spawns if ANY original condition is met.

#### animation_controllers/ (BP)
- Copy all files.
- On controller ID collision: rename lower-priority to `controller.animation.<addon>.<original_name>`. Update all entity JSON references in `MergedPack_BP/entities/` that used the old ID.

#### animations/ (BP)
- Copy all files.
- On animation ID collision: rename lower-priority to `animation.<addon>.<original_name>`. Update all entity JSON references.

#### scripts/
- **Do NOT concatenate scripts blindly.** Instead:
  1. Copy all original script files into `MergedPack_BP/scripts/<addon_name>/` subfolders (preserving internal relative imports).
  2. Generate a master entry point `MergedPack_BP/scripts/main.js` that imports every original entry point plus all compat modules.
  3. Wrap each original script import in a try/catch so one add-on's script error doesn't crash others.
  4. Generate compat scripts (tree_cutter.js, loot_injector.js, etc.) directly in `MergedPack_BP/scripts/compat/`.

```js
// MergedPack_BP/scripts/main.js — AUTO-GENERATED
// Original add-on scripts
try { await import("./addon_treecutter/main.js"); } catch(e) { console.error("[Compat] treecutter script error:", e); }
try { await import("./addon_custommetal/main.js"); } catch(e) { console.error("[Compat] custommetal script error:", e); }

// Cross-addon compatibility modules
import "./compat/tree_cutter.js";
import "./compat/loot_injector.js";
import "./compat/dimension_portals.js";
import "./compat/mob_harmony.js";
import "./compat/trade_injector.js";
import "./compat/script_event_guard.js";
```

#### functions/
- Copy all `.mcfunction` files preserving relative paths.
- On filename collision: rename lower-priority to `<addon>_<original_name>.mcfunction`. Update any `/function` calls in other merged functions.

#### structures/
- Copy all `.mcstructure` files preserving relative paths.
- On filename collision: rename lower-priority with `<addon>_` prefix.

### 2D. RP File Merging Rules

#### textures/item_texture.json and terrain_texture.json
- Merge all `texture_data` objects from all add-ons into one file.
- On key collision: higher-priority add-on wins. Rename lower-priority key to `<key>_<addon>`. Update all entity/attachable/render_controller JSON in MergedPack_RP that referenced the old key.

#### textures/flipbook_textures.json
- Merge all entries into one array. Deduplicate by `flipbook_texture` field.

#### textures/ (raw files)
- Copy all texture files into MergedPack_RP preserving subdirectory structure.
- On filename collision: higher-priority wins. Lower-priority renamed to `<addon>_<original_filename>`. Update referencing JSON accordingly.

#### models/entity/
- Copy all geometry JSON files.
- On geometry ID collision (`"geometry.<id>"` key): rename lower-priority to `geometry.<addon>_<id>`. Update all render_controller, entity client, and attachable JSON that referenced the old ID.

#### render_controllers/
- Copy all files.
- On controller ID collision: rename lower-priority to `controller.render.<addon>_<original>`. Update all entity client JSON in MergedPack_RP.

#### animations/ (RP)
- Copy all files.
- On animation ID collision: rename lower-priority to `animation.<addon>.<original>`. Update all entity client JSON references.

#### animation_controllers/ (RP)
- Copy all files.
- On controller ID collision: rename lower-priority to `controller.animation.<addon>.<original>`. Update entity client JSON references.

#### particles/
- Copy all particle JSON files.
- On `particle_identifier` collision: rename lower-priority to `<namespace>_<addon>:<name>`. Update all script and entity references.

#### sounds/sound_definitions.json
- **Merge all events** from all add-ons into one file.
- On event name collision: merge `sounds[]` file arrays (union), keep highest `volume`/`pitch`, keep `category` from higher-priority add-on.

#### sounds/music_definitions.json
- Merge all event entries. On collision: higher-priority wins.

#### sounds/ (raw files)
- Copy all `.ogg`/`.fsb` files preserving paths.
- On filename collision: rename lower-priority with `<addon>_` prefix. Update `sound_definitions.json` accordingly.

#### texts/en_US.lang
- **Merge all lang files** into one:
  1. Start with all entries from all add-ons (union).
  2. On duplicate key: higher-priority add-on's value wins. Log duplicate.
  3. Append all compat-generated display name entries at the bottom.
- Also merge `texts/languages.json` (union of language codes).

#### attachables/
- Copy all attachable JSON files.
- On `identifier` collision: higher-priority wins. Log conflict.
- After texture/geometry/render_controller renaming above, update all attachable JSON refs to use the new names.

#### fog/
- Copy all fog JSON files.
- On fog identifier collision: rename lower-priority to `<namespace>_<addon>:<name>`. Update biome JSON references.

#### ui/
- Copy all UI JSON files.
- On screen namespace collision: **cannot safely auto-merge**. Higher-priority add-on's version is kept. Log a "MANUAL REVIEW REQUIRED" warning in README.

#### biomesClient.json
- Merge all biome color/fog entries. On key collision: higher-priority wins.

### 2E. Script Event Guard

Generate `MergedPack_BP/scripts/compat/script_event_guard.js` — prevents double-firing when multiple original scripts subscribe to the same event for the same block/item/entity:

```js
import { world } from "@minecraft/server";

// Registry of which addon "owns" each block/item/entity ID for event handling
// Generated from ADDON_MAP — each ID mapped to its source addon namespace
const EVENT_OWNERS = {
  // block break ownership
  "treecutter:spirit_log": "treecutter",
  "custommetal:stellite_ore": "custommetal",
  // item use ownership
  "treecutter:lumber_axe": "treecutter",
};

// Track which events have already been handled this tick to prevent double-fire
const handledThisTick = new Set();

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  const key = `break:${ev.block.typeId}:${ev.player.id}`;
  if (handledThisTick.has(key)) {
    // Already handled by another addon's subscriber this tick — cancel duplicate
    return;
  }
  handledThisTick.add(key);
  // Clear after tick
  import("@minecraft/server").then(({ system }) => system.run(() => handledThisTick.delete(key)));
});

world.beforeEvents.itemUseOn.subscribe((ev) => {
  const key = `use:${ev.itemStack?.typeId}:${ev.source?.id}`;
  if (handledThisTick.has(key)) return;
  handledThisTick.add(key);
  import("@minecraft/server").then(({ system }) => system.run(() => handledThisTick.delete(key)));
});
```

---

## Phase 3 — Cross-Add-on Feature Generation

All compat scripts go into `MergedPack_BP/scripts/compat/`. All compat data files go into `MergedPack_BP/` under their standard paths. All compat RP overrides go into `MergedPack_RP/`.

### 3A. Tree Cutter Cross-compatibility

```js
// MergedPack_BP/scripts/compat/tree_cutter.js
import { world, system, ItemStack } from "@minecraft/server";

// ── Populated from ADDON_MAP at generation time ───────────────────
const TREE_CUTTER_TOOLS = new Set([
  // All tree_cutter-type tools from all add-ons
  "treecutter:lumber_axe", "treecutter:mega_axe",
  // All iron+ tier axes from all add-ons also fell whole trees
  "custommetal:stellite_axe",
]);

const ALL_MODDED_LOGS = new Set([
  // All log/stem blocks from all add-ons
  "treecutter:spirit_log", "treecutter:ash_log",
]);

const LEAF_SAPLING_MAP = {
  // log_id → { leaves, sapling, dropChance }
  "treecutter:spirit_log": { leaves: "treecutter:spirit_leaves", sapling: "treecutter:spirit_sapling", dropChance: 0.15 },
};
const MAX_FELL_BLOCKS = 128;
// ─────────────────────────────────────────────────────────────────

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held || !TREE_CUTTER_TOOLS.has(held.typeId)) return;
  const blockType = ev.block.typeId;
  if (!ALL_MODDED_LOGS.has(blockType) && !ev.block.hasTag("minecraft:logs")) return;

  const origin = { ...ev.block.location };
  const dim = ev.player.dimension;
  system.run(() => fellTree(dim, origin, new Set(), 0));
});

function fellTree(dim, pos, visited, count) {
  if (count >= MAX_FELL_BLOCKS) return;
  const key = `${pos.x},${pos.y},${pos.z}`;
  if (visited.has(key)) return;
  visited.add(key);

  const block = dim.getBlock(pos);
  if (!block) return;
  if (!ALL_MODDED_LOGS.has(block.typeId) && !block.hasTag("minecraft:logs")) return;

  const pair = LEAF_SAPLING_MAP[block.typeId];
  if (pair && Math.random() < pair.dropChance) {
    dim.spawnItem(new ItemStack(pair.sapling, 1), { x: pos.x+.5, y: pos.y+1, z: pos.z+.5 });
  }

  block.setType("minecraft:air");
  count++;

  const offsets = [
    {x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},
    {x:0,y:1,z:0},
    {x:1,y:1,z:0},{x:-1,y:1,z:0},{x:0,y:1,z:1},{x:0,y:1,z:-1},
    {x:1,y:1,z:1},{x:-1,y:1,z:1},{x:1,y:1,z:-1},{x:-1,y:1,z:-1},
  ];
  for (const o of offsets) {
    system.run(() => fellTree(dim, {x:pos.x+o.x,y:pos.y+o.y,z:pos.z+o.z}, visited, count));
  }
}
```

### 3B. Cross-Loot Injection

Generate `MergedPack_BP/loot_tables/compat/cross_addon_pool.json` and inject it into every add-on loot table by writing **override files** at the same relative path in MergedPack_BP (merged with original pools per 2C loot table merge rules).

**Context → inject categories:**

| Path contains | Inject categories |
|---------------|-------------------|
| `mine`/`mineshaft`/`cave`/`shaft` | `ingot`, `raw_ore`, `nugget` |
| `village`/`farm`/`harvest`/`barn` | `food`, `seed`, `sapling` |
| `dungeon`/`castle`/`fortress`/`bastion` | `ingot`, `armor_piece`, `misc` |
| `forest`/`tree`/`hollow`/`nature` | `food`, `seed`, `sapling`, `misc` |
| `nether`/`hell`/`basalt` | `ingot`, `misc` |
| `end`/`chorus`/`city` | `ingot`, `misc` |
| `shipwreck`/`ocean`/`ruin` | `raw_ore`, `misc` |
| `temple`/`pyramid`/`jungle` | `food`, `ingot`, `misc` |
| anything else | `ingot`, `misc` |

**Weight formula per category:**

| Category | Weight | Count min–max |
|----------|--------|--------------|
| ingot | 10 | 1–3 |
| nugget | 18 | 2–8 |
| raw_ore | 12 | 1–4 |
| food | 10 | 1–3 |
| seed | 20 | 1–5 |
| sapling | 8 | 1–2 |
| armor_piece | 4 | 1–1 |
| misc | 6 | 1–2 |

Items in the pool come from ALL other add-ons (never the same add-on that owns the chest).

### 3C. Cross-Smelting

For every `raw_ore → ingot` furnace recipe across all add-ons:
- Expand its `tags[]` to the union of all recipe tags found across all add-ons' recipes (so any custom smelter works with any ore).
- Also add `blast_furnace` if not already present.
- Write the expanded recipe into `MergedPack_BP/recipes/` (overwriting the original copy).

For cross-repair: if tool A is `minecraft:repairable` with material X, and add-on B has a same-tier material Y, add Y to tool A's repair items list in the merged item JSON.

### 3D. Biome and Dimension Climate Compatibility

**Climate compatibility matrix** for deciding whether to inject add-on B's biome features into add-on A's custom dimension:

| Add-on B biome temperature | Inject into |
|---------------------------|-------------|
| `< 0.15` (frozen) | Overworld frozen zones, custom cold dimensions |
| `0.15–0.5` (temperate) | Overworld, overworld-like custom dimensions |
| `> 0.5` (warm/hot) | Overworld warm zones, Nether-adjacent custom dimensions |
| `precipitation = none` | Desert zones, Nether, End-adjacent dimensions |
| Biome has `nether` tag | Nether and custom Nether-type dimensions only |
| Biome has `the_end` tag | End and custom End-type dimensions only |

For each compatible cross-injection, generate a `feature_rules` entry in `MergedPack_BP/feature_rules/compat/`:

```json
{
  "format_version": "1.13.0",
  "minecraft:feature_rules": {
    "description": {
      "identifier": "compat:inject_<addonb_feature>_into_<addona_dimension>",
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

If two or more add-ons define custom dimensions, generate `MergedPack_BP/scripts/compat/dimension_portals.js`:

```js
import { world, system } from "@minecraft/server";

// ── Generated from ADDON_MAP ──────────────────────────────────────
const PORTAL_LINKS = [
  {
    frameBlock: "addona:portal_frame",
    activatorItem: null,              // null = any flint_and_steel interaction
    fromDimension: "minecraft:overworld",
    toDimension: "addona:custom_dim",
    spawnY: 64,
    particle: "minecraft:portal_directional"
  },
  {
    frameBlock: "addona:portal_frame",
    activatorItem: "addonb:dimension_key",  // hold this to redirect to addon B instead
    fromDimension: "minecraft:overworld",
    toDimension: "addonb:other_dim",
    spawnY: 64,
    particle: "minecraft:portal_directional"
  },
];
// ─────────────────────────────────────────────────────────────────

world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  for (const link of PORTAL_LINKS) {
    if (ev.block.typeId !== link.frameBlock) continue;
    if (ev.player.dimension.id !== link.fromDimension) continue;
    if (link.activatorItem) {
      const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
      if (!held || held.typeId !== link.activatorItem) continue;
    }
    const loc = ev.player.location;
    system.run(() => {
      ev.player.teleport(
        { x: loc.x, y: link.spawnY, z: loc.z },
        { dimension: world.getDimension(link.toDimension) }
      );
      world.getDimension(link.toDimension)
        .spawnParticle(link.particle, { x: loc.x, y: link.spawnY+1, z: loc.z });
    });
    break;
  }
});
```

### 3F. Ore Y-Band Redistribution

After merging all feature/feature_rule files, re-assign non-overlapping Y bands:

```
Algorithm per dimension:
  1. Collect all ore features in this dimension from ADDON_MAP.
  2. Sort by tier: stone(0) → iron(1) → gold(2) → diamond(3) → netherite(4) → custom(5+).
  3. Dimension Y ranges: overworld [-64, 320], nether [0, 128], end [0, 256], custom [dimension.y_min, dimension.y_max].
  4. Assign bands greedily:
       band_size = max(16, floor(available_range / ore_count))
       ore[0]: y_min=dim_min,           y_max=dim_min+band_size
       ore[1]: y_min=dim_min+band_size, y_max=dim_min+2*band_size
       ... etc.
  5. If band_size < 8: warn user, compress to 8-block minimum, note in README.
  6. Rewrite each affected feature JSON's y_min/y_max in MergedPack_BP/features/.
  7. No changes needed to feature_rules — they reference the feature by ID.
```

### 3G. Mob Harmony

Generate `MergedPack_BP/scripts/compat/mob_harmony.js`:

```js
import { world, system } from "@minecraft/server";

// ── Generated from ADDON_MAP ──────────────────────────────────────
// Friendly mobs from any add-on that should not be hurt by other add-ons' hostile mobs
const PROTECTED_FRIENDLY_MOBS = new Set([
  "customfarm:friendly_golem", "treecutter:wood_sprite",
]);

// Cross-addon taming: item from add-on B can tame mob from add-on A
const CROSS_TAME = [
  { mob: "treecutter:spirit_wolf", items: new Set(["custommetal:stellite_nugget","customfarm:starwheat"]) },
];

// Cross-addon feeding/breeding
const CROSS_FEED = [
  { mob: "customfarm:giant_chicken", items: new Set(["treecutter:spirit_sap"]), effect: "breed" },
];
// ─────────────────────────────────────────────────────────────────

world.beforeEvents.entityHurt.subscribe((ev) => {
  if (!PROTECTED_FRIENDLY_MOBS.has(ev.entity.typeId)) return;
  const src = ev.damageSource.damagingEntity;
  if (!src) return;
  const victimNs = ev.entity.typeId.split(":")[0];
  const attackerNs = src.typeId.split(":")[0];
  // Block cross-addon hostile mob attacks; allow player, projectiles, environment
  if (attackerNs !== victimNs && attackerNs !== "minecraft") {
    ev.cancel = true;
  }
});

world.afterEvents.itemUseOn.subscribe((ev) => {
  const itemId = ev.itemStack?.typeId;
  if (!itemId) return;
  for (const entry of CROSS_TAME) {
    if (!entry.items.has(itemId)) continue;
    // Taming requires entity proximity check — stub for Scripting API entity interaction
    // Full implementation uses world.afterEvents.entityHitEntity + inventory check
  }
});
```

Also generate cross-biome spawn rule files in `MergedPack_BP/spawn_rules/compat/` for each mob that should spawn in a climate-compatible biome from another add-on.

### 3H. Wandering Trader Cross-Trades

Generate `MergedPack_BP/trading_tables/compat/wandering_trader_compat.json` with one trade entry per injectable item from all add-ons. Price formula: `floor(item.lootWeight / 2)` clamped to `[1, 16]`.

Extend `MergedPack_BP/spawn_rules/minecraft.wandering_trader.json` (copy vanilla, add compat trading table reference if Bedrock API supports it; otherwise note as stub).

### 3I. Sound, Particle, and Fog Merge

- **Sounds:** `MergedPack_RP/sounds/sound_definitions.json` = union of all add-ons' events. Collisions merged per 2D rules.
- **Particles:** All particle JSON copied; collisions renamed per 2D rules. Renamed IDs updated everywhere they're referenced (entity JSON, scripts).
- **Fog:** All fog JSON copied; collisions renamed. Biome JSON refs updated.
- **Music:** `MergedPack_RP/sounds/music_definitions.json` = union.

### 3J. Unified Lang File

`MergedPack_RP/texts/en_US.lang`:
1. Union all entries from all add-ons.
2. Duplicate key → higher-priority value wins.
3. Append cross-compat display name entries for any generated items/recipes.

---

## Phase 4 — Merged Pack Manifests

### MergedPack_BP/manifest.json

```json
{
  "format_version": 2,
  "header": {
    "name": "<AddonA> + <AddonB> + ... Merged Pack",
    "description": "Fully merged modpack. Contains all features from all listed add-ons plus cross-linking. Auto-generated.",
    "uuid": "<newly-generated-uuid-bp-header>",
    "version": [1, 0, 0],
    "min_engine_version": [<highest across all addon min_engine_versions>]
  },
  "modules": [
    {
      "type": "data",
      "uuid": "<newly-generated-uuid-bp-data>",
      "version": [1, 0, 0]
    },
    {
      "type": "script",
      "language": "javascript",
      "uuid": "<newly-generated-uuid-bp-script>",
      "version": [1, 0, 0],
      "entry": "scripts/main.js"
    }
  ],
  "dependencies": [
    { "uuid": "<MergedPack-RP-UUID>", "version": [1, 0, 0] },
    { "module_name": "@minecraft/server",    "version": "<highest across all addons>" },
    { "module_name": "@minecraft/server-ui", "version": "<highest across all addons>" }
  ],
  "capabilities": ["script_eval"]
}
```

**Note:** Original add-on UUIDs are NOT listed as dependencies — their content is fully merged in, not loaded separately.

### MergedPack_RP/manifest.json

```json
{
  "format_version": 2,
  "header": {
    "name": "<AddonA> + <AddonB> + ... Merged RP",
    "description": "Fully merged resource pack. Contains all textures, sounds, models, and lang from all listed add-ons.",
    "uuid": "<newly-generated-uuid-rp-header>",
    "version": [1, 0, 0],
    "min_engine_version": [<highest across all addon min_engine_versions>]
  },
  "modules": [
    {
      "type": "resources",
      "uuid": "<newly-generated-uuid-rp-module>",
      "version": [1, 0, 0]
    }
  ],
  "dependencies": []
}
```

**Note:** No dependencies on original packs. Everything is inside this single RP.

---

## Phase 5 — Package as Single `.mcaddon`

### Final file layout

```
<AddonA>_<AddonB>_merged.mcaddon   ← just a renamed .zip
├── MergedPack_BP/                  ← ONE behavior pack containing everything
│   ├── manifest.json
│   ├── items/                      ← all items from all addons
│   ├── blocks/                     ← all blocks
│   ├── entities/                   ← all entities (deep-merged on collision)
│   ├── loot_tables/                ← all loot tables (pools merged on collision)
│   │   └── compat/cross_addon_pool.json
│   ├── recipes/                    ← all recipes (tags expanded for cross-smelting)
│   ├── trading_tables/             ← all trading tables (merged on collision)
│   │   └── compat/wandering_trader_compat.json
│   ├── features/                   ← all features (Y-bands redistributed)
│   ├── feature_rules/              ← all feature rules + compat injections
│   │   └── compat/
│   ├── biomes/                     ← all biomes (deep-merged on collision)
│   ├── dimensions/                 ← all dimensions
│   ├── spawn_rules/                ← all spawn rules (merged on collision)
│   │   └── compat/
│   ├── animation_controllers/      ← all anim controllers (renamed on collision)
│   ├── animations/                 ← all animations (renamed on collision)
│   ├── structures/                 ← all structures
│   ├── functions/                  ← all mcfunction files
│   └── scripts/
│       ├── main.js                 ← generated entry point importing all scripts
│       ├── addon_treecutter/       ← original addon scripts, isolated
│       ├── addon_custommetal/      ← original addon scripts, isolated
│       └── compat/                 ← generated cross-link scripts
│           ├── tree_cutter.js
│           ├── loot_injector.js
│           ├── dimension_portals.js
│           ├── mob_harmony.js
│           ├── trade_injector.js
│           └── script_event_guard.js
│
├── MergedPack_RP/                  ← ONE resource pack containing everything
│   ├── manifest.json
│   ├── textures/
│   │   ├── item_texture.json       ← merged from all addons
│   │   ├── terrain_texture.json    ← merged from all addons
│   │   ├── flipbook_textures.json  ← merged from all addons
│   │   ├── items/
│   │   ├── blocks/
│   │   ├── entity/
│   │   └── particle/
│   ├── models/entity/
│   ├── render_controllers/
│   ├── animations/
│   ├── animation_controllers/
│   ├── particles/
│   ├── sounds/
│   │   ├── sound_definitions.json  ← merged from all addons
│   │   └── music_definitions.json  ← merged from all addons
│   ├── texts/
│   │   ├── en_US.lang              ← merged from all addons + compat entries
│   │   └── languages.json
│   ├── attachables/
│   ├── fog/
│   ├── ui/
│   └── biomesClient.json           ← merged from all addons
│
└── README.md
```

### Packaging script

```bash
WORK="/home/claude/merged"
OUTPUT_NAME="<AddonA>_<AddonB>_merged"

# MergedPack_BP/ and MergedPack_RP/ are already built in $WORK by this point
cp /home/claude/README.md "$WORK/README.md"

cd "$WORK"
zip -r "/mnt/user-data/outputs/${OUTPUT_NAME}.mcaddon" MergedPack_BP/ MergedPack_RP/ README.md

echo "✓ ${OUTPUT_NAME}.mcaddon"
echo "  BP files: $(find MergedPack_BP -type f | wc -l)"
echo "  RP files: $(find MergedPack_RP -type f | wc -l)"
echo "  Size:     $(du -sh /mnt/user-data/outputs/${OUTPUT_NAME}.mcaddon | cut -f1)"
```

### Output naming

- Pattern: `<AddonA>_<AddonB>[_<AddonC>]_merged.mcaddon`
- Strip version numbers and special characters, spaces → underscores.
- Max 3 add-on names; if more: `<AddonA>_<AddonB>_and_<N>_more_merged.mcaddon`

---

## Phase 6 — Embedded README.md

```markdown
# Merged Modpack: [AddonA] + [AddonB] + ...
Auto-generated by bedrock-addon-combiner.

## Install
Double-click `<filename>.mcaddon`.
Bedrock installs ONE behavior pack and ONE resource pack — that's it.
No load order. No separate installs. No compat layer to remember.

## What's inside
All content from all add-ons is merged into a single BP + RP.

### Add-ons merged
| Add-on | Original Version | Items | Blocks | Entities | Scripts |
|--------|-----------------|-------|--------|----------|---------|
| [AddonA] | [version] | [N] | [N] | [N] | [yes/no] |
| [AddonB] | [version] | [N] | [N] | [N] | [yes/no] |

### Cross-features generated
| Feature | Details |
|---------|---------|
| ✅ Tree Cutting | [list of tools] can fell: [list of log blocks] |
| ✅ Loot Injection | [N] items injected across [N] loot tables |
| ✅ Cross-Smelting | [N] cross-smelting recipes + [N] cross-repair entries |
| ✅ Ore Y-Bands | [table of ore → assigned Y range → dimension] |
| ✅ Dimension Portals | [list of portal linkages, or "None — no custom dimensions"] |
| ✅ Mob Harmony | [list of protected mobs + cross-taming entries] |
| ✅ Wandering Trader | [N] cross-addon trades added |
| ✅ Sounds | [N] sound events merged |
| ✅ Lang | [N] display name entries merged |

## Conflicts resolved
| # | Type | Add-ons involved | Conflict | Resolution applied |
|---|------|-----------------|----------|--------------------|
[one row per CONFLICT_LOG entry, or single row: "None detected"]

## Manual review required
[list any UI screen conflicts that could not be auto-merged]

## Known limitations
- Scripting API features (tree cutting, portals, mob harmony) require Scripting API enabled.
  Not available in Education Edition or on some Realms configurations.
- Loot injection targets loot table paths present at generation time only.
- UI screen merging is not automatic — see Manual Review section above.
- Encrypted add-ons (if any): [list]

## Ore Y-band distribution
| Ore | Dimension | Y min | Y max | Band size |
|-----|-----------|-------|-------|-----------|
[one row per ore from all add-ons]
```

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Add-on has no BP (RP-only) | Merge RP content only; skip all BP cross-linking for that add-on |
| Add-on uses legacy `format_version 1.10` item format | Parse `"minecraft:item"` wrapper; convert to current format in merged output |
| Add-on uses `format_version "1.16.100"` block format | Parse `minecraft:block` component format; preserve as-is in merged output |
| No loot tables in an add-on | Skip loot injection for it; note in README |
| Encrypted `.mcaddon` | Cannot extract — skip entirely; warn user; do not include in merged output |
| More than 2 add-ons | All logic is fully N-way throughout all phases |
| Custom tool tier undetectable | Default to `diamond` tier |
| Combined output > 200 MB | Warn user; proceed; suggest splitting if Bedrock import fails |
| Conflicting `min_engine_version` across add-ons | Use the highest. Warn if above current stable Bedrock release. |
| Original script has no entry point declared | Scan `scripts/` for `index.js` or `main.js`; if not found, import all `.js` files found at root of scripts/ |
| Two add-ons pin different `@minecraft/server` versions | Use the highest pinned version in merged manifest |
| Duplicate structure filename | Rename lower-priority: `<addon>_<original>.mcstructure`; update any `/structure load` commands in merged functions |
| Add-on references items/blocks from another add-on that's also being merged | Resolve reference in merged output — both are now in the same pack, so reference works natively |
| Add-on has `world_template` module | Extract world template settings; merge into merged BP as data module settings; warn user world template features may need manual activation |
| Biome from add-on A conflicts with vanilla biome override from add-on B | Higher-priority add-on wins; log conflict; note in README |
| Script imports a third-party npm package | Cannot merge; copy script as-is; note package must be bundled; warn user |
