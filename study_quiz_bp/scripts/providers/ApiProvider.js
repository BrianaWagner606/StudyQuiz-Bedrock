import {
  HttpHeader,
  HttpRequest,
  HttpRequestMethod,
  http
} from "@minecraft/server-net";
import { QuestionProvider } from "./QuestionProvider.js";
import { asDistinctTrimmedStrings, toStableQuestionId } from "../utils.js";
import { API_PROVIDERS, PLAYER_API_ENDPOINT, PLAYER_API_MODEL } from "../constants.js";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

function inferProviderFromKey(apiKey) {
  const key = `${apiKey ?? ""}`.trim().toLowerCase();
  if (key.startsWith("sk-ant-")) {
    return "anthropic";
  }
  if (key.startsWith("sk-or-v1-")) {
    return "openrouter";
  }
  if (key.startsWith("sk-")) {
    return "openai";
  }
  return "";
}

function parseAnswerIndex(rawAnswer, options) {
  if (Number.isInteger(rawAnswer) && rawAnswer >= 0 && rawAnswer < options.length) {
    return rawAnswer;
  }

  const asNumber = Number(rawAnswer);
  if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber < options.length) {
    return asNumber;
  }

  const asString = `${rawAnswer ?? ""}`.trim();
  if (!asString) {
    return -1;
  }

  const upper = asString.toUpperCase();
  const letterCode = upper.charCodeAt(0) - 65;
  if (upper.length === 1 && letterCode >= 0 && letterCode < options.length) {
    return letterCode;
  }

  const byText = options.findIndex((opt) => opt.toLowerCase() === asString.toLowerCase());
  return byText;
}

function validateQuestion(raw, optionCount) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const questionText = `${raw.question ?? ""}`.trim();
  if (questionText.length === 0) {
    return null;
  }

  const optionCandidates =
    raw.options ??
    raw.choices ??
    raw.answers ??
    raw.answerChoices ??
    raw.possibleAnswers;
  const options = asDistinctTrimmedStrings(optionCandidates);
  if (!options || options.length < optionCount) {
    return null;
  }

  const optionsLimited = options.slice(0, optionCount);
  const answerRaw = raw.answerIndex ?? raw.correctIndex ?? raw.correctOptionIndex ?? raw.correctAnswer;
  const answerIndex = parseAnswerIndex(answerRaw, optionsLimited);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= optionsLimited.length) {
    return null;
  }

  return {
    id: toStableQuestionId(raw),
    question: questionText,
    options: optionsLimited,
    answerIndex
  };
}

function parseApiError(rawText) {
  const text = `${rawText ?? ""}`.trim();
  if (!text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text);
    const message = `${parsed?.error?.message ?? parsed?.message ?? ""}`.trim();
    return message;
  } catch {
    return text.slice(0, 180);
  }
}

function parseQuestionsFromApiText(rawText) {
  const asString = `${rawText ?? ""}`.trim();
  if (!asString.length) {
    return null;
  }

  try {
    const maybeJson = JSON.parse(asString);
    if (Array.isArray(maybeJson)) {
      return maybeJson;
    }

    if (maybeJson && Array.isArray(maybeJson.questions)) {
      return maybeJson.questions;
    }

    if (maybeJson && Array.isArray(maybeJson.output)) {
      return maybeJson.output;
    }

    const anthropicText = maybeJson?.content?.find?.((part) => part?.type === "text")?.text;
    if (typeof anthropicText === "string") {
      return parseQuestionsFromApiText(anthropicText);
    }

    const firstChoiceContent = maybeJson?.choices?.[0]?.message?.content;
    if (typeof firstChoiceContent === "string") {
      return parseQuestionsFromApiText(firstChoiceContent);
    }
  } catch {
    const firstBracket = asString.indexOf("[");
    const lastBracket = asString.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const slice = asString.slice(firstBracket, lastBracket + 1);
      try {
        const recovered = JSON.parse(slice);
        if (Array.isArray(recovered)) {
          return recovered;
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

export class ApiProvider extends QuestionProvider {
  constructor(fallbackProvider) {
    super();
    this.fallbackProvider = fallbackProvider;
    this.liveConfigStatus = "unknown";
    this.lastConfigWarning = 0;
    this.enabledTopics = [];
  }

  isLiveConfigured() {
    return this.liveConfigStatus === "configured";
  }

  getEnabledTopics() {
    return this.enabledTopics;
  }

  readLiveConfig() {
    this.liveConfigStatus = "missing";
    this.enabledTopics = [];
    return null;
  }

  resolveConfig(overrideConfig) {
    const apiKey = `${overrideConfig?.apiKey ?? ""}`.trim();
    const configuredProvider = `${overrideConfig?.apiProvider ?? "anthropic"}`.trim().toLowerCase();
    const inferredProvider = inferProviderFromKey(apiKey);
    const provider = inferredProvider || configuredProvider;
    const providerMeta = API_PROVIDERS.find((p) => p.value === provider) ?? API_PROVIDERS[0];

    if (apiKey) {
      this.liveConfigStatus = "configured";
      return {
        provider: providerMeta.value,
        apiKey,
        endpoint: `${overrideConfig?.apiEndpoint ?? ""}`.trim() || providerMeta.defaultEndpoint || PLAYER_API_ENDPOINT,
        model: `${overrideConfig?.apiModel ?? ""}`.trim() || providerMeta.defaultModel || PLAYER_API_MODEL,
        enabledTopics: []
      };
    }

    this.liveConfigStatus = "missing";
    this.enabledTopics = [];
    const now = Date.now();
    if (now - this.lastConfigWarning > 30000) {
      this.lastConfigWarning = now;
      console.warn("[StudyQuiz] Live generation disabled: player API endpoint/model/key not configured.");
    }
    return null;
  }

  shouldUseAnthropic(config) {
    if (`${config?.provider ?? ""}`.toLowerCase() === "anthropic") {
      return true;
    }
    const endpoint = `${config?.endpoint ?? ""}`.toLowerCase();
    const key = `${config?.apiKey ?? ""}`.toLowerCase();
    return endpoint.includes("anthropic.com") || key.startsWith("sk-ant-");
  }

  buildPrompt(topic, optionCount, avoidTexts, variety) {
    const lines = [
      "Return ONLY a JSON array with no markdown and no extra text.",
      "Each array item must match exactly:",
      '{ "question": "...", "options": ["...","...","...","..."], "answerIndex": 0 }',
      `Topic: ${topic}`,
      `Generate 10 questions. Use exactly ${optionCount} distinct options for each question.`,
      "answerIndex must be the integer index of the correct option.",
      "Every question must be NEW and clearly different in wording AND subject matter from any listed below.",
      "Explore less-common sub-topics, deeper details, and applied/scenario angles rather than repeating the most obvious facts."
    ];

    if (variety) {
      lines.push(`Focus this batch on: ${variety}.`);
    }

    const avoid = Array.isArray(avoidTexts) ? avoidTexts.filter((t) => `${t ?? ""}`.trim()) : [];
    if (avoid.length > 0) {
      // Cap the avoid list so the request body stays small for the in-game HTTP client.
      const sample = avoid.slice(-40);
      lines.push("Do NOT produce any question equivalent to these already-seen questions:");
      for (const text of sample) {
        lines.push(`- ${text}`);
      }
    }

    return lines.join("\n");
  }

  buildAnthropicRequest(config, topic, optionCount, avoidTexts, variety) {
    const prompt = this.buildPrompt(topic, optionCount, avoidTexts, variety);

    const payload = {
      model: config.model,
      max_tokens: 1800,
      temperature: 0.9,
      system: "You generate concise, varied quiz items and never repeat questions.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const endpoint = config.endpoint || ANTHROPIC_ENDPOINT;
    const request = new HttpRequest(endpoint);
    request.method = HttpRequestMethod.Post;
    request.headers = [
      new HttpHeader("Content-Type", "application/json"),
      new HttpHeader("x-api-key", `${config.apiKey ?? ""}`),
      new HttpHeader("anthropic-version", "2023-06-01")
    ];
    request.body = JSON.stringify(payload);
    return request;
  }

  buildOpenAiRequest(config, topic, optionCount, avoidTexts, variety) {
    const prompt = this.buildPrompt(topic, optionCount, avoidTexts, variety);

    const payload = {
      model: config.model,
      messages: [
        {
          role: "system",
          content: "You generate concise, varied quiz items and never repeat questions."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.9
    };

    const request = new HttpRequest(config.endpoint);
    request.method = HttpRequestMethod.Post;
    request.headers = [
      new HttpHeader("Content-Type", "application/json"),
      new HttpHeader("Authorization", `Bearer ${config.apiKey}`)
    ];
    request.body = JSON.stringify(payload);
    return request;
  }

  async callApi(config, topic, optionCount, avoidTexts, variety) {
    const request = this.shouldUseAnthropic(config)
      ? this.buildAnthropicRequest(config, topic, optionCount, avoidTexts, variety)
      : this.buildOpenAiRequest(config, topic, optionCount, avoidTexts, variety);

    const response = await http.request(request);
    const bodyText = response?.body ?? "";
    const json = parseQuestionsFromApiText(bodyText);

    return {
      status: response?.status ?? -1,
      questionsRaw: json,
      errorMessage: parseApiError(bodyText)
    };
  }

  async getQuestions(topic, optionCount, excludeIds = new Set(), overrideConfig = null, avoidTexts = []) {
    const config = this.resolveConfig(overrideConfig);
    if (!config) {
      const fallback = await this.fallbackProvider.getQuestions(topic, optionCount, excludeIds);
      return {
        ...fallback,
        liveConfigured: false,
        reason: "missing_config"
      };
    }

    // Rotating angles so repeated batches for an exhausted topic keep diverging
    // instead of asking for "8 questions" the same way every time.
    const VARIETY_ANGLES = [
      "core fundamentals",
      "real-world applications and examples",
      "common misconceptions and tricky edge cases",
      "history, discoveries, and key figures",
      "advanced or less-common details",
      "comparisons and relationships between concepts"
    ];
    const angleBase = Array.isArray(avoidTexts) ? avoidTexts.length : 0;

    let finalError = "invalid_json";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const variety = VARIETY_ANGLES[(angleBase + attempt) % VARIETY_ANGLES.length];
        const result = await this.callApi(config, topic, optionCount, avoidTexts, variety);
        if (result.status < 200 || result.status >= 300) {
          finalError = `http_${result.status}${result.errorMessage ? `:${result.errorMessage}` : ""}`;
          continue;
        }

        if (!Array.isArray(result.questionsRaw) || result.questionsRaw.length === 0) {
          finalError = `empty_or_invalid_json${result.errorMessage ? `:${result.errorMessage}` : ""}`;
          continue;
        }

        const normalized = [];
        for (const item of result.questionsRaw) {
          const question = validateQuestion(item, optionCount);
          if (!question) {
            console.warn("[StudyQuiz] Skipping malformed API question payload item.");
            continue;
          }
          if (excludeIds.has(question.id)) {
            continue;
          }
          normalized.push(question);
        }

        if (normalized.length > 0) {
          return {
            source: "api",
            questions: normalized,
            liveConfigured: true
          };
        }

        finalError = "no_valid_questions_after_normalization";
      } catch (error) {
        finalError = `${error}`;
      }
    }

    console.warn(`[StudyQuiz] API provider failed ('${finalError}'), using bundled fallback for topic '${topic}'.`);
    const fallback = await this.fallbackProvider.getQuestions(topic, optionCount, excludeIds);
    return {
      ...fallback,
      liveConfigured: true,
      reason: finalError
    };
  }
}
