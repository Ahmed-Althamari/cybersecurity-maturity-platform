import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { ApiError, listAssessments, type AssessmentSummary } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';

interface AssessmentsPageProps {
  assessments: AssessmentSummary[];
  errorMessage: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  ARCHIVED: 'Archived',
};

export default function AssessmentsPage({ assessments, errorMessage }: AssessmentsPageProps) {
  return (
    <>
      <Head>
        <title>Assessments - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Assessments</h1>
              <p className="text-slate-400 text-sm mt-1">Every assessment for your organisation.</p>
            </div>
            <Link
              href="/dashboard"
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {assessments.length === 0 && !errorMessage && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">No assessments yet.</div>
          )}

          <div className="space-y-3">
            {assessments.map((assessment) => (
              <Link
                key={assessment.id}
                href={`/assessments/${assessment.id}/items`}
                className="flex items-center justify-between bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-blue-500 transition-colors"
              >
                <div>
                  <p className="text-white font-medium">{assessment.name}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{assessment.template?.name ?? 'No framework template'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-400 text-sm">{assessment.completionPercentage}% complete</span>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">
                    {STATUS_LABEL[assessment.status] ?? assessment.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AssessmentsPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  try {
    const assessments = await listAssessments(session.accessToken, session.organisationId ?? undefined);
    return { props: { assessments, errorMessage: null } };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load assessments.';
    return { props: { assessments: [], errorMessage: message } };
  }
};
