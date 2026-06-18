# Installation Guide — bedrock-addon-combiner v4

## What this skill does

Combines multiple **Minecraft Bedrock Edition** `.mcaddon` files into a single merged `.mcaddon` with one BP and one RP. Drop in any number of Bedrock add-ons — the skill resolves all conflicts and cross-links all features automatically.

> **Bedrock only.** For Java Edition mods, use the `minecraft-modding` or `minecraft-datapack` skills instead.

---

## Bedrock Version Support

| Bedrock version | Supported | Notes |
|-----------------|-----------|-------|
| 1.20.x | ✅ | Script API 1.6–1.8; legacy item format auto-converted |
| 1.21.0–1.21.3 | ✅ | Script API 1.11–1.13 |
| 1.21.4–1.21.8 | ✅ | Script API 1.14–1.16 (recommended) |
| 1.21.9+ | ✅ | Script API 1.17+ |
| < 1.20 | ⚠️ | Not tested; may work for data-only add-ons |

The merged pack targets the **highest engine version** found across all input add-ons.

---

## Method 1 — Claude.ai Projects (Recommended)

1. Download `SKILL.md` from this repo
2. Open [claude.ai](https://claude.ai) and create or open a **Project**
3. In the project, go to **Project Knowledge → Add content → Upload file**
4. Upload `SKILL.md`
5. The skill is now always active in that project

---

## Method 2 — Claude Code

```bash
git clone https://github.com/hrishitkoli-ship-it/minecraft-bedrock-macaddon-combiner-skill.git
mkdir -p your-project/.claude/skills/bedrock-addon-combiner
cp minecraft-bedrock-macaddon-combiner-skill/SKILL.md \
   your-project/.claude/skills/bedrock-addon-combiner/SKILL.md
```

Claude Code automatically reads skills from `.claude/skills/` — no extra configuration needed.

---

## Method 3 — Any Claude Chat (Manual)

1. Open `SKILL.md` and copy all contents
2. Paste at the top of your Claude conversation
3. Then upload your `.mcaddon` files and say _"Combine these"_

---

## Usage

### Step 1 — Upload add-ons
Drag and drop two or more `.mcaddon` or `.zip` Bedrock add-on files into the chat.

### Step 2 — Trigger
Say any of:
- `"Combine these add-ons"`
- `"Merge these into one mcaddon"`
- `"Intertwine these Bedrock add-ons"`

### Step 3 — Receive output

Claude will:
1. Extract and inventory all add-ons
2. Detect and resolve all conflicts
3. Generate cross-linking scripts (tree cutting, loot, portals, etc.)
4. Run a validation pass on all merged files
5. Package everything into a single `.mcaddon`

### Step 4 — Install

- Download `<name>_merged.mcaddon`
- Double-click it on Windows / macOS / Android / iOS
- Bedrock imports **one BP + one RP**
- Activate both in your world settings → Experiments → Beta APIs
- Done ✅

---

## Output layout

```
YourAddons_merged.mcaddon
├── MergedPack_BP/
│   ├── manifest.json
│   ├── items/, blocks/, entities/, loot_tables/, recipes/
│   ├── features/, feature_rules/, biomes/, dimensions/
│   ├── spawn_rules/, trading_tables/
│   ├── animation_controllers/, animations/, structures/, functions/
│   └── scripts/
│       ├── main.js                   ← generated entry point
│       ├── addon_<name>/             ← original scripts, isolated
│       └── compat/
│           ├── script_event_guard.js ← tick-safe event dedup
│           ├── tree_cutter.js        ← BFS felling + decoration handling
│           ├── tool_block_matrix.js  ← tier enforcement + hoe tilling
│           ├── soil_crop.js          ← cross-planting + fertilizing
│           ├── loot_injector.js
│           ├── dimension_portals.js  ← cooldowns + alternate destinations
│           ├── mob_harmony.js
│           └── trade_injector.js
└── MergedPack_RP/
    ├── manifest.json
    ├── textures/ (item_texture.json + terrain_texture.json merged)
    ├── models/, render_controllers/, animations/, animation_controllers/
    ├── particles/, sounds/, fog/, attachables/, ui/
    └── texts/en_US.lang (all add-ons merged)
```

---

## FAQ

**Q: Do I still need the original add-ons installed?**
No. Everything is merged in. Uninstall originals to avoid conflicts.

**Q: Will existing worlds break?**
Yes — worlds using original add-ons may have mismatched block/item IDs. Best used on new worlds.

**Q: What if an add-on is encrypted?**
Encrypted add-ons cannot be read. Claude skips them and warns you.

**Q: More than 2 add-ons?**
Yes — all logic is N-way. Upload as many as you want.

**Q: Tree cutting / portals not working?**
Enable **Beta APIs** in world settings → Experiments.

**Q: What about Java Edition mods?**
This skill is Bedrock-only. For Java mods, ask Claude to use the `minecraft-modding` skill.

**Q: My add-on uses Bedrock 1.20 format — will it still work?**
Yes. The skill auto-converts legacy `minecraft:item` wrapper format to the flat component format used by higher engine versions.

