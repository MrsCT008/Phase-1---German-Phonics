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
 * level's discrimination/dictation pair misleading.
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
      instructions: "Listen to each word — it's read slowly. Type what you hear.",
      words: ["Liebe", "Bier", "Fieber", "Tier", "Brief", "Miete", "Bein", "klein", "Arbeit", "Kleid", "Eis"]
    }
  }
];

/**
 * BUILD NOTES (for whoever edits this file later):
 * - "viel" and "Sie" are the shortest ie-words; short items make good
 *   discrimination items but are less interesting to record aloud
 *   — kept in for now, revisit if Production stage drags for these two.
 * - Dictation is now marked in-app (the student types what they hear), so
 *   its word list is restricted to words where every letter OTHER than
 *   ie/ei is pronounced the same way it would be in English — nothing
 *   the class hasn't been taught the sound for yet. Excluded on that
 *   basis, with the untaught letter in brackets: "viel" (v → f sound),
 *   "Sie" (word-initial s → z sound), "Wein" and "Weise" (w → v sound).
 *   "Reise" is also left out — its "s" sits between two vowels, which
 *   Germans voice the same way as word-initial s; this one's a closer
 *   call than the others, so add it back in if that's not a distinction
 *   you want to worry about yet. German "r" was NOT treated as a reason
 *   to exclude a word (Bier/Tier/Brief/Arbeit/Fieber/Miete are all kept
 *   in) — flag this if your students need that taught first too, since
 *   excluding r-words as well would cut the list down a lot further.
 * - This word list is a first draft and has not been checked against a
 *   frequency list or the AQA GCSE German vocabulary list — sanity-check
 *   before scaling to more levels.
 */
