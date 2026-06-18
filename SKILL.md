---
name: bedrock-addon-combiner
description: "Combine multiple Minecraft Bedrock Edition add-ons into a single .mcaddon with ONE merged BP and ONE merged RP. Inventory every pack, deep-merge all BP and RP content, resolve all conflicts (namespace, ID, loot, ore Y-range, AI, scripts, textures, sounds, particles, render controllers, UI, animations, biomes, dimensions), cross-link everything (tree cutters fell modded trees including custom structures like beehives/nests/lanterns attached to them, ores in each other's loot, cross-smelting, tool-block interaction matrix, soil/crop cross-tilling, dimension portals, mob harmony, ore Y-bands, wandering trader, lang merge), validate all references after merge. Output: MergedPack_BP/ + MergedPack_RP/ in one .mcaddon — double-click to install, no load order."
---

# Bedrock Add-on Combiner Skill — v4

You are a senior Minecraft Bedrock modpack engineer. When the user uploads two or more Bedrock Edition add-ons (`.mcaddon` or `.zip`), produce a **single `.mcaddon`** containing exactly **one `MergedPack_BP/`** and **one `MergedPack_RP/`** — all content merged, all conflicts resolved, all cross-features woven in, all references validated.

**This skill is Bedrock-only.** For Java Edition mods (`.jar`), tell the user this skill does not apply.

**Prime directive:** The merged pack is a strict superset of all inputs — every original feature works exactly as before, plus all new cross-features.

---

## Minecraft Version Matrix

Bedrock APIs and pack formats change between versions. Detect `min_engine_version` from each add-on's `manifest.json` and apply the correct rules:

| Engine version | Script API module | Item format | Block format | Pack format notes |
|----------------|-------------------|-------------|--------------|-------------------|
| 1.20.x | `@minecraft/server` 1.6–1.8 | `minecraft:item` wrapper | component-based | `format_version: "1.20.0"` |
| 1.21.0–1.21.3 | `@minecraft/server` 1.11–1.13 | flat components | component-based | `format_version: "1.21.0"` |
| 1.21.4–1.21.8 | `@minecraft/server` 1.14–1.16 | flat components | component-based | `format_version: "1.21.40"` |
| 1.21.9+ | `@minecraft/server` 1.17+ | flat components | component-based | `format_version: "1.21.90"` |

**Rules when merging add-ons with different engine versions:**
- Use the **highest** `min_engine_version` found across all add-ons in the merged manifest.
- Use the **highest** `@minecraft/server` version found across all add-ons in the merged manifest.
- If a lower-version add-on uses the `minecraft:item` wrapper format, convert its item JSON to flat component format before merging (the higher-version format is a strict superset).
- Warn in README if any add-on's `min_engine_version` is above the current stable Bedrock release (1.21.x as of this skill version).
- Never downgrade: the merged pack's engine version is always ≥ the highest input.

---

## Routing

| Upload type | Action |
|-------------|--------|
| ≥2 `.mcaddon` / `.zip` Bedrock add-on files | **Run this skill** |
| `.jar` files (Java Edition mods) | Decline. Say: "This skill combines Bedrock add-ons only. For Java mods, use the minecraft-modding or minecraft-datapack skills." |
| One file only | Ask if they have a second; otherwise decline |
| No files, just a description | Decline; ask for actual files |

---

## Phase 1 — Deep Inventory

### 1A. Extract

```bash
mkdir -p /home/claude/addons /home/claude/merged/BP /home/claude/merged/RP

for addon in /mnt/user-data/uploads/*.mcaddon /mnt/user-data/uploads/*.zip; do
  [ -f "$addon" ] || continue
  name=$(basename "$addon" | sed 's/\.[^.]*$//' | tr ' ' '_' | tr -cd '[:alnum:]_')
  mkdir -p "/home/claude/addons/$name"
  unzip -q "$addon" -d "/home/claude/addons/$name"
  # Flatten single-root zips (addon_name/BP/ → BP/)
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

### 1B. Classify BP vs RP

```python
import json, os

def classify_pack(manifest_path):
    with open(manifest_path) as f:
        m = json.load(f)
    types = [mod.get("type","") for mod in m.get("modules", [])]
    is_bp = any(t in ["data","script","javascript","world_template"] for t in types)
    return ("BP" if is_bp else "RP"), m

# ADDON_MAP[addon_name]["BP"] = { path, manifest }
# ADDON_MAP[addon_name]["RP"] = { path, manifest }
for addon_name in os.listdir("/home/claude/addons"):
    for root, dirs, files in os.walk(f"/home/claude/addons/{addon_name}"):
        if "manifest.json" in files:
            pack_type, manifest = classify_pack(f"{root}/manifest.json")
            # register pack
```

### 1C. Full BP Inventory

| Path | What to extract |
|------|----------------|
| `manifest.json` | `header.uuid`, `header.version`, `header.min_engine_version`, dependency UUIDs, module types, `@minecraft/server` version pin |
| `items/**/*.json` | Item ID, all component keys, `minecraft:tags[]`, tool components, `mining_speed`, `attack_damage`, `durability`, `repair_items[]`, `enchantable`, `food` nutrition/saturation, `on_use_on` events |
| `blocks/**/*.json` | Block ID, all tags, `destroy_time`, `explosion_resistance`, `material_instances`, `loot`, `geometry`, `crafting_table` custom station tag, `on_player_destroyed`, `on_interact` |
| `entities/**/*.json` | Entity ID, `type_family[]`, all component groups + contents, all events, all `behavior.*` goals + priorities, `loot.table`, `damage_sensor.triggers[]`, animations list, render_controllers list |
| `loot_tables/**/*.json` | Relative path, all pools, all entries (`name`, `weight`, `functions[]`, `conditions[]`) |
| `recipes/**/*.json` | Identifier, type, all ingredient IDs + counts, output ID + count, `tags[]`, `priority` |
| `trading_tables/**/*.json` | All tiers → trades → `wants[]`/`gives[]` item IDs, `max_uses`, `trader_exp` |
| `scripts/**/*.js` | All `world.*Events.*subscribe` call signatures, all `namespace:id` string literals, all `scoreboard.addObjective` names, all `dynamicProperties` keys, all `import` paths, `@minecraft/server` version used |
| `features/**/*.json` | Identifier, feature type, `fill_with` block, `may_replace[]`, y distribution params, `count` |
| `feature_rules/**/*.json` | Feature ref, `placement_pass`, biome filter conditions, distribution |
| `biomes/**/*.json` | Biome ID, full `climate` object (temperature, downfall, precipitation), `surface_parameters`, spawn entries, feature attachments |
| `dimensions/**/*.json` | Dimension ID, generator, sea_level, y_min, y_max |
| `spawn_rules/**/*.json` | Entity ID, `population_control`, all biome filter conditions, herd size |
| `animation_controllers/**/*.json` | Controller IDs, states, transitions, `on_entry`/`on_exit` commands |
| `animations/**/*.json` | Animation IDs, `loop`, `animation_length`, bone channels |
| `structures/**/*.mcstructure` | Structure ID from relative path |
| `functions/**/*.mcfunction` | All `/loot`/`/give`/`/summon`/`/setblock`/`/structure load` block+item+entity refs |
| Tree decoration scan | Any block whose ID contains `"nest"/"hive"/"lantern"/"vine"/"moss"/"lichen"/"mushroom"/"fungus"/"cocoon"/"web"/"pod"` OR whose `minecraft:placement_filter` targets log surfaces |

### 1D. Full RP Inventory

| Path | What to extract |
|------|----------------|
| `textures/item_texture.json` | All `texture_data.<key>` → paths |
| `textures/terrain_texture.json` | All `texture_data.<key>` → paths |
| `textures/flipbook_textures.json` | All entries |
| `textures/**` (raw files) | All filenames and relative paths |
| `models/entity/**/*.json` | All `geometry.<id>` keys, bone names |
| `render_controllers/**/*.json` | All `controller.render.<id>` keys, geometry/texture/material expressions |
| `animations/**/*.json` | All `animation.<id>` keys |
| `animation_controllers/**/*.json` | All `controller.animation.<id>` keys |
| `particles/**/*.json` | All `particle_identifier` values, texture ref |
| `sounds/sound_definitions.json` | All event names → files/volume/pitch/category |
| `sounds/music_definitions.json` | Music event names |
| `sounds/**` (raw files) | All `.ogg`/`.fsb` paths |
| `texts/en_US.lang` | All `key=value` pairs |
| `texts/languages.json` | Language list |
| `ui/**/*.json` | Screen/namespace names, control types |
| `attachables/**/*.json` | `identifier`, geometry, texture, render_controller refs |
| `fog/**/*.json` | Fog `identifier`, distance/density/color settings |
| `biomesClient.json` | Per-biome color/fog client settings |

### 1E. ADDON_MAP structure

```python
ADDON_MAP = {
  "addon_name": {
    "namespace": str,
    "bp_uuid": str, "rp_uuid": str,
    "bp_version": list, "rp_version": list,
    "min_engine": list,          # e.g. [1, 21, 0]
    "script_api_version": str,   # e.g. "1.14.0"

    # Items (populated from 1C inventory)
    "tools": {
      "axe": [], "pickaxe": [], "hoe": [], "shovel": [],
      "sword": [], "tree_cutter": [], "shears": []
    },
    "armor": {"helmet": [], "chestplate": [], "leggings": [], "boots": []},
    "ingots": [], "nuggets": [], "raw_ores": [],
    "foods": [], "seeds": [], "saplings": [],
    "fertilizers": [],
    "misc_items": [],

    # Blocks
    "logs": [], "stems": [], "planks": [], "leaves": [],
    "stripped_logs": [], "stripped_stems": [],
    "ores": {"stone": [], "deepslate": [], "nether": [], "end": [], "custom_stone": []},
    "crops": [], "soils": [],
    "custom_machines": [],        # blocks that are custom crafting stations
    "decorative_blocks": [],
    "tree_decorations": [],       # blocks that attach to trees

    # World gen
    "features": [],               # { id, type, fill_block, y_min, y_max, count, dimension, biome_filter }
    "feature_rules": [],          # { id, feature_ref, placement_pass, biome_filter }
    "biomes": [],                 # { id, temperature, downfall, precipitation, surface_block, dimension_tag }
    "dimensions": [],             # { id, generator, sea_level, y_min, y_max }

    # Entities
    "mobs": [],                   # { id, family_tags, behavior_keys, loot_table, spawn_biomes, is_passive, tame_items, breed_items }

    # Data
    "loot_tables": [],            # { path, context, item_ids }
    "recipes": [],                # { type, id, inputs, output, recipe_tags, priority }
    "custom_station_tags": [],    # recipe tags from custom crafting stations in this add-on
    "trades": [],                 # { tier, wants, gives, max_uses }
    "scoreboards": [],
    "dynamic_props": [],
    "script_files": [],           # { path, event_subscriptions, id_refs, import_paths }
    "functions": [],              # { path, entity_refs, item_refs, block_refs }

    # RP
    "texture_keys": {"items": {}, "terrain": {}},
    "sounds": [],                 # { event_name, files, category }
    "music": [],
    "particles": [],              # { identifier, texture_path }
    "render_ctrls": [],           # { id, geometry_expr, texture_expr }
    "geometries": [],             # { id, bones }
    "animations_rp": [],
    "anim_ctrls_rp": [],
    "attachables": [],            # { identifier, geometry, texture, render_controller }
    "fog_ids": [],
    "ui_screens": [],
    "lang_entries": {},           # { key: value }
  }
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
| `"fertilizer"/"bonemeal"/"compost"/"growth"` in ID | `fertilizer` |
| Block tag `minecraft:logs` OR `"log"/"stem"/"wood"/"hyphae"` in ID | `log/stem` |
| `"stripped_log"/"stripped_stem"` in ID | `stripped_log/stem` |
| Block tag `minecraft:leaves` OR `"leaves"/"foliage"` in ID | `leaves` |
| `"planks"/"board"` in ID | `planks` |
| `"sapling"/"seedling"/"sprout"` in ID | `sapling` |
| `"ore"` in ID + `"deepslate"` | `ore → deepslate` |
| `"ore"` in ID + `"nether"` | `ore → nether` |
| `"ore"` in ID + `"end"` | `ore → end` |
| `"ore"` in ID (other) | `ore → stone` |
| Block tag `minecraft:crop` OR `"crop"/"plant"/"wheat"` in ID | `crop` |
| `"soil"/"dirt"/"loam"/"peat"/"humus"` in ID + tillable event | `soil` |
| `minecraft:food` component | `food` |
| `"ingot"` in ID | `ingot` |
| `"nugget"` in ID | `nugget` |
| `"raw_"` prefix OR `"raw"` + ore sibling | `raw_ore` |
| `"seed"` in ID | `seed` |
| Block on log surface + `"hive"/"beehive"` in ID | `tree_decoration → beehive` |
| Block on log surface + `"nest"/"bird"/"egg"` in ID | `tree_decoration → nest` |
| Block on log surface + `"lantern"/"light"/"lamp"` in ID | `tree_decoration → lantern` |
| Block on log surface + `"vine"/"moss"/"lichen"/"web"` in ID | `tree_decoration → clinging` |
| Block on log surface + `"mushroom"/"fungus"/"shelf"` in ID | `tree_decoration → fungal` |
| Block on log surface + `"cocoon"/"chrysalis"/"pod"` in ID | `tree_decoration → cocoon` |
| Feature/biome with `"nether"` tag | `dimension → nether` |
| Feature/biome with `"the_end"` tag | `dimension → end` |
| Custom `dimensions/*.json` | `dimension → custom` |

---

## Phase 2 — Conflict Detection, Resolution, and Merge

Log every conflict into `CONFLICT_LOG[]`. All merges target `MergedPack_BP/` and `MergedPack_RP/` — originals are never modified.

### 2A. Priority Order

Higher `header.version` (semver compare) = higher priority. Ties → first uploaded wins.

### 2B. Namespace and ID Conflicts

| Conflict | Detection | Resolution |
|----------|-----------|------------|
| Two add-ons share namespace string | Same prefix | Lower-priority namespace → `<name>_alt` in compat cross-references only. Originals unchanged. |
| Same block/item/entity ID | Identical `identifier` | Higher-priority wins; lower-priority file copied as `<addon>_<filename>.json`. Both IDs kept. |
| Same recipe identifier | Same `description.identifier` | Keep both; rename lower-priority: append `_<addon_name>`. |
| Same scoreboard objective | Same `addObjective` string | Merged scripts use: `world.scoreboard.getObjective(name) ?? world.scoreboard.addObjective(name, displayName)` |
| Same dynamic property key | Same key | Each add-on uses its own key; compat never cross-reads. |

### 2C. BP File Merging

#### items/ and blocks/
- Copy all files. Filename collision → rename lower-priority to `<addon>_<filename>.json`.
- Version format migration: if a lower-version add-on uses `"minecraft:item": { "components": {...} }` wrapper, convert to flat component format matching the highest `min_engine_version` in the merge.
- Update cross-references after rename: `minecraft:repairable.repair_items`, `minecraft:on_use_on` block targets.

#### entities/
- Copy all files.
- Same `identifier` → **deep merge**:
  - `component_groups`: union; key collision → higher-priority wins, logged.
  - `events`: union; event name collision → merge `add.component_groups[]` (dedup).
  - Top-level `components`: higher-priority per key; log overrides.
  - `behavior.*` goals: union; same goal key → higher-priority `priority` value wins.
  - `damage_sensor.triggers[]`: union.

#### loot_tables/
- Copy all files preserving relative paths.
- Path collision → merge `pools[]` from both; deduplicate entries by `name`; preserve all unique `functions`.
- Cap `rolls.max` to 8 if merged entry count > 40.

#### recipes/
- Copy all files.
- Output ID collision → keep both; rename lower-priority.
- **Expand `tags[]`** on ALL furnace/smelting recipes to the union of all recipe station tags found across all add-ons — so every ore works in every custom smelter.
- If `priority` field is missing, default to `0`.

#### trading_tables/
- Copy all files. Path collision → merge `tiers[]`; within same tier index merge `trades[]` (dedup by `gives[0].item`).

#### features/ and feature_rules/
- Copy all files. ID collision → higher-priority wins; log.
- After full copy, run **ore Y-band redistribution** (Phase 3F). Rewrite affected feature JSONs.

#### biomes/
- Copy all files. ID collision → **deep merge**: `climate` higher-priority; mob spawn entries unioned; feature attachments unioned (dedup by ref).
- After full copy, run **climate cross-injection** (Phase 3D).

#### dimensions/
- Copy all files. ID collision → higher-priority wins; log.
- After full copy, run **portal linkage** (Phase 3E).

#### spawn_rules/
- Copy all files.
- Entity ID collision → merge `conditions[]` with OR logic.

#### animation_controllers/ (BP) and animations/ (BP)
- Copy all files.
- ID collision → rename lower-priority to `controller.animation.<addon>_<original>` / `animation.<addon>_<original>`.
- **Update all entity JSON refs** in `MergedPack_BP/entities/` to the new name. This is mandatory — failing to do so leaves broken references.

#### functions/
- Copy all `.mcfunction` files.
- Filename collision → rename lower-priority to `<addon>_<original>.mcfunction`. Update `/function` calls in all other merged functions.

#### structures/
- Copy all `.mcstructure` files.
- Filename collision → rename lower-priority to `<addon>_<original>.mcstructure`. Update `/structure load` commands.

#### scripts/
1. Copy each add-on's scripts to `MergedPack_BP/scripts/addon_<name>/`. Rewrite internal relative import paths to match new locations.
2. Generate `MergedPack_BP/scripts/main.js` importing all originals + compat modules. Wrap each original import in try/catch.

```js
// MergedPack_BP/scripts/main.js — AUTO-GENERATED
import "./compat/script_event_guard.js";  // MUST be first

try { await import("./addon_treecutter/main.js"); } catch(e){ console.error("[Merge] treecutter:", String(e)); }
try { await import("./addon_custommetal/main.js"); } catch(e){ console.error("[Merge] custommetal:", String(e)); }

import "./compat/tree_cutter.js";
import "./compat/tool_block_matrix.js";
import "./compat/soil_crop.js";
import "./compat/loot_injector.js";
import "./compat/dimension_portals.js";
import "./compat/mob_harmony.js";
import "./compat/trade_injector.js";
```

### 2D. RP File Merging

#### textures/item_texture.json and terrain_texture.json
- Merge all `texture_data` objects. Key collision → higher-priority wins; rename lower-priority to `<key>_<addon>`. **Update all referencing JSON** (render_controllers, attachables, entity client JSON) to the new key name.

#### textures/flipbook_textures.json
- Merge all entries. Dedup by `flipbook_texture` field.

#### textures/ (raw files)
- Copy all, preserving subdirectory structure. Filename collision → higher-priority wins; lower-priority renamed to `<addon>_<filename>`. Update all JSON that referenced the old path.

#### models/entity/
- Copy all geometry JSON. Geometry ID (`"geometry.<id>"`) collision → rename lower-priority to `geometry.<addon>_<id>`. **Update render_controllers and entity client JSON.**

#### render_controllers/
- Copy all. Controller ID collision → rename lower-priority to `controller.render.<addon>_<original>`. **Update entity client JSON.**

#### animations/ and animation_controllers/ (RP)
- Copy all. ID collision → rename lower-priority with `<addon>_` prefix. **Update entity client JSON refs.**

#### particles/
- Copy all. `particle_identifier` collision → rename lower-priority to `<namespace>_<addon>:<name>`. **Update all scripts and entity JSON** that reference the particle ID.

#### sounds/sound_definitions.json
- Merge all events (union). Event name collision → merge `sounds[]` file arrays; keep highest `volume`/`pitch`; keep `category` from higher-priority.

#### sounds/music_definitions.json + sounds/ (raw)
- Merge event entries (collision → higher-priority). Raw file collision → rename lower-priority with `<addon>_` prefix; update `sound_definitions.json`.

#### texts/en_US.lang
- Union all `key=value` pairs. Duplicate key → higher-priority value wins; log duplicate.
- Merge `languages.json` (union). Append compat entries at bottom.

#### attachables/
- Copy all. `identifier` collision → higher-priority wins; log. After texture/geometry renames, update all attachable JSON refs.

#### fog/
- Copy all. Fog identifier collision → rename lower-priority to `<namespace>_<addon>:<name>`. Update biome JSON refs.

#### ui/
- Copy all. Screen namespace collision → **cannot safely auto-merge**. Higher-priority kept. Add "MANUAL REVIEW REQUIRED" to CONFLICT_LOG.

#### biomesClient.json
- Merge all per-biome entries. Collision → higher-priority wins.

### 2E. TOML Config Merging (for add-ons that bundle config files)

**Bug fix:** Do not append raw TOML blocks — that creates duplicate table headers which is invalid TOML. Instead, parse each TOML config as a table tree and deep-merge at the value level:

```python
def merge_toml_safe(base_text: str, incoming_text: str, incoming_addon: str) -> str:
    """
    Deep-merges two TOML strings. Keys absent in base are added from incoming.
    Keys present in base are NOT overwritten (base = higher-priority).
    Returns valid merged TOML string.
    Uses tomllib (Python 3.11+) to parse; tomli_w to serialize.
    """
    import tomllib, tomli_w
    base = tomllib.loads(base_text)
    incoming = tomllib.loads(incoming_text)

    def deep_merge(b: dict, n: dict):
        for k, v in n.items():
            if k not in b:
                b[k] = v
            elif isinstance(b[k], dict) and isinstance(v, dict):
                deep_merge(b[k], v)
            # else: base value wins — do not overwrite

    deep_merge(base, incoming)
    return f"# Merged: includes settings from {incoming_addon}\n" + tomli_w.dumps(base)
```

### 2F. Script Event Guard

`MergedPack_BP/scripts/compat/script_event_guard.js` — import **first** in `main.js`. Uses a tick-counter Map to prevent double-handling per game tick:

```js
import { world, system } from "@minecraft/server";

const handled = new Map();
let tick = 0;

system.runInterval(() => {
  tick++;
  for (const [k, t] of handled) {
    if (tick - t > 1) handled.delete(k);
  }
}, 1);

export function guardEvent(key) {
  if (handled.has(key)) return false;
  handled.set(key, tick);
  return true;
}

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
All compat RP overrides → `MergedPack_RP/`.

### 3A. Tree Cutter — BFS with Custom Tree Structure Handling

Uses **iterative BFS** (not recursive `system.run` chains — those overflow call stacks on trees > ~30 logs).

```js
// MergedPack_BP/scripts/compat/tree_cutter.js
import { world, system, ItemStack } from "@minecraft/server";
import { onPlayerBreakBlock } from "./script_event_guard.js";

// ── ALL values below are populated from ADDON_MAP at generation time ──

const TREE_CUTTER_TOOLS = new Set([
  // toolType=tree_cutter from any add-on
  "treecutter:lumber_axe", "treecutter:mega_axe",
  // iron+ tier axes from any add-on also fell whole trees
  "custommetal:stellite_axe",
]);

const ALL_LOG_BLOCKS = new Set([
  // all log/stem/wood block IDs from all add-ons
  "treecutter:spirit_log", "treecutter:ash_log",
]);

const ALL_LEAF_BLOCKS = new Set([
  "treecutter:spirit_leaves", "treecutter:ash_leaves",
]);

// log_id → { sapling, saplingDropChance, strippedLog }
const LOG_DATA = {
  "treecutter:spirit_log": {
    sapling: "treecutter:spirit_sapling", saplingDropChance: 0.15,
    strippedLog: "treecutter:stripped_spirit_log"
  },
};

// Decoration strategy per block ID
// "preserve_if_occupied" → leave if occupied block state > 0, else drop item
// "drop"                 → remove and spawn item(s)
// "trigger"              → use setblock destroy to fire on_player_destroyed
// "remove"               → silently remove (vines, moss, lichen)
const TREE_DECORATIONS = {
  "custombees:modded_beehive": { strategy: "preserve_if_occupied", occupancyState: "honey_level", dropItem: "custombees:honeycomb" },
  "naturemobs:bird_nest":      { strategy: "drop", dropItem: "naturemobs:bird_egg", dropCount: [1, 3] },
  "magicmod:glowing_lantern":  { strategy: "drop", dropItem: "magicmod:glowing_lantern", dropCount: [1, 1] },
  "naturemobs:tree_moss":      { strategy: "remove" },
  "fungi:shelf_mushroom":      { strategy: "drop", dropItem: "fungi:shelf_mushroom", dropCount: [1, 2] },
  "insects:silk_cocoon":       { strategy: "trigger" },
};

const DECORATION_KEYWORDS = ["nest","hive","lantern","vine","moss","lichen","mushroom","fungus","cocoon","web","pod"];
const MAX_FELL = 256;
// ─────────────────────────────────────────────────────────────────

onPlayerBreakBlock((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held || !TREE_CUTTER_TOOLS.has(held.typeId)) return;
  if (!ALL_LOG_BLOCKS.has(ev.block.typeId) && !ev.block.hasTag("minecraft:logs")) return;

  const origin = { ...ev.block.location };
  const dim = ev.player.dimension;
  const player = ev.player;

  system.run(() => {
    const { logs, decorations } = scanTree(dim, origin);
    for (const d of decorations) handleDecoration(dim, d.pos, d.blockId);
    let broken = 0;
    for (const { pos, blockId } of logs) {
      if (broken >= MAX_FELL) break;
      const block = dim.getBlock(pos);
      if (!block || block.typeId !== blockId) continue;
      const data = LOG_DATA[blockId];
      if (data && Math.random() < data.saplingDropChance) {
        dim.spawnItem(new ItemStack(data.sapling, 1), { x: pos.x+.5, y: pos.y+1, z: pos.z+.5 });
      }
      block.setType("minecraft:air");
      broken++;
    }
    consumeDurability(player, broken);
  });
});

function scanTree(dim, origin) {
  const logs = [], decorations = [], visited = new Set();
  const queue = [origin];
  while (queue.length && logs.length < MAX_FELL) {
    const pos = queue.shift();
    const key = `${pos.x},${pos.y},${pos.z}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const block = dim.getBlock(pos);
    if (!block) continue;
    const bType = block.typeId;
    const isLog  = ALL_LOG_BLOCKS.has(bType)  || block.hasTag("minecraft:logs");
    const isLeaf = ALL_LEAF_BLOCKS.has(bType) || block.hasTag("minecraft:leaves");
    const isDeco = isDecoration(bType);
    if (isLog) {
      logs.push({ pos, blockId: bType });
      for (const o of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:1,z:0},
                       {x:1,y:1,z:0},{x:-1,y:1,z:0},{x:0,y:1,z:1},{x:0,y:1,z:-1},
                       {x:1,y:1,z:1},{x:-1,y:1,z:1},{x:1,y:1,z:-1},{x:-1,y:1,z:-1}]) {
        queue.push({ x:pos.x+o.x, y:pos.y+o.y, z:pos.z+o.z });
      }
      // Check sides for decorations attached to this log
      for (const o of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:-1,z:0}]) {
        queue.push({ x:pos.x+o.x, y:pos.y+o.y, z:pos.z+o.z });
      }
    } else if (isLeaf) {
      for (const o of [{x:0,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}])
        queue.push({ x:pos.x+o.x, y:pos.y+o.y, z:pos.z+o.z });
    } else if (isDeco) {
      decorations.push({ pos, blockId: bType });
    }
  }
  return { logs, decorations };
}

function isDecoration(id) {
  return !!TREE_DECORATIONS[id] || DECORATION_KEYWORDS.some(k => id.includes(k));
}

function handleDecoration(dim, pos, blockId) {
  const block = dim.getBlock(pos);
  if (!block || block.typeId !== blockId) return;
  const rule = TREE_DECORATIONS[blockId] ?? { strategy: "remove" };
  if (rule.strategy === "remove") { block.setType("minecraft:air"); return; }
  if (rule.strategy === "preserve_if_occupied") {
    try {
      const level = block.permutation.getState(rule.occupancyState ?? "honey_level") ?? 0;
      if (level > 0) return; // occupied — leave it
    } catch(_) {}
    if (rule.dropItem) dim.spawnItem(new ItemStack(rule.dropItem, 1), { x:pos.x+.5, y:pos.y+.5, z:pos.z+.5 });
    block.setType("minecraft:air");
    return;
  }
  if (rule.strategy === "drop") {
    if (rule.dropItem) {
      const [min, max] = rule.dropCount ?? [1, 1];
      const count = Math.floor(Math.random() * (max - min + 1)) + min;
      dim.spawnItem(new ItemStack(rule.dropItem, count), { x:pos.x+.5, y:pos.y+.5, z:pos.z+.5 });
    }
    block.setType("minecraft:air");
    return;
  }
  if (rule.strategy === "trigger") {
    dim.runCommand(`setblock ${pos.x} ${pos.y} ${pos.z} air destroy`);
  }
}

function consumeDurability(player, blocksBroken) {
  try {
    const eq = player.getComponent("minecraft:equippable");
    const item = eq?.getEquipment("Mainhand");
    if (!item) return;
    const dur = item.getComponent("minecraft:durability");
    if (!dur) return;
    dur.damage = Math.min(dur.maxDurability, dur.damage + blocksBroken);
    eq.setEquipment("Mainhand", item);
  } catch(_) {} // fail silently on older engine versions
}
```

Also generate **log stripping cross-compat** in the same file:

```js
// Cross-addon log stripping — any registered axe strips any modded log
const STRIP_MAP = new Map(
  // Populated from ADDON_MAP LOG_DATA: log_id → stripped_log_id
  Object.entries(LOG_DATA)
    .filter(([_, d]) => d.strippedLog)
    .map(([id, d]) => [id, d.strippedLog])
);
const ALL_AXE_TOOLS = new Set([...TREE_CUTTER_TOOLS]); // axes are a superset of tree_cutters

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held || !ALL_AXE_TOOLS.has(held.typeId)) return;
  const stripped = STRIP_MAP.get(ev.block.typeId);
  if (!stripped) return;
  ev.cancel = true;
  system.run(() => {
    ev.block.setType(stripped);
    ev.player.dimension.playSound("dig.wood", ev.block.location, { volume: 1, pitch: 0.8 });
  });
});
```

### 3B. Tool–Block Interaction Matrix

```js
// MergedPack_BP/scripts/compat/tool_block_matrix.js
import { world, system } from "@minecraft/server";
import { onPlayerBreakBlock } from "./script_event_guard.js";

// Tier order: higher index = stronger
const TIER_ORDER = ["wood","stone","iron","gold","diamond","netherite"];

// All registered pickaxes from all add-ons: Map<item_id, tier>
const ALL_PICKAXES = new Map([
  ["custommetal:stellite_pickaxe", "diamond"],
]);

// All registered ores with required tier to mine: Map<block_id, required_tier>
const ORE_TIER_REQUIRED = new Map([
  ["custommetal:stellite_ore", "iron"],
  ["custommetal:deepslate_stellite_ore", "iron"],
]);

// All registered hoes from all add-ons
const ALL_HOES = new Set(["customfarm:golden_hoe"]);

// Soil blocks → what they become when tilled: Map<block_id, result_block_id>
const HOE_TILL_MAP = new Map([
  ["customfarm:rich_soil",     "customfarm:tilled_rich_soil"],
  ["customfarm:volcanic_soil", "customfarm:tilled_volcanic_soil"],
  ["minecraft:dirt",           "minecraft:farmland"],
  ["minecraft:grass_block",    "minecraft:farmland"],
]);

// Ore tier enforcement
onPlayerBreakBlock((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held) return;
  const required = ORE_TIER_REQUIRED.get(ev.block.typeId);
  if (!required) return;
  const toolTier = ALL_PICKAXES.get(held.typeId);
  if (!toolTier) return; // not a registered pickaxe — let vanilla handle it
  if (TIER_ORDER.indexOf(toolTier) < TIER_ORDER.indexOf(required)) {
    ev.cancel = true;
    system.run(() => ev.player.dimension.playSound("note.bass", ev.block.location, { volume: 0.5, pitch: 0.5 }));
  }
});

// Cross-addon hoe tilling
onPlayerBreakBlock((ev) => {
  const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
  if (!held || !ALL_HOES.has(held.typeId)) return;
  const result = HOE_TILL_MAP.get(ev.block.typeId);
  if (!result) return;
  ev.cancel = true;
  system.run(() => {
    ev.block.setType(result);
    ev.player.dimension.playSound("use.grass", ev.block.location, { volume: 1, pitch: 1 });
  });
});
```

### 3C. Soil and Crop Cross-Compatibility

```js
// MergedPack_BP/scripts/compat/soil_crop.js
import { world, system, ItemStack } from "@minecraft/server";
import { onItemUseOn } from "./script_event_guard.js";

// Map<soil_block_id, Set<seed_item_id>> — which seeds can plant on which tilled soil
const CROSS_PLANTABLE = new Map([
  ["customfarm:tilled_rich_soil",     new Set(["customfarm:starwheat_seeds","minecraft:wheat_seeds"])],
  ["customfarm:tilled_volcanic_soil", new Set(["customfarm:starwheat_seeds"])],
  ["minecraft:farmland",              new Set(["customfarm:starwheat_seeds"])],
]);

// Map<seed_item_id, { targetBlock, growthStates }>
const SEED_TO_CROP = new Map([
  ["customfarm:starwheat_seeds", { targetBlock: "customfarm:starwheat_crop", growthStates: 7 }],
]);

// All fertilizer items from all add-ons
const ALL_FERTILIZERS = new Set(["minecraft:bone_meal","customfarm:star_fertilizer"]);

// All crop blocks from all add-ons — built from SEED_TO_CROP values
const ALL_CROPS = new Set([...SEED_TO_CROP.values()].map(v => v.targetBlock));

// Cross-planting
onItemUseOn((ev) => {
  const itemId = ev.itemStack?.typeId, blockId = ev.block?.typeId;
  if (!itemId || !blockId) return;
  const seeds = CROSS_PLANTABLE.get(blockId);
  if (!seeds?.has(itemId)) return;
  const cropData = SEED_TO_CROP.get(itemId);
  if (!cropData) return;
  system.run(() => {
    const above = ev.block.above();
    if (!above || above.typeId !== "minecraft:air") return;
    above.setType(cropData.targetBlock);
    try { above.setPermutation(above.permutation.withState("growth", 0)); } catch(_) {}
    // Consume 1 seed from inventory
    const inv = ev.source.getComponent("minecraft:inventory")?.container;
    if (inv) {
      const slot = ev.source.selectedSlotIndex;
      const item = inv.getItem(slot);
      if (item?.typeId === itemId && item.amount > 0) {
        item.amount--;
        inv.setItem(slot, item.amount === 0 ? undefined : item);
      }
    }
  });
});

// Cross-fertilizing
onItemUseOn((ev) => {
  const itemId = ev.itemStack?.typeId, blockId = ev.block?.typeId;
  if (!itemId || !blockId) return;
  if (!ALL_FERTILIZERS.has(itemId) || !ALL_CROPS.has(blockId)) return;
  system.run(() => {
    try {
      const cur = ev.block.permutation.getState("growth") ?? 0;
      const cropData = [...SEED_TO_CROP.values()].find(v => v.targetBlock === blockId);
      const max = cropData?.growthStates ?? 7;
      const next = Math.min(max, cur + Math.floor(Math.random() * 3) + 2);
      ev.block.setPermutation(ev.block.permutation.withState("growth", next));
      ev.block.dimension.spawnParticle("minecraft:crop_growth_emitter",
        { x: ev.block.location.x+.5, y: ev.block.location.y+.5, z: ev.block.location.z+.5 });
    } catch(_) {}
  });
});
```

### 3D. Climate-Gated Biome Cross-Injection

Generate `MergedPack_BP/feature_rules/compat/<feature>_in_<dim>.json` for each compatible pair:

| Add-on B biome temperature | Compatible injection targets |
|---------------------------|------------------------------|
| `< 0.15` (frozen) | Overworld frozen zones, custom cold dims |
| `0.15–0.5` (temperate) | Overworld, overworld-like custom dims |
| `> 0.5` (warm/hot) | Overworld warm zones, Nether-adjacent custom dims |
| `precipitation = none` | Desert, Nether, End-adjacent dims |
| Biome has `nether` tag | Nether and custom Nether-type dims only |
| Biome has `the_end` tag | End and custom End-type dims only |

Template:
```json
{
  "format_version": "1.13.0",
  "minecraft:feature_rules": {
    "description": {
      "identifier": "compat:inject_<feature>_into_<dim>",
      "places_feature": "<addon>:<feature_id>"
    },
    "conditions": {
      "placement_pass": "surface_pass",
      "minecraft:biome_filter": [{ "test": "has_biome_tag", "value": "<dim_biome_tag>" }]
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
  // Generated from ADDON_MAP dimensions — one entry per portal frame block
  {
    frameBlock: "addona:portal_frame",
    activatorItem: null,             // null = vanilla flint_and_steel
    altActivatorItem: "addonb:dim_key",  // hold this to go to alternate dimension
    fromDimension: "minecraft:overworld",
    toDimension: "addona:custom_dim",
    altDimension: "addonb:other_dim",
    spawnY: 64,
    cooldownTicks: 80,               // 4-second cooldown prevents re-fire
    particle: "minecraft:portal_directional"
  },
];

const cooldowns = new Map(); // playerId → expiry tick
let tick = 0;
system.runInterval(() => tick++, 1);

world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  for (const link of PORTAL_LINKS) {
    if (ev.block.typeId !== link.frameBlock) continue;
    if (ev.player.dimension.id !== link.fromDimension) continue;
    if ((cooldowns.get(ev.player.id) ?? 0) > tick) continue;
    const held = ev.player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    const useAlt = link.altActivatorItem && held?.typeId === link.altActivatorItem;
    const dest = useAlt ? link.altDimension : link.toDimension;
    const loc = ev.player.location;
    system.run(() => {
      try {
        ev.player.teleport({ x: loc.x, y: link.spawnY, z: loc.z },
          { dimension: world.getDimension(dest) });
        world.getDimension(dest).spawnParticle(link.particle, { x: loc.x, y: link.spawnY+1, z: loc.z });
        cooldowns.set(ev.player.id, tick + link.cooldownTicks);
      } catch(e) { console.error("[Merge] Portal:", String(e)); }
    });
    break;
  }
});
```

### 3F. Ore Y-Band Redistribution

```
Per dimension:
  1. Collect all ore features from all add-ons for this dimension.
  2. Sort by tier: stone(0) iron(1) gold(2) diamond(3) netherite(4) custom(5+).
  3. Dimension Y ranges:
       overworld: [-64, 320] = 384 blocks
       nether:    [0, 128]   = 128 blocks
       end:       [0, 256]   = 256 blocks
       custom:    [dim.y_min, dim.y_max]
  4. band_size = max(16, floor(range / ore_count))
     If band_size < 8: compress to 8, flag in README.
  5. Assign: ore[i].y_min = dim_min + i*band_size
             ore[i].y_max = dim_min + (i+1)*band_size
  6. Rewrite feature JSONs in MergedPack_BP/features/.
  7. Emit ore Y-band table in README.
```

### 3G. Cross-Loot Injection

`MergedPack_BP/loot_tables/compat/cross_addon_pool.json` — pool containing injectable items from ALL add-ons.
Inject into every add-on's loot tables by adding this pool to existing files (per Phase 2C loot table merge).

Context → categories:

| Path substring | Inject categories |
|----------------|-------------------|
| `mine`/`mineshaft`/`cave` | `ingot`, `raw_ore`, `nugget` |
| `village`/`farm`/`harvest` | `food`, `seed`, `sapling` |
| `dungeon`/`castle`/`fortress`/`bastion` | `ingot`, `armor_piece`, `misc` |
| `forest`/`tree`/`hollow` | `food`, `seed`, `sapling`, `misc` |
| `nether`/`hell` | `ingot`, `misc` |
| `end`/`chorus`/`city` | `ingot`, `misc` |
| `shipwreck`/`ocean`/`ruin` | `raw_ore`, `misc` |
| `temple`/`pyramid`/`jungle` | `food`, `ingot`, `misc` |
| fallback | `ingot`, `misc` |

Weight+count: ingot(10,1–3), nugget(18,2–8), raw_ore(12,1–4), food(10,1–3), seed(20,1–5), sapling(8,1–2), armor_piece(4,1–1), misc(6,1–2).

Items in the pool come from OTHER add-ons only (never self-injection).

### 3H. Cross-Smelting and Cross-Repair

- Expand `tags[]` on ALL furnace recipes to union of all recipe station tags across all add-ons + `blast_furnace`.
- Cross-repair: for every tool with `minecraft:repairable`, if any other add-on has a same-tier material, add it to `repair_items[]` in the merged item JSON.

### 3I. Mob Harmony

`MergedPack_BP/scripts/compat/mob_harmony.js`:

```js
import { world, system, ItemStack } from "@minecraft/server";

// Populated from ADDON_MAP
const FRIENDLY_MOBS = new Set(["customfarm:friendly_golem","treecutter:wood_sprite"]);
const HOSTILE_MOBS  = new Set(["custommetal:ore_golem"]);
const CROSS_TAME  = [ { mob: "treecutter:spirit_wolf",   items: new Set(["custommetal:stellite_nugget","customfarm:starwheat"]) } ];
const CROSS_BREED = [ { mob: "customfarm:giant_chicken", items: new Set(["treecutter:spirit_sap"]) } ];

world.beforeEvents.entityHurt.subscribe((ev) => {
  if (!FRIENDLY_MOBS.has(ev.entity.typeId)) return;
  const src = ev.damageSource.damagingEntity;
  if (!src) return;
  const victimNs   = ev.entity.typeId.split(":")[0];
  const attackerNs = src.typeId.split(":")[0];
  if (attackerNs !== "minecraft" && attackerNs !== victimNs && HOSTILE_MOBS.has(src.typeId))
    ev.cancel = true;
});

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player") return;
  const player = damagingEntity;
  for (const entry of CROSS_TAME) {
    if (hitEntity.typeId !== entry.mob) continue;
    const held = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    if (!held || !entry.items.has(held.typeId)) continue;
    system.run(() => {
      hitEntity.addTag(`tamed_by_${player.id}`);
      hitEntity.nameTag = `${player.name}'s ${hitEntity.typeId.split(":")[1]}`;
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (inv) {
        const item = inv.getItem(player.selectedSlotIndex);
        if (item && item.amount > 0) {
          item.amount--;
          inv.setItem(player.selectedSlotIndex, item.amount === 0 ? undefined : item);
        }
      }
    });
    break;
  }
});
```

Generate cross-biome spawn rules in `MergedPack_BP/spawn_rules/compat/` for climate-compatible mob+biome pairs (same climate matrix as Phase 3D).

### 3J. Wandering Trader Cross-Trades

`MergedPack_BP/trading_tables/compat/wandering_trader_compat.json` — one trade entry per injectable item across all add-ons. Price: `max(1, min(16, floor(lootWeight / 2)))`.

### 3K. Sound, Particle, Fog, and Lang Merge

- **Sounds:** Merge all `sound_definitions.json` events per Phase 2D rules.
- **Particles:** Copy all; rename colliding identifiers; update all script + entity JSON refs.
- **Fog:** Copy all; rename collisions; update biome JSON refs.
- **Lang:** Union all `en_US.lang`; higher-priority wins on duplicate; append compat entries.

---

## Phase 4 — Merged Manifests

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
      "uuid": "<new-uuid-bp-script>", "version": [1, 0, 0], "entry": "scripts/main.js" }
  ],
  "dependencies": [
    { "uuid": "<MergedPack-RP-UUID>", "version": [1, 0, 0] },
    { "module_name": "@minecraft/server",    "version": "<highest across all addons>" },
    { "module_name": "@minecraft/server-ui", "version": "<highest across all addons>" }
  ],
  "capabilities": ["script_eval"]
}
```

**Original add-on UUIDs are NOT dependencies — their content is fully merged in.**

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

Run after full merge, before packaging. Auto-fix where possible; log unfixable issues.

### 5A. BP Validation

| Check | Auto-fix |
|-------|----------|
| Item ID in recipe doesn't exist in merged pack | Remove that ingredient; log |
| Block ID in loot table entry doesn't exist | Remove entry; log |
| Entity ID in spawn_rules not in entities/ | Remove spawn rule; log |
| Animation ID in entity JSON not in animations/ | Try renamed `<addon>_` prefix; if still missing, remove ref; log |
| Animation controller ID not found | Same as above |
| Feature ID in feature_rules not in features/ | Remove feature_rule; log |
| `/function` call in .mcfunction references missing function | Comment line: `# [MERGE WARNING] missing: <name>`; log |
| `/structure load` references missing .mcstructure | Comment line; log |
| Loot table path in entity `minecraft:loot` doesn't exist | Remove loot component; log |
| Scoreboard objective name collision in scripts | Already wrapped idempotently by guard |

### 5B. RP Validation

| Check | Auto-fix |
|-------|----------|
| Texture path in item_texture.json doesn't exist | Log; point to `textures/misc/missing_texture` |
| Texture path in terrain_texture.json doesn't exist | Same |
| Geometry ID in render_controller not in models/entity/ | Log; fall back to `geometry.humanoid` |
| Texture key in render_controller not in texture atlas | Log; use missing_texture |
| Render controller ID in entity client JSON not found | Log; remove that controller from entity |
| Animation ID in entity client JSON not found | Log; remove that animation entry |
| Sound event in entity client JSON not in sound_definitions.json | Log; remove sound entry |
| Particle ID in entity JSON not in particles/ | Log; remove particle entry |
| Attachable geometry/texture/render_controller ref not found | Log; skip that attachable |
| Fog ID in biome JSON not in fog/ | Log; remove fog reference |

### 5C. Script Validation

| Check | Auto-fix |
|-------|----------|
| Import path resolves to non-existent file after remapping | Comment out import in main.js; log |
| Script references block/item/entity ID not in merged pack | Log in README (cannot fix at script level) |
| Script uses `@minecraft/server` API above declared version | Update version pin in manifest |

---

## Phase 6 — Package as Single `.mcaddon`

### Final layout

```
<AddonA>_<AddonB>_merged.mcaddon
├── MergedPack_BP/
│   ├── manifest.json
│   ├── items/, blocks/, entities/, loot_tables/, recipes/
│   ├── trading_tables/, features/, feature_rules/, biomes/
│   ├── dimensions/, spawn_rules/, animation_controllers/
│   ├── animations/, structures/, functions/
│   └── scripts/
│       ├── main.js
│       ├── addon_<name>/        (one per add-on with scripts)
│       └── compat/
│           ├── script_event_guard.js
│           ├── tree_cutter.js
│           ├── tool_block_matrix.js
│           ├── soil_crop.js
│           ├── loot_injector.js
│           ├── dimension_portals.js
│           ├── mob_harmony.js
│           └── trade_injector.js
├── MergedPack_RP/
│   ├── manifest.json
│   ├── textures/ (item_texture.json + terrain_texture.json merged)
│   ├── models/, render_controllers/, animations/
│   ├── animation_controllers/, particles/, sounds/
│   ├── fog/, attachables/, ui/
│   ├── texts/en_US.lang
│   └── biomesClient.json
└── README.md
```

### Packaging

```bash
WORK="/home/claude/merged"
NAME="<AddonA>_<AddonB>_merged"
cp /home/claude/README.md "$WORK/README.md"
cd "$WORK"
zip -r "/mnt/user-data/outputs/${NAME}.mcaddon" MergedPack_BP/ MergedPack_RP/ README.md
echo "✓ ${NAME}.mcaddon — BP: $(find MergedPack_BP -type f | wc -l) files, RP: $(find MergedPack_RP -type f | wc -l) files"
```

Naming: `<A>_<B>[_<C>]_merged.mcaddon` (max 3 names; `_and_N_more` if exceeded).

---

## Phase 7 — Embedded README.md

```markdown
# Merged: [AddonA] + [AddonB] + ...
Auto-generated by bedrock-addon-combiner v4.

## Install
Double-click `<filename>.mcaddon`. Activate ONE BP + ONE RP in world settings.

## Engine version
Merged pack targets Bedrock [min_engine_version]. All add-ons migrated to this version's formats.

## Add-ons merged
| Add-on | Version | Engine | Items | Blocks | Entities | Scripts |
|--------|---------|--------|-------|--------|----------|---------|

## Cross-features
| Feature | Details |
|---------|---------|
| ✅ Tree Cutting | Tools: [...] Logs: [...] Decorations handled: [...] |
| ✅ Log Stripping | All axes strip all modded logs |
| ✅ Tool–Block Matrix | Pickaxe tiers enforced; hoes till modded soils |
| ✅ Soil & Crops | Cross-planting and cross-fertilizing active |
| ✅ Loot Injection | [N] items across [N] tables |
| ✅ Cross-Smelting | [N] recipes; [N] cross-repair entries |
| ✅ Ore Y-Bands | See table below |
| ✅ Dimension Portals | [list or "None"] |
| ✅ Mob Harmony | Protected: [...] Cross-taming: [...] |
| ✅ Wandering Trader | [N] trades |
| ✅ Lang | [N] entries merged |

## Ore Y-band distribution
| Ore | Dimension | Y min | Y max | Band size |
|-----|-----------|-------|-------|-----------|

## Tree decorations handled
| Block | Strategy | Notes |
|-------|----------|-------|

## Conflicts resolved
| # | Type | Add-ons | Conflict | Resolution |
|---|------|---------|----------|------------|

## Validation warnings
| # | File | Issue | Action taken |
|---|------|-------|--------------|

## Manual review required
[UI screen conflicts that could not be auto-merged]

## Known limitations
- Beta APIs / Scripting API must be enabled in world settings.
- Not compatible with Education Edition.
- Loot injection targets only loot table paths known at generation time.
- UI screen merging requires manual intervention (see above).
- Trees > 256 connected logs are partially felled.
```

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Add-on has no BP (RP-only) | Merge RP only; skip BP cross-linking |
| Legacy `minecraft:item` wrapper format | Convert to flat component format matching highest engine version |
| No loot tables in add-on | Skip loot injection; note in README |
| Encrypted `.mcaddon` | Skip entirely; warn user |
| More than 2 add-ons | All logic is fully N-way |
| Tool tier undetectable | Default to `diamond` |
| Combined output > 200 MB | Warn user; proceed |
| No script entry point declared | Scan `scripts/` root for `index.js`/`main.js`; import all root `.js` files if not found |
| Two add-ons pin different `@minecraft/server` versions | Use highest in merged manifest |
| Duplicate `.mcstructure` | Rename lower-priority to `<addon>_<original>`; update `/structure load` calls |
| Add-on A references items from add-on B (also being merged) | Both in merged pack — resolves natively; no action |
| Add-on A ore requires add-on B pickaxe tier | `tool_block_matrix.js` handles this automatically |
| TOML config collision | Use safe deep-merge (Phase 2E) — no duplicate table headers |
| Tree > 256 connected logs | Fell up to MAX_FELL; leave rest; note in README |
| Unknown decoration block matching keywords | Apply `"remove"` strategy as safe default |
| `world_template` module | Extract settings as data module; warn user |
| Script imports third-party npm package | Copy as-is; note in README that package must be side-loaded |
| Add-on uses `format_version 1.8` spawn rules | Parse as-is; valid in all engine versions |
