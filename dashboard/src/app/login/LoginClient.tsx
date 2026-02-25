'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Zap, AlertCircle } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="18" rx="3" fill="white"/>
      <path d="M4.5 7H6.5V13.5H4.5V7ZM5.5 6C4.95 6 4.5 5.55 4.5 5C4.5 4.45 4.95 4 5.5 4C6.05 4 6.5 4.45 6.5 5C6.5 5.55 6.05 6 5.5 6ZM8 7H9.9V8C10.2 7.4 10.9 7 11.7 7C13.2 7 14 7.9 14 9.5V13.5H12V10C12 9.2 11.6 8.8 11 8.8C10.4 8.8 10 9.2 10 10V13.5H8V7Z" fill="#0A66C2"/>
    </svg>
  );
}

interface Props {
  hasGoogle: boolean;
  hasLinkedIn: boolean;
}

export function LoginClient({ hasGoogle, hasLinkedIn }: Props) {
  const [loadingProvider, setLoading] = useState<string | null>(null);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [credError, setCredError] = useState('');
  const anyProvider = hasGoogle || hasLinkedIn;

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading('credentials');
    setCredError('');
    const result = await signIn('credentials', {
      email, password, redirect: false,
    });
    if (result?.error) {
      setCredError('Invalid email or password.');
      setLoading(null);
    } else {
      window.location.href = '/';
    }
  }

  async function handleSignIn(provider: 'google' | 'linkedin') {
    setLoading(provider);
    await signIn(provider, { callbackUrl: '/' });
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
            <Zap size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1 text-center">
            Sign in to access the LSC Revenue Platform
          </p>
        </div>

        {/* Auth card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-3">
          {/* Credentials form — always shown */}
          <form onSubmit={handleCredentials} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="admin@lsc.local"
                className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            {credError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                <AlertCircle size={12} /> {credError}
              </div>
            )}
            <button
              type="submit"
              disabled={loadingProvider !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-wait rounded-xl text-sm font-semibold text-white transition-colors"
            >
              {loadingProvider === 'credentials'
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in…</>
                : 'Sign in'}
            </button>
          </form>

          {/* OAuth options — only shown if configured */}
          {anyProvider && (
            <>
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-600">or</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              {hasGoogle && (
                <button
                  onClick={() => handleSignIn('google')}
                  disabled={loadingProvider !== null}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-100 disabled:opacity-60 disabled:cursor-wait rounded-xl text-sm font-semibold text-gray-800 transition-colors"
                >
                  {loadingProvider === 'google'
                    ? <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                    : <GoogleIcon />}
                  Continue with Google
                </button>
              )}
              {hasLinkedIn && (
                <button
                  onClick={() => handleSignIn('linkedin')}
                  disabled={loadingProvider !== null}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-wait"
                  style={{ backgroundColor: '#0A66C2' }}
                  onMouseEnter={e => { if (!loadingProvider) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#004182'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#0A66C2'; }}
                >
                  {loadingProvider === 'linkedin'
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <LinkedInIcon />}
                  Continue with LinkedIn
                </button>
              )}
            </>
          )}
        </div>

        {/* Back link */}
        <div className="text-center mt-5">
          <a
            href="/landing.html"
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            ← Back to site
          </a>
        </div>
      </div>

      <div className="absolute bottom-6 text-center">
        <p className="text-[11px] text-gray-700">
          LSC Platform · Autonomous Organic Revenue Engine
        </p>
      </div>
    </div>
  );
}
