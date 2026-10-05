/**
 * lib/classes/dedupe.ts — SERVER-ONLY
 *
 * A batch has at most one class per day. Duplicates crept in because several
 * active slots existed for the same batch + weekday (default schedule created
 * more than once, re-seeded batch IDs), and generation only de-duplicated per
 * slot. Everything here keys on batch CODE + day instead, so re-seeded batch
 * IDs still collapse together.
 */

import { queryDocs, updateDoc, deleteDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';

type Doc = Record<string, unknown> & { id: string };

/** batchBandId → batch code ('A'..'D'). */
export async function loadBandCodes(): Promise<Record<string, string>> {
  const bands = await queryDocs<Doc>(COLLECTIONS.BATCH_BANDS, []);
  const map: Record<string, string> = {};
  for (const b of bands) if (b.code) map[b.id] = String(b.code).toUpperCase();
  return map;
}

export function batchKey(bandCodes: Record<string, string>, batchBandId: unknown): string {
  const id = String(batchBandId ?? '');
  return bandCodes[id] ?? id;
}

/**
 * Pick one slot per batch + weekday. Among duplicates, the start time shared
 * by most of them wins (ties → most recently updated), so a stray slot with
 * the wrong time doesn't override the real schedule.
 */
export function splitCanonicalSlots<T extends Doc>(
  slots: T[],
  bandCodes: Record<string, string>,
): { keep: T[]; duplicates: T[] } {
  const groups = new Map<string, T[]>();
  for (const s of slots) {
    const key = `${batchKey(bandCodes, s.batchBandId)}|${s.dayOfWeek}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const keep: T[] = [];
  const duplicates: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { keep.push(group[0]); continue; }
    const timeVotes = new Map<string, number>();
    for (const s of group) {
      const t = String(s.startTimeLocal ?? '');
      timeVotes.set(t, (timeVotes.get(t) ?? 0) + 1);
    }
    const sorted = [...group].sort((a, b) => {
      const votes = (timeVotes.get(String(b.startTimeLocal ?? '')) ?? 0) - (timeVotes.get(String(a.startTimeLocal ?? '')) ?? 0);
      if (votes !== 0) return votes;
      if (!!b.startTimeLocal !== !!a.startTimeLocal) return b.startTimeLocal ? 1 : -1;
      return String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? ''));
    });
    keep.push(sorted[0]);
    duplicates.push(...sorted.slice(1));
  }
  return { keep, duplicates };
}

/** Deactivate duplicate slots so they stop generating classes. Returns how many. */
export async function deactivateDuplicateSlots(bandCodes: Record<string, string>): Promise<number> {
  const slots = await queryDocs<Doc>(COLLECTIONS.CLASS_SLOTS, [
    { type: 'where', field: 'isActive', op: '==', value: true },
  ]);
  const { keep, duplicates } = splitCanonicalSlots(slots, bandCodes);
  const keptByKey = new Map(keep.map((s) => [`${batchKey(bandCodes, s.batchBandId)}|${s.dayOfWeek}`, s.id]));
  for (const s of duplicates) {
    await updateDoc(COLLECTIONS.CLASS_SLOTS, s.id, {
      isActive: false,
      deactivatedReason: 'duplicate_slot',
      duplicateOf: keptByKey.get(`${batchKey(bandCodes, s.batchBandId)}|${s.dayOfWeek}`) ?? null,
      updatedAt: nowISO(),
    });
  }
  return duplicates.length;
}

export interface DedupeResult {
  groupsFound: number;
  deleted: number;
  /** Duplicates left in place because attendance was already marked on them. */
  keptWithAttendance: number;
  details: string[];
}

/**
 * Remove duplicate class instances (same batch + same date). Keeps the copy
 * that has attendance, else a non-cancelled one, else the oldest. Never
 * deletes an instance that has attendance records.
 */
export async function removeDuplicateInstances(
  bandCodes: Record<string, string>,
  range?: { from: string; to: string },
): Promise<DedupeResult> {
  const instances = await queryDocs<Doc>(
    COLLECTIONS.CLASS_INSTANCES,
    range
      ? [
          { type: 'where', field: 'scheduledStartTime', op: '>=', value: range.from },
          { type: 'where', field: 'scheduledStartTime', op: '<=', value: range.to },
        ]
      : [],
  );

  const groups = new Map<string, Doc[]>();
  for (const inst of instances) {
    const date = String(inst.scheduledStartTime ?? '').slice(0, 10);
    if (!date) continue;
    const key = `${batchKey(bandCodes, inst.batchBandId)}|${date}`;
    groups.set(key, [...(groups.get(key) ?? []), inst]);
  }

  const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
  const result: DedupeResult = { groupsFound: dupGroups.length, deleted: 0, keptWithAttendance: 0, details: [] };
  if (dupGroups.length === 0) return result;

  // Which of the duplicated instances already have attendance?
  const withAttendance = new Set<string>();
  const dupIds = dupGroups.flatMap(([, g]) => g.map((i) => i.id));
  for (let i = 0; i < dupIds.length; i += 30) {
    const records = await queryDocs<Doc>(COLLECTIONS.ATTENDANCE_RECORDS, [
      { type: 'where', field: 'classInstanceId', op: 'in', value: dupIds.slice(i, i + 30) },
    ]);
    for (const r of records) withAttendance.add(String(r.classInstanceId));
  }

  const isCancelled = (i: Doc) => String(i.status ?? '').includes('cancel');
  for (const [key, group] of dupGroups) {
    const sorted = [...group].sort((a, b) => {
      const att = Number(withAttendance.has(b.id)) - Number(withAttendance.has(a.id));
      if (att !== 0) return att;
      const live = Number(isCancelled(a)) - Number(isCancelled(b));
      if (live !== 0) return live;
      return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
    });
    let deletedHere = 0;
    for (const extra of sorted.slice(1)) {
      if (withAttendance.has(extra.id)) { result.keptWithAttendance++; continue; }
      await deleteDoc(COLLECTIONS.CLASS_INSTANCES, extra.id);
      deletedHere++;
    }
    result.deleted += deletedHere;
    result.details.push(`${key}: ${group.length} copies → removed ${deletedHere}`);
  }
  return result;
}
