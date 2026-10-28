// Copies storage.rules into a TypeScript module so the server can publish
// the rules to Firebase (src/lib/firebase/storage-rules.ts). Runs before
// every build; the generated file is committed too.
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
writeFileSync(
  new URL('../src/lib/firebase/storage-rules-source.ts', import.meta.url),
  '// GENERATED from storage.rules by scripts/gen-storage-rules.mjs — edit storage.rules instead.\n' +
    `export const STORAGE_RULES_SOURCE = ${JSON.stringify(source)};\n`,
);
