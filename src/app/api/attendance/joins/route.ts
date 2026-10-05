/**
 * API: GET /api/attendance/joins?days=14
 *
 * Attendance per batch per class day (duplicate class copies merged), for
 * every enrolled student: the automatic record from clicking the Join link
 * (POST /api/attendance/auto), or the teacher's manual entry — which wins —
 * including how many minutes the teacher spent with that student.
 * Teacher / admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { loadBandCodes, batchKey } from '@/lib/classes/dedupe';
import { parseSchedule, startFor, addMinutesHHMM, type StudentSchedule } from '@/lib/classes/student-schedule';

export interface StudentInfo {
  studentId: string;
  name: string;
  batch: string;
  schedule: StudentSchedule | null;
}

export const dynamic = 'force-dynamic';

type Doc = Record<string, unknown> & { id: string };

export interface StudentAttendance {
  studentId: string;
  name: string;
  status: string | null;          // null = nothing recorded yet
  joinedAt: string | null;        // when the Join link was clicked
  lateByMinutes: number;
  durationMinutes: number | null; // minutes entered by the teacher
  scheduledMinutes: number | null; // the student's usual class length (used when none entered)
  start: string | null;            // the student's own start/end that day (ISO), if scheduled
  end: string | null;
  viaLink: boolean;               // recorded by the Join click (not edited by teacher)
  notes: string;
  recordInstanceId: string;       // class copy the record lives on (edit target)
}

export interface ClassJoins {
  key: string;              // "A|2026-09-28"
  instanceId: string;       // class copy to attach new manual records to
  batch: string;
  date: string;             // YYYY-MM-DD (IST)
  start: string;            // ISO
  end: string;
  cancelled: boolean;
  teacherJoinedAt: string | null; // when the teacher clicked Join for this batch
  enrolled: number;
  students: StudentAttendance[];
}

function istDate(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

const STATUS_RANK: Record<string, number> = { attended: 3, late: 2, notified_absence: 1, absent: 0, no_show: 0 };
const isAuto = (r: Doc) => String(r.markedBy ?? '').startsWith('auto_');

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);

    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days')) || 14, 1), 120);
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
    const scheduleById = new Map<string, StudentSchedule | null>();
    const studentInfo: StudentInfo[] = [];
    const nameById = new Map<string, string>();
    for (const p of profiles) {
      const name = (p.fullName as string) || 'Student';
      nameById.set(p.id, name);
      if (p.isActive === false || !p.currentBatchBandId) continue;
      const code = batchKey(bandCodes, p.currentBatchBandId);
      studentsByBatch.set(code, [...(studentsByBatch.get(code) ?? []), { studentId: p.id, name }]);
      const schedule = parseSchedule(p.classSchedule);
      scheduleById.set(p.id, schedule);
      studentInfo.push({ studentId: p.id, name, batch: code, schedule });
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

      // One record per student across all copies of this class. A teacher's
      // manual entry always wins over the automatic Join-click record.
      const best = new Map<string, Doc>();
      for (const inst of group) {
        for (const r of recordsByInstance.get(inst.id) ?? []) {
          if (r.isDependentRecord) continue;
          const sid = String(r.studentId);
          const prev = best.get(sid);
          const better =
            !prev ||
            (isAuto(prev) && !isAuto(r)) ||
            (isAuto(prev) === isAuto(r) &&
              (STATUS_RANK[String(r.status)] ?? 0) > (STATUS_RANK[String(prev.status)] ?? 0));
          if (better) best.set(sid, r);
        }
      }

      const enrolled = studentsByBatch.get(batch) ?? [];
      // Students with their own schedule only get rows on their days
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const onToday = enrolled.filter((s) => {
        const sched = scheduleById.get(s.studentId);
        return !sched || sched.days.includes(dow);
      });
      const roster = new Map(onToday.map((s) => [s.studentId, s.name]));
      const ownTimes = (sid: string) => {
        const sched = scheduleById.get(sid);
        const own = sched ? startFor(sched, dow) : null;
        return own && sched
          ? { start: `${date}T${own}:00+05:30`, end: `${date}T${addMinutesHHMM(own, sched.durationMinutes)}:00+05:30` }
          : { start: null, end: null };
      };
      for (const sid of best.keys()) if (!roster.has(sid)) roster.set(sid, nameById.get(sid) ?? 'Student');

      const students: StudentAttendance[] = [...roster.entries()]
        .map(([studentId, name]) => {
          const r = best.get(studentId);
          return {
            studentId,
            name,
            status: r ? String(r.status) : null,
            joinedAt: r && isAuto(r) ? ((r.markedAt as string) ?? null) : ((r?.joinedAt as string) ?? null),
            lateByMinutes: Number(r?.lateByMinutes) || 0,
            durationMinutes: typeof r?.durationMinutes === 'number' ? (r.durationMinutes as number) : null,
            scheduledMinutes: scheduleById.get(studentId)?.durationMinutes ?? null,
            ...ownTimes(studentId),
            viaLink: !!r && isAuto(r),
            notes: (r?.notes as string) ?? '',
            recordInstanceId: r ? String(r.classInstanceId) : main.id,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      classes.push({
        key,
        instanceId: main.id,
        batch,
        date,
        start: String(main.scheduledStartTime ?? ''),
        end: String(main.scheduledEndTime ?? ''),
        cancelled: live.length === 0,
        teacherJoinedAt:
          group.map((i) => i.teacherJoinedAt as string | undefined).filter(Boolean).sort()[0] ?? null,
        enrolled: onToday.length,
        students,
      });
    }

    classes.sort((a, b) => b.start.localeCompare(a.start));
    studentInfo.sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ success: true, classes, students: studentInfo });
  } catch (error) {
    return authErrorResponse(error);
  }
}
