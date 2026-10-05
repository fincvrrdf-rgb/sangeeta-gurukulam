/**
 * lib/storage/migrate.ts — SERVER-ONLY
 *
 * Copies files uploaded to Firebase Storage (before the move) into Supabase
 * Storage and repoints the records:
 *   - lyrics attachments  → public `materials` bucket (new permanent URL)
 *   - resources           → public `materials` bucket
 *   - payment proofs      → private `payment-proofs` bucket
 *   - practice recordings → private `recordings` bucket
 * Safe to run repeatedly: anything already on Supabase is skipped. A file that
 * can't be read from Firebase is reported and left as it was.
 */

import { adminStorage } from '@/lib/firebase/admin';
import { queryDocs, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { BUCKETS, supabasePublicUrl, uploadToSupabase } from '@/lib/storage/supabase';

type Doc = Record<string, unknown> & { id: string };

export interface MigrationReport {
  moved: number;
  alreadyMoved: number;
  failed: { what: string; reason: string }[];
  pending: number; // dry run: how many would be moved
}

/** Firebase download URL / gs:// URL / plain path → { bucket?, path } */
function firebaseLocation(ref: string): { bucket?: string; path: string } | null {
  if (!ref) return null;
  const dl = ref.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
  if (dl) return { bucket: dl[1], path: decodeURIComponent(dl[2]) };
  const gs = ref.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (gs) return { bucket: gs[1], path: gs[2] };
  const gcs = ref.match(/storage\.googleapis\.com\/([^/]+)\/([^?]+)/);
  if (gcs) return { bucket: gcs[1], path: decodeURIComponent(gcs[2]) };
  if (/^https?:\/\//.test(ref)) return null; // some other website — not ours
  return { path: ref.replace(/^\/+/, '') };
}

async function copyFromFirebase(
  loc: { bucket?: string; path: string },
  toBucket: string,
  toPath: string,
): Promise<string> {
  const file = (loc.bucket ? adminStorage.bucket(loc.bucket) : adminStorage.bucket()).file(loc.path);
  const [[buffer], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  const contentType = (meta.contentType as string) || 'application/octet-stream';
  await uploadToSupabase(toPath, buffer, contentType, toBucket);
  return contentType;
}

const isSupabaseUrl = (u: unknown) => typeof u === 'string' && u.includes('.supabase.co/');
const baseName = (p: string) => p.split('/').pop() || 'file';

export async function migrateFirebaseFiles(dryRun: boolean): Promise<MigrationReport> {
  const report: MigrationReport = { moved: 0, alreadyMoved: 0, failed: [], pending: 0 };

  // Lyrics attachments
  for (const doc of await queryDocs<Doc>(COLLECTIONS.LYRICS, [])) {
    const files = Array.isArray(doc.attachedFiles) ? (doc.attachedFiles as Record<string, unknown>[]) : [];
    if (!files.length) continue;
    let changed = false;
    const next: Record<string, unknown>[] = [];
    for (const f of files) {
      const ref = String(f.storageRef ?? '');
      const loc = isSupabaseUrl(ref) ? null : firebaseLocation(ref);
      if (!loc) { if (isSupabaseUrl(ref)) report.alreadyMoved++; next.push(f); continue; }
      if (dryRun) { report.pending++; next.push(f); continue; }
      try {
        const path = `lyrics/${doc.id}/${baseName(loc.path)}`;
        await copyFromFirebase(loc, BUCKETS.materials, path);
        next.push({ ...f, storageRef: supabasePublicUrl(BUCKETS.materials, path), migratedFrom: ref });
        report.moved++;
        changed = true;
      } catch (e) {
        report.failed.push({ what: `Lyrics "${doc.title ?? doc.id}" — ${f.name ?? baseName(loc.path)}`, reason: errText(e) });
        next.push(f);
      }
    }
    if (changed) await updateDoc(COLLECTIONS.LYRICS, doc.id, { attachedFiles: next, updatedAt: nowISO() });
  }

  // Resources
  for (const doc of await queryDocs<Doc>(COLLECTIONS.RESOURCES, [])) {
    const ref = String(doc.storageRef ?? '');
    if (isSupabaseUrl(ref)) { report.alreadyMoved++; continue; }
    const loc = firebaseLocation(ref);
    if (!loc) continue;
    if (dryRun) { report.pending++; continue; }
    try {
      const path = `resources/${doc.id}/${baseName(loc.path)}`;
      await copyFromFirebase(loc, BUCKETS.materials, path);
      await updateDoc(COLLECTIONS.RESOURCES, doc.id, {
        storageRef: supabasePublicUrl(BUCKETS.materials, path),
        migratedFrom: ref,
        updatedAt: nowISO(),
      });
      report.moved++;
    } catch (e) {
      report.failed.push({ what: `Resource "${doc.title ?? doc.id}"`, reason: errText(e) });
    }
  }

  // Payment proofs
  for (const doc of await queryDocs<Doc>(COLLECTIONS.PAYMENT_PROOF_UPLOADS, [])) {
    if (doc.storageProvider === 'supabase') { report.alreadyMoved++; continue; }
    const loc = firebaseLocation(String(doc.storageRef ?? ''));
    if (!loc) continue;
    if (dryRun) { report.pending++; continue; }
    try {
      const path = loc.path.replace(/^payment_proofs\//, '');
      await copyFromFirebase(loc, BUCKETS.paymentProofs, path);
      await updateDoc(COLLECTIONS.PAYMENT_PROOF_UPLOADS, doc.id, {
        storageRef: path,
        storageProvider: 'supabase',
        migratedFrom: loc.path,
        updatedAt: nowISO(),
      });
      report.moved++;
    } catch (e) {
      report.failed.push({ what: `Payment proof ${doc.cycleMonth ?? doc.id}`, reason: errText(e) });
    }
  }

  // Practice recordings
  for (const doc of await queryDocs<Doc>(COLLECTIONS.PRACTICE_RECORDINGS, [])) {
    if (doc.storageProvider === 'supabase') { report.alreadyMoved++; continue; }
    const loc = firebaseLocation(String(doc.storagePath ?? doc.storageRef ?? ''));
    if (!loc) continue;
    if (dryRun) { report.pending++; continue; }
    try {
      await copyFromFirebase(loc, BUCKETS.recordings, loc.path);
      await updateDoc(COLLECTIONS.PRACTICE_RECORDINGS, doc.id, {
        storagePath: loc.path,
        storageProvider: 'supabase',
        updatedAt: nowISO(),
      });
      report.moved++;
    } catch (e) {
      report.failed.push({ what: `Recording ${doc.fileName ?? doc.id}`, reason: errText(e) });
    }
  }

  return report;
}

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/No such object|404/i.test(msg)) return 'The file is not in Firebase Storage (the original upload never finished). Please upload it again.';
  if (/billing|402|requires a billing/i.test(msg)) return 'Firebase refused to hand over the file (storage billing). Please upload it again.';
  return msg.slice(0, 200);
}
