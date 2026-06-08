# 💖 Study Quiz — Minecraft Bedrock Add-On

A cute, pink **study-quiz** add-on for **Bedrock Dedicated Server (BDS)**. Players answer
pop quizzes while they play, earn an adorable **pink Study Coin**, spend coins in an
in-game **Store**, and risk dropping their coins on a wrong answer.

Works **offline** with built-in questions, with optional **live AI** for endless,
any-subject questions.

---

## ✨ Features
- Timed pop quizzes with a 3-2-1 countdown
- Collectible **pink Study Coin** item (real inventory item)
- Multi-category **Store** (Food / Materials / Premium)
- Configurable wrong-answer penalty (held item / hotbar / full inventory)
- Per-player settings, coins, mastery & stats
- Optional AI-generated questions via a secure local gateway

---

## 🚀 Quick start
1. Copy `study_quiz_bp` and `study_quiz_rp` into your BDS pack folders and attach
   them to your world.
2. Start the server and join — use the **Study Settings book** in your inventory to
   open the menu.
3. *(Optional)* For live AI questions, set up the `proxy` (see the guide).

👉 **Full instructions:** [USER_GUIDE.md](USER_GUIDE.md)

---

## 📦 What's in this project
```
study_quiz_bp/      Behavior pack (game logic, scripts, coin item)
study_quiz_rp/      Resource pack (pink coin texture)
proxy/              Optional local AI gateway (keeps your API key out of the game)
tools/              Dev scripts (texture & icon generators)
dist/               Packaged add-on for sharing (.mcaddon)
USER_GUIDE.md       Full setup + how-to-play guide
```

---

## 🔒 Security note
Your AI API key lives **only** in `proxy/anthropic-key.txt`, which is git-ignored and
never bundled into the shareable add-on. Never paste a real key into chat, a
screenshot, or a pack file. If a key is ever exposed, regenerate it.

---

## 🎮 Requirements
- Bedrock Dedicated Server 1.21.80+ (tested on 1.26.x)
- *(AI only)* Node.js + an AI provider API key

---

Made with 💖 — happy studying!
