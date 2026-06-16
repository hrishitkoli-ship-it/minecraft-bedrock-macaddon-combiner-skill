# 🧱 Minecraft Bedrock `.mcaddon` Combiner Skill

A Claude AI skill that merges multiple Minecraft Bedrock Edition add-ons into a **single `.mcaddon` file** containing one unified BP and one unified RP — just double-click to install, no load order needed.

---

## ✨ What it does

Upload two or more `.mcaddon` or `.zip` Bedrock add-on files to Claude, and this skill:

- **Deep-merges** all BP content (items, blocks, entities, loot tables, recipes, scripts, features, biomes, dimensions, spawn rules, animations)
- **Deep-merges** all RP content (textures, models, sounds, particles, lang files, UI, fog, render controllers)
- **Resolves all conflicts** — namespace clashes, duplicate IDs, overlapping ore Y-ranges, entity AI collisions, script event double-fires, texture key collisions, and more
- **Cross-links everything** so the add-ons work in harmony:
  - 🪓 Tree cutters from any add-on fell modded trees from every other add-on
  - 📦 Custom ingots/ores appear in each other's structure chest loot
  - 🔥 Cross-smelting: any ore works in any custom smelter
  - 🌀 Custom dimension portal linkage
  - 🐾 Mob harmony: friendly mobs protected, cross-taming supported
  - ⛏️ Ore Y-band redistribution: no two ores fight over the same depth
  - 🧑‍🤝‍🧑 Wandering trader cross-trades
  - 🔊 Sound, particle, and fog merging
  - 🌐 Unified `en_US.lang` from all add-ons

**Output:** One `.mcaddon` → `MergedPack_BP/` + `MergedPack_RP/` — install both, done.

---

## 📁 Repository structure

```
minecraft-bedrock-macaddon-combiner-skill/
├── SKILL.md          ← The skill file (load this into your Claude skill library)
├── INSTALL.md        ← How to install and use the skill
└── examples/
    └── registry_example.js   ← Example add-on registry for reference
```

---

## 🚀 Quick start

See [INSTALL.md](./INSTALL.md) for full setup instructions.

**TL;DR:**
1. Add `SKILL.md` to your Claude skill library (or paste its path into your Claude Code project)
2. Upload your `.mcaddon` files to Claude
3. Say: _"Combine these add-ons"_
4. Download the merged `.mcaddon` and install it in Bedrock

---

## 🧠 How it works

The skill runs in **6 phases**:

| Phase | What happens |
|-------|-------------|
| 1 — Deep Inventory | Extracts and catalogues every file in every add-on |
| 2 — Conflict Resolution | Detects and fixes all 7 categories of conflicts |
| 3 — Cross-linking | Generates tree cutting, loot injection, portals, mob harmony, ore bands |
| 4 — Manifests | Writes unified BP + RP manifests with correct UUIDs and engine version |
| 5 — Packaging | Zips into a single `.mcaddon` with a full README inside |
| 6 — Report | Embeds conflict log, ore Y-band table, and feature summary |

---

## ⚠️ Requirements

- Minecraft Bedrock Edition 1.21.0+
- Scripting API must be enabled in world settings (for tree cutting, portals, mob harmony)
- Not compatible with Education Edition or encrypted add-ons

---

## 📄 License

MIT — free to use, fork, and extend.

