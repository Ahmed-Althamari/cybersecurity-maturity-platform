import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { getAuthSession } from '../lib/auth';

export default function Home() {
  return (
    <>
      <Head>
        <title>CMMP - Cybersecurity Maturity Management Platform</title>
        <meta name="description" content="Enterprise cybersecurity maturity assessment platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">CMMP</h1>
              <p className="text-slate-300">Cybersecurity Maturity Management Platform</p>
            </div>
            <Link
              href="/auth/signin"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Sign In
            </Link>
          </div>

          <div className="bg-slate-800 rounded-lg p-8 shadow-xl text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Welcome to CMMP</h2>
            <p className="text-slate-300 mb-8">
              Upload cybersecurity assessment data and transform it into an interactive maturity view: NIST CSF
              function maturity, control-level gaps, risks, and a prioritised remediation roadmap.
            </p>
            <Link
              href="/auth/signin"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg"
            >
              Sign In to Get Started
            </Link>
          </div>

          <div className="mt-12 text-center text-slate-500 text-sm">
            <p>CMMP v0.1.0 - Enterprise Cybersecurity Maturity Management Platform</p>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getAuthSession(context);
  if (session?.accessToken) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return { props: {} };
};
