/* ============================================================================
 *  ✿  STUDY QUIZ — YOUR OFFLINE QUESTIONS  ✿   (edit this one file!)
 * ============================================================================
 *
 *  This is the ONLY file you edit to add or change the built-in (offline)
 *  quiz questions. No AI key needed — these work completely offline.
 *
 *  It is a ".js" file (Minecraft can't read ".json" while the game runs), but
 *  you edit it EXACTLY like JSON. Just follow the examples below.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  HOW TO ADD A QUESTION
 *  ─────────────────────────────────────────────────────────────────────────
 *  Copy one question block and paste it inside a topic's [ square brackets ].
 *  A question looks like this:
 *
 *      {
 *        "question": "Which planet is closest to the Sun?",
 *        "options":  ["Mercury", "Venus", "Earth", "Mars"],
 *        "answer":   "Mercury"
 *      },
 *
 *  THE RULES (stick to these and you can't go wrong):
 *    • "question" — the text players see. Keep it inside "double quotes".
 *    • "options"  — between 2 and 6 answers, each in "quotes", separated by
 *                   commas, all inside the [ square brackets ].
 *    • "answer"   — copy ONE of your options here, EXACTLY. That marks the
 *                   correct one. (Capitalization & spaces don't have to match —
 *                   we're forgiving.)
 *    • Put a comma after each question's closing }  — except the very last one
 *      in a list can skip it (a trailing comma is fine too).
 *    • You do NOT write an "id" — it's created for you automatically.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  HOW TO ADD A WHOLE NEW TOPIC
 *  ─────────────────────────────────────────────────────────────────────────
 *  Copy a topic block (e.g. the "general_science: [ ... ]," part), paste it,
 *  rename it, and fill in your questions. The topic name is what players type
 *  in the in-game "Topic" box, so keep it short & lowercase and use _ instead
 *  of spaces  (e.g. world_history, fun_facts, my_class).
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  GOOD TO KNOW
 *  ─────────────────────────────────────────────────────────────────────────
 *    • After editing, reload the world (or restart the server) to see changes.
 *    • If a question is written wrong, the game just SKIPS it — it won't crash.
 *      (Check the server log for a "Skipping malformed question" note.)
 *    • Keep the topic named "general_science" — the game uses it as the
 *      default fallback. You can freely change ITS questions, just not delete
 *      the topic.
 * ============================================================================ */

export const BUNDLED_TOPICS = {

  // ── Default topic (used as the fallback). Keep this one; edit freely. ──
  general_science: [
    {
      "question": "Which planet is closest to the Sun?",
      "options":  ["Mercury", "Venus", "Earth", "Mars"],
      "answer":   "Mercury"
    },
    {
      "question": "What is the chemical formula for water?",
      "options":  ["CO2", "H2O", "NaCl", "O2"],
      "answer":   "H2O"
    },
    {
      "question": "How many chambers are in the human heart?",
      "options":  ["2", "3", "4", "5"],
      "answer":   "4"
    },
    {
      "question": "Which state of matter has a fixed volume but no fixed shape?",
      "options":  ["Solid", "Liquid", "Gas", "Plasma"],
      "answer":   "Liquid"
    }
  ],

  // ── A second example topic, to show how to add your own. ──
  fun_facts: [
    {
      "question": "How many legs does a spider have?",
      "options":  ["6", "8", "10"],
      "answer":   "8"
    },
    {
      "question": "What is the largest planet in our solar system?",
      "options":  ["Earth", "Saturn", "Jupiter", "Neptune"],
      "answer":   "Jupiter"
    }
  ]

  // ── Add more topics below. Copy the pattern above. For example: ──
  //
  // ,
  // my_class: [
  //   {
  //     "question": "Type your question here?",
  //     "options":  ["Option A", "Option B", "Option C", "Option D"],
  //     "answer":   "Option A"
  //   }
  // ]

};

export function getBundledTopicNames() {
  return Object.keys(BUNDLED_TOPICS);
}
