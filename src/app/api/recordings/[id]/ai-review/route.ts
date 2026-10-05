/**
 * API: POST /api/recordings/[id]/ai-review
 *
 * (Re)generate the AI preliminary review for a recording. Body may carry a
 * fresh `analysis` (measured in the browser, e.g. for recordings submitted
 * before the AI check existed, or with a corrected Sa/raga); otherwise the
 * stored analysis is reused. Teacher/admin, or the student who owns it.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { getDoc, updateDoc, nowISO } from '@/lib/firebase/firestore';
import { COLLECTIONS } from '@/domain/constants';
import { AnalysisSchema, generateRecordingReview } from '@/lib/ai/recording-review';
import { z } from 'zod';

const Body = z.object({ analysis: AnalysisSchema.optional() });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth(request, ['student', 'teacher', 'super_admin']);
    const rec = await getDoc<Record<string, unknown>>(COLLECTIONS.PRACTICE_RECORDINGS, params.id);
    if (!rec) return Response.json({ error: 'Recording not found' }, { status: 404 });
    if (auth.role === 'student' && rec.studentId !== auth.uid) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'Invalid analysis' }, { status: 400 });

    const stored = AnalysisSchema.safeParse(rec.analysis);
    const analysis = parsed.data.analysis ?? (stored.success ? stored.data : null);
    if (!analysis) {
      return Response.json({ error: 'This recording has not been analysed yet' }, { status: 400 });
    }

    const unit = rec.teachingUnitId && rec.teachingUnitId !== 'general'
      ? await getDoc<{ unitName?: string }>(COLLECTIONS.TEACHING_UNITS, rec.teachingUnitId as string)
      : null;
    const aiReview = await generateRecordingReview(analysis, {
      unitName: unit?.unitName ?? (rec.pieceName as string | null) ?? null,
      studentNote: (rec.studentNote as string | null) ?? null,
    });

    await updateDoc(COLLECTIONS.PRACTICE_RECORDINGS, params.id, {
      analysis,
      aiReview,
      updatedAt: nowISO(),
    });
    return Response.json({ aiReview, analysis });
  } catch (error) {
    return authErrorResponse(error);
  }
}
