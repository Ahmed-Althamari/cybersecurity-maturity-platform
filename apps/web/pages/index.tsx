import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/assessments');
    } else if (status === 'unauthenticated') {
      router.replace('/auth/signin');
    }
  }, [status, router]);

  return (
    <>
      <Head>
        <title>CMMP</title>
        <meta name="description" content="Enterprise cybersecurity maturity assessment platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
        <p className="text-slate-400">Loading…</p>
      </div>
    </>
  );
}
