/**
 * Sa pitches and raga swara tables (just-intonation ratios to Sa), shared by
 * the Riyaz tuner and the AI recording review.
 */

export const SA_PITCHES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

export const PITCH_FREQS: Record<string, number> = {
  'C': 261.63, 'C#/Db': 277.18, 'D': 293.66, 'D#/Eb': 311.13,
  'E': 329.63, 'F': 349.23, 'F#/Gb': 369.99, 'G': 392.00,
  'G#/Ab': 415.30, 'A': 440.00, 'A#/Bb': 466.16, 'B': 493.88,
};

export type SwaraDef = { name: string; symbol: string; ratio: number };

// Ragas with just-intonation ratios relative to Sa
export const RAGAS: Record<string, { desc: string; swaras: SwaraDef[] }> = {
  'Maya Malava Gowla': {
    desc: 'Melakarta 15 · S R₁ G₃ M₁ P D₁ N₃',
    swaras: [
      { name: 'Sa',   symbol: 'S',  ratio: 1 },
      { name: 'Ri₁',  symbol: 'R₁', ratio: 16 / 15 },
      { name: 'Ga₃',  symbol: 'G₃', ratio: 5 / 4 },
      { name: 'Ma₁',  symbol: 'M₁', ratio: 4 / 3 },
      { name: 'Pa',   symbol: 'P',  ratio: 3 / 2 },
      { name: 'Dha₁', symbol: 'D₁', ratio: 8 / 5 },
      { name: 'Ni₃',  symbol: 'N₃', ratio: 15 / 8 },
    ],
  },
  'Shankarabharanam': {
    desc: 'Melakarta 29 · S R₂ G₃ M₁ P D₂ N₃',
    swaras: [
      { name: 'Sa',   symbol: 'S',  ratio: 1 },
      { name: 'Ri₂',  symbol: 'R₂', ratio: 9 / 8 },
      { name: 'Ga₃',  symbol: 'G₃', ratio: 5 / 4 },
      { name: 'Ma₁',  symbol: 'M₁', ratio: 4 / 3 },
      { name: 'Pa',   symbol: 'P',  ratio: 3 / 2 },
      { name: 'Dha₂', symbol: 'D₂', ratio: 5 / 3 },
      { name: 'Ni₃',  symbol: 'N₃', ratio: 15 / 8 },
    ],
  },
  'Kharaharapriya': {
    desc: 'Melakarta 22 · S R₂ G₂ M₁ P D₂ N₂',
    swaras: [
      { name: 'Sa',   symbol: 'S',  ratio: 1 },
      { name: 'Ri₂',  symbol: 'R₂', ratio: 9 / 8 },
      { name: 'Ga₂',  symbol: 'G₂', ratio: 6 / 5 },
      { name: 'Ma₁',  symbol: 'M₁', ratio: 4 / 3 },
      { name: 'Pa',   symbol: 'P',  ratio: 3 / 2 },
      { name: 'Dha₂', symbol: 'D₂', ratio: 5 / 3 },
      { name: 'Ni₂',  symbol: 'N₂', ratio: 9 / 5 },
    ],
  },
  'Mohanam': {
    desc: 'Pentatonic · S R₂ G₃ P D₂',
    swaras: [
      { name: 'Sa',   symbol: 'S',  ratio: 1 },
      { name: 'Ri₂',  symbol: 'R₂', ratio: 9 / 8 },
      { name: 'Ga₃',  symbol: 'G₃', ratio: 5 / 4 },
      { name: 'Pa',   symbol: 'P',  ratio: 3 / 2 },
      { name: 'Dha₂', symbol: 'D₂', ratio: 5 / 3 },
    ],
  },
  'Bilahari': {
    desc: 'Janya 29 · S R₂ G₃ P D₂ (N₃)',
    swaras: [
      { name: 'Sa',   symbol: 'S',  ratio: 1 },
      { name: 'Ri₂',  symbol: 'R₂', ratio: 9 / 8 },
      { name: 'Ga₃',  symbol: 'G₃', ratio: 5 / 4 },
      { name: 'Pa',   symbol: 'P',  ratio: 3 / 2 },
      { name: 'Dha₂', symbol: 'D₂', ratio: 5 / 3 },
      { name: 'Ni₃',  symbol: 'N₃', ratio: 15 / 8 },
    ],
  },
  'Hamsadhwani': {
    desc: 'Pentatonic · S R₂ G₃ P N₃',
    swaras: [
      { name: 'Sa',   symbol: 'S',  ratio: 1 },
      { name: 'Ri₂',  symbol: 'R₂', ratio: 9 / 8 },
      { name: 'Ga₃',  symbol: 'G₃', ratio: 5 / 4 },
      { name: 'Pa',   symbol: 'P',  ratio: 3 / 2 },
      { name: 'Ni₃',  symbol: 'N₃', ratio: 15 / 8 },
    ],
  },
  'Hindolam': {
    desc: 'Pentatonic · S G₂ M₁ D₁ N₂',
    swaras: [
      { name: 'Sa',   symbol: 'S',  ratio: 1 },
      { name: 'Ga₂',  symbol: 'G₂', ratio: 6 / 5 },
      { name: 'Ma₁',  symbol: 'M₁', ratio: 4 / 3 },
      { name: 'Dha₁', symbol: 'D₁', ratio: 8 / 5 },
      { name: 'Ni₂',  symbol: 'N₂', ratio: 9 / 5 },
    ],
  },
};

export const RAGA_NAMES = Object.keys(RAGAS);

/** Look up a raga by name, forgiving spacing/case/spelling variants. */
export function findRaga(name: string | null | undefined): { name: string; swaras: SwaraDef[] } | null {
  if (!name) return null;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
  const want = norm(name);
  for (const key of RAGA_NAMES) {
    if (norm(key) === want) return { name: key, swaras: RAGAS[key].swaras };
  }
  return null;
}

/** All 12 swarasthanas — used when a raga isn't in the table. */
export const ALL_SWARASTHANAS: SwaraDef[] = [
  { name: 'Sa', symbol: 'S', ratio: 1 },
  { name: 'Ri₁', symbol: 'R₁', ratio: 16 / 15 },
  { name: 'Ri₂', symbol: 'R₂', ratio: 9 / 8 },
  { name: 'Ga₂', symbol: 'G₂', ratio: 6 / 5 },
  { name: 'Ga₃', symbol: 'G₃', ratio: 5 / 4 },
  { name: 'Ma₁', symbol: 'M₁', ratio: 4 / 3 },
  { name: 'Ma₂', symbol: 'M₂', ratio: 45 / 32 },
  { name: 'Pa', symbol: 'P', ratio: 3 / 2 },
  { name: 'Dha₁', symbol: 'D₁', ratio: 8 / 5 },
  { name: 'Dha₂', symbol: 'D₂', ratio: 5 / 3 },
  { name: 'Ni₂', symbol: 'N₂', ratio: 9 / 5 },
  { name: 'Ni₃', symbol: 'N₃', ratio: 15 / 8 },
];
