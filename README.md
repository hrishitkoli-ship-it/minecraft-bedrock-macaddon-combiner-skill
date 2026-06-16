# 🧱 Minecraft Bedrock `.mcaddon` Combiner Skill

A Claude AI skill that merges multiple Minecraft Bedrock Edition add-ons into a **single `.mcaddon`** file — one BP, one RP, double-click to install.

---

## ✨ What it does

Upload two or more `.mcaddon` or `.zip` Bedrock add-on files to Claude and this skill produces a fully merged modpack where everything works together natively.

### 🪓 Tree Cutting — with custom structure support
- Every tree-cutter and iron+ axe from any add-on fells every modded tree from every other add-on
- **Custom structures on trees are handled intelligently:**
  - 🐝 Beehives/nests → preserved if occupied, dropped as item if empty
  - 🪺 Bird nests → contents dropped as items
  - 🏮 Lanterns → dropped as items
  - 🍄 Shelf mushrooms → dropped as items
  - 🕸️ Vines/moss/lichen → silently removed
  - 🐛 Cocoons → break event triggered (may spawn mobs)
- All axes can strip all modded logs to their stripped variants
- Uses BFS (not recursion) — no stack overflows on large trees
- Correct durability consumed per log broken

### ⛏️ Tool–Block Interaction Matrix
- Pickaxe tiers enforced across all add-on ores (wrong tier = blocked with sound)
- Hoes from any add-on till soil blocks from every other add-on
- All modded soils become tillable farmland

### 🌾 Soil & Crop Cross-Compatibility
- Seeds from any add-on plant on tilled soil from any other add-on
- Fertilizers from any add-on accelerate crops from any other add-on

### 📦 Cross-Loot Injection
- Custom ingots, ores, foods and seeds appear in each other's structure chests
- Context-aware: ingots in mine chests, food in village chests, etc.

### 🔥 Cross-Smelting
- Any ore works in any custom smelter from any add-on
- Cross-repair: same-tier materials from different add-ons repair each other's tools

### 🌀 Dimension Portals
- Custom dimensions from different add-ons are portal-linked
- Portal cooldowns prevent teleport spam
- Alternate destinations via holding a special item

### 🐾 Mob Harmony
- Friendly mobs from one add-on are protected from hostile mobs of another
- Cross-add-on taming and breeding items
- Climate-gated cross-biome mob spawning

### ⛏️ Ore Y-Band Redistribution
- No two ores compete for the same depth band
- Non-overlapping 16-block bands assigned per dimension

### 🧑‍🤝‍🧑 Wandering Trader
- High-value items from all add-ons added to trader pool

### ✅ Validation Pass
- After merge, all JSON references checked (items, blocks, entities, textures, sounds, geometries, animations)
- Broken references auto-fixed or logged for manual review

### 🌐 Sound, Particle, Fog & Lang Merge
- All sound events merged into one `sound_definitions.json`
- All particle IDs merged (collisions renamed, references updated everywhere)
- All `en_US.lang` entries unified

---

## 🔧 Conflict Resolution

| Conflict type | How it's resolved |
|--------------|----------------------|
| Namespace collision | Lower-priority namespace aliased |
| Duplicate item/block/entity ID | Higher-version add-on wins; both kept |
| Duplicate recipe | Both kept, lower-priority renamed |
| Loot table path clash | Pools merged, entries deduplicated |
| Entity behavior goal clash | Deep-merged, higher-priority wins per key |
| Ore Y-range overlap | Non-overlapping bands assigned |
| Texture key collision | Higher-priority wins; all references updated |
| Sound event collision | File lists merged |
| Particle ID collision | Lower-priority renamed everywhere |
| Script event double-fire | Per-tick guard prevents duplicate handling |
| Scoreboard objective clash | Idempotent `getObjective ?? addObjective` pattern |
| Animation/render controller ID clash | Lower-priority renamed; all entity refs updated |
| UI screen collision | Manual review flagged (cannot auto-merge) |

---

## 📁 Repository structure

```
minecraft-bedrock-macaddon-combiner-skill/
├── SKILL.md              ← Load into Claude skill library
├── INSTALL.md            ← Setup instructions (3 methods)
├── README.md             ← This file
└── examples/
    └── registry_example.js   ← Annotated ADDON_MAP example
```

---

## 🚀 Quick start

See [INSTALL.md](./INSTALL.md) for full setup.

**TL;DR:**
1. Add `SKILL.md` to your Claude skill library
2. Upload your `.mcaddon` files to Claude
3. Say: _"Combine these add-ons"_
4. Download and double-click the merged `.mcaddon`

---

## 🏗️ Output structure

```
YourAddons_merged.mcaddon
├── MergedPack_BP/
│   ├── items/, blocks/, entities/, loot_tables/, recipes/
│   ├── features/, feature_rules/, biomes/, dimensions/, spawn_rules/
│   ├── animations/, animation_controllers/, structures/, functions/
│   └── scripts/
│       ├── main.js                  ← generated entry point
│       ├── addon_<name>/            ← original scripts, isolated
│       └── compat/
│           ├── script_event_guard.js
│           ├── tree_cutter.js       ← BFS felling + decoration handling
│           ├── tool_block_matrix.js ← tier enforcement + hoe tilling
│           ├── soil_crop.js         ← cross-planting + fertilizing
│           ├── loot_injector.js
│           ├── dimension_portals.js ← cooldowns + alternate destinations
│           ├── mob_harmony.js       ← protection + cross-taming
│           └── trade_injector.js
└── MergedPack_RP/
    ├── textures/ (item_texture.json + terrain_texture.json merged)
    ├── models/, render_controllers/, animations/, animation_controllers/
    ├── particles/, sounds/, fog/, attachables/, ui/
    └── texts/en_US.lang (all add-ons merged)
```

---

## ⚠️ Requirements

- Minecraft Bedrock 1.21.0+
- **Beta APIs / Scripting API** enabled in world settings (for tree cutting, portals, mob harmony, soil tilling, fertilizing)
- Not compatible with Education Edition

---

## 📄 License

MIT

