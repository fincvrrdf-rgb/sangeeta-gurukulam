/**
 * Browser-safe: collapse rows that are the same lesson — same day, same start
 * and end time, same student name(s) — into one. The real class wins over a
 * placeholder for a scheduled day, then the one the teacher joined, then one
 * she added; each student keeps the entry that has attendance recorded.
 */

interface LessonStudent {
  name: string;
  status: string | null;
  viaLink: boolean;
}

interface Lesson<S extends LessonStudent> {
  key: string;
  instanceId: string;
  copyIds?: string[];
  kind: string;
  date: string;
  start: string;
  end: string;
  cancelled: boolean;
  meetLink: string | null;
  teacherJoinedAt: string | null;
  enrolled: number;
  students: S[];
}

const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
const minuteOf = (iso: string) => Math.floor(new Date(iso).getTime() / 60000);

export function mergeSameLessons<S extends LessonStudent, C extends Lesson<S>>(classes: C[]): C[] {
  const sig = (c: C) =>
    `${c.date}|${minuteOf(c.start)}|${minuteOf(c.end)}|${[...new Set(c.students.map((s) => normName(s.name)))].sort().join(',')}`;
  const rank = (c: C) => (c.instanceId ? 4 : 0) + (c.teacherJoinedAt ? 2 : 0) + (c.kind === 'extra' ? 1 : 0);

  const groups = new Map<string, C[]>();
  const order: (C | string)[] = [];
  for (const c of classes) {
    if (c.cancelled || c.students.length === 0) { order.push(c); continue; }
    const k = sig(c);
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k)!.push(c);
  }

  return order.map((entry) => {
    if (typeof entry !== 'string') return entry;
    const copies = groups.get(entry)!;
    if (copies.length === 1) return copies[0];
    const winner = [...copies].sort((a, b) => rank(b) - rank(a))[0];
    const students = new Map<string, S>();
    for (const copy of [winner, ...copies.filter((x) => x !== winner)]) {
      for (const st of copy.students) {
        const k = normName(st.name);
        const prev = students.get(k);
        if (!prev || (prev.status === null && st.status !== null) || (prev.viaLink && st.status !== null && !st.viaLink)) {
          students.set(k, st);
        }
      }
    }
    return {
      ...winner,
      copyIds: [...new Set(copies.flatMap((x) => x.copyIds ?? (x.instanceId ? [x.instanceId] : [])))],
      meetLink: winner.meetLink ?? copies.find((x) => x.meetLink)?.meetLink ?? null,
      teacherJoinedAt: copies.map((x) => x.teacherJoinedAt).filter((x): x is string => !!x).sort()[0] ?? null,
      enrolled: Math.max(...copies.map((x) => x.enrolled)),
      students: [...students.values()],
    };
  });
}
