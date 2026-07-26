/**
 * LEVELS
 * ------
 * Each entry is one contrastive-phonics level. The engine (app.js) reads
 * this structure generically — it does not know anything about German,
 * "ie" or "ei" specifically. To add Level 2, append another object with
 * the same shape; nothing in app.js or index.html needs to change.
 *
 * Word bank rule (see build notes at the bottom of this file):
 * every word in patternA.words must contain patternA.grapheme exactly
 * once, spelled unambiguously as that grapheme (same for patternB).
 * Words that are phonetically similar but spelled a third way (e.g.
 * "Bayern" for the /aɪ/ sound) must NOT appear here — that ambiguity is
 * fine for a later "spot the odd spelling" level, but would make this
 * discrimination/encode pair misleading.
 */

const LEVELS = [
  {
    id: "ie-ei",
    title: '"ie" vs "ei"',
    patternA: {
      grapheme: "ie",
      soundHint: "long ee", // plain-English description, no IPA notation
      label: "long ee, like English 'see'",
      exampleWord: "Liebe",
      words: ["Liebe", "Bier", "Fieber", "Tier", "viel", "Brief", "Miete", "Sie"]
    },
    patternB: {
      grapheme: "ei",
      soundHint: "eye",
      label: "like English 'eye'",
      exampleWord: "Bein",
      words: ["Bein", "klein", "Arbeit", "Wein", "Kleid", "Eis", "Reise", "Weise"]
    },
    mnemonic: "When i and e go walking, the last one does the talking.",
    dictation: {
      instructions: "Listen to each word — it's read slowly. Write it in your homework book.",
      words: ["Brief", "Arbeit", "Tier", "Kleid", "Miete"]
    }
  }
];

/**
 * BUILD NOTES (for whoever edits this file later):
 * - "viel" and "Sie" are the shortest ie-words; short items make good
 *   discrimination/encode items but are less interesting to record aloud
 *   — kept in for now, revisit if Production stage drags for these two.
 * - Dictation list (3 "ie" + 2 "ei") replaces the earlier capstone
 *   sentence — pulled from the existing word banks rather than new
 *   vocabulary, so nothing here is a word students haven't already met
 *   in this level. First draft — swap words if you want a different mix.
 * - This word list is a first draft and has not been checked against a
 *   frequency list or the AQA GCSE German vocabulary list — sanity-check
 *   before scaling to more levels.
 */
