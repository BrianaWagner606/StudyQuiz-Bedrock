# 💖 Study Quiz — Minecraft Bedrock Add-On

A cute, pink aesthetics (Planning on adding different colors but pink is my favorite) **study-quiz** add-on for **Bedrock Dedicated Server (BDS)**. 

Players answer pop quizzes while they play, earn an adorable **pink Study Coin**, spend coins in an
in-game **Store**, and risk dropping their coins on a wrong answer.

Works **offline** with built-in questions, with optional **live AI** for endless,
any-subject questions.

---

## ⬇️ Download & install

> **Requires a [Bedrock Dedicated Server (BDS)](https://www.minecraft.net/en-us/download/server/bedrock) 1.21.80+** — this is a server add-on, not a Realms or regular-client mod.

### 👉 [**Download the latest release**](https://github.com/BrianaWagner606/StudyQuiz-Bedrock/releases/latest)

- **Easiest:** grab **`StudyQuiz-Full-Project.zip`**, unzip it, run **`install-bds.bat`**, and paste your BDS folder path. It copies both packs *and* sets `permissions.json` for you (the step people most often miss).
- **One-click packs:** grab **`StudyQuiz.mcaddon`**, import it, attach both packs to your world, and allow the script modules in `config/default/permissions.json`.

Restart the server and it works **offline immediately**. **Players install nothing** — just join a server that runs it and use the **Study Settings book** in your inventory (or `/scriptevent study:open`).

👉 Full steps & troubleshooting: **[USER_GUIDE.md](USER_GUIDE.md)**  ·  AI questions are **bring-your-own-key** — see **[SECURITY.md](SECURITY.md)**.

---

## ✨ Features
- Timed pop quizzes with a 3-2-1 countdown before the user is prompted with the question so they can prepare while in game.
- Collectible **pink Study Coin** item (real inventory item)
- Multi-category **Store** (Food / Materials / Premium items)
- Configurable wrong-answer penalty (held item / hotbar / full inventory)
- Per-player settings, coins, mastery, accuracy & stats
- **Curriculum packs** — ready-made tech tracks (Cloud/IaC, DevOps/SRE, AI-ML, Security, Data, Programming Languages, System Design, CS Fundamentals)
- **Difficulty tiers** — foundational / associate / pro / mixed, fed into the AI
- **Teacher tools** (tag a player `sq_admin`) — assign a lesson to the whole class, lock topic/difficulty, view a class roster, reset a student
- Optional AI-generated questions via a secure local gateway

---

## 📦 What's in this project
```
study_quiz_bp/      Behavior pack (game logic, scripts, coin item)
study_quiz_rp/      Resource pack (pink coin texture)
proxy/              Optional local AI gateway (keeps your API key out of the game)
cloud/              Optional AWS backend (serverless gateway, cross-server progress, teacher dashboard, analytics)
tools/              Dev scripts (texture & icon generators)
dist/               Packaged add-on for sharing (.mcaddon)
USER_GUIDE.md       Full setup + how-to-play guide
```

---

## ☁️ Optional cloud backend
Want it to scale past one PC? The [`cloud/`](cloud/) folder has a Terraform-deployed
**AWS** backend: a serverless AI gateway (Lambda + API Gateway, key in Secrets
Manager), a shared **DynamoDB** question cache, **cross-server progress +
leaderboard**, a **teacher dashboard** (S3 + CloudFront), and **analytics** (S3 +
Athena). It's optional — the add-on runs fully local without it. See
[cloud/README.md](cloud/README.md).

## 🔒 Security note
Your AI API key lives **only** in `proxy/anthropic-key.txt` (local) or **AWS
Secrets Manager** (cloud) — never in a pack file.

**Publishing this on GitHub?** Read [SECURITY.md](SECURITY.md) first. Short
version: ship code, not secrets — others run their own proxy/backend with their
own key ("Bring Your Own"). Enable the secret guard once per clone with
`git config core.hooksPath .githooks`.

---

## 🎮 Requirements
- Bedrock Dedicated Server 1.21.80+ (tested on 1.26.x)
- *(AI only)* Node.js + an AI provider API key

---

Made with 💖 — happy studying!
