/**
 * Contrastive Phonics — core exercise engine (Phase 1)
 *
 * This file knows nothing German-specific — it reads whatever is in
 * LEVELS (data.js) and drives the five-stage loop. Adding levels 2-14
 * later is a data.js change only.
 *
 * Extension point for later phases: INTERLEAVED REVIEW.
 * Once LEVELS.length > 1, insert a review stage that samples words from
 * previously-completed levels before the "encode" stage of a new level.
 * See buildStageList() below for exactly where that slots in.
 */

// ---- Tunable constants -----------------------------------------------
// How many words per pattern get a full record-and-compare treatment in
// the Production stage. Recording is effortful, so we sample rather than
// drilling all 8+8 words. Raise this once you've tested the loop.
const PRODUCTION_WORDS_PER_PATTERN = 3;

// ---- Small utilities ---------------------------------------------------

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

// ---- Text-to-speech ------------------------------------------------------

const TTS = {
  voice: null,
  ready: false,
  supported: "speechSynthesis" in window,
  loadVoices() {
    if (!this.supported) return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    // Prefer an explicitly German voice; fall back to any voice whose
    // lang starts with "de".
    this.voice =
      voices.find((v) => v.lang && v.lang.toLowerCase() === "de-de") ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("de")) ||
      null;
    this.ready = true;
    document.dispatchEvent(new CustomEvent("tts-ready"));
  },
  speak(text) {
    if (!this.supported) return false;
    speechSynthesis.cancel(); // avoid queueing pile-ups on rapid taps
    const utter = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utter.voice = this.voice;
      utter.lang = this.voice.lang;
    } else {
      utter.lang = "de-DE"; // best-effort even with no German voice installed
    }
    utter.rate = 0.95;
    speechSynthesis.speak(utter);
    return true;
  }
};

if (TTS.supported) {
  TTS.loadVoices();
  speechSynthesis.addEventListener("voiceschanged", () => TTS.loadVoices());
}

function playAudioButton(text, label = "▶ Play") {
  const btn = el("button", { class: "btn btn-audio" }, label);
  btn.addEventListener("click", () => {
    if (!TTS.supported) {
      flashUnsupported(btn);
      return;
    }
    if (!TTS.voice) {
      // Still attempt playback with the browser default voice — many
      // browsers will fall back reasonably — but warn once.
      warnNoGermanVoice();
    }
    TTS.speak(text);
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

// ---- Recording -----------------------------------------------------------

const Recorder = {
  supported: !!(navigator.mediaDevices && window.MediaRecorder),
  permissionState: "unknown", // unknown | granted | denied
  stream: null,
  recorder: null,
  chunks: [],
  currentUrl: null,

  async ensureStream() {
    if (this.stream) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.permissionState = "granted";
    return this.stream;
  },

  async start() {
    const stream = await this.ensureStream();
    this.chunks = [];
    this.recorder = new MediaRecorder(stream);
    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    const stopped = new Promise((resolve) => {
      this.recorder.addEventListener("stop", resolve, { once: true });
    });
    this.recorder.start();
    return stopped;
  },

  stop() {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
  },

  finish() {
    // Call after the 'stop' event has fired (i.e. after the promise from
    // start() resolves) to get the recorded blob.
    const blob = new Blob(this.chunks, { type: "audio/webm" });
    this.discardUrl();
    this.currentUrl = URL.createObjectURL(blob);
    return this.currentUrl;
  },

  discardUrl() {
    // Explicitly free the previous recording — nothing is persisted
    // beyond the current word, per the no-storage requirement.
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

// ---- Engine state ----------------------------------------------------

const state = {
  level: LEVELS[0],
  stageIndex: 0,
  stages: [],
  discrimination: { queue: [], i: 0, correct: 0, awaitingRetry: false },
  production: { queue: [], i: 0 },
  encode: { queue: [], i: 0, correct: 0 }
};

function buildStageList() {
  // Extension point: once LEVELS.length > 1, splice an "interleaved
  // review" stage in here, e.g. between "encode" and "final", sampling
  // words from levels[0..levelIndex-1]. Left as a single linear list for
  // Phase 1 since there is nothing yet to interleave.
  return ["intro", "discrimination", "production", "encode", "final"];
}

function wordList(level) {
  return [
    ...level.patternA.words.map((w) => ({ word: w, pattern: "A" })),
    ...level.patternB.words.map((w) => ({ word: w, pattern: "B" }))
  ];
}

function patternOf(level, key) {
  return key === "A" ? level.patternA : level.patternB;
}

function init() {
  state.stages = buildStageList();
  state.stageIndex = 0;
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
    encode: "Spell",
    final: "Sentence"
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
  else if (stage === "encode") renderEncode();
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
    el("div", { class: "ipa" }, `/${pattern.ipa}/ — ${pattern.label}`),
    el("div", { class: "example-word" }, pattern.exampleWord),
    playAudioButton(pattern.exampleWord, "▶ Hear " + pattern.exampleWord)
  ]);
}

// ---- Stage 2: Discrimination --------------------------------------------

function renderDiscrimination() {
  const level = state.level;
  if (!state.discrimination.queue.length) {
    state.discrimination.queue = shuffle(wordList(level));
    state.discrimination.i = 0;
    state.discrimination.correct = 0;
  }
  const d = state.discrimination;

  if (d.i >= d.queue.length) {
    root.appendChild(
      el("div", { class: "card" }, [
        el("h2", {}, "Listening — done"),
        el("p", {}, `${d.correct} / ${d.queue.length} correct on the first try.`),
        el("button", { class: "btn btn-primary", onclick: nextStage }, "Continue to speaking →")
      ])
    );
    return;
  }

  const item = d.queue[d.i];
  const pattern = patternOf(level, item.pattern);
  const otherPattern = item.pattern === "A" ? level.patternB : level.patternA;
  const buttons = shuffle([pattern, otherPattern]); // randomise button position each attempt

  const card = el("div", { class: "card" }, [
    el("div", { class: "progress-line" }, `Word ${d.i + 1} of ${d.queue.length}`),
    el("h2", {}, "Which spelling did you hear?"),
    playAudioButton(item.word, "▶ Play word")
  ]);

  const btnRow = el("div", { class: "choice-row" });
  buttons.forEach((p) => {
    const choice = el(
      "button",
      { class: "btn btn-choice" },
      `"${p.grapheme}"  /${p.ipa}/`
    );
    choice.addEventListener("click", () => handleDiscriminationAnswer(choice, btnRow, p, pattern, item));
    btnRow.appendChild(choice);
  });
  card.appendChild(btnRow);

  const feedback = el("div", { class: "feedback", id: "disc-feedback" });
  card.appendChild(feedback);

  root.appendChild(card);
}

function handleDiscriminationAnswer(choiceBtn, btnRow, chosenPattern, correctPattern, item) {
  const d = state.discrimination;
  const feedback = document.getElementById("disc-feedback");
  [...btnRow.children].forEach((b) => (b.disabled = true));

  if (chosenPattern.grapheme === correctPattern.grapheme) {
    choiceBtn.classList.add("correct");
    d.correct++;
    feedback.innerHTML = "";
    feedback.appendChild(el("p", { class: "feedback-text good" }, "Correct."));
    const goBtn = el("button", { class: "btn btn-primary", onclick: () => advanceDiscrimination() }, "Next word →");
    feedback.appendChild(goBtn);
  } else {
    choiceBtn.classList.add("wrong");
    feedback.innerHTML = "";
    feedback.appendChild(
      el("p", { class: "feedback-text bad" }, `Not quite — that was "${item.word}" (${correctPattern.grapheme}).`)
    );
    feedback.appendChild(playAudioButton(item.word, "▶ Hear it again"));
    const goBtn = el("button", { class: "btn btn-primary", onclick: () => advanceDiscrimination() }, "Next word →");
    feedback.appendChild(goBtn);
  }
}

function advanceDiscrimination() {
  state.discrimination.i++;
  renderCurrentStage();
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
        el("button", { class: "btn btn-primary", onclick: nextStage }, "Continue to spelling →")
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

  if (!Recorder.supported) {
    card.appendChild(
      el("p", { class: "feedback-text bad" }, "Recording isn't supported in this browser, so you can only listen to the model version below.")
    );
    card.appendChild(playAudioButton(item.word, "▶ Hear the model version"));
    card.appendChild(el("button", { class: "btn btn-primary", onclick: () => advanceProduction() }, "Next word →"));
    root.appendChild(card);
    return;
  }

  const recordArea = el("div", { class: "record-area" });
  const recordBtn = el("button", { class: "btn btn-record" }, "● Record");
  const status = el("div", { class: "record-status" }, "");
  const playbackRow = el("div", { class: "playback-row" });

  let recording = false;

  recordBtn.addEventListener("click", async () => {
    if (recording) return;
    recording = true;
    recordBtn.disabled = true;
    status.textContent = "Recording… tap stop when done.";
    const stopBtn = el("button", { class: "btn btn-record-stop" }, "■ Stop");
    recordArea.appendChild(stopBtn);

    let stoppedPromise;
    try {
      stoppedPromise = await Recorder.start();
    } catch (err) {
      Recorder.permissionState = "denied";
      status.textContent = "Microphone access was denied or unavailable. You can still hear the model version below.";
      stopBtn.remove();
      recordBtn.remove();
      card.appendChild(playAudioButton(item.word, "▶ Hear the model version"));
      card.appendChild(el("button", { class: "btn btn-primary", onclick: () => advanceProduction() }, "Next word →"));
      return;
    }

    stopBtn.addEventListener(
      "click",
      () => {
        Recorder.stop();
      },
      { once: true }
    );

    await stoppedPromise;
    stopBtn.remove();
    const url = Recorder.finish();
    status.textContent = "Got it — compare below.";
    playbackRow.innerHTML = "";
    playbackRow.appendChild(el("div", { class: "playback-label" }, "Your recording:"));
    playbackRow.appendChild(el("audio", { controls: "true", src: url }));
    playbackRow.appendChild(el("div", { class: "playback-label" }, "Model version:"));
    playbackRow.appendChild(playAudioButton(item.word, "▶ Play model version"));
    recordBtn.textContent = "● Record again";
    recordBtn.disabled = false;
    recording = false;
  });

  recordArea.appendChild(recordBtn);
  recordArea.appendChild(status);
  card.appendChild(recordArea);
  card.appendChild(playbackRow);
  card.appendChild(el("button", { class: "btn btn-primary", onclick: () => advanceProduction() }, "Next word →"));

  root.appendChild(card);
}

function advanceProduction() {
  Recorder.discardUrl(); // delete recording as soon as we move on — never persisted
  state.production.i++;
  renderCurrentStage();
}

// ---- Stage 4: Encode (fill-in-the-gap) -----------------------------------

function gapWord(word, grapheme) {
  const idx = word.toLowerCase().indexOf(grapheme.toLowerCase());
  if (idx === -1) return null; // shouldn't happen if data.js is well-formed
  return {
    before: word.slice(0, idx),
    after: word.slice(idx + grapheme.length)
  };
}

function renderEncode() {
  const level = state.level;
  if (!state.encode.queue.length) {
    state.encode.queue = shuffle(wordList(level));
    state.encode.i = 0;
    state.encode.correct = 0;
  }
  const e = state.encode;

  if (e.i >= e.queue.length) {
    root.appendChild(
      el("div", { class: "card" }, [
        el("h2", {}, "Spelling — done"),
        el("p", {}, `${e.correct} / ${e.queue.length} correct on the first try.`),
        el("button", { class: "btn btn-primary", onclick: nextStage }, "Continue to the final sentence →")
      ])
    );
    return;
  }

  const item = e.queue[e.i];
  const correctPattern = patternOf(level, item.pattern);
  const otherPattern = item.pattern === "A" ? level.patternB : level.patternA;
  const gap = gapWord(item.word, correctPattern.grapheme);
  const buttons = shuffle([correctPattern, otherPattern]);

  const card = el("div", { class: "card" }, [
    el("div", { class: "progress-line" }, `Word ${e.i + 1} of ${e.queue.length}`),
    el("h2", {}, "Fill the gap"),
    el("div", { class: "gap-word" }, [
      gap.before,
      el("span", { class: "gap-blank" }, "___"),
      gap.after
    ]),
    playAudioButton(item.word, "▶ Hear the word")
  ]);

  const btnRow = el("div", { class: "choice-row" });
  buttons.forEach((p) => {
    const choice = el("button", { class: "btn btn-choice mono" }, `"${p.grapheme}"`);
    choice.addEventListener("click", () => handleEncodeAnswer(choice, btnRow, p, correctPattern, item));
    btnRow.appendChild(choice);
  });
  card.appendChild(btnRow);
  card.appendChild(el("div", { class: "feedback", id: "encode-feedback" }));

  root.appendChild(card);
}

function handleEncodeAnswer(choiceBtn, btnRow, chosenPattern, correctPattern, item) {
  const e = state.encode;
  const feedback = document.getElementById("encode-feedback");
  [...btnRow.children].forEach((b) => (b.disabled = true));

  if (chosenPattern.grapheme === correctPattern.grapheme) {
    choiceBtn.classList.add("correct");
    e.correct++;
    feedback.innerHTML = "";
    feedback.appendChild(el("p", { class: "feedback-text good" }, `Correct — ${item.word}.`));
  } else {
    choiceBtn.classList.add("wrong");
    feedback.innerHTML = "";
    feedback.appendChild(el("p", { class: "feedback-text bad" }, `The word is ${item.word} (${correctPattern.grapheme}).`));
  }
  feedback.appendChild(el("button", { class: "btn btn-primary", onclick: () => advanceEncode() }, "Next word →"));
}

function advanceEncode() {
  state.encode.i++;
  renderCurrentStage();
}

// ---- Stage 5: Final sentence (not graded) --------------------------------

let sentencePlayed = false;
let sentencePlayCount = 0;

function renderFinal() {
  const level = state.level;
  const card = el("div", { class: "card" }, [
    el("h2", {}, "Final sentence"),
    el("p", {}, "Listen, then write this sentence in your exercise book."),
    playAudioButtonWithLog(level.sentence.text),
    el("div", { class: "sentence-note" }, "The app doesn't mark this one — your teacher will check your exercise book.")
  ]);

  const log = el("div", { class: "play-log", id: "sentence-log" }, sentenceLogText());
  card.appendChild(log);

  card.appendChild(
    el(
      "button",
      { class: "btn btn-primary", onclick: () => finishLevel() },
      "I've written it down — finish level"
    )
  );

  root.appendChild(card);
}

function sentenceLogText() {
  if (sentencePlayCount === 0) return "Not played yet.";
  return `Played ${sentencePlayCount} time${sentencePlayCount === 1 ? "" : "s"} this session.`;
}

function playAudioButtonWithLog(text) {
  const btn = playAudioButton(text, "▶ Play sentence");
  btn.addEventListener("click", () => {
    sentencePlayed = true;
    sentencePlayCount++;
    const log = document.getElementById("sentence-log");
    if (log) log.textContent = sentenceLogText();
  });
  return btn;
}

function finishLevel() {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "card complete-card" }, [
      el("h2", {}, "Level complete"),
      el("p", {}, `"${state.level.patternA.grapheme}" vs "${state.level.patternB.grapheme}" — all five stages done.`),
      el(
        "p",
        { class: "muted" },
        sentencePlayed ? "Final sentence was played — go write it up." : "Note: the final sentence was never played."
      ),
      el("button", { class: "btn btn-secondary", onclick: restart }, "Restart this level")
    ])
  );
}

function restart() {
  state.stageIndex = 0;
  state.discrimination = { queue: [], i: 0, correct: 0, awaitingRetry: false };
  state.production = { queue: [], i: 0 };
  state.encode = { queue: [], i: 0, correct: 0 };
  sentencePlayed = false;
  sentencePlayCount = 0;
  Recorder.discardUrl();
  Recorder.releaseMic();
  renderStageDots();
  renderCurrentStage();
}

// ---- Boot ------------------------------------------------------------

document.addEventListener("DOMContentLoaded", init);
