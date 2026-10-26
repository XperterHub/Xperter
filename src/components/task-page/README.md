# Task Management & Auto-Planner Engine — Implementation & Architecture Guide

A complete, high-performance, offline-first personal task and habit management system built for **Xperter**, featuring an integrated lightweight AI natural language processing (NLP) planner, Web Audio API alarm synthesizer, and liquid glassmorphism interface.

---

## 1. Architectural Overview

```
task-page/
├── TodoView.tsx       # Primary UI component & state coordinator (Liquid glassmorphism)
├── autoPlanner.ts     # Offline NLP engine, typo corrector, clause splitter, time & habit classifier
├── alarmAudio.ts      # Synthetic Web Audio API alarm generator & audio settings
├── index.ts           # Public API & re-exports
└── README.md          # Comprehensive technical documentation & process breakdown
```

### Core Design Principles:
1. **0 MB Added Model Weight**: Operates 100% locally and offline without external API keys or multi-megabyte neural network weights.
2. **Imperative Tense & Grammar Correction**: Automatically transforms conversational and typo-riddled input (e.g. `"atten the meeting at 6pn"`) into clean, professional task titles (`"Meeting"` at `6:00 PM`).
3. **Habit vs. One-Off Task Differentiation**: Understands recurring schedules (`"daily except saturday and sunday"` $\to$ Mon–Fri Habit) versus one-off deadlines (`"attend meeting today"` $\to$ High-priority Task).
4. **Liquid Glassmorphism Aesthetics**: Built to seamlessly match the Xperter design system with frosted glass panels, liquid press micro-animations, and collision-aware popovers.

---

## 2. Deep Dive: `autoPlanner.ts` (NLP & Intent Engine)

`autoPlanner.ts` is responsible for parsing unstructured human text, resolving keyboard typos, splitting compound sentences, extracting schedules, and formatting canonical task titles.

### 2.1 Spacing & Fused Token Pre-Normalization (`normalizeSpacingAndFusedTokens`)
Before language processing, raw user text is pre-processed with targeted regular expressions:
- **Keyboard Slip Correction**: Automatically maps common mobile/desktop keyboard typos where adjacent keys are pressed:
  - `(\d+)\s*(?:pn|on)\b` $\to$ `$1 pm` (e.g. `6pn` $\to$ `6 pm`)
  - `(\d+)\s*(?:an|ak)\b` $\to$ `$1 am` (e.g. `8an` $\to$ `8 am`)
- **Period Time Notation**: Converts dot-formatted times into standard clock formats:
  - `(\b\d{1,2})\.(\d{2})\s*(am|pm)?` $\to$ `$1:$2 $3` (e.g. `7.30am` $\to$ `7:30 am`)
- **Fused Token Separation**: Separates numbers merged with meridiem or prepositions:
  - `10am` $\to$ `10 am`, `at6pm` $\to$ `at 6 pm`, `in15m` $\to$ `in 15 m`
- **Fused Routine Phrases**: Corrects fused phrases like `atebrekfest` $\to$ `ate breakfast`, `gotogym` $\to$ `go to gym`, `doyoga` $\to$ `do yoga`.
- **Comma Token Padding**: Punctuation is spaced to ensure clean word-boundary tokenization.

### 2.2 Dual-Tier Spell Checking & Typo Map
To prevent language models from conjugating misspelled words incorrectly (e.g. Compromise NLP mistakenly conjugating `atten` into `ate`):
- **`STOP_AND_COMMON_WORDS`**: An immutable set of ~150 standard English words (pronouns, prepositions, auxiliary verbs, calendar terms, and common nouns like `team`, `sync`, `work`, `mom`, `car`). These are never modified.
- **`COMMON_TYPO_MAP`**: Explicit phonetic lookup dictionary mapping common user misspellings:
  - `atten`, `atend`, `atending`, `attnd` $\to$ `attend`
  - `exercses`, `exersice`, `exercis`, `excercise` $\to$ `exercise`
  - `snacls`, `snackes`, `snac`, `snaks` $\to$ `snack`
  - `muste` $\to$ `must`, `reed` $\to$ `read`
  - `brekfest`, `brakefast` $\to$ `breakfast`
  - `ygoa` $\to$ `yoga`, `jym` $\to$ `gym`, `wrkout` $\to$ `workout`
- **Bounded Levenshtein Distance Matching**: For non-stop words with length $\ge 4$, fuzzy matching is applied against the offline task vocabulary with strict length difference constraints ($\le 1$) so standard 4-letter nouns like `team` are never mutated into `tea`.

### 2.3 Intelligent Multi-Task Clause Splitter (`splitCompoundTaskSentences`)
Splits complex conversational sentences containing multiple goals:
- **Filler Stripping**: Removes conversational interjections such as `"man don't forget it"`, `"dude"`, `"bro"`.
- **Conjunction Splitting**: Splits on:
  - Explicit sequence words: `"and then"`, `"after that"`, `"followed by"`, `"and also"`
  - Discourse transitions: `", so"`, `"and so"`, `"so <action verb>"`
  - Time boundary markers: e.g. `"at 7:30 am ... and ... at 8:00 pm"`
  - Action verb coordinates: `"and (must|need|eat|go|take|buy|clean|meet|attend)..."`
- **Leading Marker Cleanup**: Strips leftover leading transitions (`so `, `and so `, `then `, `also `, `plus `) from each chunk so each task starts cleanly.

### 2.4 Schedule & Days Extraction (`extractScheduleDays`)
Extracts recurrence rules:
- **Negative Day Exceptions**: Detects phrases like `"except saturday and sunday"`, `"excluding weekends"`, or `"monday to friday"`, assigning allowed days `[1, 2, 3, 4, 5]` and schedule `"weekdays"`.
- **Weekend / Single Day Exceptions**: Handles `"except sunday"`, `"weekends only"`.
- **Habit Classification**: Marks recurring items as `itemType: "habit"` and one-off tasks as `itemType: "task"`.

### 2.5 Time & Alarm Extraction (`extractAlarmFromText`)
Multi-pass clock detection:
1. **Relative Delays**: Matches `"in 15 m"`, `"in 30 mins"`, `"in 1 h"`, computing target timestamps from `Date.now()`.
2. **Period-Based Time**: Parses `"morning 6 am"`, `"at 6 in the evening"`, `"night 10"`.
3. **Standard Clock Times**: Matches `"at 6 pm"`, `"at 7:30 am"`, `"by 10:00 am"`, `"at 18:00"`.
4. **Standalone Time Expressions**: Matches clock times even without prepositions (e.g. `"meeting 6pm"`, `"reading 7.30am"`).
5. **Next Epoch Calculation**: Calculates exact next epoch milliseconds matching the allowed recurrence days.

### 2.6 NLP Title Distillation (`distillTaskTitleWithNLP`)
Transforms unstructured phrasing into a concise title:
- **Calendar Noise Stripping**: Removes `today`, `tomorrow`, `tonight`, `yesterday` from the title string (while retaining them for priority detection).
- **Compromise NLP Inversion**: Converts past-tense verbs to infinitive roots (`ate` $\to$ `eat`).
- **Preamble Stripping Loop**: Repeatedly eliminates filler:
  - Modals & Pronouns: `"i want to"`, `"i need to"`, `"i have to"`, `"i gotta"`, `"must"`, `"should"`.
  - Reminders: `"remind me to"`, `"set alarm for"`, `"don't forget to"`, `"please"`.
  - Verbs with articles: `"attend the"`, `"attend a"`, `"attend"`, `"go to the"`, `"eat the"`, `"take a"`.
  - Leading articles: `"the"`, `"a"`, `"an"`.
- **Canonical Activity Catalog**: Maps activities to curated titles, tags, and default times:
  - `gym` $\to$ Title: `"GYM"`, Tag: `"fitness"`, Default: `6:00 PM`
  - `meeting` $\to$ Title: `"Meeting"`, Tag: `"comms"`, Default: `10:00 AM`
  - `snack` $\to$ Title: `"Healthy Snack"`, Tag: `"personal"`, Default: `4:00 PM`
  - `exercise` $\to$ Title: `"Exercise"`, Tag: `"fitness"`, Default: `6:00 PM`
  - `breakfast` $\to$ Title: `"Breakfast"`, Tag: `"personal"`, Default: `8:00 AM`
- **Priority & Duration**: Sets priority to `high` if prompt mentions urgency, deadlines, or `today`; assigns realistic durations (`fitness` = `45m`, `comms` = `15m`, meals = `30m`).

---

## 3. Deep Dive: `TodoView.tsx` (UI & User Experience)

`TodoView.tsx` implements the complete visual management interface, alarm monitoring, interactive filtering, and modal workflows.

### 3.1 Design System & Layout
- **Glassmorphism**: Encapsulated within `GlassCard` using backdrop blur, translucent borders, and depth lighting.
- **Dynamic Header & Progress**:
  - Displays `"TASK"` header matching the clean minimalism requested.
  - Custom progress bar featuring dynamic gradient fill, percentage calculation, and remaining count.
- **Top Actions**:
  - **Add Task Button**: Primary liquid-styled CTA to quickly append tasks.
  - **Auto-Plan with AI Button**: Opens the natural language decomposition modal.
  - **Settings Popover Trigger**: Opens task preferences and sound settings.

### 3.2 Segmented Filter Tabs
Features four interactive filters:
1. **All**: Complete overview of habits and one-off tasks.
2. **Habits**: Filters only recurring items (`itemType === "habit"`).
3. **Tasks**: Filters only non-recurring standalone items (`itemType === "task"`).
4. **Done**: Filters finished items.

Tabs utilize an animated ink indicator that glides smoothly beneath the selected filter pill.

### 3.3 Task Cards & Visual Tags
Each item is rendered with rich interactive affordances:
- **Status Toggle**: Custom circular checkmark button with spring-stroke animation.
- **Text & Completion**: Strikethrough and subtle opacity reduction on completion.
- **Type Badge**: Distinctive badge highlighting `Habit` (blue-tinted glow) vs. `Task` (purple-tinted glow).
- **Priority Pill**:
  - `High`: Soft Rose glow (`bg-rose-500/10 text-rose-400 border-rose-500/30`)
  - `Medium`: Warm Amber glow (`bg-amber-500/10 text-amber-400 border-amber-500/30`)
  - `Low`: Emerald glow (`bg-emerald-500/10 text-emerald-400 border-emerald-500/30`)
- **Alarm Indicator**: Displays scheduled time with a bell icon; clicking toggles alarm on/off.
- **Card Actions**: Inline editing modal and animated deletion.

### 3.4 Live Alarm Background Watcher
- Employs a real-time interval timer running every 15 seconds.
- Compares `Date.now() >= alarmTimestamp`.
- When triggered:
  - Emits the selected Web Audio API synthesizer chime.
  - Triggers a top-level alert toast with **"Dismiss"** and **"Snooze (+10m)"** actions.
  - For habits, automatically computes and schedules the next occurrence timestamp.

### 3.5 Settings Popover & Ringtone Selector
Anchored to the settings button using Radix Popover with collision-awareness:
- **Sound Toggle**: Instant enable/disable for alarm audio.
- **Volume Slider**: Smooth range control from 0% to 100%.
- **Compact Ringtone Dropdown**: Replaces tall button stacks with a sleek, animated dropdown selector.
- **Live Preview Button**: A quick-test button to audition any ringtone directly in the popover.

---

## 4. Deep Dive: `alarmAudio.ts` (Web Audio API Synthesizer)

Rather than bundling bulky MP3 or WAV audio assets that increase download size and can fail on mobile file systems, `alarmAudio.ts` utilizes the browser's native **Web Audio API** to synthesize crystalline tones on demand.

### 4.1 Synthesized Profiles
1. **Chime (Default)**:
   - Harmonic 4-note ascending C-major arpeggio: $C_5 (523.25\text{Hz}) \to E_5 (659.25\text{Hz}) \to G_5 (783.99\text{Hz}) \to C_6 (1046.5\text{Hz})$.
   - Staggered attack envelope with $360\text{ms}$ exponential decay tail.
2. **Beep**:
   - Triple digital square-wave pulse with a lowpass biquad filter ($2200\text{Hz}$) to eliminate harsh harmonics.
   - Frequency jumps from $880\text{Hz}$ to $1046.5\text{Hz}$ on the final pulse.
3. **Zen**:
   - Deep Tibetan singing bowl gong effect.
   - Triple harmonic sine resonance: $216\text{Hz}$, $432\text{Hz}$, and $648\text{Hz}$ with a slow $1.2\text{s}$ decay.
4. **Radar**:
   - High-tech frequency sweep ping.
   - Dual pings sweeping from $1400\text{Hz}$ down to $800\text{Hz}$ over $180\text{ms}$.

### 4.2 Autoplay & AudioContext Lifecycle
- Handles suspended audio context states via `sharedAudioCtx.resume()`.
- Routes all oscillators through an isolated `GainNode` connected directly to `AudioContext.destination`.
- Persists user preferences to `localStorage` (`lumen.task.settings.v1`).

---

## 5. Chronological Evolution & Iterations

### Step 1: Initial Todo Foundation
- Built initial task manager on Page 3 (`/app/page-3`).
- Created core data model (`TodoItem`) with priority, alarm time, and LocalStorage persistence.

### Step 2: Visual Simplification & Polish
- Removed marketing phrases and unnecessary emojis.
- Cleaned page header to simply `"TASK"`.
- Designed a custom theme-matching progress bar with animated counter.

### Step 3: Habit vs. Task Intelligence & Exception Parsing
- Introduced `extractScheduleDays` to support phrases like `"I want to go to the gym daily but except the saturday and sunday"`.
- Added `itemType` (`"habit"` vs `"task"`) with distinct visual badges and top filter tabs.
- Automated Monday–Friday scheduling (`[1, 2, 3, 4, 5]`) for habit routines.

### Step 4: Web Audio Alarm Engine & Settings Redesign
- Created `alarmAudio.ts` with 4 procedural audio ringtones.
- Replaced separated settings buttons with a compact dropdown selector and live audio tester.

### Step 5: Offline AI Engine & Typos Tolerance
- Integrated `compromise` NLP for local tense conversion without server calls.
- Implemented `normalizeSpacingAndFusedTokens` and `COMMON_TYPO_MAP` to handle messy inputs (e.g., `"must reed books at 6pm man dont forget it and muste eat dinner at 8pm"`).

### Step 6: Proper Sentence Formation & Precision Normalization
- Resolved issue where `"atten"` was conjugated into `"ate"`:
  - Added explicit typo mapping: `atten` $\to$ `attend`.
  - Added keyboard slip corrections: `6pn` $\to$ `6 pm`, `8an` $\to$ `8 am`.
  - Added period time support: `7.30am` $\to$ `7:30 AM`.
  - Added leading discourse marker stripping: eliminated stray `"So "` and `"today"` from titles.
- Successfully verified test input:
  `"do exercses at 7.30am and eat the snacls at 8pm , so atten the meeting at 6pn today"`
  $\to$ Generates:
  1. **Exercise** (`7:30 AM`)
  2. **Healthy Snack** (`8:00 PM`)
  3. **Meeting** (`6:00 PM`, High Priority)

---

## 6. How to Use or Port This Module

To use the task system in any React / Vite / Next.js application:

```tsx
import { TodoView } from "./task-page";

export default function MyTaskPage() {
  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-white">
      <TodoView />
    </div>
  );
}
```

Or invoke the AI planner programmatically:

```ts
import { decomposeTextIntoTodos } from "./task-page";

const tasks = decomposeTextIntoTodos(
  "go to gym daily except weekends at 6pm and read books at 8pm"
);
console.log(tasks);
// [
//   { text: "GYM", itemType: "habit", repeat: "weekdays", alarmTime: "6:00 PM" },
//   { text: "Read Books", itemType: "task", repeat: "none", alarmTime: "8:00 PM" }
// ]
```
