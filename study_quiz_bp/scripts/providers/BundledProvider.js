import { QuestionProvider } from "./QuestionProvider.js";
import { BUNDLED_TOPICS } from "../questions/bundledTopics.js";
import { asDistinctTrimmedStrings, toStableQuestionId } from "../utils.js";

// Work out which option is correct. The friendly, hand-edit form is "answer"
// holding the exact text of the correct option (no index counting). We also
// still accept a 0-based "answerIndex" number so older questions keep working.
function resolveAnswerIndex(raw, options) {
  const answerText = `${raw.answer ?? raw.correctAnswer ?? ""}`.trim();
  if (answerText.length > 0) {
    const byText = options.findIndex((opt) => opt.toLowerCase() === answerText.toLowerCase());
    if (byText !== -1) {
      return byText;
    }
  }

  const numeric = Number(raw.answerIndex);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < options.length) {
    return numeric;
  }

  return -1;
}

function validateQuestion(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const questionText = `${raw.question ?? ""}`.trim();
  if (questionText.length === 0) {
    return null;
  }

  // Accept any sensible number of distinct options (a quiz needs at least 2,
  // and the in-game menu stays readable up to 6). We do NOT force a question to
  // match the player's "options per question" setting, so hand-written
  // questions always show up instead of being silently dropped.
  const options = asDistinctTrimmedStrings(raw.options);
  if (!options || options.length < 2 || options.length > 6) {
    return null;
  }

  const answerIndex = resolveAnswerIndex(raw, options);
  if (answerIndex < 0) {
    return null;
  }

  return {
    id: toStableQuestionId(raw),
    question: questionText,
    options,
    answerIndex
  };
}

export class BundledProvider extends QuestionProvider {
  // optionCount is accepted for a consistent provider interface but bundled
  // questions keep however many options the author wrote (see validateQuestion).
  async getQuestions(topic, optionCount, excludeIds = new Set()) {
    const topicQuestions = BUNDLED_TOPICS[topic] ?? [];
    const validated = [];

    for (const candidate of topicQuestions) {
      const normalized = validateQuestion(candidate);
      if (!normalized) {
        const preview = `${candidate?.question ?? ""}`.trim().slice(0, 60) || "(no question text)";
        console.warn(`[StudyQuiz] Skipping malformed question in topic '${topic}': "${preview}". Check its options/answer.`);
        continue;
      }
      if (excludeIds.has(normalized.id)) {
        continue;
      }
      validated.push(normalized);
    }

    return {
      source: "bundled",
      questions: validated
    };
  }
}
