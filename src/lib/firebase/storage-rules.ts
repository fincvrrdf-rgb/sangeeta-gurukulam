/**
 * lib/firebase/storage-rules.ts — SERVER-ONLY
 *
 * Keeps the live Firebase Storage security rules in step with storage.rules
 * in this repo. Students upload straight from the browser with the Firebase
 * SDK, which only works if the published rules allow it — and the project
 * was left on old/expired rules. The server publishes ours (with the admin
 * service account) when they differ. Checked at most once per server
 * instance.
 */

import { getSecurityRules } from 'firebase-admin/security-rules';
import adminApp, { adminStorage } from '@/lib/firebase/admin';
import { STORAGE_RULES_SOURCE } from './storage-rules-source';

export type StorageRulesStatus = 'up_to_date' | 'published' | `failed: ${string}`;

const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();

let pending: Promise<StorageRulesStatus> | null = null;

async function check(): Promise<StorageRulesStatus> {
  const rules = getSecurityRules(adminApp);
  const bucket = adminStorage.bucket().name;
  try {
    const live = await rules.getStorageRuleset(bucket);
    if (live.source.some((f) => norm(f.content) === norm(STORAGE_RULES_SOURCE))) return 'up_to_date';
  } catch {
    // No ruleset released yet, or not readable: publish below
  }
  await rules.releaseStorageRulesetFromSource(STORAGE_RULES_SOURCE, bucket);
  return 'published';
}

/** Publish storage.rules if the live rules differ. Never throws. */
export function ensureStorageRules(): Promise<StorageRulesStatus> {
  if (!pending) {
    pending = check().catch((err) => {
      console.error('[STORAGE_RULES]', err);
      pending = null; // try again on the next request
      return `failed: ${err instanceof Error ? err.message : String(err)}` as const;
    });
  }
  return pending;
}
