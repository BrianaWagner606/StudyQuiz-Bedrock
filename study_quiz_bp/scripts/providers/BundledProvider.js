import { QuestionProvider } from "./QuestionProvider.js";
import { BUNDLED_TOPICS } from "../questions/bundledTopics.js";
import { asDistinctTrimmedStrings, toStableQuestionId } from "../utils.js";

function validateQuestion(raw, optionCount) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const questionText = `${raw.question ?? ""}`.trim();
  if (questionText.length === 0) {
    return null;
  }

  const options = asDistinctTrimmedStrings(raw.options);
  if (!options || options.length !== optionCount) {
    return null;
  }

  const answerIndex = Number(raw.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    return null;
  }

  const normalized = {
    id: toStableQuestionId(raw),
    question: questionText,
    options,
    answerIndex
  };

  return normalized;
}

export class BundledProvider extends QuestionProvider {
  async getQuestions(topic, optionCount, excludeIds = new Set()) {
    const topicQuestions = BUNDLED_TOPICS[topic] ?? [];
    const validated = [];

    for (const candidate of topicQuestions) {
      const normalized = validateQuestion(candidate, optionCount);
      if (!normalized) {
        console.warn(`[StudyQuiz] Skipping malformed bundled question for topic '${topic}'.`);
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
