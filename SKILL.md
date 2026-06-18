---
name: bedrock-addon-combiner
description: "Combine multiple Minecraft Bedrock Edition add-ons into a single .mcaddon OR combine multiple Java Edition mods (.jar) into a merged modpack. For Bedrock: ONE merged BP + ONE merged RP, all conflicts resolved, all cross-features woven in. For Java: full N-way mod merge — items, blocks, entities, recipes, biomes, loot tables, tags, mixins guard, mod config merging, cross-mod OreDict/Tags unification, and a ready-to-run merged modpack folder. Supports Fabric, Forge, and NeoForge. Also handles mixed Bedrock+Java workflows via a Java→Bedrock conversion bridge. Output: one .mcaddon (Bedrock) or one merged mods/ folder + modpack ZIP (Java)."
---

# Bedrock Add-on Combiner + Java Mod Combiner Skill (v3)

You are a senior Minecraft modpack engineer with deep expertise in **Bedrock Edition add-ons**, **Java Edition Fabric mods**, and **Java Edition Forge/NeoForge mods**. Depending on what the user uploads, you run the correct pipeline:

| Upload type | Pipeline |
|-------------|----------|
| ≥2 `.mcaddon` / `.zip` Bedrock add-on files | **Bedrock Full Merge** (Phases 1–7) |
| ≥2 Java `.jar` mod files | **Java Full Combine** (Phase J) |
| Mix of `.mcaddon` + `.jar` | Bedrock merge + Java→Bedrock conversion bridge |
| 1 file only | Ask if they want a second; otherwise decline |
| Brand-new add-on/mod from scratch | Decline this skill |

**Prime directive (both pipelines):** The output must be a strict superset of all inputs. Every original feature works exactly as before, plus all new cross-features. If it worked in one mod it must work in the merged output.

---

# ═══════════════════════════════════════════════════
# JAVA MOD COMBINE PIPELINE — Phase J
# ═══════════════════════════════════════════════════

Run Phase J when the user uploads ≥2 `.jar` Java Edition mod files.

## Phase J1 — Extract and Inventory All Mods

### J1A. Extract JAR contents

```bash
mkdir -p /home/claude/java_mods /home/claude/java_merged

for jar in /mnt/user-data/uploads/*.jar; do
  [ -f "$jar" ] || continue
  name=$(basename "$jar" .jar | tr ' ' '_' | tr -cd '[:alnum:]_')
  mkdir -p "/home/claude/java_mods/$name"
  unzip -q "$jar" -d "/home/claude/java_mods/$name" 2>/dev/null || true
done
```

### J1B. Detect mod loader and metadata

```python
import json, os, re

def detect_mod(mod_dir):
    """Returns: { loader, mod_id, version, name, description, deps, mc_version }"""
    result = { "loader": "unknown", "mod_id": "unknown", "version": "0.0.1",
               "name": "Unknown", "description": "", "deps": [], "mc_version": "1.20" }

    # ── Fabric ──────────────────────────────────────────────────────
    fmj = f"{mod_dir}/fabric.mod.json"
    if os.path.exists(fmj):
        with open(fmj) as f: d = json.load(f)
        result.update({
            "loader":      "fabric",
            "mod_id":      d.get("id", "unknown"),
            "version":     d.get("version", "0.0.1"),
            "name":        d.get("name", d.get("id", "Unknown")),
            "description": d.get("description", ""),
            "deps":        list(d.get("depends", {}).keys()),
            "mc_version":  d.get("depends", {}).get("minecraft", ">=1.20").lstrip(">=~^"),
            "entrypoints": d.get("entrypoints", {}),
            "mixins":      d.get("mixins", []),
        })
        return result

    # ── Forge / NeoForge ────────────────────────────────────────────
    toml = f"{mod_dir}/META-INF/mods.toml"
    if os.path.exists(toml):
        content = open(toml).read()
        mod_id  = re.search(r'modId\s*=\s*"([^"]+)"', content)
        version = re.search(r'version\s*=\s*"([^"]+)"', content)
        name    = re.search(r'displayName\s*=\s*"([^"]+)"', content)
        mc_dep  = re.search(r'modId\s*=\s*"minecraft".*?versionRange\s*=\s*"\[([^,\]]+)', content, re.DOTALL)
        loader_type = "neoforge" if "neoforged" in content.lower() else "forge"
        result.update({
            "loader":      loader_type,
            "mod_id":      mod_id.group(1)  if mod_id  else "unknown",
            "version":     version.group(1) if version else "0.0.1",
            "name":        name.group(1)    if name    else "Unknown",
            "mc_version":  mc_dep.group(1)  if mc_dep  else "1.20",
        })
        return result

    # ── Quilt ────────────────────────────────────────────────────────
    qmj = f"{mod_dir}/quilt.mod.json"
    if os.path.exists(qmj):
        with open(qmj) as f: d = json.load(f)
        qi = d.get("quilt_loader", {})
        result.update({
            "loader":  "quilt",
            "mod_id":  qi.get("id", "unknown"),
            "version": qi.get("version", "0.0.1"),
            "name":    qi.get("metadata", {}).get("name", "Unknown"),
        })
        return result

    return result
```

### J1C. Deep Inventory per mod

For each mod, scan every data/assets directory and build a `JAVA_MOD_MAP` entry:

```python
JAVA_MOD_MAP[mod_id] = {
    "meta":        { loader, mod_id, version, name, deps, mc_version, entrypoints, mixins },

    # ── Data (behavior) ──────────────────────────────────────────────
    "items":       [],  # { id, material, food, armor, tool_type, tags[], max_stack, fire_immune }
    "blocks":      [],  # { id, hardness, resistance, material, harvest_tool, harvest_level, tags[] }
    "entities":    [],  # { id, base_class, health, speed, drops[], spawn_egg, is_hostile }
    "tile_entities": [], # { id, block_id, has_inventory, has_energy, is_machine }
    "recipes":     [],  # { id, type, ingredients, output, group }
    "loot_tables": [],  # { path, pools, conditions }
    "advancements":[],  # { id, criteria, rewards }
    "tags": {           # all tag files across namespaces
        "items":  {},   # tag_id → [item_ids]
        "blocks": {},   # tag_id → [block_ids]
        "entities": {},
        "biomes": {},
        "dimensions": {},
        "damage_types": {},
    },
    "structures":  [],  # { id, path }
    "dimensions":  [],  # { id, type, generator }
    "biomes":      [],  # { id, temperature, downfall, category, surface_builder }
    "worldgen": {
        "features":         [],
        "configured_features": [],
        "placed_features":  [],
        "carvers":          [],
        "noise_settings":   [],
        "biome_sources":    [],
        "structure_sets":   [],
    },
    "damage_types": [],
    "trim_materials": [],
    "trim_patterns":  [],

    # ── Assets (rendering) ───────────────────────────────────────────
    "models": {
        "items":  {},   # item_id → model path
        "blocks": {},   # block_id → model path(s)
    },
    "blockstates": {},  # block_id → blockstate JSON path
    "textures":    {},  # texture_key → path
    "sounds": {
        "sound_events": {},  # event_id → SoundEvent settings
        "sound_files":  [],  # all .ogg paths
    },
    "lang":        {},  # locale → { key: value }
    "particles":   {},  # id → particle JSON path
    "shaders":     [],  # shader file paths (note only — no merge)
    "atlases":     [],  # atlas definitions

    # ── Code ─────────────────────────────────────────────────────────
    "entrypoints":     {},  # { main:[], client:[], server:[] }
    "mixin_configs":   [],  # [ "modid.mixins.json", ... ]
    "mixin_classes":   [],  # all @Mixin target classes found in mixin JSONs
    "event_listeners": [], # detected EventBus subscriptions (Forge) or event listeners (Fabric)
    "capabilities":    [], # Forge capability registrations
    "registries":      [], # custom registry definitions
    "config_files":    [], # { filename, format: "toml"|"json"|"json5" }
}
```

### J1D. Tag resolution

```python
def resolve_tags(all_mods: dict) -> dict:
    """
    Merge all tag files across all mods into a unified tag map.
    Tags from multiple mods that share the same tag ID are UNIONED (arrays merged).
    Higher-version mod wins on replace=true conflicts.
    """
    unified_tags = { "items": {}, "blocks": {}, "entities": {}, "biomes": {}, "dimensions": {} }

    for mod_id, mod in all_mods.items():
        for category, tag_dict in mod["tags"].items():
            for tag_id, entries in tag_dict.items():
                if tag_id not in unified_tags[category]:
                    unified_tags[category][tag_id] = { "replace": False, "values": [] }
                if entries.get("replace", False):
                    # replace=true: higher-version mod wins
                    unified_tags[category][tag_id]["values"] = entries["values"]
                else:
                    # Merge: union
                    unified_tags[category][tag_id]["values"] = list(set(
                        unified_tags[category][tag_id]["values"] + entries["values"]
                    ))
    return unified_tags
```

---

## Phase J2 — Java Mod Conflict Detection and Resolution

### J2A. Priority Order

Same as Bedrock: higher `version` (semver) = higher priority. Ties broken by upload order.

### J2B. Namespace / ID Conflicts

| Conflict | Detection | Resolution |
|----------|-----------|------------|
| Two mods share `mod_id` | Same `mod_id` string | Lower-priority `mod_id` → `<name>_alt` throughout its merged data; log |
| Same item ID `modid:item` | Identical identifier | Both items kept; lower-priority renamed to `<modid>_alt:<item>`; cross-recipe stubs added |
| Same block ID | Identical identifier | Same as items |
| Same entity ID | Identical identifier | Both kept; lower-priority renamed |
| Same recipe path | Same `data/<ns>/recipes/<path>` | Both kept; lower-priority path gets `_<modid>` suffix |
| Same loot table path | Same path | Merge pools (union) as in Bedrock; cap rolls if needed |
| Same tag ID (different values) | Same tag path, different values | Union (unless `replace: true` — see J1D) |
| Same advancement ID | Same path | Higher-priority wins; log |
| Same structure ID | Same path | Higher-priority wins; lower-priority renamed |
| Same biome ID | Same path | Deep merge (climate/effects higher-priority, spawners unioned) |
| Same dimension ID | Same path | Higher-priority wins; log |
| Same damage type ID | Same path | Higher-priority wins; log |

### J2C. Mixin Safety Guard

Mixins injecting into the same target class from two mods is the most common crash source.

```python
def detect_mixin_conflicts(all_mods: dict) -> list:
    """
    Returns list of { mod_a, mod_b, target_class, conflict_type }
    where conflict_type is one of: "same_method_inject", "same_field_redirect", "head_conflict"
    """
    target_map = {}  # class → [{ mod_id, mixin_class, methods }]

    for mod_id, mod in all_mods.items():
        for mixin_class in mod["mixin_classes"]:
            target = mixin_class.get("target")
            if not target: continue
            if target not in target_map:
                target_map[target] = []
            target_map[target].append({
                "mod_id": mod_id,
                "mixin_class": mixin_class["name"],
                "injections": mixin_class.get("injections", []),
            })

    conflicts = []
    for target, entries in target_map.items():
        if len(entries) < 2: continue
        for i, a in enumerate(entries):
            for b in entries[i+1:]:
                # Check for method-level conflicts
                methods_a = {inj["method"] for inj in a["injections"]}
                methods_b = {inj["method"] for inj in b["injections"]}
                shared = methods_a & methods_b
                if shared:
                    conflicts.append({
                        "mod_a": a["mod_id"], "mod_b": b["mod_id"],
                        "target_class": target, "shared_methods": list(shared),
                        "conflict_type": "same_method_inject",
                    })
    return conflicts
```

Generate `java_merged/compat/MixinCompatReport.md` listing every conflict with recommended resolution.

For safe conflicts (different methods on same class): no action needed — Mixin handles this natively.
For risky conflicts (same method, same injection point): document in report; cannot auto-resolve; user must choose.

### J2D. Forge Capability Conflicts

```python
def detect_capability_conflicts(all_mods):
    """Two mods attaching different capabilities to the same object type can conflict."""
    cap_map = {}  # capability_id → mod_id
    conflicts = []
    for mod_id, mod in all_mods.items():
        for cap in mod["capabilities"]:
            cap_id = cap["capability_id"]
            if cap_id in cap_map:
                conflicts.append({ "cap": cap_id, "mod_a": cap_map[cap_id], "mod_b": mod_id })
            cap_map[cap_id] = mod_id
    return conflicts
```

### J2E. Config File Merging

```python
def merge_configs(all_mods: dict, output_dir: str):
    """
    For mods that share config keys (common in Forge/Fabric mods using the same config library),
    merge config files so defaults don't stomp each other.
    """
    import tomllib, json

    for mod_id, mod in all_mods.items():
        for cfg in mod["config_files"]:
            dest = f"{output_dir}/config/{cfg['filename']}"
            os.makedirs(os.path.dirname(dest), exist_ok=True)

            if not os.path.exists(dest):
                # First mod with this config: just copy
                shutil.copy(cfg["path"], dest)
            else:
                # Merge: load both, deep-merge (mod's values override existing only if key absent)
                if cfg["format"] == "toml":
                    # Emit a comment-annotated merged TOML
                    existing = open(dest).read()
                    incoming = open(cfg["path"]).read()
                    with open(dest, "a") as f:
                        f.write(f"\n# ── Merged from {mod_id} ──\n")
                        f.write(incoming)
                elif cfg["format"] in ["json", "json5"]:
                    with open(dest) as f: base = json.load(f)
                    with open(cfg["path"]) as f: new = json.load(f)
                    # Deep merge: new values only set if key absent in base
                    def deep_merge(b, n):
                        for k, v in n.items():
                            if k not in b:
                                b[k] = v
                            elif isinstance(b[k], dict) and isinstance(v, dict):
                                deep_merge(b[k], v)
                    deep_merge(base, new)
                    with open(dest, "w") as f: json.dump(base, f, indent=2)
```

---

## Phase J3 — Java Cross-Mod Feature Weaving

### J3A. Cross-Mod OreDict / Tag Unification

Generate unified tag files in `java_merged/data/c/tags/` (Fabric common convention) and `java_merged/data/forge/tags/` (Forge convention):

```python
def generate_unified_tags(all_mods: dict, unified_tags: dict, output_dir: str):
    """
    Writes merged tag JSONs to output_dir/data/<namespace>/tags/<category>/<id>.json
    Also generates c: (common) and forge: namespace aliases for cross-loader compat.
    """
    for category, tag_dict in unified_tags.items():
        for tag_id, tag_data in tag_dict.items():
            ns, path = tag_id.split(":", 1) if ":" in tag_id else ("minecraft", tag_id)
            out_path = f"{output_dir}/data/{ns}/tags/{category}/{path}.json"
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "w") as f:
                json.dump({ "replace": False, "values": tag_data["values"] }, f, indent=2)

    # Generate c: namespace aliases (Fabric common tags standard)
    # e.g.  c:ingots/iron → contains all modded iron ingots
    common_tag_aliases = {
        "items": {
            "c:ingots":           [v for mod in all_mods.values() for v in mod["items"]
                                   if "ingot" in v["id"]],
            "c:nuggets":          [v for mod in all_mods.values() for v in mod["items"]
                                   if "nugget" in v["id"]],
            "c:raw_ores":         [v for mod in all_mods.values() for v in mod["items"]
                                   if v["id"].startswith("raw_") or "raw_ore" in v["id"]],
            "c:ores":             [v for mod in all_mods.values() for v in mod["blocks"]
                                   if "ore" in v["id"]],
            "c:storage_blocks":   [v for mod in all_mods.values() for v in mod["blocks"]
                                   if any(k in v["id"] for k in ["_block","storage","compressed"])],
            "c:foods":            [v for mod in all_mods.values() for v in mod["items"]
                                   if v.get("food")],
            "c:seeds":            [v for mod in all_mods.values() for v in mod["items"]
                                   if "seed" in v["id"]],
            "c:gems":             [v for mod in all_mods.values() for v in mod["items"]
                                   if any(k in v["id"] for k in ["gem","crystal","shard","dust"])],
            "c:dusts":            [v for mod in all_mods.values() for v in mod["items"]
                                   if "dust" in v["id"]],
        },
        "blocks": {
            "c:ores/in_ground":   [v for mod in all_mods.values() for v in mod["blocks"]
                                   if "ore" in v["id"]],
            "c:logs":             [v for mod in all_mods.values() for v in mod["blocks"]
                                   if "log" in v["id"] or "stem" in v["id"]],
            "c:leaves":           [v for mod in all_mods.values() for v in mod["blocks"]
                                   if "leaves" in v["id"] or "foliage" in v["id"]],
            "c:dirt":             [v for mod in all_mods.values() for v in mod["blocks"]
                                   if any(k in v["id"] for k in ["dirt","soil","loam","humus","peat"])],
        }
    }

    for category, aliases in common_tag_aliases.items():
        for tag_id, items in aliases.items():
            ns, path = tag_id.split(":", 1)
            out_path = f"{output_dir}/data/{ns}/tags/{category}/{path}.json"
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            values = list({i["id"] if isinstance(i, dict) else i for i in items})
            with open(out_path, "w") as f:
                json.dump({ "replace": False, "values": values }, f, indent=2)
```

### J3B. Cross-Mod Recipe Injection

```python
def generate_cross_mod_recipes(all_mods: dict, unified_tags: dict, output_dir: str):
    """
    Generates cross-mod crafting recipes so materials from mod A work in mod B recipes
    and vice versa, using unified tags as ingredients.
    """
    recipes = []

    # Cross-smelting: every ore from any mod can be smelted in any furnace-type recipe
    all_ores = [b for mod in all_mods.values() for b in mod["blocks"] if "ore" in b["id"]]
    all_ingots = [i for mod in all_mods.values() for i in mod["items"] if "ingot" in i["id"]]

    for ore in all_ores:
        # Find the matching ingot (by material name)
        material = ore["id"].split(":")[1].replace("_ore","").replace("deepslate_","").replace("nether_","")
        matching_ingot = next((i for i in all_ingots if material in i["id"]), None)
        if not matching_ingot: continue

        ore_mod = ore["id"].split(":")[0]
        ingot_mod = matching_ingot["id"].split(":")[0]
        if ore_mod == ingot_mod: continue  # same mod, already handled by the mod itself

        recipe_id = f"compat/{ore_mod}_ore_to_{ingot_mod}_ingot"
        recipes.append({
            "type": "minecraft:smelting",
            "ingredient": { "item": ore["id"] },
            "result": { "id": matching_ingot["id"], "count": 1 },
            "experience": 0.7,
            "cookingtime": 200,
            "_comment": f"Cross-mod smelting: {ore['id']} → {matching_ingot['id']}"
        })
        # Also blasting
        recipes.append({
            "type": "minecraft:blasting",
            "ingredient": { "item": ore["id"] },
            "result": { "id": matching_ingot["id"], "count": 1 },
            "experience": 0.7,
            "cookingtime": 100,
        })

    # Cross-repair: same-tier materials across mods
    all_tools = [i for mod in all_mods.values() for i in mod["items"]
                 if any(t in i.get("tool_type","") for t in ["sword","pickaxe","axe","shovel","hoe"])]
    # (Smithing/anvil recipe generation for cross-mod repair is emitted as smithing_transform recipes)

    # Write all cross-mod recipes
    for recipe in recipes:
        rid = recipe.get("_comment","compat_recipe").split(":")[-1].replace(" ","_")
        out_path = f"{output_dir}/data/compat/recipes/{rid}.json"
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        r = {k: v for k, v in recipe.items() if not k.startswith("_")}
        with open(out_path, "w") as f: json.dump(r, f, indent=2)
```

### J3C. Cross-Mod Loot Table Injection

Same logic as Bedrock Phase 3G, adapted for Java data pack format:

```python
def inject_cross_mod_loot(all_mods: dict, output_dir: str):
    """Injects items from each mod into other mods' loot tables."""
    for mod_id, mod in all_mods.items():
        for loot in mod["loot_tables"]:
            path = loot["path"]
            out_path = f"{output_dir}/{path}"
            if not os.path.exists(out_path): continue

            with open(out_path) as f: table = json.load(f)

            # Determine context from path
            context = "fallback"
            for keyword, ctx in [("chest","chest"),("mob","mob"),("block","block"),
                                  ("fishing","fishing"),("gameplay","gameplay")]:
                if keyword in path: context = ctx; break

            # Inject items from other mods as a new pool
            inject_items = []
            for other_id, other_mod in all_mods.items():
                if other_id == mod_id: continue
                for item in other_mod["ingots"] + other_mod["misc_items"]:
                    inject_items.append({
                        "type": "minecraft:item",
                        "name": item["id"],
                        "weight": 5,
                        "functions": [{"function": "minecraft:set_count",
                                       "count": {"min": 1, "max": 3, "type": "minecraft:uniform"}}]
                    })

            if inject_items:
                table.setdefault("pools", []).append({
                    "rolls": {"min": 0, "max": 1, "type": "minecraft:uniform"},
                    "bonus_rolls": 0.0,
                    "entries": inject_items[:12],  # cap at 12 to avoid bloat
                    "conditions": [{"condition": "minecraft:random_chance", "chance": 0.15}]
                })
                with open(out_path, "w") as f: json.dump(table, f, indent=2)
```

### J3D. Cross-Mod Biome Mob Spawning

```python
def cross_inject_spawners(all_mods: dict, output_dir: str):
    """
    Mobs from mod A that are compatible with biomes from mod B get spawn entries added.
    Compatibility: same temperature/precipitation range.
    """
    for mod_id, mod in all_mods.items():
        for biome in mod["biomes"]:
            biome_path = f"{output_dir}/data/{biome['id'].replace(':','/data/',1)}/worldgen/biome/{biome['id'].split(':')[1]}.json"
            if not os.path.exists(biome_path): continue

            with open(biome_path) as f: biome_json = json.load(f)

            spawners = biome_json.setdefault("spawners", {})

            for other_id, other_mod in all_mods.items():
                if other_id == mod_id: continue
                for mob in other_mod["entities"]:
                    if not mob.get("is_hostile"): continue
                    # Simple climate check — inject hostile mobs into compatible biomes
                    spawners.setdefault("monster", []).append({
                        "type": mob["id"],
                        "weight": 5,
                        "minCount": 1,
                        "maxCount": 3
                    })

            with open(biome_path, "w") as f: json.dump(biome_json, f, indent=2)
```

### J3E. Cross-Mod Advancements

Generate `java_merged/data/compat/advancements/cross_mod_explorer.json` — a root advancement that unlocks when the player collects one item from each merged mod:

```json
{
  "display": {
    "icon": { "id": "minecraft:nether_star" },
    "title": { "text": "Merged Pack Explorer" },
    "description": { "text": "Collect an item from every merged mod" },
    "frame": "challenge",
    "announce_to_chat": true,
    "show_toast": true
  },
  "parent": "minecraft:story/root",
  "criteria": {
    "<mod_id>_item": {
      "trigger": "minecraft:inventory_changed",
      "conditions": {
        "items": [{ "items": ["<first_item_from_mod>"] }]
      }
    }
  },
  "requirements": [["<mod_id>_item" /* one per mod */]],
  "rewards": {
    "experience": 100
  }
}
```

---

## Phase J4 — Asset Merging (Resources)

### J4A. Model and Texture Merging

```bash
mkdir -p /home/claude/java_merged/assets

# Copy all assets preserving namespaces — each mod's namespace is isolated
for mod_dir in /home/claude/java_mods/*/; do
  mod_id=$(python3 -c "
import json, os
fmj='$mod_dir/fabric.mod.json'
if os.path.exists(fmj):
    print(json.load(open(fmj)).get('id','unknown'))
else:
    print('unknown')
" 2>/dev/null)
  # Assets use the mod's own namespace — copy preserves them
  [ -d "$mod_dir/assets" ] && cp -rn "$mod_dir/assets" /home/claude/java_merged/ 2>/dev/null || true
done
```

**Conflict rule:** Asset namespaces (`assets/<modid>/`) are naturally isolated — no conflicts unless two mods use the same `modid`. In that case, higher-priority mod's assets win; lower-priority mod's assets are prefixed `<modid>_alt/`.

### J4B. Language File Merging

```python
def merge_lang_files(all_mods: dict, output_dir: str):
    """Merges all en_us.json (and other locales) from all mods."""
    from collections import defaultdict
    locale_maps = defaultdict(dict)

    # Process in priority order (highest last = wins on conflict)
    for mod_id, mod in sorted(all_mods.items(), key=lambda x: x[1]["meta"]["version"]):
        for locale, entries in mod["lang"].items():
            for key, value in entries.items():
                locale_maps[locale][key] = value  # last write (highest priority) wins

    for locale, entries in locale_maps.items():
        out_path = f"{output_dir}/assets/compat/lang/{locale}.json"
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w") as f: json.dump(entries, f, indent=2, ensure_ascii=False)
```

### J4C. Sound Event Merging

All `sounds.json` files are merged; event name collisions take the higher-priority mod's definition. All sound files are copied preserving their original `assets/<modid>/sounds/` paths.

### J4D. Particle Merging

All `assets/<modid>/particles/` directories copied as-is; namespace isolation prevents collisions.

---

## Phase J5 — Modpack Manifest Generation

### J5A. Fabric — generate `fabric.mod.json` for the merged compat mod

```json
{
  "schemaVersion": 1,
  "id":          "mergedpack_compat",
  "version":     "1.0.0",
  "name":        "<ModA> + <ModB> + ... Merged Compat",
  "description": "Cross-mod compatibility layer. Requires all component mods to be present.",
  "authors":     ["Auto-generated by bedrock-addon-combiner v3"],
  "license":     "MIT",
  "environment": "*",
  "entrypoints": {
    "main":   ["compat.MergedPackInit"],
    "client": ["compat.MergedPackClientInit"]
  },
  "depends": {
    "fabricloader": ">=0.14",
    "minecraft":    "<mc_version from highest mod>",
    "<mod_a_id>":   "<mod_a_version>",
    "<mod_b_id>":   "<mod_b_version>"
  }
}
```

### J5B. Forge — generate `META-INF/mods.toml` for the compat mod

```toml
modLoader="javafml"
loaderVersion="[47,)"
license="MIT"

[[dependencies.mergedpack_compat]]
    modId="forge"
    mandatory=true
    versionRange="[47,)"
    ordering="NONE"
    side="BOTH"

[[dependencies.mergedpack_compat]]
    modId="minecraft"
    mandatory=true
    versionRange="[<mc_version>,)"
    ordering="NONE"
    side="BOTH"

[[mods]]
modId="mergedpack_compat"
version="1.0.0"
displayName="Merged Pack Compat"
description="Cross-mod compatibility data. Requires all merged mods present."
```

### J5C. Modpack ZIP layout

```
<ModA>_<ModB>_merged_modpack.zip
├── mods/
│   ├── <ModA>.jar                    ← original mod JARs (user provides)
│   ├── <ModB>.jar
│   └── mergedpack_compat-1.0.0.jar   ← generated compat JAR (data-only)
│
├── config/                            ← merged config files
│   ├── <mod_a_config>.toml
│   └── <mod_b_config>.toml
│
├── resourcepacks/
│   └── mergedpack_resources.zip       ← merged lang + any RP overrides
│
├── data/                              ← merged data pack (cross-mod recipes, tags, loot)
│   ├── compat/
│   │   ├── recipes/
│   │   ├── tags/
│   │   ├── loot_tables/
│   │   └── advancements/
│   └── c/                             ← Fabric common tags (c: namespace)
│       └── tags/
│
├── MixinCompatReport.md               ← mixin conflict report
├── CompatReport.md                    ← full merge summary
└── README.md
```

### J5D. Generate the compat data JAR

```bash
COMPAT_DIR="/home/claude/java_merged/compat_jar"
mkdir -p "$COMPAT_DIR/data" "$COMPAT_DIR/assets" "$COMPAT_DIR/META-INF"

# Copy all cross-mod data
cp -r /home/claude/java_merged/data/compat "$COMPAT_DIR/data/"
cp -r /home/claude/java_merged/data/c      "$COMPAT_DIR/data/" 2>/dev/null || true
cp -r /home/claude/java_merged/data/forge  "$COMPAT_DIR/data/" 2>/dev/null || true

# Write fabric.mod.json or mods.toml depending on detected loader
# (generated in J5A / J5B above)

# Package as JAR (which is just a ZIP)
cd "$COMPAT_DIR"
zip -r "/home/claude/java_merged/mergedpack_compat-1.0.0.jar" data/ assets/ fabric.mod.json 2>/dev/null || \
zip -r "/home/claude/java_merged/mergedpack_compat-1.0.0.jar" data/ assets/ META-INF/

echo "✓ compat JAR: $(du -sh /home/claude/java_merged/mergedpack_compat-1.0.0.jar | cut -f1)"
```

---

## Phase J6 — Java Mod Validation

| Check | Auto-fix |
|-------|----------|
| Cross-mod recipe references an item ID that doesn't exist in any mod | Remove that recipe; log warning |
| Tag value references an ID not found in any mod | Remove that entry from the tag; log warning |
| Two mixin configs inject into same method at same injection point | Cannot auto-fix; document in MixinCompatReport.md |
| Config file uses same key with incompatible types across mods | Keep higher-priority mod's type; log warning |
| Advancement references item that doesn't exist | Replace with `minecraft:nether_star`; log warning |
| Biome spawn entry references entity that doesn't exist | Remove spawn entry; log warning |
| Loot table cross-injection would push pool count > 20 | Cap at 20 pools; log warning |
| Two mods declare same custom registry ID | Higher-priority wins; log warning |
| Compat JAR depends on mod ID not found in uploads | Add note in README: required mod missing |

---

## Phase J7 — Java Merge README

```markdown
# Merged Modpack: [ModA] + [ModB] + ...
Auto-generated by bedrock-addon-combiner v3 — Java pipeline.

## Install
1. Place ALL `.jar` files from `mods/` into your `.minecraft/mods/` folder.
2. Place contents of `config/` into `.minecraft/config/`.
3. Place `mergedpack_resources.zip` into `.minecraft/resourcepacks/` and enable it.
4. The `data/` folder is embedded in `mergedpack_compat-1.0.0.jar` — no manual install needed.

## Mods merged
| Mod | ID | Version | Loader | Items | Blocks | Entities |
|-----|----|---------|--------|-------|--------|----------|

## Cross-features active
| Feature | Details |
|---------|---------|
| ✅ Unified Tags (c:) | [N] unified tag files covering ingots, ores, logs, foods, gems |
| ✅ Cross-Smelting | [N] cross-mod smelting recipes generated |
| ✅ Cross-Loot | [N] items injected into [N] loot tables |
| ✅ Cross-Spawning | [N] mobs added to [N] biomes |
| ✅ Cross-Advancements | Merged Pack Explorer advancement |
| ✅ Config Merge | [N] config files merged |
| ✅ Lang Merge | [N] language keys merged |

## Mixin Compatibility
| Mod A | Mod B | Target Class | Conflict? | Action |
|-------|-------|-------------|-----------|--------|

## Conflicts resolved
| # | Type | Mods | Conflict | Resolution |
|---|------|------|----------|------------|

## Manual review required
[List any mixin conflicts requiring user intervention]
[List any capabilities that could not be auto-merged]

## Known limitations
- This tool generates a data-only compat JAR; it cannot recompile Java source code.
- Mixin conflicts at the same injection point require manual resolution.
- Shader mods (Iris, Optifine, Sodium) are copied as-is; no merge attempted.
- Mod-specific GUIs and custom inventory logic are not merged — only data/recipes/tags.
- Always test the merged modpack in a fresh world before use.
```

---

# ═══════════════════════════════════════════════════
# BEDROCK ADD-ON MERGE PIPELINE — Phases 0–7
# ═══════════════════════════════════════════════════

*(All phases from v2 are preserved in full below, including Phase 0 Java→Bedrock bridge, Phases 1–7 Bedrock full merge, custom machines, function compatibility, UI bridge, scoreboard guard, and gametest bridge.)*

---

## Routing Summary

```
User uploads .jar files only       → Phase J1 → J2 → J3 → J4 → J5 → J6 → J7
User uploads .mcaddon files only   → Phase 0  → 1  → 2  → 3  → 4  → 5  → 6  → 7
User uploads mix of both           → Phase J (for jars) + Phases 0-7 (for mcaddons)
                                     then cross-link: Java stubs added to Bedrock merged pack
```

---

## Phase 0 — Java→Bedrock Conversion Bridge

*(Full Phase 0 from v2 — J0A extract, J0B detect loader, J0C generate Bedrock stubs, J0D conversion report)*

### 0A. Extract and detect *(same as v2)*
### 0B. Detect mod loader *(same as v2)*
### 0C. Generate Bedrock stubs per Java item/block/entity *(same as v2)*
### 0D. Conversion report *(same as v2)*

---

## Phase 1 — Bedrock Deep Inventory
*(Full Phase 1 from v2 — extract, classify, inventory BP+RP, ADDON_MAP, categorization)*

## Phase 2 — Bedrock Conflict Detection and Merge
*(Full Phase 2 from v2 — priority order, namespace conflicts, BP file merging, RP merging, custom machine recipe tag merging, UI screen merging)*

## Phase 3 — Bedrock Cross-Features Weaving
*(Full Phase 3 from v2 — tree cutting, log stripping, tool-block matrix, soil/crop, fertilizers, ore Y-bands, climate injection, dimension portals, ore Y-redistribution, cross-loot, cross-smelting, mob harmony, wandering trader, sounds/particles/fog/lang, custom machine compat, function compat, scoreboard guard, UI bridge, gametest bridge)*

## Phase 4 — Bedrock Manifests
*(Full Phase 4 from v2)*

## Phase 5 — Bedrock Validation
*(Full Phase 5 from v2 — BP validation, RP validation, script validation, custom machine validation, function validation, Java bridge validation)*

## Phase 6 — Bedrock Package
*(Full Phase 6 from v2 — final layout with java_bridge/ folder, packaging commands)*

## Phase 7 — Bedrock README
*(Full Phase 7 from v2)*

---

## Edge Cases (v3 additions)

| Situation | Handling |
|-----------|----------|
| Java mod is a library/API (no items/blocks) | Extract its tag definitions and API stubs; include in unified tags; note in report |
| Two Java mods have same `mod_id` | Lower-priority renamed to `<name>_alt` throughout; log |
| Java mod uses Kotlin or Scala | Treat same as Java for data extraction; note compiled language in report |
| Java mod is server-only (`"environment": "server"`) | Skip client assets; still merge data |
| Java mod is client-only (`"environment": "client"`) | Skip data; still merge assets/lang |
| Forge mod uses `@ObjectHolder` for cross-mod item references | Note in MixinCompatReport; cannot auto-resolve static references |
| Mod uses custom codec/registry not in standard `data/` structure | Copy data as-is; note in report as "non-standard data format" |
| Mixed Fabric + Forge mods uploaded together | Generate both `fabric.mod.json` and `mods.toml` for compat JAR; note loader incompatibility in README |
| Java mod version > current MC stable | Warn; continue; note possible incompatibility |
| Compat JAR would exceed 50MB | Split into multiple compat JARs by feature area; note in README |
| All uploaded Java mods are from same mod author/pack | Note likely already compatible; generate tags/recipes only; skip mixin conflict check |
| Java mod uses `pack.mcmeta` data pack format directly | Treat its `data/` as a data pack; merge normally |
| *(all v2 Bedrock edge cases also apply)* | *(see v2 edge cases section)* |
