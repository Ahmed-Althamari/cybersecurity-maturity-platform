import Head from 'next/head';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import React, { useState } from 'react';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError('Invalid email or password.');
      return;
    }

    router.push('/dashboard');
  }

  return (
    <>
      <Head>
        <title>Sign In - CMMP</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 px-4">
        <div className="w-full max-w-sm bg-slate-800 rounded-lg p-8 shadow-xl border border-slate-700">
          <h1 className="text-2xl font-bold text-white mb-1">CMMP</h1>
          <p className="text-slate-400 text-sm mb-6">Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-slate-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm text-slate-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-md transition-colors"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-500">
            Local development demo accounts: admin@example.local, ciso@example.local, assessor@example.local,
            viewer@example.local — password from <code>DEMO_USER_PASSWORD</code> (seed default:{' '}
            <code>DemoPassword123!</code>).
          </p>
        </div>
      </div>
    </>
  );
}
