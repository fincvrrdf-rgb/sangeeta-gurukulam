/**
 * lib/classes/links.ts — SERVER-ONLY
 *
 * Which Google Meet link a class uses:
 *  1. a link set on the class itself (extra / group classes)
 *  2. for a student's own class, that student's personal Meet link
 *  3. for a group class without its own link, the first student's link
 *  4. otherwise the batch link (admin-set, or the batch default)
 */

import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS, DEFAULT_BATCH_MEET_LINKS } from '@/domain/constants';

type Doc = Record<string, unknown> & { id: string };

export interface LinkContext {
  batchLinkById: Record<string, string>;   // batchBandId → link
  studentLinkById: Record<string, string>; // studentId → personal link
}

export async function loadLinkContext(profiles?: Doc[]): Promise<LinkContext> {
  const [bands, students] = await Promise.all([
    queryDocs<Doc>(COLLECTIONS.BATCH_BANDS, []),
    profiles ? Promise.resolve(profiles) : queryDocs<Doc>(COLLECTIONS.STUDENT_PROFILES, []),
  ]);
  const batchLinkById: Record<string, string> = {};
  for (const b of bands) {
    const link = (b.meetLink as string) || DEFAULT_BATCH_MEET_LINKS[String(b.code ?? '')];
    if (link) batchLinkById[b.id] = link;
  }
  const studentLinkById: Record<string, string> = {};
  for (const p of students) if (p.meetLink) studentLinkById[p.id] = String(p.meetLink);
  return { batchLinkById, studentLinkById };
}

export function resolveClassLink(inst: Record<string, unknown>, ctx: LinkContext): string | null {
  if (inst.customMeetLink) return String(inst.customMeetLink);
  const ids = Array.isArray(inst.studentIds) ? (inst.studentIds as unknown[]).map(String) : [];
  for (const id of ids) if (ctx.studentLinkById[id]) return ctx.studentLinkById[id];
  return ctx.batchLinkById[String(inst.batchBandId ?? '')] ?? null;
}

/** Normalise a pasted Meet link ("meet.google.com/abc-defg-hij" → https://…). */
export function normaliseMeetLink(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
