/**
 * Contrastive Phonics — core exercise engine (Phase 1)
 *
 * This file knows nothing German-specific — it reads whatever is in
 * LEVELS (data.js) and drives the four-stage loop. Adding levels 2-14
 * later is a data.js change only.
 *
 * Extension point for later phases: INTERLEAVED REVIEW.
 * Once LEVELS.length > 1, insert a review stage that samples words from
 * previously-completed levels between "production" and "final" of a new
 * level. See buildStageList() below for exactly where that slots in.
 */

// ---- Tunable constants -----------------------------------------------
// How many words per pattern the Listen (discrimination) stage drills.
// 5+5 = 10 questions, rather than the full 8+8 = 16-word list.
const DISCRIMINATION_WORDS_PER_PATTERN = 5;

// How many words per pattern get a full record-and-compare treatment in
// the Production stage. Recording is effortful, so we sample rather than
// drilling all 8+8 words. Raise this once you've tested the loop.
const PRODUCTION_WORDS_PER_PATTERN = 3;

// How many times a student can get a single word wrong before the app
// lets them move on without mastering it (still logged for the summary).
const MAX_ATTEMPTS_PER_WORD = 3;

// ---- Small utilities -----------------------------------------------------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

// ---- Text-to-speech --------------------------------------------------------

const TTS = {
  voice: null,
  ready: false,
  supported: "speechSynthesis" in window,
  loadVoices() {
    if (!this.supported) return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    this.voice =
      voices.find((v) => v.lang && v.lang.toLowerCase() === "de-de") ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("de")) ||
      null;
    this.ready = true;
    document.dispatchEvent(new CustomEvent("tts-ready"));
  },
  speak(text, rate) {
    if (!this.supported) return false;
    speechSynthesis.cancel(); // avoid queueing pile-ups on rapid taps
    const utter = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utter.voice = this.voice;
      utter.lang = this.voice.lang;
    } else {
      utter.lang = "de-DE"; // best-effort even with no German voice installed
    }
    utter.rate = rate || 0.95;
    speechSynthesis.speak(utter);
    return true;
  }
};

if (TTS.supported) {
  TTS.loadVoices();
  speechSynthesis.addEventListener("voiceschanged", () => TTS.loadVoices());
}

function playAudioButton(text, label = "▶ Play", rate) {
  const btn = el("button", { class: "btn btn-audio" }, label);
  btn.addEventListener("click", () => {
    if (!TTS.supported) {
      flashUnsupported(btn);
      return;
    }
    if (!TTS.voice) warnNoGermanVoice();
    TTS.speak(text, rate);
  });
  return btn;
}

let voiceWarningShown = false;
function warnNoGermanVoice() {
  if (voiceWarningShown) return;
  voiceWarningShown = true;
  const banner = document.getElementById("global-banner");
  banner.textContent =
    "No German voice was found on this device, so audio may sound off or use a default voice. The exercise still works — check System/Browser settings for a German (de-DE) voice if this matters.";
  banner.hidden = false;
}

function flashUnsupported(btn) {
  btn.textContent = "Audio not supported here";
  btn.disabled = true;
}

// ---- Recording -------------------------------------------------------------
// Fixed design: start() only starts the recorder and returns immediately.
// stopAndGetUrl() is a separate call, triggered by the Stop button, that
// resolves once the 'stop' event has actually fired. Earlier versions
// awaited the stop event from inside start() itself, which meant the Stop
// button's click handler wasn't attached until after start() had already
// finished — a deadlock, since nothing could ever fire 'stop'.

const Recorder = {
  supported: !!(navigator.mediaDevices && window.MediaRecorder),
  stream: null,
  recorder: null,
  chunks: [],
  currentUrl: null,

  async ensureStream() {
    if (this.stream) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return this.stream;
  },

  async start() {
    const stream = await this.ensureStream();
    this.chunks = [];
    this.recorder = new MediaRecorder(stream);
    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    this.recorder.start();
  },

  stopAndGetUrl() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        resolve(null);
        return;
      }
      this.recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(this.chunks, { type: "audio/webm" });
          this.discardUrl();
          this.currentUrl = URL.createObjectURL(blob);
          resolve(this.currentUrl);
        },
        { once: true }
      );
      this.recorder.stop();
    });
  },

  discardUrl() {
    // Nothing is persisted beyond the current word, per the no-storage
    // requirement — every previous recording is explicitly freed.
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  },

  releaseMic() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
};

// ---- Gamification (lightweight, in-session only — nothing persisted) -----

const AFFIRMATIONS = ["Correct!", "Nice one!", "Got it!", "Well done!", "Spot on!", "Exactly right!"];
function pickAffirmation() {
  return AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
}

function renderScoreboard() {
  const bar = document.getElementById("scoreboard");
  if (!bar) return;
  bar.textContent =
    `★ ${state.score} pts` + (state.streak >= 2 ? `   🔥 ${state.streak} in a row` : "");
}

function awardPoints(n) {
  state.score += n;
  renderScoreboard();
}

function registerCorrectStreak() {
  state.streak++;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  renderScoreboard();
}

function registerWrongStreak() {
  state.streak = 0;
  renderScoreboard();
}

function starsFor(ratio) {
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.4) return 1;
  return 0;
}

// ---- Drill queue (discrimination + encode share this) ---------------------
// A "drill" runs the word list once, then automatically loops any wrong
// answers back in as a second (or third) round, so mistakes get repeated
// before the stage ends. A word that's wrong MAX_ATTEMPTS_PER_WORD times
// is let through without being mastered, so nobody gets stuck.

function newDrillState(items) {
  return {
    round: shuffle(items),
    idx: 0,
    attempts: {},
    firstPassCorrect: 0,
    totalWords: items.length,
    movedOn: [],
    nextRound: [],
    roundNumber: 1
  };
}

function drillKey(item) {
  return item.pattern + ":" + item.word;
}

function currentDrillItem(drill) {
  return drill.round[drill.idx];
}

function isDrillDone(drill) {
  return drill.idx >= drill.round.length && drill.nextRound.length === 0;
}

// Records the answer's outcome and returns the attempt number (1-based)
// for THIS word. Called once, immediately when the student answers.
function recordDrillAnswer(drill, item, wasCorrect) {
  const key = drillKey(item);
  const attemptNumber = (drill.attempts[key] || 0) + 1;
  drill.attempts[key] = attemptNumber;

  if (wasCorrect) {
    if (attemptNumber === 1) drill.firstPassCorrect++;
  } else if (attemptNumber >= MAX_ATTEMPTS_PER_WORD) {
    drill.movedOn.push(item);
  } else {
    drill.nextRound.push(item);
  }
  return attemptNumber;
}

// Moves to the next word, rolling missed words into a new round once the
// current one is exhausted. Called when the student taps "Next word".
function advanceDrillIndex(drill) {
  drill.idx++;
  if (drill.idx >= drill.round.length && drill.nextRound.length > 0) {
    drill.round = shuffle(drill.nextRound);
    drill.nextRound = [];
    drill.idx = 0;
    drill.roundNumber++;
  }
}

function drillSummaryCard(drill, label, onContinue, continueLabel) {
  const stars = starsFor(drill.totalWords ? drill.firstPassCorrect / drill.totalWords : 0);
  const card = el("div", { class: "card" }, [
    el("h2", {}, `${label} — done`),
    el("div", { class: "stars" }, "★".repeat(stars) + "☆".repeat(3 - stars)),
    el("p", {}, `${drill.firstPassCorrect} / ${drill.totalWords} correct on the first try.`)
  ]);
  if (drill.movedOn.length) {
    card.appendChild(
      el(
        "p",
        { class: "muted" },
        "Needs more practice next time: " + drill.movedOn.map((w) => w.word).join(", ")
      )
    );
  }
  card.appendChild(el("button", { class: "btn btn-primary", onclick: onContinue }, continueLabel));
  return card;
}

// Builds the kid-friendly explanation shown after a wrong answer, e.g.
// "When i and e go walking, the last one does the talking. The correct
// word was Arbeit. This word has the eye sound, so it needs the spelling ei."
function explainWrong(level, item, correctPattern) {
  return `${level.mnemonic} The correct word was "${item.word}". This word has the ${correctPattern.soundHint} sound, so it needs the spelling "${correctPattern.grapheme}".`;
}

// ---- Engine state ----------------------------------------------------

const state = {
  level: LEVELS[0],
  stageIndex: 0,
  stages: [],
  discrimination: { drill: null },
  production: { queue: [], i: 0 },
  final: { drill: null },
  score: 0,
  streak: 0,
  bestStreak: 0
};

function buildStageList() {
  // Extension point: once LEVELS.length > 1, splice an "interleaved
  // review" stage in here, between "production" and "final", sampling
  // words from levels[0..levelIndex-1]. Left as a single linear list for
  // Phase 1 since there is nothing yet to interleave.
  return ["intro", "discrimination", "production", "final"];
}

// Balanced sample: perPattern words from each of patternA/patternB, so a
// shortened drill still contrasts both patterns evenly rather than
// skewing toward whichever one the random sample favours.
function sampleWordList(level, perPattern) {
  const wordsA = sample(level.patternA.words, perPattern).map((w) => ({ word: w, pattern: "A" }));
  const wordsB = sample(level.patternB.words, perPattern).map((w) => ({ word: w, pattern: "B" }));
  return [...wordsA, ...wordsB];
}

function patternOf(level, key) {
  return key === "A" ? level.patternA : level.patternB;
}

function init() {
  state.stages = buildStageList();
  state.stageIndex = 0;
  renderScoreboard();
  renderStageDots();
  renderCurrentStage();
}

// ---- Rendering shell ---------------------------------------------------

const root = document.getElementById("exercise-root");

function renderStageDots() {
  const wrap = document.getElementById("stage-dots");
  wrap.innerHTML = "";
  const labels = {
    intro: "Rule",
    discrimination: "Listen",
    production: "Speak",
    final: "Dictation"
  };
  state.stages.forEach((s, i) => {
    const dot = el(
      "div",
      { class: "stage-dot" + (i === state.stageIndex ? " active" : i < state.stageIndex ? " done" : "") },
      labels[s]
    );
    wrap.appendChild(dot);
  });
}

function goToStage(i) {
  state.stageIndex = i;
  renderStageDots();
  renderCurrentStage();
  root.scrollIntoView({ behavior: "smooth", block: "start" });
}

function nextStage() {
  goToStage(Math.min(state.stageIndex + 1, state.stages.length - 1));
}

function renderCurrentStage() {
  root.innerHTML = "";
  const stage = state.stages[state.stageIndex];
  if (stage === "intro") renderIntro();
  else if (stage === "discrimination") renderDiscrimination();
  else if (stage === "production") renderProduction();
  else if (stage === "final") renderFinal();
}

// ---- Stage 1: Rule introduction ----------------------------------------

function renderIntro() {
  const level = state.level;
  const card = el("div", { class: "card intro-card" }, [
    el("h2", {}, level.title),
    el("p", { class: "mnemonic" }, `"${level.mnemonic}"`),
    el("div", { class: "pattern-pair" }, [
      renderPatternExample(level.patternA),
      el("div", { class: "vs" }, "vs"),
      renderPatternExample(level.patternB)
    ]),
    el("button", { class: "btn btn-primary", onclick: nextStage }, "I've got it — start listening →")
  ]);
  root.appendChild(card);
}

function renderPatternExample(pattern) {
  return el("div", { class: "pattern-example" }, [
    el("div", { class: "grapheme" }, `"${pattern.grapheme}"`),
    el("div", { class: "sound-label" }, pattern.label),
    el("div", { class: "example-word" }, pattern.exampleWord),
    playAudioButton(pattern.exampleWord, "▶ Hear " + pattern.exampleWord)
  ]);
}

// ---- Stage 2: Discrimination --------------------------------------------

function renderDiscrimination() {
  const level = state.level;
  if (!state.discrimination.drill) {
    state.discrimination.drill = newDrillState(sampleWordList(level, DISCRIMINATION_WORDS_PER_PATTERN));
  }
  const drill = state.discrimination.drill;

  if (isDrillDone(drill)) {
    root.appendChild(drillSummaryCard(drill, "Listening", nextStage, "Continue to speaking →"));
    return;
  }

  const item = currentDrillItem(drill);
  const pattern = patternOf(level, item.pattern);
  const otherPattern = item.pattern === "A" ? level.patternB : level.patternA;
  const buttons = shuffle([pattern, otherPattern]); // randomise button position each attempt
  const attemptNumber = (drill.attempts[drillKey(item)] || 0) + 1;

  const card = el("div", { class: "card" });
  if (drill.idx === 0 && drill.roundNumber > 1) {
    card.appendChild(el("div", { class: "round-banner" }, "Let's try the ones you missed again."));
  }
  card.appendChild(
    el(
      "div",
      { class: "progress-line" },
      `Word ${drill.idx + 1} of ${drill.round.length}` +
        (attemptNumber > 1 ? ` — attempt ${attemptNumber} of ${MAX_ATTEMPTS_PER_WORD}` : "")
    )
  );
  card.appendChild(el("h2", {}, "Which spelling did you hear?"));
  card.appendChild(playAudioButton(item.word, "▶ Play word"));

  const btnRow = el("div", { class: "choice-row" });
  buttons.forEach((p) => {
    const choice = el("button", { class: "btn btn-choice" }, `"${p.grapheme}" — ${p.soundHint} sound`);
    choice.addEventListener("click", () => handleDiscriminationAnswer(choice, btnRow, p, pattern, item, drill));
    btnRow.appendChild(choice);
  });
  card.appendChild(btnRow);
  card.appendChild(el("div", { class: "feedback", id: "disc-feedback" }));

  root.appendChild(card);
}

function handleDiscriminationAnswer(choiceBtn, btnRow, chosenPattern, correctPattern, item, drill) {
  const feedback = document.getElementById("disc-feedback");
  [...btnRow.children].forEach((b) => (b.disabled = true));
  const correct = chosenPattern.grapheme === correctPattern.grapheme;
  const attemptNumber = recordDrillAnswer(drill, item, correct);

  feedback.innerHTML = "";
  if (correct) {
    choiceBtn.classList.add("correct");
    registerCorrectStreak();
    awardPoints(attemptNumber === 1 ? 10 : 5);
    feedback.appendChild(el("p", { class: "feedback-text good" }, pickAffirmation()));
  } else {
    choiceBtn.classList.add("wrong");
    registerWrongStreak();
    feedback.appendChild(el("p", { class: "feedback-text bad" }, explainWrong(state.level, item, correctPattern)));
    feedback.appendChild(playAudioButton(item.word, "▶ Hear it again"));
    if (attemptNumber >= MAX_ATTEMPTS_PER_WORD) {
      feedback.appendChild(el("p", { class: "feedback-text muted" }, "That's three tries on this one — let's move on for now."));
    }
  }

  const goBtn = el(
    "button",
    {
      class: "btn btn-primary",
      onclick: () => {
        advanceDrillIndex(drill);
        renderCurrentStage();
      }
    },
    "Next word →"
  );
  feedback.appendChild(goBtn);
}

// ---- Stage 3: Production -------------------------------------------------

function renderProduction() {
  const level = state.level;
  if (!state.production.queue.length) {
    const wordsA = sample(level.patternA.words, PRODUCTION_WORDS_PER_PATTERN).map((w) => ({ word: w, pattern: "A" }));
    const wordsB = sample(level.patternB.words, PRODUCTION_WORDS_PER_PATTERN).map((w) => ({ word: w, pattern: "B" }));
    state.production.queue = shuffle([...wordsA, ...wordsB]);
    state.production.i = 0;
  }
  const p = state.production;
  Recorder.discardUrl(); // never carry a recording across renders

  if (p.i >= p.queue.length) {
    Recorder.releaseMic();
    root.appendChild(
      el("div", { class: "card" }, [
        el("h2", {}, "Speaking — done"),
        el("button", { class: "btn btn-primary", onclick: nextStage }, "Continue to dictation →")
      ])
    );
    return;
  }

  const item = p.queue[p.i];
  const card = el("div", { class: "card" }, [
    el("div", { class: "progress-line" }, `Word ${p.i + 1} of ${p.queue.length}`),
    el("h2", {}, "Say this word aloud"),
    el("div", { class: "example-word big" }, item.word)
  ]);

  const hint = el("div", { class: "muted hint" }, "Record yourself and play a recording back to unlock \"Next word\".");
  const nextBtn = el(
    "button",
    { class: "btn btn-primary", disabled: "true", onclick: () => advanceProduction() },
    "Next word →"
  );
  function unlockNext() {
    nextBtn.disabled = false;
    hint.textContent = "";
  }

  // Shared fallback for "no mic on this device", "permission denied", and
  // the explicit "No microphone" button below — same UI, same unlock rule:
  // Next stays locked until they've actually pressed play on something.
  function renderNoMicFallback(container, message, tone) {
    container.innerHTML = "";
    if (message) container.appendChild(el("p", { class: `feedback-text ${tone || "muted"}` }, message));
    const modelBtn = playAudioButton(item.word, "▶ Hear the model version");
    modelBtn.addEventListener("click", unlockNext);
    container.appendChild(modelBtn);
  }

  if (!Recorder.supported) {
    renderNoMicFallback(
      card,
      "Recording isn't supported in this browser, so you can only listen to the model version below.",
      "bad"
    );
    card.appendChild(hint);
    card.appendChild(nextBtn);
    root.appendChild(card);
    return;
  }

  const recordArea = el("div", { class: "record-area" });
  const recordBtn = el("button", { class: "btn btn-record" }, "● Record");
  const noMicBtn = el("button", { class: "btn btn-secondary" }, "No microphone");
  const status = el("div", { class: "record-status" }, "");
  const playbackRow = el("div", { class: "playback-row" });

  let recording = false;
  let awardedThisWord = false;

  noMicBtn.addEventListener("click", () => {
    renderNoMicFallback(recordArea, "No problem — just listen to the model version instead.");
    playbackRow.innerHTML = "";
  });

  recordBtn.addEventListener("click", async () => {
    if (recording) return;
    recording = true;
    recordBtn.disabled = true;
    noMicBtn.disabled = true;
    status.textContent = "Recording… tap stop when done.";
    playbackRow.innerHTML = ""; // clear any previous take while re-recording

    const stopBtn = el("button", { class: "btn btn-record-stop" }, "■ Stop");
    recordArea.appendChild(stopBtn);

    try {
      await Recorder.start();
    } catch (err) {
      renderNoMicFallback(recordArea, "Microphone access was denied or unavailable — listen to the model version instead.", "bad");
      recording = false;
      return;
    }

    stopBtn.addEventListener(
      "click",
      async () => {
        stopBtn.disabled = true;
        status.textContent = "Processing…";
        const url = await Recorder.stopAndGetUrl();
        stopBtn.remove();

        if (!url) {
          status.textContent = "Something went wrong with that recording — try again.";
        } else {
          status.textContent = "Got it — compare below.";
          playbackRow.innerHTML = "";
          playbackRow.appendChild(el("div", { class: "playback-label" }, "Your recording:"));
          const ownAudio = el("audio", { controls: "true", src: url });
          ownAudio.addEventListener("play", unlockNext);
          playbackRow.appendChild(ownAudio);
          playbackRow.appendChild(el("div", { class: "playback-label" }, "Model version:"));
          const modelBtn = playAudioButton(item.word, "▶ Play model version");
          modelBtn.addEventListener("click", unlockNext);
          playbackRow.appendChild(modelBtn);
          if (!awardedThisWord) {
            awardedThisWord = true;
            awardPoints(5);
          }
        }

        recordBtn.textContent = "● Record again";
        recordBtn.disabled = false;
        noMicBtn.disabled = false;
        recording = false;
      },
      { once: true }
    );
  });

  recordArea.appendChild(recordBtn);
  recordArea.appendChild(noMicBtn);
  recordArea.appendChild(status);
  card.appendChild(recordArea);
  card.appendChild(playbackRow);
  card.appendChild(hint);
  card.appendChild(nextBtn);

  root.appendChild(card);
}

function advanceProduction() {
  Recorder.discardUrl(); // delete recording as soon as we move on — never persisted
  state.production.i++;
  renderCurrentStage();
}

// ---- Stage 4: Final dictation (marked) ------------------------------------
// Each word is played slowly; the student types what they heard and the
// app checks it immediately, same drill engine as Listen — missed words
// repeat at the end, up to the usual 3-attempt cap, then a stars summary.

function dictationDrillItems(level) {
  return level.dictation.words.map((word) => ({
    word,
    pattern: level.patternA.words.includes(word) ? "A" : "B"
  }));
}

function renderFinal() {
  const level = state.level;
  if (!state.final.drill) {
    state.final.drill = newDrillState(dictationDrillItems(level));
  }
  const drill = state.final.drill;

  if (isDrillDone(drill)) {
    root.appendChild(drillSummaryCard(drill, "Dictation", finishLevel, "Finish level"));
    return;
  }

  const item = currentDrillItem(drill);
  const correctPattern = patternOf(level, item.pattern);
  const attemptNumber = (drill.attempts[drillKey(item)] || 0) + 1;

  const card = el("div", { class: "card" });
  if (drill.idx === 0 && drill.roundNumber > 1) {
    card.appendChild(el("div", { class: "round-banner" }, "Let's try the ones you missed again."));
  }
  card.appendChild(
    el(
      "div",
      { class: "progress-line" },
      `Word ${drill.idx + 1} of ${drill.round.length}` +
        (attemptNumber > 1 ? ` — attempt ${attemptNumber} of ${MAX_ATTEMPTS_PER_WORD}` : "")
    )
  );
  card.appendChild(el("h2", {}, "Dictation — type what you hear"));
  card.appendChild(el("p", { class: "muted" }, level.dictation.instructions));
  card.appendChild(playAudioButton(item.word, "▶ Play slowly", 0.6));

  const input = el("input", {
    class: "text-input mono",
    type: "text",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    placeholder: "Type the word…"
  });
  const submitBtn = el("button", { class: "btn btn-primary" }, "Check");
  const feedback = el("div", { class: "feedback", id: "final-feedback" });

  function submit() {
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    input.disabled = true;
    const correct = input.value.trim().toLowerCase() === item.word.toLowerCase();
    const attemptNum = recordDrillAnswer(drill, item, correct);

    feedback.innerHTML = "";
    if (correct) {
      registerCorrectStreak();
      awardPoints(attemptNum === 1 ? 10 : 5);
      feedback.appendChild(el("p", { class: "feedback-text good" }, pickAffirmation()));
    } else {
      registerWrongStreak();
      feedback.appendChild(el("p", { class: "feedback-text bad" }, explainWrong(level, item, correctPattern)));
      if (attemptNum >= MAX_ATTEMPTS_PER_WORD) {
        feedback.appendChild(el("p", { class: "feedback-text muted" }, "That's three tries on this one — let's move on for now."));
      }
    }
    feedback.appendChild(
      el(
        "button",
        {
          class: "btn btn-primary",
          onclick: () => {
            advanceDrillIndex(drill);
            renderCurrentStage();
          }
        },
        "Next word →"
      )
    );
  }

  submitBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  card.appendChild(el("div", { class: "type-row" }, [input, submitBtn]));
  card.appendChild(feedback);

  root.appendChild(card);
  input.focus();
}

function finishLevel() {
  const level = state.level;
  const missed = [
    ...(state.discrimination.drill ? state.discrimination.drill.movedOn : []),
    ...(state.final.drill ? state.final.drill.movedOn : [])
  ];
  const uniqueMissed = [...new Set(missed.map((m) => m.word))];

  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "card complete-card" }, [
      el("h2", {}, "Level complete"),
      el("p", {}, `"${level.patternA.grapheme}" vs "${level.patternB.grapheme}" — all ${state.stages.length} stages done.`),
      el("p", { class: "stars" }, `★ ${state.score} points   —   best streak 🔥 ${state.bestStreak}`),
      uniqueMissed.length
        ? el("p", { class: "muted" }, "Words to revisit next time: " + uniqueMissed.join(", "))
        : null,
      el("button", { class: "btn btn-secondary", onclick: restart }, "Restart this level")
    ])
  );
}

function restart() {
  state.stageIndex = 0;
  state.discrimination = { drill: null };
  state.production = { queue: [], i: 0 };
  state.final = { drill: null };
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  Recorder.discardUrl();
  Recorder.releaseMic();
  renderScoreboard();
  renderStageDots();
  renderCurrentStage();
}

// ---- Boot ------------------------------------------------------------

document.addEventListener("DOMContentLoaded", init);
