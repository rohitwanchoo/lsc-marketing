import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import LinkedInProvider from 'next-auth/providers/linkedin';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────
// Production environment validation (deferred to request time)
// ─────────────────────────────────────────────

function validateProductionEnv(): void {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD environment variable is required in production');
    }
    if (process.env.ADMIN_PASSWORD.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters in production');
    }
  }
}

// ─────────────────────────────────────────────
// DB pool for user lookups
// ─────────────────────────────────────────────

let _pool: Pool | null = null;
function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// ─────────────────────────────────────────────
// In-memory rate limiter for login attempts
// Max 5 failed attempts per email per 15-minute window
// ─────────────────────────────────────────────

interface FailedAttemptEntry {
  count: number;
  resetAt: number;
}

const failedAttempts = new Map<string, FailedAttemptEntry>();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS    = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email: string): { blocked: boolean; retryAfter: number } {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const entry = failedAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    return { blocked: false, retryAfter: 0 };
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { blocked: true, retryAfter };
  }

  return { blocked: false, retryAfter: 0 };
}

function recordFailedAttempt(email: string): void {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const entry = failedAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    failedAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count++;
  }
}

function clearFailedAttempts(email: string): void {
  failedAttempts.delete(email.toLowerCase().trim());
}

// Clean up expired entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failedAttempts) {
    if (now > entry.resetAt) failedAttempts.delete(key);
  }
}, LOGIN_WINDOW_MS);

// ─────────────────────────────────────────────
// Logging helper for auth events
// ─────────────────────────────────────────────

function logAuthAttempt(params: {
  email: string;
  success: boolean;
  reason: string;
  ip: string;
}): void {
  const { email, success, reason, ip } = params;
  const level = success ? 'info' : 'warn';
  const message = success ? 'Login success' : 'Login failed';
  // Use console so this works in both Next.js edge and Node runtimes without
  // importing the orchestrator logger.
  console[level](`[auth] ${message}`, { email, reason, ip, ts: new Date().toISOString() });
}

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email:    { label: 'Email',    type: 'email' },
      password: { label: 'Password', type: 'password' },
      // NextAuth passes request headers via the `req` object; we capture IP below
    },
    async authorize(credentials, req) {
      validateProductionEnv();
      if (!credentials?.email || !credentials?.password) return null;

      const ip: string =
        (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
        (req?.headers?.['x-real-ip'] as string | undefined) ||
        'unknown';

      const email = credentials.email.trim().toLowerCase();

      // ── Rate-limit check ──────────────────────────────────────
      const { blocked, retryAfter } = checkRateLimit(email);
      if (blocked) {
        logAuthAttempt({ email, success: false, reason: 'rate_limited', ip });
        // Throw with a special prefix so the caller can surface retryAfter
        throw new Error(`RATE_LIMITED:${retryAfter}`);
      }

      // ── 1. DB users table ─────────────────────────────────────
      try {
        const pool = getPool();
        const result = await pool.query(
          `SELECT id, email, name, role, password_hash FROM users WHERE email = $1 AND provider = 'credentials'`,
          [email]
        );
        const user = result.rows[0];
        if (user && user.password_hash) {
          const match = await bcrypt.compare(credentials.password, user.password_hash);
          if (match) {
            clearFailedAttempts(email);
            logAuthAttempt({ email, success: true, reason: 'db_user', ip });
            return { id: user.id, name: user.name, email: user.email, role: user.role };
          }
          // Wrong password for DB user — record and reject
          recordFailedAttempt(email);
          logAuthAttempt({ email, success: false, reason: 'bad_password_db', ip });
          return null;
        }
      } catch {
        // DB unavailable — fall through to env-var admin
      }

      // ── 2. Env-var admin fallback ─────────────────────────────
      const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@lsc.local';
      const adminPassword = process.env.ADMIN_PASSWORD; // no default in production

      if (!adminPassword) {
        // Development-only: allow a plaintext comparison against a dev sentinel
        recordFailedAttempt(email);
        logAuthAttempt({ email, success: false, reason: 'no_admin_password_configured', ip });
        return null;
      }

      if (email === adminEmail.toLowerCase() && credentials.password === adminPassword) {
        clearFailedAttempts(email);
        logAuthAttempt({ email, success: true, reason: 'env_admin', ip });
        return { id: 'env-admin', name: 'Admin', email: adminEmail, role: 'admin' };
      }

      recordFailedAttempt(email);
      logAuthAttempt({ email, success: false, reason: 'bad_credentials', ip });
      return null;
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (process.env.LINKEDIN_AUTH_CLIENT_ID && process.env.LINKEDIN_AUTH_CLIENT_SECRET) {
  providers.push(
    LinkedInProvider({
      clientId:     process.env.LINKEDIN_AUTH_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_AUTH_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages:   { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role || 'viewer';
        token.id   = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id   = token.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },
};
