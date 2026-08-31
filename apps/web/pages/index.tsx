import Head from 'next/head';
import { useSession, signIn, signOut } from 'next-auth/react';
import React from 'react';

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <>
      <Head>
        <title>CMMP - Cybersecurity Maturity Management Platform</title>
        <meta
          name="description"
          content="Enterprise cybersecurity maturity assessment platform"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                CMMP
              </h1>
              <p className="text-slate-300">
                Cybersecurity Maturity Management Platform
              </p>
            </div>
            <div>
              {status === 'loading' && (
                <p className="text-slate-300">Loading...</p>
              )}
              {!session ? (
                <button
                  onClick={() => signIn()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Sign In
                </button>
              ) : (
                <div className="flex items-center gap-4">
                  <span className="text-slate-300">
                    {session.user?.email}
                  </span>
                  <button
                    onClick={() => signOut()}
                    className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="bg-slate-800 rounded-lg p-8 shadow-xl">
            {!session ? (
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Welcome to CMMP
                </h2>
                <p className="text-slate-300 mb-8">
                  Please sign in to access the cybersecurity maturity assessment platform.
                </p>
                <button
                  onClick={() => signIn()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg"
                >
                  Sign In to Get Started
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Dashboard
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Placeholder Cards - Will be replaced with actual dashboard */}
                  {[
                    { title: 'Overall Maturity', value: '2.7' },
                    { title: 'Target Maturity', value: '3.8' },
                    { title: 'Maturity Gap', value: '1.1' },
                    { title: 'Completion', value: '95%' },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className="bg-slate-700 rounded-lg p-6 border border-slate-600"
                    >
                      <p className="text-slate-400 text-sm mb-2">
                        {card.title}
                      </p>
                      <p className="text-3xl font-bold text-white">
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 text-slate-300">
                  <p className="mb-4">
                    🚀 Dashboard is under development. Features coming soon:
                  </p>
                  <ul className="list-disc list-inside space-y-2">
                    <li>Cybersecurity Maturity Radar Chart</li>
                    <li>NIST Function Breakdown</li>
                    <li>Security Gaps Analysis</li>
                    <li>Risk Register</li>
                    <li>Remediation Roadmap</li>
                    <li>Executive Reports</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-12 text-center text-slate-500 text-sm">
            <p>CMMP v0.1.0 - Enterprise Cybersecurity Maturity Management Platform</p>
          </div>
        </div>
      </div>
    </>
  );
}
