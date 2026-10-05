/**
 * API: GET /api/attendance/joins?days=14
 *
 * Attendance as recorded by students clicking their batch's Join link
 * (POST /api/attendance/auto). Returns one entry per batch per class day —
 * duplicate class instances for the same batch + date are merged — with the
 * students who joined (join time, on time / late) and those who didn't.
 * Teacher / admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { loadBandCodes, batchKey } from '@/lib/classes/dedupe';

export const dynamic = 'force-dynamic';

type Doc = Record<string, unknown> & { id: string };

export interface JoinEntry {
  studentId: string;
  name: string;
  status: string;           // attended | late | absent | …
  joinedAt: string | null;  // when the Join link was clicked
  lateByMinutes: number;
  viaLink: boolean;         // false = marked manually by teacher
}

export interface ClassJoins {
  key: string;              // "A|2026-09-28"
  instanceId: string;       // the class copy to open for manual edits
  batch: string;
  date: string;             // YYYY-MM-DD (IST)
  start: string;            // ISO
  end: string;
  cancelled: boolean;
  enrolled: number;
  joined: JoinEntry[];
  notJoined: { studentId: string; name: string }[];
}

function istDate(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

const STATUS_RANK: Record<string, number> = { attended: 3, late: 2, excused: 1, absent: 0 };

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);

    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days')) || 14, 1), 60);
    const from = istDate(-days);
    const today = istDate(0);

    const [bandCodes, instances, profiles] = await Promise.all([
      loadBandCodes(),
      queryDocs<Doc>(COLLECTIONS.CLASS_INSTANCES, [
        { type: 'where', field: 'scheduledStartTime', op: '>=', value: `${from}T00:00:00+05:30` },
        { type: 'where', field: 'scheduledStartTime', op: '<=', value: `${today}T23:59:59+05:30` },
      ]),
      queryDocs<Doc>(COLLECTIONS.STUDENT_PROFILES, []),
    ]);

    // Enrolled students per batch code
    const studentsByBatch = new Map<string, { studentId: string; name: string }[]>();
    const nameById = new Map<string, string>();
    for (const p of profiles) {
      const name = (p.fullName as string) || 'Student';
      nameById.set(p.id, name);
      if (p.isActive === false || !p.currentBatchBandId) continue;
      const code = batchKey(bandCodes, p.currentBatchBandId);
      studentsByBatch.set(code, [...(studentsByBatch.get(code) ?? []), { studentId: p.id, name }]);
    }

    // Group class instances by batch + date
    const groups = new Map<string, Doc[]>();
    for (const inst of instances) {
      const date = String(inst.scheduledStartTime ?? '').slice(0, 10);
      if (!date) continue;
      const key = `${batchKey(bandCodes, inst.batchBandId)}|${date}`;
      groups.set(key, [...(groups.get(key) ?? []), inst]);
    }

    // Attendance for all those instances ('in' takes at most 30 values)
    const ids = instances.map((i) => i.id);
    const records: Doc[] = [];
    for (let i = 0; i < ids.length; i += 30) {
      records.push(...(await queryDocs<Doc>(COLLECTIONS.ATTENDANCE_RECORDS, [
        { type: 'where', field: 'classInstanceId', op: 'in', value: ids.slice(i, i + 30) },
      ])));
    }
    const recordsByInstance = new Map<string, Doc[]>();
    for (const r of records) {
      const id = String(r.classInstanceId);
      recordsByInstance.set(id, [...(recordsByInstance.get(id) ?? []), r]);
    }

    const classes: ClassJoins[] = [];
    for (const [key, group] of groups) {
      const [batch, date] = key.split('|');
      const live = group.filter((i) => !String(i.status ?? '').includes('cancel'));
      const main = [...(live.length ? live : group)].sort((a, b) =>
        String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
      )[0];

      // Best record per student across all copies of this class
      const best = new Map<string, Doc>();
      for (const inst of group) {
        for (const r of recordsByInstance.get(inst.id) ?? []) {
          const sid = String(r.studentId);
          const prev = best.get(sid);
          if (!prev || (STATUS_RANK[String(r.status)] ?? 0) > (STATUS_RANK[String(prev.status)] ?? 0)) {
            best.set(sid, r);
          }
        }
      }

      const joined: JoinEntry[] = [...best.values()]
        .filter((r) => r.status !== 'absent' || r.markedBy === 'auto_meet_join')
        .map((r) => ({
          studentId: String(r.studentId),
          name: nameById.get(String(r.studentId)) ?? (r.dependentName as string) ?? 'Student',
          status: String(r.status),
          joinedAt: (r.markedAt as string) ?? null,
          lateByMinutes: Number(r.lateByMinutes) || 0,
          viaLink: r.markedBy === 'auto_meet_join',
        }))
        .sort((a, b) => String(a.joinedAt ?? '').localeCompare(String(b.joinedAt ?? '')));

      const joinedIds = new Set(joined.map((j) => j.studentId));
      const enrolled = studentsByBatch.get(batch) ?? [];

      classes.push({
        key,
        instanceId: main.id,
        batch,
        date,
        start: String(main.scheduledStartTime ?? ''),
        end: String(main.scheduledEndTime ?? ''),
        cancelled: live.length === 0,
        enrolled: enrolled.length,
        joined,
        notJoined: enrolled.filter((s) => !joinedIds.has(s.studentId)),
      });
    }

    classes.sort((a, b) => b.start.localeCompare(a.start));
    return Response.json({ success: true, classes });
  } catch (error) {
    return authErrorResponse(error);
  }
}
