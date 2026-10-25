import nlp from "compromise";

export type PriorityLevel = "low" | "medium" | "high";

export type RepeatSchedule = "none" | "daily" | "weekdays" | "weekends" | "custom";

export type ItemType = "habit" | "task";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: PriorityLevel;
  tag: string;
  itemType?: ItemType | undefined; // "habit" for recurring schedules, "task" for one-off todos
  estimatedTime?: string | undefined;
  alarmTime?: string | undefined; // "6:00 AM", "6:00 PM", "8:00 PM"
  alarmTimestamp?: number | undefined; // next epoch timestamp
  alarmEnabled?: boolean | undefined;
  alarmFired?: boolean | undefined;
  repeat?: RepeatSchedule | undefined;
  days?: number[] | undefined; // [1, 2, 3, 4, 5] = Mon-Fri. 0=Sun, 6=Sat
  createdAt: number;
  completedAt?: number | undefined;
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Calculates the next epoch timestamp for a given time of day (HH:mm) on allowed days of week.
 */
export function getNextAlarmTimestamp(
  hour: number,
  minute: number,
  allowedDays: number[] = [0, 1, 2, 3, 4, 5, 6]
): number {
  const now = new Date();
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute, 0, 0);
    const dayOfWeek = candidate.getDay();

    if (allowedDays.includes(dayOfWeek)) {
      if (candidate.getTime() > now.getTime()) {
        return candidate.getTime();
      }
    }
  }

  const fallback = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute, 0, 0);
  return fallback.getTime();
}

/**
 * Fast Levenshtein distance for fuzzy matching typos with zero dependencies & 0 MB added weight.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Common English stopwords, pronouns, prepositions, and verbs that MUST NOT be altered by fuzzy matching.
 */
const STOP_AND_COMMON_WORDS = new Set([
  "the", "a", "an", "to", "in", "on", "at", "by", "for", "with", "from", "of", "and", "or", "but",
  "not", "is", "it", "my", "your", "i", "you", "he", "she", "we", "they", "want", "need", "have",
  "had", "has", "go", "goes", "went", "gone", "going", "do", "does", "did", "done", "doing", "get",
  "got", "make", "made", "take", "took", "taken", "taking", "call", "called", "see", "saw", "come", "came",
  "can", "could", "will", "would", "should", "shall", "may", "might", "must", "am", "are", "was",
  "were", "been", "being", "so", "as", "if", "then", "than", "this", "that", "these", "those", "each",
  "every", "all", "both", "some", "any", "no", "more", "most", "other", "into", "through", "during",
  "before", "after", "above", "below", "up", "down", "out", "off", "over", "under", "again", "further",
  "once", "here", "there", "when", "where", "why", "how", "day", "days", "daily", "week", "weeks",
  "weekly", "month", "months", "monthly", "year", "years", "time", "times", "mon", "tue", "wed",
  "thu", "fri", "sat", "sun", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  "sunday", "today", "tomorrow", "tonight", "yesterday", "except", "excluding", "including", "only",
  "also", "just", "now", "later", "eat", "ate", "eaten", "eating", "drink", "drank", "buy", "bought",
  "meet", "met", "run", "ran", "read", "reading", "books", "book", "dinner", "breakfast", "lunch",
  "attend", "attending", "team", "sync", "mom", "dad", "boss", "client", "friend", "family", "work",
  "office", "desk", "project", "task", "tasks", "card", "mail", "bill", "bills", "car", "trip", "ride",
]);

/**
 * Comprehensive offline dictionary of common English task and routine words.
 */
const OFFLINE_TASK_VOCABULARY = [
  // Meals & Nutrition
  "breakfast", "lunch", "dinner", "snack", "coffee", "tea", "water", "hydration", "brunch", "meal",
  // Fitness & Health
  "gym", "yoga", "workout", "exercise", "running", "jogging", "walk", "walking", "meditation",
  "stretch", "cycling", "swimming", "cardio", "weights",
  // Medical & Care
  "medicine", "pills", "vitamins", "doctor", "dentist", "therapy", "prescription",
  // Work & Productivity
  "meeting", "interview", "presentation", "report", "email", "code", "coding", "review",
  "project", "client", "deadline", "task", "roadmap", "call", "standup", "attend",
  // Learning & Study
  "study", "reading", "homework", "exam", "class", "course", "assignment", "book", "books", "lecture",
  // Chores & Home
  "clean", "cleaning", "laundry", "dishes", "groceries", "shopping", "cooking", "trash",
  "plants", "organize", "tidy", "car", "bills", "shower", "sleep", "bedroom", "kitchen",
  // Calendar & Frequency
  "daily", "weekly", "weekdays", "weekends", "morning", "afternoon", "evening", "night",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "tomorrow", "today",
  "except", "always", "routine",
];

/**
 * Explicit mapping for common phonetic typos, slang, and misspellings.
 */
const COMMON_TYPO_MAP: Record<string, string> = {
  // Common verbs and modal typos
  atten: "attend",
  atend: "attend",
  atending: "attending",
  atnd: "attend",
  attnd: "attend",
  muste: "must",
  reed: "read",
  reeding: "reading",
  bookk: "book",
  bookks: "books",

  // Meals & Snacks
  snacls: "snack",
  snackes: "snack",
  snac: "snack",
  snaks: "snack",
  snakk: "snack",
  brekfest: "breakfast",
  brakefast: "breakfast",
  breakfest: "breakfast",
  brakfast: "breakfast",
  brekfast: "breakfast",
  brkfast: "breakfast",
  bkfast: "breakfast",
  lunsh: "lunch",
  luanch: "lunch",
  lunc: "lunch",
  dinr: "dinner",
  diner: "dinner",
  dinnr: "dinner",
  dinar: "dinner",
  cofee: "coffee",
  watr: "water",
  wtr: "water",

  // Fitness
  ygoa: "yoga",
  yogo: "yoga",
  yogaa: "yoga",
  gymm: "gym",
  gyme: "gym",
  gim: "gym",
  jym: "gym",
  wrkout: "workout",
  exercses: "exercise",
  exersice: "exercise",
  exercis: "exercise",
  excercise: "exercise",
  exersises: "exercise",
  exrcise: "exercise",
  runing: "running",
  joging: "jogging",
  meditaion: "meditation",
  meditat: "meditation",

  // Medical
  medicne: "medicine",
  medicin: "medicine",
  medisin: "medicine",
  pil: "pills",
  pils: "pills",
  vitamens: "vitamins",
  apointment: "appointment",
  appontment: "appointment",

  // Work & Study
  meating: "meeting",
  meetin: "meeting",
  metting: "meeting",
  studyy: "study",
  stydy: "study",
  stdy: "study",
  reding: "reading",
  codding: "coding",
  codin: "coding",
  emial: "email",
  cal: "call",

  // Chores
  groceris: "groceries",
  grocceries: "groceries",
  groccery: "groceries",
  cleann: "clean",
  cleen: "clean",
  laundryy: "laundry",
  shwr: "shower",
  showr: "shower",
  slp: "sleep",
  sleap: "sleep",

  // Slang & Conversational
  wana: "want to",
  wanna: "want to",
  gona: "going to",
  gonna: "going to",
  gotta: "got to",
  plz: "please",
  pls: "please",
  mrng: "morning",
  mornin: "morning",
  evning: "evening",
  eveing: "evening",
  aftrnoon: "afternoon",
  tmrw: "tomorrow",
  tomorow: "tomorrow",
  satday: "saturday",
  saturdy: "saturday",
  snday: "sunday",
  sundy: "sunday",
  mondey: "monday",
  fridey: "friday",
  exsept: "except",
  excpet: "except",
  dayly: "daily",
};

/**
 * Activity catalog with canonical task title, tags, and default alarm times.
 */
const CANONICAL_ACTIVITIES: Record<string, { title: string; tag: string; defaultTime?: string }> = {
  breakfast: { title: "Breakfast", tag: "personal", defaultTime: "8:00 AM" },
  lunch: { title: "Lunch", tag: "personal", defaultTime: "1:00 PM" },
  dinner: { title: "Dinner", tag: "personal", defaultTime: "7:30 PM" },
  snack: { title: "Healthy Snack", tag: "personal", defaultTime: "4:00 PM" },
  coffee: { title: "Coffee Break", tag: "personal", defaultTime: "10:30 AM" },
  water: { title: "Hydration Check", tag: "personal", defaultTime: "9:00 AM" },
  hydration: { title: "Hydration Check", tag: "personal", defaultTime: "9:00 AM" },
  gym: { title: "GYM", tag: "fitness", defaultTime: "6:00 PM" },
  yoga: { title: "Yoga", tag: "fitness", defaultTime: "6:00 AM" },
  workout: { title: "Workout", tag: "fitness", defaultTime: "6:00 PM" },
  exercise: { title: "Exercise", tag: "fitness", defaultTime: "6:00 PM" },
  running: { title: "Running", tag: "fitness", defaultTime: "7:00 AM" },
  jogging: { title: "Jogging", tag: "fitness", defaultTime: "7:00 AM" },
  walk: { title: "Morning Walk", tag: "fitness", defaultTime: "7:00 AM" },
  walking: { title: "Morning Walk", tag: "fitness", defaultTime: "7:00 AM" },
  meditation: { title: "Meditation", tag: "personal", defaultTime: "7:00 AM" },
  medicine: { title: "Take Medicine", tag: "personal", defaultTime: "8:00 AM" },
  pills: { title: "Take Medicine", tag: "personal", defaultTime: "8:00 AM" },
  vitamins: { title: "Take Vitamins", tag: "personal", defaultTime: "8:30 AM" },
  study: { title: "Study", tag: "study", defaultTime: "4:00 PM" },
  reading: { title: "Read Books", tag: "personal", defaultTime: "6:00 PM" },
  books: { title: "Read Books", tag: "personal", defaultTime: "6:00 PM" },
  book: { title: "Read Book", tag: "personal", defaultTime: "6:00 PM" },
  coding: { title: "Coding Session", tag: "dev", defaultTime: "10:00 AM" },
  meeting: { title: "Meeting", tag: "comms", defaultTime: "10:00 AM" },
  groceries: { title: "Groceries", tag: "personal", defaultTime: "5:00 PM" },
  shopping: { title: "Shopping", tag: "personal", defaultTime: "5:00 PM" },
  clean: { title: "Clean Room", tag: "personal", defaultTime: "11:00 AM" },
  cleaning: { title: "Cleaning", tag: "personal", defaultTime: "11:00 AM" },
  laundry: { title: "Laundry", tag: "personal", defaultTime: "2:00 PM" },
  shower: { title: "Shower", tag: "personal", defaultTime: "7:30 AM" },
  sleep: { title: "Sleep Schedule", tag: "personal", defaultTime: "11:00 PM" },
};

/**
 * Normalizes spacing, separates fused compound tokens, and repairs word boundaries.
 */
function normalizeSpacingAndFusedTokens(text: string): string {
  let normalized = text
    // Keyboard slip typos for am/pm: e.g. "6pn" -> "6 pm", "7on" -> "7 pm", "8an" -> "8 am", "9ak" -> "9 am"
    .replace(/(\d+)\s*(?:pn|on)\b/gi, "$1 pm")
    .replace(/(\d+)\s*(?:an|ak)\b/gi, "$1 am")
    // Times with periods: "7.30am" -> "7:30 am", "7.30" -> "7:30"
    .replace(/(\b\d{1,2})\.(\d{2})\s*(am|pm)?\b/gi, "$1:$2 $3")
    // Separate numbers fused with am/pm: "10am" -> "10 am", "6pm" -> "6 pm", "8pm" -> "8 pm"
    .replace(/(\d+)(am|pm)\b/gi, "$1 $2")
    // Separate times with period: "morning6am" -> "morning 6 am"
    .replace(/(morning|evening|afternoon|night)(\d{1,2})/gi, "$1 $2")
    // Separate prepositions fused with numbers: "at10am" -> "at 10 am", "by6pm" -> "by 6 pm"
    .replace(/\b(at|by|in|on|before|after)(\d{1,2})/gi, "$1 $2")
    // Separate relative durations: "in15m" -> "in 15 m"
    .replace(/\b(in)(\d+)/gi, "$1 $2")
    // Separate digits fused with duration units: "15m" -> "15 m", "30min" -> "30 min"
    .replace(/\b(\d+)(m|min|mins|minutes|h|hr|hrs|hours)\b/gi, "$1 $2")
    // Fused routine tokens
    .replace(/\batebrekfest\b/gi, "ate breakfast")
    .replace(/\beatbreakfast\b/gi, "eat breakfast")
    .replace(/\bgotogym\b/gi, "go to gym")
    .replace(/\bdoyoga\b/gi, "do yoga")
    .replace(/\btakemedicine\b/gi, "take medicine")
    .replace(/\bcleenroom\b/gi, "clean room")
    .replace(/\bcleanroom\b/gi, "clean room")
    .replace(/\bdailybut\b/gi, "daily but")
    .replace(/\batmorning\b/gi, "at morning")
    .replace(/\batevening\b/gi, "at evening")
    // Pad commas with spaces for clean tokenization
    .replace(/,/g, " , ")
    // Normalize excessive whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Spell-check tokens against our offline vocabulary while protecting standard English words
  const tokens = normalized.split(" ");
  const correctedTokens = tokens.map((token) => {
    const cleanWord = token.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleanWord) return token;

    // Never alter common stopwords/verbs
    if (STOP_AND_COMMON_WORDS.has(cleanWord)) {
      return token;
    }

    // Check exact typo map
    if (COMMON_TYPO_MAP[cleanWord]) {
      return COMMON_TYPO_MAP[cleanWord];
    }

    // If word is already a known task vocabulary word, keep it
    if (OFFLINE_TASK_VOCABULARY.includes(cleanWord)) {
      return cleanWord;
    }

    // Fuzzy match against vocabulary:
    // Only 4-letter words with distance 1 to 4-letter vocab words
    if (cleanWord.length === 4) {
      for (const vocabWord of OFFLINE_TASK_VOCABULARY) {
        if (vocabWord.length === 4 && levenshtein(cleanWord, vocabWord) === 1) {
          return vocabWord;
        }
      }
    } else if (cleanWord.length >= 5) {
      // 5+ letter words with distance <= 2 and length difference <= 1
      for (const vocabWord of OFFLINE_TASK_VOCABULARY) {
        if (Math.abs(cleanWord.length - vocabWord.length) <= 1 && levenshtein(cleanWord, vocabWord) <= 2) {
          return vocabWord;
        }
      }
    }

    return token;
  });

  return correctedTokens.join(" ").replace(/\s+,\s+/g, " , ").replace(/\s+/g, " ").trim();
}

/**
 * Intelligent compound sentence and multi-task clause splitter.
 * Detects multiple tasks within conversational compound sentences:
 * e.g. "must reed books at 6pm man dont forget it and muste eat dinner at 8pm"
 *   -> ["must read books at 6pm", "must eat dinner at 8pm"]
 */
function splitCompoundTaskSentences(rawText: string): string[] {
  // 1. Strip conversational interjections and filler
  let cleaned = rawText
    .replace(/\b(?:man\s+)?don'?t\s+forget(?:\s+it|\s+about\s+it)?\b/gi, "")
    .replace(/\bdo\s+not\s+forget(?:\s+it)?\b/gi, "")
    .replace(/\b(?:man|bro|dude|guys)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // 2. Split on explicit line breaks and semicolons
  const lines = cleaned.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
  const tasks: string[] = [];

  // 3. Multi-task conjunction split pattern:
  // - "and then", "then", "after that", "and also", "also", "as well as", "followed by"
  // - ", so", "and so", "so <action verb>"
  // - Time boundary: e.g. "at 6 pm ... and ... at 8 pm"
  // - "and" followed by an action/modal verb (must, need, eat, go, read, take, etc.)
  const splitPattern = /\b(?:and\s+then|then|after\s+that|and\s+also|also|as\s+well\s+as|followed\s+by)\b|,\s*so\b|\bso\b(?=\s*(?:attend|meet|do|eat|take|go|call|buy|clean|study|read|walk|work|sleep)\b)|\b(?<=\b(?:am|pm|\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b)\s*(?:,\s*and\s+|,\s*|\s+and\s+)|\b(?:and)\b(?=\s*(?:must|need|want|have|eat|drink|go|take|buy|clean|call|meet|do|study|read|walk|sleep|workout|gym|attend)\b)/gi;

  for (const line of lines) {
    const parts = line.split(splitPattern).map((s) => {
      return s.trim()
        .replace(/^(?:,\s*|\s*,\s*)/, "")
        .replace(/^(?:so|and\s+so|and\s+also|and|then|also|plus)\s+/i, "")
        .trim();
    }).filter((s) => s.length > 2);
    tasks.push(...parts);
  }

  return tasks.length > 0 ? tasks : [rawText];
}

/**
 * Parses days of week and repeat schedule from text.
 */
export function extractScheduleDays(text: string): {
  days: number[];
  repeat: RepeatSchedule;
  cleanText: string;
} {
  let cleanText = text;
  const lower = cleanText.toLowerCase();

  // Pattern: "except saturday and sunday", "except the saturday and sunday", "excluding weekends", "not saturday and sunday", "mon to fri"
  if (
    /except\s+(?:the\s+)?(?:saturday\s+and\s+sunday|weekends?|sunday\s+and\s+saturday|sat\s+and\s+sun)/i.test(lower) ||
    /excluding\s+(?:the\s+)?(?:saturday\s+and\s+sunday|weekends?|sat\s+and\s+sun)/i.test(lower) ||
    /monday\s+(?:to|through)\s+friday|mon\s+(?:to|through)\s+fri/i.test(lower) ||
    /weekdays\s+only|on\s+weekdays/i.test(lower)
  ) {
    cleanText = cleanText
      .replace(/except\s+(?:the\s+)?(?:saturday\s+and\s+sunday|weekends?|sunday\s+and\s+saturday|sat\s+and\s+sun)/gi, "")
      .replace(/excluding\s+(?:the\s+)?(?:saturday\s+and\s+sunday|weekends?|sat\s+and\s+sun)/gi, "")
      .replace(/monday\s+(?:to|through)\s+friday|mon\s+(?:to|through)\s+fri/gi, "")
      .replace(/weekdays\s+only|on\s+weekdays/gi, "")
      .replace(/daily\s+but/gi, "")
      .trim();

    return {
      days: [1, 2, 3, 4, 5],
      repeat: "weekdays",
      cleanText,
    };
  }

  // Pattern: "except sunday", "excluding sunday"
  if (/except\s+(?:the\s+)?sunday|excluding\s+(?:the\s+)?sunday/i.test(lower)) {
    cleanText = cleanText
      .replace(/except\s+(?:the\s+)?sunday|excluding\s+(?:the\s+)?sunday/gi, "")
      .replace(/daily\s+but/gi, "")
      .trim();
    return {
      days: [1, 2, 3, 4, 5, 6],
      repeat: "custom",
      cleanText,
    };
  }

  // Pattern: "weekends only", "on weekends", "saturday and sunday"
  if (/weekends?\s+only|on\s+weekends?|only\s+on\s+weekends?/i.test(lower)) {
    cleanText = cleanText.replace(/weekends?\s+only|on\s+weekends?|only\s+on\s+weekends?/gi, "").trim();
    return {
      days: [0, 6],
      repeat: "weekends",
      cleanText,
    };
  }

  // Pattern: "daily", "every day", "each day", "every morning", "every evening"
  if (/\b(?:daily|every\s+day|each\s+day|every\s+morning|every\s+evening)\b/i.test(lower)) {
    cleanText = cleanText.replace(/\b(?:daily|every\s+day|each\s+day|every\s+morning|every\s+evening)\b/gi, "").trim();
    return {
      days: [0, 1, 2, 3, 4, 5, 6],
      repeat: "daily",
      cleanText,
    };
  }

  return {
    days: [0, 1, 2, 3, 4, 5, 6],
    repeat: "none",
    cleanText,
  };
}

/**
 * Parses time expressions and handles morning/evening/night offsets.
 * e.g. "morning 6 am", "at 6 pm", "in 15 m", "at 10 am", "at 18:00", "6 in the morning"
 */
export function extractAlarmFromText(
  text: string,
  allowedDays: number[] = [0, 1, 2, 3, 4, 5, 6]
): {
  alarmTime?: string | undefined;
  alarmTimestamp?: number | undefined;
  cleanText: string;
} {
  let cleanText = text;
  const now = new Date();

  // 1. Relative offset: "in 15 m", "in 30 mins", "in 1 h"
  const relMatch = cleanText.match(/\bin\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/i);
  if (relMatch && relMatch[1] && relMatch[2]) {
    const val = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const minutesToAdd = unit.startsWith("h") ? val * 60 : val;
    const targetDate = new Date(now.getTime() + minutesToAdd * 60 * 1000);

    const hours = targetDate.getHours();
    const mins = targetDate.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    const formatted = `${h12}:${String(mins).padStart(2, "0")} ${ampm}`;

    cleanText = cleanText.replace(relMatch[0], "").trim();
    return {
      alarmTime: formatted,
      alarmTimestamp: targetDate.getTime(),
      cleanText,
    };
  }

  // 2. Pattern: "at 6 in the morning" / "at 6 in the evening" / "6 in morning"
  const inPeriodMatch = cleanText.match(
    /\b(?:at|by|@)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:in\s+the|in)\s+(morning|evening|afternoon|night)\b/i
  );
  if (inPeriodMatch && inPeriodMatch[1] && inPeriodMatch[3]) {
    let hour = parseInt(inPeriodMatch[1], 10);
    const minute = inPeriodMatch[2] ? parseInt(inPeriodMatch[2], 10) : 0;
    const period = inPeriodMatch[3].toLowerCase();

    if ((period === "evening" || period === "night" || period === "afternoon") && hour < 12) {
      hour += 12;
    }
    if (period === "morning" && hour === 12) {
      hour = 0;
    }

    if (hour >= 0 && hour < 24) {
      const h12 = hour % 12 || 12;
      const ampm = hour >= 12 ? "PM" : "AM";
      const formatted = `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
      const targetMs = getNextAlarmTimestamp(hour, minute, allowedDays);

      cleanText = cleanText.replace(inPeriodMatch[0], "").trim();
      return {
        alarmTime: formatted,
        alarmTimestamp: targetMs,
        cleanText,
      };
    }
  }

  // 3. Pattern: "morning 6", "morning 6 am", "evening 6 pm", "at morning 6 am"
  const periodMatch = cleanText.match(
    /\b(?:at|by|@)?\s*(?:in\s+the\s+)?(morning|evening|afternoon|night)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i
  );
  if (periodMatch && periodMatch[1] && periodMatch[2]) {
    const period = periodMatch[1].toLowerCase();
    let hour = parseInt(periodMatch[2], 10);
    const minute = periodMatch[3] ? parseInt(periodMatch[3], 10) : 0;
    const meridiem = periodMatch[4] ? periodMatch[4].toLowerCase() : null;

    if (meridiem) {
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
    } else {
      if ((period === "evening" || period === "night" || period === "afternoon") && hour < 12) {
        hour += 12;
      }
      if (period === "morning" && hour === 12) {
        hour = 0;
      }
    }

    if (hour >= 0 && hour < 24) {
      const h12 = hour % 12 || 12;
      const ampm = hour >= 12 ? "PM" : "AM";
      const formatted = `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
      const targetMs = getNextAlarmTimestamp(hour, minute, allowedDays);

      cleanText = cleanText.replace(periodMatch[0], "").trim();
      return {
        alarmTime: formatted,
        alarmTimestamp: targetMs,
        cleanText,
      };
    }
  }

  // 4. Standard clock time with at/by/@: "at 6 pm", "at 7:30 am", "at 7.30 am", "at 18:00"
  const clockMatch = cleanText.match(
    /\b(?:at|by|@)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i
  );
  if (clockMatch && clockMatch[1]) {
    let hour = parseInt(clockMatch[1], 10);
    const minute = clockMatch[2] ? parseInt(clockMatch[2], 10) : 0;
    const meridiem = clockMatch[3] ? clockMatch[3].toLowerCase() : null;

    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      const h12 = hour % 12 || 12;
      const ampm = hour >= 12 ? "PM" : "AM";
      const formatted = `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;

      const targetMs = getNextAlarmTimestamp(hour, minute, allowedDays);
      cleanText = cleanText.replace(clockMatch[0], "").trim();

      return {
        alarmTime: formatted,
        alarmTimestamp: targetMs,
        cleanText,
      };
    }
  }

  // 5. Standalone clock time with explicit am/pm: e.g. "meeting 6:00 pm", "walk 7.30am"
  const standaloneMatch = cleanText.match(
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i
  );
  if (standaloneMatch && standaloneMatch[1] && standaloneMatch[3]) {
    let hour = parseInt(standaloneMatch[1], 10);
    const minute = standaloneMatch[2] ? parseInt(standaloneMatch[2], 10) : 0;
    const meridiem = standaloneMatch[3].toLowerCase();

    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      const h12 = hour % 12 || 12;
      const ampm = hour >= 12 ? "PM" : "AM";
      const formatted = `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;

      const targetMs = getNextAlarmTimestamp(hour, minute, allowedDays);
      cleanText = cleanText.replace(standaloneMatch[0], "").trim();

      return {
        alarmTime: formatted,
        alarmTimestamp: targetMs,
        cleanText,
      };
    }
  }

  return { cleanText };
}

/**
 * Distills raw task prompt into a clean, professional task title.
 * Performs NLP tense normalization (e.g. "ate breakfast" -> "Breakfast"),
 * conversational stripping, and canonical activity mapping.
 */
function distillTaskTitleWithNLP(rawCleanText: string): { title: string; tag: string; defaultTime?: string } {
  let clean = rawCleanText.trim();

  // Strip calendar temporal words that shouldn't be part of the task title: today, tomorrow, tonight
  clean = clean
    .replace(/\b(?:today|tomorrow|tonight|yesterday)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Use compromise NLP to convert past-tense verbs to infinitive (e.g. "ate" -> "eat", "went" -> "go")
  try {
    const doc = nlp(clean);
    doc.verbs().toInfinitive();
    clean = doc.text();
  } catch {
    // Fallback gracefully
  }

  // Repeatedly strip conversational filler preambles, modals, and auxiliary action verbs
  let prev = "";
  while (prev !== clean) {
    prev = clean;
    clean = clean
      .replace(/^(?:so|and\s+so|and\s+also|then|also|plus|now|well|next)\s+/i, "")
      .replace(/^(?:i\s+want\s+to|i\s+need\s+to|i\s+have\s+to|i'd\s+like\s+to|i\s+plan\s+to|i'm\s+planning\s+to|i\s+wanna|i\s+wana|i\s+gonna|i\s+gona|i\s+gotta)\s+/i, "")
      .replace(/^(?:i\s+walk\s+to|i\s+go\s+to|i\s+went\s+to|i\s+ate|i\s+eat|i\s+had|i\s+did|i\s+took|i\s+take)\s+/i, "")
      .replace(/^(?:remind\s+me\s+to|set\s+(?:an?\s+)?alarm\s+(?:for|to)|schedule\s+(?:a\s+task\s+)?to|plan\s+to)\s+/i, "")
      .replace(/^(?:remember\s+to|make\s+sure\s+to|be\s+sure\s+to|don't\s+forget\s+to|dont\s+forget\s+to)\s+/i, "")
      .replace(/^(?:please|plz|pls|can\s+you|could\s+you)\s+/i, "")
      .replace(/^(?:must|should|have\s+to|need\s+to)\s+/i, "")
      .replace(/^(?:go\s+to\s+the|go\s+to|go\s+for\s+a|go\s+for|head\s+to|visit|walk\s+to)\s+/i, "")
      .replace(/^(?:eat\s+a|eat\s+the|eat|have\s+a|have\s+the|have|take\s+a|take\s+my|take)\s+/i, "")
      .replace(/^(?:do\s+some|do\s+a|do\s+the|do|attend\s+the|attend\s+a|attend|start|practice|work\s+on)\s+/i, "")
      .replace(/^(?:the|a|an)\s+/i, "")
      .replace(/^(?:daily|every\s+day|each\s+day)\s+/i, "")
      .replace(/[,.;]+$/, "")
      .trim();
  }

  // Check specific multi-word combinations first (e.g. "read books", "read book")
  if (/^read\s+books?$/i.test(clean)) {
    return {
      title: /^read\s+books$/i.test(clean) ? "Read Books" : "Read Book",
      tag: "study",
      defaultTime: "6:00 PM",
    };
  }

  // Check canonical activities
  const words = clean.toLowerCase().split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9]/g, "");
    if (CANONICAL_ACTIVITIES[cleanWord]) {
      const match = CANONICAL_ACTIVITIES[cleanWord];
      // If the intent is primarily this activity (e.g. "breakfast", "dinner", "gym", "yoga", "clean")
      if (words.length <= 3) {
        return {
          title: match.title,
          tag: match.tag,
          defaultTime: match.defaultTime,
        };
      }
      return {
        title: clean.charAt(0).toUpperCase() + clean.slice(1),
        tag: match.tag,
        defaultTime: match.defaultTime,
      };
    }
  }

  // Format title cleanly
  if (clean.length > 0) {
    if (/^gym$/i.test(clean)) {
      clean = "GYM";
    } else {
      clean = clean
        .split(" ")
        .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ""))
        .join(" ");
    }
  }

  return {
    title: clean || "Task",
    tag: "task",
  };
}

/**
 * Intelligent offline lightweight AI NLP engine.
 * Understands user intent, multi-task sentences, fixes typos/grammar/tense, separates schedules, and creates clean titles.
 */
export function decomposeTextIntoTodos(rawText: string): TodoItem[] {
  // Step 1: Normalize spacing, segment compound words, and correct typos
  const normalizedRaw = normalizeSpacingAndFusedTokens(rawText.trim());
  if (!normalizedRaw) return [];

  // Step 2: Split compound sentences into individual task clauses
  const taskChunks = splitCompoundTaskSentences(normalizedRaw);

  const items: TodoItem[] = [];

  for (let chunk of taskChunks) {
    chunk = chunk.trim();
    if (!chunk) continue;

    // Remove leading list markers
    let clean = chunk.replace(/^([-*•\d+.\s\(\)]+|\[\s*\])+/g, "").trim();

    // 1. Extract schedule days (e.g. "daily except saturday and sunday")
    const scheduleResult = extractScheduleDays(clean);
    clean = scheduleResult.cleanText;

    // 2. Extract alarm from text (handles "at 10am", "morning 6 am", "at 6 pm", "at 8pm", etc.)
    const alarmResult = extractAlarmFromText(clean, scheduleResult.days);
    clean = alarmResult.cleanText;

    // 3. Distill task title with our NLP grammar & tense engine
    const distilled = distillTaskTitleWithNLP(clean);
    let finalTitle = distilled.title;
    const finalTag = distilled.tag;
    const defaultTimeIfNone = distilled.defaultTime;

    if (finalTitle.length < 2) continue;

    // Default time for routine activities if user did not specify one
    let finalAlarmTime = alarmResult.alarmTime;
    let finalAlarmTimestamp = alarmResult.alarmTimestamp;

    if (!finalAlarmTime && defaultTimeIfNone) {
      finalAlarmTime = defaultTimeIfNone;
      const [hStr, mStr] = defaultTimeIfNone.split(":");
      let h = parseInt(hStr, 10);
      const isPM = defaultTimeIfNone.includes("PM");
      if (isPM && h < 12) h += 12;
      finalAlarmTimestamp = getNextAlarmTimestamp(h, parseInt(mStr, 10) || 0, scheduleResult.days);
    }

    // Determine Habit vs. Todo Task
    const isHabit =
      scheduleResult.repeat !== "none" ||
      /\b(?:daily|every\s+day|each\s+day|routine|habit|weekdays|weekends|every\s+morning|every\s+evening)\b/i.test(chunk);

    const itemType: ItemType = isHabit ? "habit" : "task";
    const finalRepeat: RepeatSchedule = isHabit
      ? scheduleResult.repeat !== "none"
        ? scheduleResult.repeat
        : "daily"
      : "none";

    // Priority detection (handles "must", "muste", "urgent", "asap", etc.)
    const lower = chunk.toLowerCase();
    let priority: PriorityLevel = "medium";
    if (
      lower.includes("urgent") ||
      lower.includes("asap") ||
      lower.includes("critical") ||
      lower.includes("today") ||
      lower.includes("deadline") ||
      lower.includes("p0") ||
      lower.includes("must") ||
      lower.includes("muste") ||
      lower.includes("important")
    ) {
      priority = "high";
    } else if (
      lower.includes("later") ||
      lower.includes("maybe") ||
      lower.includes("low") ||
      lower.includes("optional")
    ) {
      priority = "low";
    }

    // Duration estimate
    let estimatedTime: string | undefined;
    const timeMatch = clean.match(/(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/i);
    if (timeMatch && timeMatch[1] && timeMatch[2]) {
      const num = timeMatch[1];
      const unit = timeMatch[2].toLowerCase().startsWith("h") ? "h" : "m";
      estimatedTime = `${num}${unit}`;
    } else {
      if (finalTag === "fitness") estimatedTime = "45m";
      else if (finalTag === "comms") estimatedTime = "15m";
      else if (finalTag === "dev") estimatedTime = "45m";
      else if (finalTitle === "Breakfast" || finalTitle === "Lunch" || finalTitle === "Dinner") estimatedTime = "30m";
      else if (finalTitle === "Read Books" || finalTitle === "Read Book") estimatedTime = "30m";
      else estimatedTime = "30m";
    }

    items.push({
      id: `task-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
      text: finalTitle,
      completed: false,
      priority,
      tag: finalTag,
      itemType,
      estimatedTime,
      alarmTime: finalAlarmTime,
      alarmTimestamp: finalAlarmTimestamp,
      alarmEnabled: Boolean(finalAlarmTimestamp),
      alarmFired: false,
      repeat: finalRepeat,
      days: isHabit ? scheduleResult.days : undefined,
      createdAt: Date.now() + items.length,
    });
  }

  return items;
}

const STORAGE_KEY = "lumen.todos.v1";

export function loadSavedTodos(): TodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [
        {
          id: "init-gym",
          text: "GYM",
          completed: false,
          priority: "high",
          tag: "fitness",
          itemType: "habit",
          estimatedTime: "1h",
          alarmTime: "6:00 PM",
          alarmTimestamp: getNextAlarmTimestamp(18, 0, [1, 2, 3, 4, 5]),
          alarmEnabled: true,
          alarmFired: false,
          repeat: "weekdays",
          days: [1, 2, 3, 4, 5],
          createdAt: Date.now() - 3600000,
        },
      ];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTodos(items: TodoItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota limits
  }
}
