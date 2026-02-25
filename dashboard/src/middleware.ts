import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth'];

// Methods that mutate state and therefore require CSRF protection
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Build base URL from the public-facing host header (works correctly behind Apache proxy)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  // ── CSRF protection for state-changing API requests ───────────────────────
  // For mutating requests to /api/* routes, verify that the Origin or Referer
  // header matches this server's own origin.  Browsers always send one of these
  // for same-site fetches; a cross-origin attacker cannot set them.
  // NextAuth's own endpoints (/api/auth/*) are already exempted above.
  if (STATE_CHANGING_METHODS.has(req.method) && pathname.startsWith('/api/')) {
    const origin   = req.headers.get('origin');
    const referer  = req.headers.get('referer');
    const expected = `${proto}://${host}`;

    const sourceOk =
      (origin  && origin.startsWith(expected)) ||
      (referer && referer.startsWith(expected));

    if (!sourceOk) {
      return new NextResponse(
        JSON.stringify({ error: 'CSRF check failed: origin mismatch' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Redirect unauthenticated users to login
  if (!token) {
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Non-admins blocked from user management
  if (pathname.startsWith('/settings/users') && token.role !== 'admin') {
    return NextResponse.redirect(new URL('/overview', baseUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|landing\\.html|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.webp).*)',
  ],
};
