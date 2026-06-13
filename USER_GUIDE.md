# Study Quiz — User Guide

A study-quiz add-on for Minecraft **Bedrock Dedicated Server**. Players
answer quick quizzes while they play, earn pink Study Coins, spend them in a
store, and lose a few items when they get one wrong.

It works offline with built-in questions. If you want endless questions on any
topic, you can connect AI (that part's optional).

---

## 1. What you need

- A **Bedrock Dedicated Server (BDS)**, version **1.21.80 or newer** (tested on
  1.26).
- The two packs in this project:
  - `study_quiz_bp` — the behavior pack (the actual game logic)
  - `study_quiz_rp` — the resource pack (the pink coin texture)
- *(Only if you want AI)* Node.js, plus an API key from an AI provider.

This is a **server** add-on. It won't run in a normal single-player world,
because it uses server-only features.

---

## 2. Install it

### The easy way

1. Download and unzip `StudyQuiz-Full-Project.zip`.
2. Double-click **`install-bds.bat`**.
3. Paste the path to your BDS folder (the one with `bedrock_server.exe`) and
   press Enter.

That copies both packs and sets up the permissions file (the step people forget).
When it's done, jump to section 3.

### By hand

1. Stop your server.
2. Copy the two folders into your server:
   - `study_quiz_bp` → `behavior_packs\study_quiz_bp`
   - `study_quiz_rp` → `resource_packs\study_quiz_rp`
3. In your world folder (`worlds\<your-level-name>\`), make sure these two files
   exist:

   `world_behavior_packs.json`
   ```json
   [ { "pack_id": "7f01af09-a5e4-45cf-9f36-696f96a50c0b", "version": [1, 1, 0] } ]
   ```
   `world_resource_packs.json`
   ```json
   [ { "pack_id": "b2d6f3a1-9c44-4e7a-8f12-3a7e5c901d44", "version": [1, 0, 0] } ]
   ```

4. **Allow the script modules.** This is the step that causes the most "it
   doesn't work" problems. In your server folder, open (or create)
   `config\default\permissions.json` and set it to exactly this:
   ```json
   {
     "allowed_modules": [
       "@minecraft/server",
       "@minecraft/server-ui",
       "@minecraft/server-net",
       "@minecraft/server-admin"
     ]
   }
   ```
   It has to be the one in your **server's** `config\default\` folder — not the
   example copy inside the pack.

5. Start the server. You should see `[StudyQuiz] Loaded.` in the console.

Restart the server fully after any update so it reloads the packs.

---

## 3. How to play

You get a **Study Settings book** in your inventory automatically. **Use it**
(hold and right-click / long-press) to open the menu.

> No book? An operator can run `/scriptevent study:open` to open it.

From the menu you can take a quiz, browse curriculum packs, open the store, check
your stats, and change your settings.

**Answering a question:**
- A 3-2-1 countdown plays, then the question shows up.
- The full answer choices are listed in the question text (they scroll), and the
  buttons below are how you pick.
- Right answer → +1 Study Coin, and your streak on that question goes up.
- Get the same question right 3 times → you've "mastered" it.
- Wrong answer (or you run out of time) → your streak resets and you drop some
  items.
- **Close a question with the X** → no penalty, and you'll get a quick overview
  of the topic plus the correct answer. It's a nice way to learn one you didn't
  know.

The coins are real items in your inventory, so you can see how many you have, and
the "full inventory" penalty can actually make you drop them — so answer
carefully!

---

## 4. Settings (per player)

Open the book → **Settings**:

- **Quiz interval** — how often a quiz pops up (15 seconds up to 60 minutes)
- **Answer time limit** — how long you get per question
- **Topic** — type any subject you like (leave it blank to keep a curriculum pack)
- **Difficulty** — foundational, associate, pro, or mixed
- **Options per question** — how many answer buttons
- **Penalty** — what you drop on a wrong answer: held item, hotbar, or full
  inventory

If a teacher has locked the lesson, the topic and difficulty are set for you and
won't show here.

---

## 5. Curriculum packs

Open the book → **Curriculum** to pick a ready-made study track instead of typing
a topic — things like Cloud & IaC, DevOps & SRE, AI/ML, Security, Data
Engineering, Programming Languages, System Design, and CS Fundamentals.

Pick a pack, choose a difficulty (and a language for the programming pack), and
start. These packs lean on AI for their questions, so turn on AI (section 7) for
the full experience.

You can add or edit packs in
`study_quiz_bp/scripts/questions/curriculum.js`.

---

## 6. Teacher tools

If you're running this for a class, give yourself the teacher tag from the server
console:

```
tag "YourGamertag" add sq_admin
```

Now you'll see a **Teacher** button in the menu. From there you can:

- **Assign a lesson** to everyone (a curriculum pack or a free topic), pick the
  difficulty, and optionally **lock** it so students can't change it.
- See a **class roster** — everyone's answered count, accuracy, and coins.
- **Reset a student's** progress (their coins stay).

If you deploy the optional cloud backend, you also get a browser dashboard and
progress that follows students across servers. See [cloud/README.md](cloud/README.md).

---

## 7. The store

Open the book → **Store**, pick a category, and buy something with your coins.

| Category | Examples |
| --- | --- |
| Food | Bread, Steak, Golden Apple |
| Materials | Torch, Arrows, Iron/Gold Ingot, Ender Pearl |
| Premium | Diamond, Emerald, Netherite Scrap, Diamond Block |

Prices go from 1 coin for snacks up to 50 for the fancy stuff. If your inventory
is full, what you bought drops at your feet.

---

## 8. Turn on AI questions (optional)

By default the game uses the built-in questions. For endless AI questions, you
have two options.

### Option A — the local helper

A small program that holds your API key **outside** the game.

1. Install [Node.js](https://nodejs.org).
2. Get an API key from your provider (for example, the Anthropic console).
3. Double-click `proxy\start-proxy.bat`. The first time, it creates
   `anthropic-key.txt` and opens it.
4. Paste your key, save, and run `start-proxy.bat` again. It should say the key
   loaded.
5. Start it **before** your Minecraft server each time, and leave its window open.

### Option B — the cloud

Deploy the AWS backend in [`cloud/`](cloud/). After that there's no helper to
start, and you get the teacher dashboard and shared progress. Setup is in
[cloud/README.md](cloud/README.md).

Either way, your key lives only in the helper or in AWS — never in a pack file.

---

## 9. Edit the built-in questions (no AI needed)

All the offline questions live in one file:

`study_quiz_bp/scripts/questions/bundledTopics.js`

Each one looks like this:

```js
{
  "question": "Which planet is closest to the Sun?",
  "options":  ["Mercury", "Venus", "Earth", "Mars"],
  "answer":   "Mercury"
}
```

- **question** — what players see
- **options** — 2 to 6 answers
- **answer** — copy one of your options here exactly; that's the right one

To add a question, copy a `{ ... }` block into a topic's `[ ]`. To add a topic,
copy a whole topic block, rename it, and fill it in. Reload the world or restart
the server to see changes. If a question is typed wrong, the game just skips it.
(Keep the `general_science` topic — it's the default fallback.)

---

## 10. Troubleshooting

**The coin looks like a purple-and-black checkered block.**
The resource pack isn't attached. Make sure `study_quiz_rp` is in your server and
listed in `world_resource_packs.json`, then restart.

**The menu won't open from the book.**
Use the book item, or have an operator run `/scriptevent study:open`.

**Questions feel basic or repeat.**
That's the built-in set. Turn on AI (section 8) for fresh questions.

**"Could not make an HTTP request" when using AI.**
The game can't reach your AI helper. Check, in order:
1. Is the helper running? Start it before the server.
2. On the same PC, open `http://127.0.0.1:8787/health` in a browser — you should
   see `{"ok":true,...}`.
3. Is `permissions.json` in `config\default\` and does it list
   `@minecraft/server-net`? (See install step 4.) This is the usual cause.

**Testing on the same PC and can't connect to your own server.**
Windows blocks the Minecraft app from reaching a local server until you run this
once in PowerShell:
```powershell
CheckNetIsolation LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"
```

**"Topic mastered!"**
You've mastered every question for that topic. Switch topics, or turn on AI for
more.

---

## 11. For tinkerers

Most things you'd want to change live in `study_quiz_bp/scripts/constants.js`:

- **Store items & prices** — `STORE_ITEMS`, `STORE_CATEGORIES`
- **Defaults** (interval, timer, penalty) — `DEFAULT_CONFIG`
- **Mastery requirement** — `MASTERY_STREAK_REQUIRED` (default 3)
- **Turn the penalty on/off** — `ENABLE_WRONG_ANSWER_PENALTY`
- **Teacher tag** — `ADMIN_TAG` (default `sq_admin`)
- **Difficulty tiers** — `DIFFICULTY_TIERS`

Other files: curriculum packs in `questions/curriculum.js`, offline questions in
`questions/bundledTopics.js`, the AI connection in `userConfig.js`.

Coins are also mirrored to a scoreboard objective called `study_coins`, so you
can show a live total on a sidebar if you want.

---

Made with 💖 — have fun!
