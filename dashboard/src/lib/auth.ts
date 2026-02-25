import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import LinkedInProvider from 'next-auth/providers/linkedin';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// DB pool for user lookups (reuses same connection string as orchestrator)
let _pool: Pool | null = null;
function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email:    { label: 'Email',    type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      // 1. Check DB users table first
      try {
        const pool = getPool();
        const result = await pool.query(
          `SELECT id, email, name, role, password_hash FROM users WHERE email = $1 AND provider = 'credentials'`,
          [credentials.email]
        );
        const user = result.rows[0];
        if (user && user.password_hash) {
          const match = await bcrypt.compare(credentials.password, user.password_hash);
          if (match) {
            return { id: user.id, name: user.name, email: user.email, role: user.role };
          }
        }
      } catch {
        // DB unavailable — fall through to env-var admin
      }

      // 2. Env-var admin fallback
      const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@lsc.local';
      const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';
      if (credentials.email === adminEmail && credentials.password === adminPassword) {
        return { id: 'env-admin', name: 'Admin', email: adminEmail, role: 'admin' };
      }

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
