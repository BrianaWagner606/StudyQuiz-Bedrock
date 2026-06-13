# 💖 Study Quiz — Minecraft Bedrock Add-On

A cute, pink study-quiz add-on for Minecraft **Bedrock Dedicated Server**. (I'm
planning to add more colors, but pink is my favorite!)

While you play, little pop quizzes show up. Get one right and you earn a pink
**Study Coin** you can spend in the in-game store. Get one wrong and you drop
some items, so it's worth paying attention. It works offline out of the box, and
you can optionally hook up AI for endless questions on any subject.

---

## Download & install

> You need a **Bedrock Dedicated Server (BDS)**, version 1.21.80 or newer. This
> is a server add-on, not something you load in a normal single-player world.

👉 **[Download the latest release](https://github.com/BrianaWagner606/StudyQuiz-Bedrock/releases/latest)**

- **Easiest:** grab `StudyQuiz-Full-Project.zip`, unzip it, run `install-bds.bat`,
  and paste the path to your server folder. It copies the packs and sets up the
  permissions file for you.
- **Just the packs:** grab `StudyQuiz.mcaddon`, import it, add both packs to your
  world, and allow the script modules in `config/default/permissions.json`.

Then start your server and it works right away. Players don't install anything —
they just join and use the **Study Settings book** in their inventory.

Full steps and troubleshooting are in the [User Guide](USER_GUIDE.md).

---

## What you can do

- 🎀 Pop quizzes while you play, with a little 3-2-1 countdown first
- 💖 Earn a pink Study Coin for every right answer
- 🛍️ Spend coins in a store (food, materials, premium stuff)
- ⚠️ Drop items when you get one wrong (you choose how much)
- 🏆 "Master" a question by getting it right 3 times; track your accuracy
- 📚 **Curriculum packs** — ready-made study tracks (cloud, DevOps, AI/ML,
  security, data, programming languages, system design, CS basics)
- 🎚️ Pick a **difficulty** (foundational, associate, pro, or mixed)
- 📖 Close a question and get a quick **overview** of the topic plus the answer —
  a nice way to learn instead of guessing
- 🧑‍🏫 **Teacher tools** — set one lesson for the whole class, see everyone's
  progress, and reset a student
- 🤖 Optional AI questions (see below)

Everyone has their own coins, settings, and progress.

---

## AI questions (optional)

Out of the box, quizzes use the built-in question set, so you don't need anything
extra. If you want endless AI-generated questions (this is what powers the
curriculum packs), you have two choices:

- **Local helper** — run the little program in [`proxy/`](proxy/) with your own
  API key. Simple, runs on the same PC as your server.
- **Cloud** — deploy the optional AWS backend in [`cloud/`](cloud/). A bit more
  setup, but then there's no helper to start, and you get a teacher dashboard and
  shared progress across servers.

Either way, **your API key stays yours** and never goes into the game files.

---

## What's in here

```
study_quiz_bp/   The behavior pack (the game logic)
study_quiz_rp/   The resource pack (the pink coin texture)
proxy/           Optional local AI helper
cloud/           Optional AWS backend (dashboard, shared progress)
tools/           Build scripts
USER_GUIDE.md    Full setup + how to play
SECURITY.md      Read this before you publish your own copy
```

---

## Sharing this yourself?

If you fork or publish this, please read [SECURITY.md](SECURITY.md) first. The
short version: share the code, not your keys. Anyone who wants AI runs their own
helper or backend with their own key.

---

Made with 💖 — happy studying!
