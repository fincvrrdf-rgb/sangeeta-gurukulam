/**
 * Next.js Middleware — Role-based route protection.
 *
 * This runs on every navigation request (not API routes).
 * It checks for the __session cookie containing the Firebase ID token
 * and redirects users based on their role:
 *   - Unauthenticated → /login (for protected routes)
 *   - Student → cannot access /teacher/* or /admin/*
 *   - Teacher → cannot access /admin/*
 *   - Super Admin → full access
 *
 * Note: This is a first-pass client-side guard. API routes enforce
 * auth independently via requireAuth().
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password', '/bhajan', '/privacy', '/terms'];

// Route prefixes that require specific roles
const ROLE_ROUTES: Record<string, string[]> = {
  '/student': ['student', 'super_admin'],
  '/teacher': ['teacher', 'super_admin'],
  '/admin': ['super_admin'],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get('__session')?.value;
  if (!sessionCookie) {
    // Redirect to login for protected routes
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode the role from the cookie payload (base64 JWT payload)
  // Note: This is a SOFT check. Real authorization happens server-side.
  // The cookie stores the Firebase ID token; we decode the payload to read the role claim.
  try {
    const payloadBase64 = sessionCookie.split('.')[1];
    if (!payloadBase64) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = JSON.parse(atob(payloadBase64));
    const userRole = payload.role as string | undefined;

    if (!userRole) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Check route-level role requirements
    for (const [routePrefix, allowedRoles] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(routePrefix)) {
        if (!allowedRoles.includes(userRole)) {
          // Redirect to their own dashboard
          const dashboardUrl = userRole === 'teacher' ? '/teacher' :
                               userRole === 'student' ? '/student' : '/';
          return NextResponse.redirect(new URL(dashboardUrl, request.url));
        }
        break;
      }
    }

    return NextResponse.next();
  } catch {
    // Invalid cookie — redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
