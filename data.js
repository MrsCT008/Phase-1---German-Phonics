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
 * level's discrimination/spelling pair misleading.
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
      words: ["Liebe", "Bier", "Fieber", "Tier", "viel", "Brief", "Miete", "Sie", "hier"]
    },
    patternB: {
      grapheme: "ei",
      soundHint: "eye",
      label: "like English 'eye'",
      exampleWord: "Bein",
      words: ["Bein", "klein", "Arbeit", "Wein", "Kleid", "Eis", "Reise", "Weise", "ein", "mein"]
    },
    mnemonic: "When i and e go walking, the last one does the talking.",
    production: {
      words: ["ein", "Bein", "Tier", "Bier", "Brief", "klein"]
    },
    spelling: {
      words: ["ein", "Bein", "Tier", "Bier", "Brief", "klein"]
    },
    dictation: {
      instructions: "Listen to each word — it's read slowly. Write it in your Homework book.",
      words: ["Eis", "Tier", "hier", "klein", "mein", "sie"]
    }
  }
];

/**
 * BUILD NOTES (for whoever edits this file later):
 * - "viel" and "Sie" are the shortest ie-words; short items make good
 *   discrimination items but are less interesting to record aloud
 *   — kept in for now, revisit if Production stage drags for these two.
 * - "ein", "hier" and "mein" were added to the patternB/patternA word
 *   banks specifically to support the Production/Spelling/Dictation word
 *   lists below — they also widen the pool the Listen stage samples from.
 * - Production and Spelling currently use the identical 6-word list
 *   (ein, Bein, Tier, Bier, Brief, klein) — same words, heard in Speak
 *   then spelled in Spell. Give Spelling its own list here if you'd
 *   rather they not overlap.
 * - Dictation is NOT marked by the app — students write each word in
 *   their Homework book and the teacher checks it — so its 6-word list
 *   isn't filtered for "untaught" German letter sounds the way the
 *   in-app graded exercises are. Worth noting: "sie" starts with the
 *   same word-initial s → z sound as "Sie" — harmless since nothing
 *   here grades spelling, but flag it if that sound hasn't been taught
 *   yet and you'd rather swap it out.
 * - This word list is a first draft and has not been checked against a
 *   frequency list or the AQA GCSE German vocabulary list — sanity-check
 *   before scaling to more levels.
 */
