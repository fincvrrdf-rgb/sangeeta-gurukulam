/**
 * lib/auth/middleware.ts
 *
 * Server-side auth middleware for API routes. Verifies Firebase ID tokens
 * from the Authorization header and enforces role-based access.
 *
 * Usage in any API route:
 *   const { uid, role } = await requireAuth(request, ['teacher', 'super_admin']);
 */

import { adminAuth } from '@/lib/firebase/admin';
import type { UserRole } from '@/domain/enums';

export interface AuthContext {
  uid: string;
  email: string;
  role: UserRole;
}

/**
 * Extracts and verifies the Firebase ID token from the request.
 * Returns decoded user info or throws an HTTP-appropriate error.
 *
 * @param request - The incoming Next.js Request object
 * @param allowedRoles - Array of roles permitted to access this route.
 *                       Pass empty array to allow any authenticated user.
 */
export async function requireAuth(
  request: Request,
  allowedRoles: UserRole[] = []
): Promise<AuthContext> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError(401, 'Missing or invalid Authorization header. Expected: Bearer <token>');
  }

  const idToken = authHeader.slice(7);

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new AuthError(401, 'Invalid or expired authentication token.');
  }

  const role = (decoded.role as UserRole) || null;
  if (!role) {
    throw new AuthError(403, 'User has no assigned role. Contact administrator.');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    throw new AuthError(403, `Access denied. Required role: ${allowedRoles.join(' or ')}`);
  }

  return {
    uid: decoded.uid,
    email: decoded.email || '',
    role,
  };
}

/**
 * Custom error class for auth failures.
 * API routes catch this and return the appropriate HTTP status.
 */
export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Helper to create a JSON error response from an AuthError.
 */
export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.statusCode });
  }
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}
