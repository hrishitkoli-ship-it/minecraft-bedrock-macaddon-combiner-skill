---
name: bedrock-addon-combiner
description: "Combine multiple Minecraft Bedrock Edition add-ons into a single .mcaddon with ONE merged BP and ONE merged RP. Also bridges Java Edition mods (.jar) to Bedrock equivalents, supports custom machines/crafting stations, N-way function compatibility, dimension portals, mob harmony, ore Y-bands, biome injection, cross-smelting, Fabric/Forge mod conversion templates, scripting API guards, and full validation. Output: MergedPack_BP/ + MergedPack_RP/ in one .mcaddon — double-click to install, no load order."
---

# Bedrock Add-on Combiner Skill (v2)

You are a senior Minecraft modpack engineer with expertise in both **Bedrock Edition add-ons** and **Java Edition mods (Fabric/Forge)**. When the user uploads two or more Bedrock add-ons or Java mods, produce a **single `.mcaddon`** containing exactly **one BP folder** (`MergedPack_BP/`) and **one RP folder** (`MergedPack_RP/`). For Java mods, produce a conversion-bridge template explaining the Bedrock equivalent.

**Architecture:** No separate CompatLayer. Everything lives in `MergedPack_BP/` and `MergedPack_RP/`. Install one BP, one RP. Done.

**Prime directive:** The merged pack must be a strict superset of all inputs — every original feature works exactly as before, plus all new cross-features. If a feature worked in the original it must work in the merged output.

---

## Routing

| Condition | Action |
|-----------|--------|
| User uploads ≥2 `.mcaddon` / `.zip` Bedrock add-on files | **Use this skill — full merge** |
| Java Edition mods (`.jar`) uploaded | **Use this skill — Java conversion bridge** (Phase 0) |
| Mix of Bedrock add-ons + Java mods | Use this skill — merge Bedrock, generate Java bridge templates |
| Only one add-on uploaded | Ask if they want a second; otherwise decline |
| User wants a brand-new add-on from scratch | Decline this skill |

---

## Phase 0 — Java Edition Mod Conversion Bridge *(new)*

When `.jar` files are detected, run this phase before any Bedrock merge.

### 0A. Inspect the JAR

```bash
mkdir -p /home/claude/java_mods /home/claude/java_bridge
for jar in /mnt/user-data/uploads/*.jar; do
  [ -f "$jar" ] || continue
  name=$(basename "$jar" .jar | tr ' ' '_' | tr -cd '[:alnum:]_')
  mkdir -p "/home/claude/java_mods/$name"
  # Extract mod metadata
  unzip -q "$jar" "fabric.mod.json" "META-INF/mods.toml" "META-INF/MANIFEST.MF" \
        "pack.mcmeta" "data/**" "assets/**" \
        -d "/home/claude/java_mods/$name" 2>/dev/null || true
done
```

### 0B. Detect mod loader

```python
import json, os, glob

def detect_java_mod(mod_dir):
    # Fabric
    fmj = f"{mod_dir}/fabric.mod.json"
    if os.path.exists(fmj):
        with open(fmj) as f: data = json.load(f)
        return "fabric", data.get("id","unknown"), data.get("version","0.0.1"), data.get("name","Unknown")
    # Forge / NeoForge
    toml = f"{mod_dir}/META-INF/mods.toml"
    if os.path.exists(toml):
        # parse TOML-like
        return "forge", "unknown", "0.0.1", "Unknown Forge Mod"
    return "unknown", "unknown", "0.0.1", "Unknown Mod"
```

### 0C. Generate Bedrock Conversion Bridge

For each Java mod, produce a `java_bridge/<mod_id>/` directory:

```
java_bridge/<mod_id>/
├── conversion_report.md        # What was detected; what has a Bedrock equivalent
├── MergedPack_BP/
│   ├── items/                  # Bedrock item stubs for every Java item found
│   ├── blocks/                 # Bedrock block stubs for every Java block found
│   ├── entities/               # Bedrock entity stubs for every Java entity found
│   ├── recipes/                # Converted shapeless/shaped/smelting recipes
│   └── scripts/bridge/         # Script stubs for Java event handlers
└── MergedPack_RP/
    ├── texts/en_US.lang        # All Java lang keys converted to Bedrock format
    └── textures/               # Placeholder texture slots matching Java namespaces
```

#### Java → Bedrock item component mapping

| Java component / tag | Bedrock equivalent |
|---------------------|-------------------|
| `ToolMaterial.WOOD/STONE/IRON/GOLD/DIAMOND/NETHERITE` | `minecraft:digger` with speeds + `minecraft:durability` |
| `FoodProperties` | `minecraft:food` (nutrition, saturation, can_always_eat) |
| `ArmorMaterial` | `minecraft:armor` protection + `minecraft:durability` |
| `Tags.Items.AXES/PICKAXES/SHOVELS/HOES/SWORDS` | `minecraft:is_axe/is_pickaxe/is_shovel/is_hoe/is_sword` |
| `UseAnim.EAT/DRINK` | `minecraft:food` use_animation |
| `EnchantmentCategory` | `minecraft:enchantable` slot + value |
| `Rarity.UNCOMMON/RARE/EPIC` | `minecraft:display_name` color override in lang |
| `Item.Properties().stacksTo(1)` | `minecraft:max_stack_size: 1` |
| `Item.Properties().fireResistant()` | `minecraft:fire_immune: true` |

#### Java recipe format → Bedrock recipe format

```python
def convert_java_recipe(java_recipe: dict) -> dict:
    rtype = java_recipe.get("type","")
    if rtype == "minecraft:crafting_shaped":
        return {
            "format_version": "1.20.10",
            "minecraft:recipe_shaped": {
                "description": { "identifier": java_recipe["id"] },
                "tags": ["crafting_table"],
                "pattern": java_recipe["pattern"],
                "key": { k: {"item": convert_id(v["item"])} for k,v in java_recipe["key"].items() },
                "result": { "item": convert_id(java_recipe["result"]["item"]),
                            "count": java_recipe["result"].get("count",1) }
            }
        }
    elif rtype == "minecraft:crafting_shapeless":
        return {
            "format_version": "1.20.10",
            "minecraft:recipe_shapeless": {
                "description": { "identifier": java_recipe["id"] },
                "tags": ["crafting_table"],
                "ingredients": [{"item": convert_id(i["item"])} for i in java_recipe["ingredients"]],
                "result": { "item": convert_id(java_recipe["result"]["item"]) }
            }
        }
    elif rtype in ["minecraft:smelting","minecraft:blasting","minecraft:smoking"]:
        return {
            "format_version": "1.20.10",
            "minecraft:recipe_furnace": {
                "description": { "identifier": java_recipe["id"] },
                "tags": ["furnace","blast_furnace","smoker"],
                "input": convert_id(java_recipe["ingredient"]["item"]),
                "output": convert_id(java_recipe["result"])
            }
        }

def convert_id(java_id: str) -> str:
    """minecraft:oak_log → minecraft:oak_log (vanilla passthrough)
       modid:custom_item → modid:custom_item (preserve namespace)"""
    return java_id  # namespaces are already compatible
```

#### Java entity → Bedrock entity stub

```python
def make_bedrock_entity_stub(java_entity_id: str, java_nbt: dict) -> dict:
    """Produces a minimal Bedrock entity JSON that can be hand-completed."""
    ns, name = java_entity_id.split(":",1) if ":" in java_entity_id else ("minecraft", java_entity_id)
    return {
        "format_version": "1.19.80",
        "minecraft:entity": {
            "description": {
                "identifier": f"{ns}:{name}",
                "is_spawnable": True,
                "is_summonable": True,
                "is_experimental": False
            },
            "component_groups": {},
            "components": {
                "minecraft:health": {"value": java_nbt.get("Health", 20), "max": java_nbt.get("Health", 20)},
                "minecraft:physics": {},
                "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
                "minecraft:collision_box": {"width": 0.6, "height": 1.8}
            },
            "events": {}
        }
    }
```

### 0D. Conversion Report

Emit `java_bridge/<mod_id>/conversion_report.md` containing:
- Summary of all Java items/blocks/entities/recipes found
- Which features have direct Bedrock equivalents (auto-converted)
- Which features need manual implementation (custom renderer, complex Java-only mechanic)
- Estimated effort level (Easy / Medium / Hard / Not Possible in Bedrock)

---

## Phase 1 — Deep Inventory

*(same as v1, extended with custom machine tracking)*

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
```

### 1C. Full BP inventory (extended)

| Path | Extract |
|------|---------|
| `manifest.json` | `header.uuid`, `header.version`, `header.min_engine_version`, all dependency UUIDs, all module types, `@minecraft/server` version pin |
| `items/**/*.json` | Item ID, all components, `minecraft:tags[]`, tool components, `mining_speed`, `attack_damage`, `durability`, `repair_items`, `enchantable` slot/value, `food` nutrition/saturation, `on_use_on` events |
| `blocks/**/*.json` | Block ID, all tags, `destroy_time`, `explosion_resistance`, `material_instances`, `loot`, `geometry`, **`crafting_table`** (custom station name, grid_size, recipe_tags), `on_player_destroyed` event, `on_interact` event |
| `entities/**/*.json` | Entity ID, `type_family[]`, all component groups, all events, all behavior goals, `loot.table`, `damage_sensor` filters, animations list, render_controllers list |
| `loot_tables/**/*.json` | Full path, all pools, all entries |
| `recipes/**/*.json` | Identifier, type, ingredients, output, **`tags[]`** (critical for custom stations) |
| `trading_tables/**/*.json` | All tiers, trades, wants/gives |
| `scripts/**/*.js` | All event subscriptions, all `namespace:id` literals, all scoreboard names, all dynamic property keys, all import paths, **custom UI form definitions (ActionFormData, ModalFormData, MessageFormData)**, **`world.structureManager` calls**, **`@minecraft/server-gametest` usages** |
| `features/**/*.json` | Identifier, feature type, fill_with block, y distribution |
| `feature_rules/**/*.json` | Feature ref, placement_pass, biome filter |
| `biomes/**/*.json` | Biome ID, climate, surface_parameters, spawn entries, feature attachments |
| `dimensions/**/*.json` | Dimension ID, generator, sea_level, build height |
| `spawn_rules/**/*.json` | Entity ID, all conditions |
| `animation_controllers/**/*.json` | All controller IDs, all states, transitions, on_entry/on_exit commands |
| `animations/**/*.json` | All animation IDs, loop, length, bone channels |
| `structures/**/*.mcstructure` | Structure ID |
| `functions/**/*.mcfunction` | All commands — note every item/block/entity/function/structure ID |
| **`ui/**/*.json`** | **All screen names, namespace, controls, bindings, button refs** *(new deep scan)* |

### 1D. Full RP inventory

*(unchanged from v1)*

### 1E. ADDON_MAP structure (extended)

```
ADDON_MAP[addon_name] = {
  namespace, bp_uuid, rp_uuid, bp_version, rp_version,
  min_engine,
  script_api_version,

  // Items
  tools: { axe:[], pickaxe:[], hoe:[], shovel:[], sword:[], tree_cutter:[], shears:[] },
  armor: { helmet:[], chestplate:[], leggings:[], boots:[] },
  ingots:[], nuggets:[], raw_ores:[], foods:[], seeds:[], saplings:[],
  fertilizers:[], misc_items:[],

  // Blocks
  logs:[], stems:[], planks:[], leaves:[], stripped_logs:[], stripped_stems:[],
  ores:{ stone:[], deepslate:[], nether:[], end:[], custom_stone:[] },
  crops:[], soils:[],
  custom_machines:[],      // { id, station_name, recipe_tag, grid_size, script_ui_form }
  decorative_blocks:[],
  tree_decorations:[],

  // NEW: Custom machine details
  custom_stations: [{
    block_id,              // e.g. "mymod:alloy_furnace"
    station_name,          // string used in recipe tags[]
    grid_size,             // "3x3" | "2x2" | "custom"
    has_fuel_slot,         // bool — does it consume fuel?
    has_output_slots,      // int — how many output slots
    script_form_class,     // "ActionFormData" | "ModalFormData" | null
    recipes: [],           // all recipe IDs that use this tag
    fuel_items: [],        // accepted fuel item IDs
  }],

  // World gen
  features:[], feature_rules:[], biomes:[], dimensions:[],

  // Entities
  mobs:[],

  // Data
  loot_tables:[], recipes:[], custom_station_tags:[], trades:[],
  scoreboards:[], dynamic_props:[],
  functions:[], script_files:[],

  // RP
  texture_keys:{}, sounds:[], music:[], particles:[],
  render_ctrls:[], geometries:[], animations_rp:[], anim_ctrls_rp:[],
  attachables:[], fog_ids:[], ui_screens:[], lang_entries:{},
}
```

### 1F. Auto-categorization rules

*(unchanged from v1, plus the following)*

| Signal | Category |
|--------|----------|
| `block.components["minecraft:crafting_table"]` exists | `custom_machine` |
| Script imports `ActionFormData`/`ModalFormData` AND references block ID | `custom_machine → script_ui` |
| `"furnace"/"smelter"/"forge"/"kiln"/"crucible"` in ID | `custom_machine → smelter` |
| `"crusher"/"grinder"/"mill"/"press"` in ID | `custom_machine → processor` |
| `"enchanter"/"infuser"/"imbuer"` in ID | `custom_machine → enchanting` |
| `"assembler"/"workbench"/"table"` in ID (non-vanilla) | `custom_machine → crafting` |

---

## Phase 2 — Conflict Detection, Resolution, and Merge

*(All v1 rules apply, extended below)*

### 2A–2E *(unchanged from v1)*

### 2F. Custom Machine Recipe Tag Merging *(new)*

When two add-ons each define custom machines, recipes must be cross-compatible.

```python
def merge_recipe_tags(all_addon_maps):
    """
    Build a unified recipe tag expansion table.
    Every smelting/processing recipe gets ALL custom smelter tags injected.
    """
    all_smelter_tags = set()
    all_crafter_tags = set()

    for addon in all_addon_maps.values():
        for station in addon["custom_stations"]:
            if station["grid_size"] in ["3x3","2x2"]:
                all_crafter_tags.add(station["station_name"])
            else:
                all_smelter_tags.add(station["station_name"])

    # Always include vanilla tags
    all_smelter_tags.update(["furnace","blast_furnace","smoker","campfire_cooking"])
    all_crafter_tags.add("crafting_table")

    return all_smelter_tags, all_crafter_tags

def expand_recipe_tags(recipe_json, all_smelter_tags, all_crafter_tags):
    """Expand tags[] on every recipe to include all compatible stations."""
    existing = set(recipe_json.get("tags", []))
    # If it has any smelter tag, add all smelter tags
    if existing & {"furnace","blast_furnace","smoker","campfire_cooking"} or \
       any("smelt" in t or "furnace" in t or "forge" in t or "kiln" in t for t in existing):
        recipe_json["tags"] = list(existing | all_smelter_tags)
    # If it has any crafter tag, add all compatible crafter tags (same grid size only)
    if "crafting_table" in existing or any("bench" in t or "table" in t or "workbench" in t for t in existing):
        recipe_json["tags"] = list(existing | all_crafter_tags)
    return recipe_json
```

### 2G. UI Screen Merging *(new)*

Custom machine UI forms defined in scripts often share control names. Merge rules:

| Conflict | Detection | Resolution |
|----------|-----------|------------|
| Two scripts define `ActionFormData` with same title string | Same `.title()` call | Rename lower-priority to `"<AddonName> - <original title>"` in merged script |
| Two `ui/*.json` screens share a `namespace` | Same namespace string | Rename lower-priority namespace to `<addon>_ui` throughout all RP files |
| Same screen name in different namespaces | No collision | No action needed |
| `ModalFormData` slider/toggle IDs overlap | Same field index | Add offset to lower-priority form's indices in merged script |

Generate `MergedPack_BP/scripts/compat/ui_bridge.js` to unify form dispatch:

```js
// ui_bridge.js — generated
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// Maps block ID → which add-on's form handler to invoke
const MACHINE_UI_MAP = new Map([
  // Populated from ADDON_MAP.custom_stations
  ["addon_a:alloy_furnace", "addon_a_ui"],
  ["addon_b:crystal_press", "addon_b_ui"],
]);

export function openMachineUI(player, block) {
  const handler = MACHINE_UI_MAP.get(block.typeId);
  if (!handler) return;
  // Dynamically dispatch to correct add-on's form
  import(`./machine_forms/${handler}.js`).then(m => m.open(player, block));
}
```

---

## Phase 3 — Cross-Features Weaving

*(All v1 phases 3A–3K apply, extended below)*

### 3A–3K *(unchanged from v1)*

### 3L. Custom Machine Cross-Compatibility *(new)*

Generate `MergedPack_BP/scripts/compat/machine_compat.js`:

```js
import { world, system, BlockPermutation } from "@minecraft/server";

// ── Generated from ADDON_MAP.custom_stations ──────────────────────
// All custom machine block IDs across all add-ons
const CUSTOM_MACHINES = new Map([
  // { blockId → { type, fuelItems, outputSlots, recipeTag } }
  ["addon_a:alloy_furnace",  { type: "smelter",  fuelItems: new Set(["minecraft:coal","addon_b:crystal_fuel"]), outputSlots: 1 }],
  ["addon_b:crystal_press",  { type: "processor", fuelItems: new Set([]), outputSlots: 2 }],
]);

// Cross-fuel: items from add-on B can fuel machines from add-on A
const CROSS_FUEL_MAP = new Map([
  // addon_a machine → [addon_b fuel items it should accept]
  ["addon_a:alloy_furnace", ["addon_b:crystal_coal", "addon_b:compressed_charcoal"]],
]);

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  const machine = CUSTOM_MACHINES.get(block.typeId);
  if (!machine) return;

  system.run(() => {
    // Cross-fuel injection: insert cross-addon fuel items into machine's accepted fuels
    const crossFuels = CROSS_FUEL_MAP.get(block.typeId) ?? [];
    // This is a hook point — actual inventory management depends on add-on's scripting model
    player.sendMessage(`§a[MergedPack] ${block.typeId} accepts cross-addon fuels: ${crossFuels.join(", ") || "none"}`);
  });
});

// Cross-recipe: ore from add-on A can be smelted in machine from add-on B
// (Handled automatically via Phase 2F recipe tag expansion — no extra script needed)
```

### 3M. Function Compatibility Layer *(new)*

Bedrock `.mcfunction` files can call each other via `/function`. After renaming conflicts in Phase 2C, generate a **function router** to keep original call paths working:

```bash
# For every function that was renamed due to conflict, generate a stub at original path:
# Original: functions/treecutter/fell_tree.mcfunction (renamed to treecutter_addon_fell_tree.mcfunction)
# Stub: functions/treecutter/fell_tree.mcfunction → calls renamed version
```

```python
def generate_function_stubs(renamed_functions: list) -> None:
    """
    renamed_functions: list of { original_path, new_path }
    Generates stub .mcfunction files at original paths that call the renamed version.
    """
    for entry in renamed_functions:
        stub_path = f"MergedPack_BP/{entry['original_path']}"
        os.makedirs(os.path.dirname(stub_path), exist_ok=True)
        # Derive the function call name from path (strip leading functions/ and .mcfunction)
        call_name = entry['new_path'].replace("functions/","").replace(".mcfunction","")
        with open(stub_path, "w") as f:
            f.write(f"# [Auto-generated compat stub] Original path preserved for backward compatibility\n")
            f.write(f"function {call_name}\n")
```

Also generate `MergedPack_BP/functions/compat/init.mcfunction` — called from pack's main tick/load functions:

```mcfunction
# compat/init.mcfunction — runs once on world load
# Initializes all cross-addon compatibility systems
function compat/scoreboard_init
function compat/tag_init
say [MergedPack] Cross-addon compatibility layer loaded.
```

### 3N. Scoreboard & Tag Namespace Guard *(new)*

Generate `MergedPack_BP/functions/compat/scoreboard_init.mcfunction` and `tag_init.mcfunction` to safely initialize all scoreboards from all add-ons without duplication:

```mcfunction
# scoreboard_init.mcfunction
# Uses execute store to check existence before creating (Bedrock 1.20+)
scoreboard objectives add mergedpack_loaded dummy "MergedPack Loaded"
# [All add-on scoreboards listed here — idempotent, safe to re-run]
scoreboard objectives add treecutter_fell_count dummy "Trees Felled"
scoreboard objectives add custommetal_smelts dummy "Smelts Done"
```

And the script-level guard in `MergedPack_BP/scripts/compat/scoreboard_guard.js`:

```js
import { world } from "@minecraft/server";

const REQUIRED_OBJECTIVES = [
  { name: "treecutter_fell_count", display: "Trees Felled" },
  { name: "custommetal_smelts",    display: "Smelts Done" },
  // ... all objectives from all add-ons
];

world.afterEvents.worldInitialize.subscribe(() => {
  for (const obj of REQUIRED_OBJECTIVES) {
    if (!world.scoreboard.getObjective(obj.name)) {
      world.scoreboard.addObjective(obj.name, obj.display);
    }
  }
});
```

### 3O. @minecraft/server-gametest Bridge *(new)*

If any add-on uses `@minecraft/server-gametest`, generate a compatibility stub so tests don't break the merged pack's runtime:

```js
// MergedPack_BP/scripts/compat/gametest_bridge.js
// Generated stub — prevents gametest imports from crashing non-gametest worlds
let GameTest;
try {
  const gt = await import("@minecraft/server-gametest");
  GameTest = gt.default ?? gt;
} catch {
  // GameTest module not available in this world — create no-op stubs
  GameTest = {
    register: () => {},
    registerParallel: () => {},
    registerAsync: () => {},
  };
}
export { GameTest };
```

---

## Phase 4 — Manifests

*(unchanged from v1, with one addition)*

### MergedPack_BP/manifest.json

```json
{
  "format_version": 2,
  "header": {
    "name": "<AddonA> + <AddonB> + ... Merged Pack",
    "description": "Fully merged modpack. All add-on content combined. Auto-generated by bedrock-addon-combiner v2.",
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

*(RP manifest unchanged from v1)*

---

## Phase 5 — Validation Pass

*(All v1 checks apply, extended below)*

### 5A–5C *(unchanged from v1)*

### 5D. Custom Machine Validation *(new)*

| Check | Auto-fix |
|-------|----------|
| Custom machine block ID referenced in recipe tag doesn't exist in merged blocks/ | Log warning; leave recipe tag (may be loaded by the machine's add-on natively) |
| Recipe tag used in recipe has no matching custom_machine in any add-on | Log warning; add `crafting_table` as fallback tag |
| Machine script form references item/block ID not in merged pack | Log warning in README; cannot auto-fix scripts |
| Two machines share identical `station_name` string (same recipe tag) | Merge their recipe pools; note in README |
| Machine `fuel_items` list references IDs not in merged pack | Log warning; items still listed but won't function until that add-on's content is present |

### 5E. Function Compatibility Validation *(new)*

| Check | Auto-fix |
|-------|----------|
| Stub function file at original path already exists (was not renamed) | Skip stub generation |
| `/function` call in .mcfunction references a path > 80 chars | Warn; Bedrock has an 80-char function path limit |
| `compat/init.mcfunction` references a function that doesn't exist | Remove that line; log |
| Tick function in `tick.json` references renamed function | Update `tick.json` with new path |

### 5F. Java Bridge Validation *(new)*

| Check | Auto-fix |
|-------|----------|
| Java item has no Bedrock equivalent (e.g. custom renderer) | Mark as "Manual implementation required" in conversion report |
| Java recipe uses an ingredient with no Bedrock stub yet | Generate empty item stub with `// TODO` marker |
| Java entity uses NBT that has no Bedrock component equivalent | List in conversion report under "Not auto-convertible" |

---

## Phase 6 — Package as Single `.mcaddon`

### Final layout (extended)

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
│   │   └── compat/
│   │       ├── init.mcfunction          ← NEW
│   │       ├── scoreboard_init.mcfunction ← NEW
│   │       └── tag_init.mcfunction      ← NEW
│   └── scripts/
│       ├── main.js
│       ├── addon_<name>/
│       └── compat/
│           ├── script_event_guard.js
│           ├── tree_cutter.js
│           ├── tool_block_matrix.js
│           ├── soil_crop.js
│           ├── loot_injector.js
│           ├── dimension_portals.js
│           ├── mob_harmony.js
│           ├── trade_injector.js
│           ├── machine_compat.js         ← NEW
│           ├── ui_bridge.js              ← NEW
│           ├── scoreboard_guard.js       ← NEW
│           └── gametest_bridge.js        ← NEW
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
├── java_bridge/                          ← NEW (only if Java .jar files were uploaded)
│   └── <mod_id>/
│       ├── conversion_report.md
│       ├── MergedPack_BP/ (stubs)
│       └── MergedPack_RP/ (stubs)
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

# Include java_bridge if present
[ -d "/home/claude/java_bridge" ] && \
  zip -r "/mnt/user-data/outputs/${OUTPUT_NAME}.mcaddon" /home/claude/java_bridge/

echo "✓ ${OUTPUT_NAME}.mcaddon — BP: $(find MergedPack_BP -type f | wc -l) files, RP: $(find MergedPack_RP -type f | wc -l) files, Size: $(du -sh /mnt/user-data/outputs/${OUTPUT_NAME}.mcaddon | cut -f1)"
```

---

## Phase 7 — Embedded README.md

```markdown
# Merged Modpack: [AddonA] + [AddonB] + ...
Auto-generated by bedrock-addon-combiner v2.

## Install
Double-click `<filename>.mcaddon`.
Activate ONE BP + ONE RP in world settings. Nothing else needed.

## Add-ons merged
| Add-on | Version | Items | Blocks | Entities | Has Scripts | Custom Machines |
|--------|---------|-------|--------|----------|-------------|-----------------|

## Java Mods Detected (Conversion Bridge)
| Mod | Loader | Items Converted | Blocks Converted | Entities Converted | Manual Work Needed |
|-----|--------|----------------|-----------------|-------------------|-------------------|

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
| ✅ Custom Machines | [N] machines from [N] add-ons — cross-fuel and cross-recipe compatible |
| ✅ Function Compat | [N] function stubs generated to preserve original call paths |
| ✅ Scoreboard Guard | All scoreboards initialized idempotently at world load |
| ✅ UI Bridge | [N] machine UI forms dispatched via unified bridge |
| ✅ Ore Y-Bands | See table below |
| ✅ Dimension Portals | [list or "None"] |
| ✅ Mob Harmony | Protected: [...] — Cross-taming: [...] |
| ✅ Wandering Trader | [N] trades added |
| ✅ Lang | [N] entries merged |

## Custom Machine Cross-Compatibility
| Machine | Add-on | Type | Accepts Cross-Addon Fuel? | Cross-Addon Recipes? |
|---------|--------|------|--------------------------|---------------------|

## Conflicts resolved
| # | Type | Add-ons | Conflict | Resolution |
|---|------|---------|----------|------------|

## Validation warnings
| # | File | Issue | Action taken |
|---|------|-------|--------------|

## Manual review required
[UI screen conflicts that could not be auto-merged]
[Java features that require manual Bedrock implementation]

## Ore Y-band distribution
| Ore | Dimension | Y min | Y max | Band |
|-----|-----------|-------|-------|------|

## Tree decorations handled
| Block | Strategy | Notes |
|-------|----------|-------|

## Known limitations
- Scripting API features require Beta APIs enabled in world settings.
- Not available in Education Edition.
- Java mod conversion is a template — models/textures must be created manually.
- Custom machine GUIs with complex inventory logic may need manual script adjustment.
- Loot injection targets loot table paths known at generation time.
- UI screen merging requires manual review (see above).
- Function paths are limited to 80 characters by Bedrock; very long paths are truncated.
```

---

## Edge Cases (extended from v1)

| Situation | Handling |
|-----------|----------|
| Add-on has no BP (RP-only) | Merge RP only; skip all BP logic for that add-on |
| Add-on uses legacy `format_version 1.10` items | Parse `"minecraft:item"` wrapper; preserve format |
| Add-on uses `format_version "1.16.100"` blocks | Parse component format; preserve as-is |
| No loot tables in add-on | Skip loot injection; note in README |
| Encrypted `.mcaddon` | Skip entirely; warn user |
| More than 2 add-ons | All logic is fully N-way throughout all phases |
| Tool tier undetectable | Default to `diamond` tier |
| Combined output > 200 MB | Warn user; proceed; suggest splitting if import fails |
| Conflicting `min_engine_version` | Use highest; warn if above current stable release |
| No declared script entry point | Scan `scripts/` root for `index.js` or `main.js` |
| Two add-ons pin different `@minecraft/server` versions | Use highest in merged manifest |
| Duplicate `.mcstructure` filename | Rename lower-priority; update `/structure load` calls |
| **Java mod uploaded alone** | Run Phase 0 only; produce conversion bridge; explain next steps |
| **Java mod uses Fabric API / Forge hooks with no Bedrock equivalent** | Document in conversion report; mark as "Not auto-convertible" |
| **Custom machine has no `crafting_table` component (script-only UI)** | Detect from script imports; still generate `machine_compat.js` entry |
| **Two custom machines share same recipe tag string** | Merge recipe pools under that tag; document in README |
| **Function renamed AND called from a tick.json scheduled function** | Update tick.json with new path AND generate stub at original path |
| **Add-on uses `@minecraft/server-gametest`** | Generate gametest_bridge.js stub; add to main.js imports |
| **Script uses dynamic `eval()` or `Function()` constructor** | Log warning; cannot merge safely; copy script as-is with comment |
| **Java mod uses custom biome renderer (Sodium/Iris shader)** | Note in conversion report; no Bedrock equivalent; suggest vanilla fog/water color override |
| **Java recipe uses tags (e.g. `#forge:ingots/copper`)** | Expand tag to known vanilla + modded item IDs matching the tag pattern |
| **Custom machine fuel slot consumes items via script (not vanilla furnace)** | `machine_compat.js` cross-fuel hook fires on `playerInteractWithBlock`; actual consumption handled by original add-on script |
| Script imports third-party npm package | Cannot bundle; copy script as-is; note in README |
| Tree with > 256 connected log blocks | Fell up to MAX_FELL_BLOCKS; note in README |
| Tree decoration with unknown block ID | Apply `"remove"` strategy as safe default |
| Add-on A ore requires add-on B pickaxe tier to mine | Tier enforcement in `tool_block_matrix.js` handles automatically |
| Biome from add-on A uses surface block from add-on B | Both in merged pack; reference resolves natively |
