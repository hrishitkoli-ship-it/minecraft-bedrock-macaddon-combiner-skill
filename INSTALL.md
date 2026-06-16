# 📦 Installation Guide

## Method 1 — Claude.ai (Recommended)

1. Download [`SKILL.md`](./SKILL.md) from this repo
2. Open [claude.ai](https://claude.ai)
3. Go to **Settings → Custom Skills** (or your project skill library)
4. Upload `SKILL.md` as a new skill
5. The skill is now active — Claude will use it automatically when you upload `.mcaddon` files

---

## Method 2 — Claude Code (CLI)

1. Clone this repo into your project:
   ```bash
   git clone https://github.com/hrishitkoli-ship-it/minecraft-bedrock-macaddon-combiner-skill.git
   cp minecraft-bedrock-macaddon-combiner-skill/SKILL.md .claude/skills/bedrock-addon-combiner/SKILL.md
   ```

2. Claude Code automatically reads skills from `.claude/skills/` — no extra config needed.

---

## Method 3 — Manual (any Claude interface)

1. Open `SKILL.md` and copy its full contents
2. Paste it at the top of your Claude conversation as a system context block
3. Then upload your add-ons and say _"Combine these"_

---

## 🎮 Usage

### Step 1 — Upload your add-ons
Drag and drop two or more `.mcaddon` or `.zip` Bedrock add-on files into your Claude chat.

### Step 2 — Trigger the skill
Say any of:
- `"Combine these add-ons"`
- `"Merge these into one mcaddon"`
- `"Intertwine these Bedrock add-ons"`

### Step 3 — Wait for processing
Claude will:
- Extract and inventory all add-ons
- Resolve conflicts (shown in output)
- Generate cross-linking code
- Package everything into one `.mcaddon`

### Step 4 — Download and install
- Download the generated `<name>_merged.mcaddon` file
- Double-click it in Windows/macOS/Android/iOS
- Bedrock imports **one BP** and **one RP** automatically
- Activate both in your world settings
- Done ✅

---

## 🗂️ Output structure

```
YourAddons_merged.mcaddon
├── MergedPack_BP/        ← ONE behavior pack (all add-ons merged in)
│   ├── manifest.json
│   ├── items/
│   ├── blocks/
│   ├── entities/
│   ├── loot_tables/
│   ├── recipes/
│   ├── scripts/
│   │   ├── main.js       ← imports all original + compat scripts
│   │   ├── addon_*/      ← original scripts isolated per add-on
│   │   └── compat/       ← generated cross-link scripts
│   └── ...
├── MergedPack_RP/        ← ONE resource pack (all add-ons merged in)
│   ├── manifest.json
│   ├── textures/
│   ├── sounds/
│   ├── texts/en_US.lang  ← all lang entries merged
│   └── ...
└── README.md             ← conflict log + feature summary
```

---

## ❓ FAQ

**Q: Do I still need the original add-ons installed?**
No. Everything is merged into the single BP + RP. Uninstall the originals.

**Q: Will my existing worlds break?**
Worlds that used original add-ons may have mismatched block/item IDs. Best used on new worlds.

**Q: What if an add-on is encrypted?**
Encrypted add-ons cannot be read or merged. Claude will warn you and skip them.

**Q: Does this work with more than 2 add-ons?**
Yes — all merging logic is N-way. Upload as many as you want.

**Q: Tree cutting / portals are not working in-game**
Make sure **Scripting API (Beta APIs)** is enabled in your world settings under Experiments.

