/**
 * API: GET /api/attendance/joins?days=14&ahead=7
 *
 * Classes from `days` ago through `ahead` days from now, for the teacher's
 * Classes page. Each class is one of:
 *  - a student's own regular class (from their schedule)
 *  - an extra or group class (one link shared by its students)
 *  - a batch class (students without a schedule of their own)
 * Duplicate copies are merged. For each student in a class: the automatic
 * record from clicking Join (POST /api/attendance/auto) or the teacher's
 * manual entry — which wins — plus minutes taught.
 * Teacher / admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { loadBandCodes, batchKey, classKey, classStudentIds } from '@/lib/classes/dedupe';
import { parseSchedule, type StudentSchedule } from '@/lib/classes/student-schedule';
import { loadLinkContext, resolveClassLink } from '@/lib/classes/links';

export const dynamic = 'force-dynamic';

type Doc = Record<string, unknown> & { id: string };

export interface StudentInfo {
  studentId: string;
  name: string;
  batch: string;
  schedule: StudentSchedule | null;
  meetLink: string | null;        // personal link (null = uses batch link)
  effectiveLink: string | null;   // what their own classes use
}

export interface StudentAttendance {
  studentId: string;
  name: string;
  status: string | null;           // null = nothing recorded yet
  joinedAt: string | null;         // when the Join link was clicked
  lateByMinutes: number;
  durationMinutes: number | null;  // minutes entered by the teacher
  scheduledMinutes: number | null; // the class length (used when none entered)
  start: string | null;            // kept for compatibility: class start/end
  end: string | null;
  viaLink: boolean;                // recorded by the Join click (not edited by teacher)
  notes: string;
  recordInstanceId: string;        // class copy the record lives on (edit target)
}

export interface ClassJoins {
  key: string;
  instanceId: string;
  kind: 'regular' | 'extra';
  isGroup: boolean;
  batch: string;
  date: string;                    // YYYY-MM-DD (IST)
  start: string;                   // ISO
  end: string;
  upcoming: boolean;               // later than today
  cancelled: boolean;
  cancellationReason: string | null;
  meetLink: string | null;
  note: string | null;
  teacherJoinedAt: string | null;
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
const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['teacher', 'super_admin']);

    const params = new URL(request.url).searchParams;
    const days = Math.min(Math.max(Number(params.get('days')) || 14, 1), 120);
    const ahead = Math.min(Math.max(Number(params.get('ahead') ?? 7), 0), 30);
    const from = istDate(-days);
    const today = istDate(0);
    const to = istDate(ahead);

    const [bandCodes, instances, profiles] = await Promise.all([
      loadBandCodes(),
      queryDocs<Doc>(COLLECTIONS.CLASS_INSTANCES, [
        { type: 'where', field: 'scheduledStartTime', op: '>=', value: `${from}T00:00:00+05:30` },
        { type: 'where', field: 'scheduledStartTime', op: '<=', value: `${to}T23:59:59+05:30` },
      ]),
      queryDocs<Doc>(COLLECTIONS.STUDENT_PROFILES, []),
    ]);
    const linkCtx = await loadLinkContext(profiles);

    // Active students
    const studentsByBatch = new Map<string, string[]>();
    const scheduleById = new Map<string, StudentSchedule | null>();
    const nameById = new Map<string, string>();
    const studentInfo: StudentInfo[] = [];
    for (const p of profiles) {
      const name = (p.fullName as string) || 'Student';
      nameById.set(p.id, name);
      if (p.isActive === false || !p.currentBatchBandId) continue;
      const code = batchKey(bandCodes, p.currentBatchBandId);
      studentsByBatch.set(code, [...(studentsByBatch.get(code) ?? []), p.id]);
      const schedule = parseSchedule(p.classSchedule);
      scheduleById.set(p.id, schedule);
      studentInfo.push({
        studentId: p.id,
        name,
        batch: code,
        schedule,
        meetLink: (p.meetLink as string) || null,
        effectiveLink: resolveClassLink({ studentIds: [p.id], batchBandId: p.currentBatchBandId }, linkCtx),
      });
    }

    // Merge duplicate copies of the same class
    const groups = new Map<string, Doc[]>();
    for (const inst of instances) {
      if (!String(inst.scheduledStartTime ?? '').slice(0, 10)) continue;
      const key = classKey(bandCodes, inst);
      groups.set(key, [...(groups.get(key) ?? []), inst]);
    }

    // Who has their own (non-batch) class on a date — they're not on that day's batch class
    const ownClassOn = new Set<string>();
    for (const inst of instances) {
      const date = String(inst.scheduledStartTime ?? '').slice(0, 10);
      for (const id of classStudentIds(inst)) ownClassOn.add(`${id}|${date}`);
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
      const live = group.filter((i) => !String(i.status ?? '').includes('cancel'));
      const main = [...(live.length ? live : group)].sort((a, b) =>
        String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
      )[0];
      const date = String(main.scheduledStartTime).slice(0, 10);
      const batch = batchKey(bandCodes, main.batchBandId);
      const participants = classStudentIds(main);
      const start = String(main.scheduledStartTime ?? '');
      const end = String(main.scheduledEndTime ?? '');

      // One record per student across all copies; a teacher's manual entry wins
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

      // Who is in this class
      let rosterIds: string[];
      if (participants.length) {
        rosterIds = participants;
      } else {
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        rosterIds = (studentsByBatch.get(batch) ?? []).filter((sid) => {
          if (ownClassOn.has(`${sid}|${date}`)) return false;
          const sched = scheduleById.get(sid);
          return !sched || sched.days.includes(dow);
        });
      }
      const roster = new Set(rosterIds);
      for (const sid of best.keys()) roster.add(sid);

      const classMinutes = minutesBetween(start, end);
      const students: StudentAttendance[] = [...roster]
        .map((studentId) => {
          const r = best.get(studentId);
          return {
            studentId,
            name: nameById.get(studentId) ?? 'Student',
            status: r ? String(r.status) : null,
            joinedAt: r && isAuto(r) ? ((r.markedAt as string) ?? null) : ((r?.joinedAt as string) ?? null),
            lateByMinutes: Number(r?.lateByMinutes) || 0,
            durationMinutes: typeof r?.durationMinutes === 'number' ? (r.durationMinutes as number) : null,
            scheduledMinutes: participants.length ? classMinutes : (scheduleById.get(studentId)?.durationMinutes ?? null),
            start: null,
            end: null,
            viaLink: !!r && isAuto(r),
            notes: (r?.notes as string) ?? '',
            recordInstanceId: r ? String(r.classInstanceId) : main.id,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      classes.push({
        key,
        instanceId: main.id,
        kind: main.kind === 'extra' ? 'extra' : 'regular',
        isGroup: participants.length > 1,
        batch,
        date,
        start,
        end,
        upcoming: date > today,
        cancelled: live.length === 0,
        cancellationReason: live.length === 0 ? ((main.cancellationReason as string) ?? null) : null,
        meetLink: resolveClassLink(main, linkCtx),
        note: (main.note as string) ?? null,
        teacherJoinedAt:
          group.map((i) => i.teacherJoinedAt as string | undefined).filter(Boolean).sort()[0] ?? null,
        enrolled: rosterIds.length,
        students,
      });
    }

    classes.sort((a, b) => b.start.localeCompare(a.start));
    studentInfo.sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ success: true, today, classes, students: studentInfo });
  } catch (error) {
    return authErrorResponse(error);
  }
}
