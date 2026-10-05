/**
 * Attendance — /teacher/attendance
 *
 * Attendance now comes from students clicking their batch's Join link and is
 * shown on the Classes page ("Who joined"), one entry per batch per class day.
 */

import { redirect } from 'next/navigation';

export default function TeacherAttendancePage() {
  redirect('/teacher/classes');
}
