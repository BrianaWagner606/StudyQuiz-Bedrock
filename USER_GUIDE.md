# Study Quiz — User Guide

A cute, pink study-quiz add-on for **Minecraft Bedrock Dedicated Server (BDS)**.
Players answer quiz questions while they play, earn an adorable **pink Study Coin**,
spend coins in an in-game **Store**, and risk dropping their coins if they answer wrong.

Questions work **offline out of the box** using built-in topics, and can optionally be
powered by a **live AI** (via a small local helper program) so questions never repeat
and can cover any subject you want.

---

## 1. What it does

- 🎀 **Pop quizzes while you play** — a question appears on a timer (default every 5 minutes).
- ⏳ **3-second countdown** (3… 2… 1…) before each new question.
- 💖 **Pink Study Coins** — a correct answer drops a cute pink coin into your inventory.
- 🛍️ **Store** — spend coins on food, materials, and premium items, sorted into categories.
- ⚠️ **Wrong-answer penalty** — get it wrong and you drop items (configurable: held item, hotbar, or full inventory — coins included).
- 🏆 **Mastery & stats** — answer the same question right 3 times to "master" it; track progress per topic.
- 🤖 **Optional live AI** — connect an AI model for endless, on-topic questions. Falls back to built-in questions automatically if AI is off.

Every player has their **own** settings, coins, and progress.

---

## 2. Requirements

- A **Bedrock Dedicated Server (BDS)**, version **1.21.80 or newer** (tested on 1.26.x).
- The two packs included here:
  - `study_quiz_bp` — behavior pack (the game logic).
  - `study_quiz_rp` — resource pack (the pink coin texture).
- **(Optional, for live AI only)** Node.js installed, plus an API key from an AI provider (e.g. Anthropic).

> The add-on works fully **without** AI using its built-in question set. AI is a bonus.

---

## 3. Install on your server

1. **Stop** your Bedrock server.
2. Copy the two pack folders into your server install:
   - `study_quiz_bp` → `behavior_packs\study_quiz_bp`
   - `study_quiz_rp` → `development_resource_packs\study_quiz_rp` (or `resource_packs\study_quiz_rp`)
3. Tell your world to use both packs. In your world folder
   (`worlds\<your-level-name>\`), make sure these files exist:

   **`world_behavior_packs.json`**
   ```json
   [
     { "pack_id": "7f01af09-a5e4-45cf-9f36-696f96a50c0b", "version": [1, 0, 0] }
   ]
   ```

   **`world_resource_packs.json`**
   ```json
   [
     { "pack_id": "b2d6f3a1-9c44-4e7a-8f12-3a7e5c901d44", "version": [1, 0, 0] }
   ]
   ```

4. Allow the network module so live AI can work. Edit `config\default\permissions.json`
   (create it if missing) and include:
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
5. **Start** your server. In the console you should see:
   ```
   Pack Stack - [00] Study Quiz (BDS Live API) ...
   [StudyQuiz] Loaded.
   ```

> **Tip:** After any update to the packs, fully **restart** the server so it reloads them.

---

## 4. How to play (in-game)

### Open the menu
You get a **Study Settings book** in your inventory automatically. **Use (hold/right-click) the book** to open the main menu.

> If you don't have the book, a server operator can run `/scriptevent study:open` to open the menu, or `/give @s book` and rename interactions will re-grant it on next join.

### Main menu
- **Take a quiz now** — start a question immediately.
- **Store** — browse categories and spend coins.
- **My Stats** — see your coin balance and mastered topics.
- **Settings** — adjust your personal options.

### Answering questions
- A short **3-2-1 countdown** plays, then the question appears with answer buttons.
- Answer order is shuffled each time.
- **Correct:** +1 pink Study Coin, and your streak on that question goes up.
- **Master a question:** answer it correctly 3 times in a row.
- **Wrong / time runs out:** your streak resets and the **penalty** drops items.
- **Close without answering:** counts as skipped, no penalty.

### The pink coin 💖
Coins are **real items** in your inventory (named *Study Coin*). That means:
- You can see how many you have at a glance.
- The Store spends them.
- A wrong answer with the **Full inventory** penalty can make you **drop your coins** too — so answer carefully!

---

## 5. Settings (per player)

Open the book → **Settings**:

| Setting | What it does | Default |
| --- | --- | --- |
| Quiz interval (minutes) | How often a quiz pops up | 5 |
| Answer time limit (seconds) | Time allowed per question | 25 |
| Topic | The subject of your questions | general_science |
| Options per question | Number of answer buttons | 4 |
| **Penalty mode** | What you drop on a wrong answer: **Held item only**, **Hotbar**, or **Full inventory** | Full inventory |
| AI Provider | Which AI service to use (if AI is connected) | Anthropic |

> **Note:** Players who used an older version may still have an old saved penalty
> setting. To make wrong answers drop everything, open **Settings** and set
> **Penalty mode → Full inventory**.

---

## 6. The Store

Open the book → **Store**, pick a category, then pick an item to buy.

| Category | Examples |
| --- | --- |
| **Food** | Bread, Steak, Golden Apple, Enchanted Golden Apple |
| **Materials** | Torch, Arrows, XP Bottle, Iron/Gold Ingot, Ender Pearl |
| **Premium** | Diamond, Emerald, Netherite Scrap, Diamond Block |

Prices range from 1 coin (cheap snacks) up to 50 coins (top-tier rewards).
If your inventory is full, purchased items drop at your feet.

---

## 7. (Optional) Turn on live AI questions

By default the add-on uses **built-in questions**. To get endless AI-generated
questions, run the small included **proxy** program. It keeps your secret API key
**outside** the game, so the key never lives in any pack file.

### One-time setup
1. Install **Node.js** (https://nodejs.org) if you don't have it.
2. Get an API key from your AI provider (e.g. the Anthropic console).
3. In the `proxy` folder, copy `anthropic-key.example.txt` to **`anthropic-key.txt`**
   and paste your real key into it (one line, nothing else).

### Each time you play
1. **Start the proxy first:** double-click `proxy\start-proxy.bat`
   (or run `node server.js` inside the `proxy` folder). Leave its window open.
2. Then start your Minecraft server.
3. Join and take a quiz — questions now come from the AI.

### ⚠️ "Windows protected your PC" / antivirus says the .bat is unsafe
This is a **false alarm**, not a virus. Windows flags **any** script file
downloaded from the internet (this is called the "Mark of the Web"). The
launcher is a tiny plain-text file — you can open `start-proxy.bat` in Notepad
and read every line; it only runs `node server.js`.

To allow it to run, do **one** of these:

- **Unblock it (recommended, one time):** right-click `start-proxy.bat` →
  **Properties** → at the bottom check **Unblock** → **OK**. The warning is gone
  for good. (Do the same for `server.js` if prompted.)
- **Or click through the prompt:** on the blue "Windows protected your PC" box,
  click **More info** → **Run anyway**.
- **Or unblock everything at once:** open PowerShell in the project folder and run
  `Get-ChildItem -Recurse | Unblock-File`.

If your antivirus quarantines it, add the project folder to its allow/exclusion
list. The launcher needs **Node.js installed** — if it isn't, the window will
tell you and link to https://nodejs.org.

### How it connects
The game is pre-configured to talk to the proxy at `http://127.0.0.1:8787`.
The proxy adds your key, calls the AI provider, caches repeats, and returns the
question. To change the AI model or provider, edit `proxy\server.js`
(look for `DEFAULT_MODEL`). You don't need to edit any pack files.

> 🔒 **Security:** Never paste your real API key into chat, screenshots, or any pack
> file. It belongs only in `proxy\anthropic-key.txt`, which is excluded from sharing.
> If your key was ever shown publicly, **regenerate it** in your provider's console.

---

## 8. Troubleshooting

**The coin looks like a purple/black checkered cube.**
The resource pack isn't attached. Confirm `study_quiz_rp` is in your server's
resource pack folder and listed in `world_resource_packs.json` (see step 3),
then fully restart the server.

**The menu won't open from the book.**
On some BDS builds the in-chat `!study` command is disabled (you'll see a console
note about it). Use the **book item**, or have an operator run
`/scriptevent study:open`.

**Wrong answers don't drop everything.**
Open **Settings → Penalty mode** and choose **Full inventory**. (Older saved
settings may still say "Held item only".)

**Questions repeat or seem basic.**
That means it's using the built-in question set. Start the proxy (section 7) for
live AI questions.

**Live AI isn't working.**
- Make sure the proxy window is open **before** the Minecraft server starts.
- Make sure `proxy\anthropic-key.txt` contains a real key (not the example text).
- Make sure `permissions.json` allows `@minecraft/server-net` and `@minecraft/server-admin`.
- Check the proxy window and the server console for error messages.

**Players get "Topic mastered!".**
They've mastered every available question for that topic. Switch topics in
**Settings**, or connect live AI for fresh questions.

---

## 9. For advanced users / customizing

- **Store items & prices:** `study_quiz_bp/scripts/constants.js` → `STORE_ITEMS` and `STORE_CATEGORIES`.
- **Defaults (interval, timer, penalty):** `study_quiz_bp/scripts/constants.js` → `DEFAULT_CONFIG`.
- **Mastery requirement:** `MASTERY_STREAK_REQUIRED` (default 3).
- **Penalty always applies (even Creative/keepInventory):** `DROP_PENALTY_IGNORES_GAMEMODE_AND_KEEPINVENTORY`.
- **AI endpoint the game calls:** `study_quiz_bp/scripts/userConfig.js` (points at the proxy).
- **AI model/provider:** `proxy/server.js` → `DEFAULT_MODEL`.
- **Built-in questions:** `study_quiz_bp/scripts/questions/`.

Coins are also mirrored to a scoreboard objective named `study_coins` so you can
show a live balance on a sidebar if you like.

---

Made with 💖 — have fun studying!
