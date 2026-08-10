import content from "./word-vertigo-content.json";

interface WordEntry {
  word: string;
  pronunciation: string;
}

interface WordVertigoContent {
  template: string;
  words: Record<string, WordEntry> & { fallback: WordEntry };
}

const authoredContent = content as WordVertigoContent;

export const WORD_VERTIGO_SPEEDS = [0.4, 0.6, 0.75, 1.9] as const;
export const WORD_VERTIGO_SECONDS = 90;
export const WORD_VERTIGO_BASE_CHARACTER_MS = 50;

export const wordVertigoBlurb = (firstCharacter: string) => {
  const key = firstCharacter.slice(0, 1).toLowerCase();
  const entry = /^[a-z]$/.test(key) ? authoredContent.words[key] : authoredContent.words.fallback;
  return authoredContent.template
    .replaceAll("{WORD}", entry.word)
    .replaceAll("{PRONUNCIATION}", entry.pronunciation);
};

export const formatWordVertigoCountdown = (seconds: number) => {
  const bounded = Math.max(0, Math.min(WORD_VERTIGO_SECONDS, seconds));
  const minutes = Math.floor(bounded / 60);
  const remainder = bounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};
