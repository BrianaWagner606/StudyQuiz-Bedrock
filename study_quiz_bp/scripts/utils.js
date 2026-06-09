export function hashQuestionId(input) {
  let hash = 5381;
  const text = `${input ?? ""}`;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return `q_${(hash >>> 0).toString(16)}`;
}

export function toStableQuestionId(question) {
  if (question && typeof question.id === "string" && question.id.trim().length > 0) {
    return question.id.trim();
  }
  return hashQuestionId((question?.question ?? "").trim().toLowerCase());
}

export function safeJsonParse(input, fallbackValue) {
  try {
    return JSON.parse(input);
  } catch {
    return fallbackValue;
  }
}

export function clampInt(value, min, max, defaultValue) {
  if (!Number.isFinite(value)) {
    return defaultValue;
  }
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}

export function nowMs() {
  return Date.now();
}

export function asDistinctTrimmedStrings(values) {
  if (!Array.isArray(values)) {
    return null;
  }
  const cleaned = values
    .map((v) => `${v ?? ""}`.trim())
    .filter((v) => v.length > 0);

  const unique = [...new Set(cleaned)];
  if (unique.length !== cleaned.length) {
    return null;
  }
  return unique;
}

// Bedrock action-form buttons clip long single-line labels (the end of the text
// gets cut off). Buttons DO honor "\n", so we wrap the label onto multiple lines
// at word boundaries, hard-breaking any single word longer than the line width.
export function wrapButtonLabel(text, maxLineLen = 20) {
  const words = `${text ?? ""}`.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "";
  }
  const lines = [];
  let current = "";
  for (let word of words) {
    // A single word longer than a line is broken across lines so nothing clips.
    while (word.length > maxLineLen) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, maxLineLen));
      word = word.slice(maxLineLen);
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxLineLen) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.join("\n");
}

export function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
