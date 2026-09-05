import { FileSpreadsheet } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { AssessmentItemsForm } from '../../../components/assessments/AssessmentItemsForm';
import { AppHeader } from '../../../components/layout/AppHeader';
import { BackLink } from '../../../components/layout/BackLink';
import { ApiError, getAssessment, getFrameworkTree, type FrameworkTreeFunction } from '../../../lib/api';
import { getAuthSession } from '../../../lib/auth';

const EDITABLE_STATUSES = ['DRAFT', 'IN_PROGRESS'];

interface AssessmentItemsPageProps {
  assessmentId: string;
  assessmentName: string;
  status: string;
  editable: boolean;
  accessToken: string;
  tree: FrameworkTreeFunction[];
  initialAnswers: Record<string, { currentMaturity: string; targetMaturity: string }>;
  errorMessage: string | null;
}

export default function AssessmentItemsPage({
  assessmentId,
  assessmentName,
  status,
  editable,
  accessToken,
  tree,
  initialAnswers,
  errorMessage,
}: AssessmentItemsPageProps) {
  return (
    <>
      <Head>
        <title>{assessmentName ? `${assessmentName} - CMMP` : 'Assessment - CMMP'}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <BackLink href="/assessments">Assessments</BackLink>
              <h1 className="text-3xl font-bold text-white mt-1">{assessmentName}</h1>
              <p className="text-slate-400 text-sm mt-1">Status: {status}</p>
            </div>
            {editable && (
              <Link
                href={`/assessments/${assessmentId}/import`}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Import from Excel/CSV
              </Link>
            )}
          </div>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {!errorMessage && (
            <AssessmentItemsForm
              assessmentId={assessmentId}
              accessToken={accessToken}
              editable={editable}
              tree={tree}
              initialAnswers={initialAnswers}
            />
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AssessmentItemsPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { notFound: true };
  }

  try {
    const assessment = await getAssessment(session.accessToken, id);
    if (!assessment.template) {
      return {
        props: {
          assessmentId: id,
          assessmentName: assessment.name,
          status: assessment.status,
          editable: false,
          accessToken: session.accessToken,
          tree: [],
          initialAnswers: {},
          errorMessage: 'This assessment has no framework template to score against.',
        },
      };
    }

    const frameworkTree = await getFrameworkTree(session.accessToken, assessment.template.frameworkId);
    const initialAnswers: Record<string, { currentMaturity: string; targetMaturity: string }> = {};
    for (const item of assessment.items) {
      initialAnswers[item.questionId] = { currentMaturity: item.currentMaturity, targetMaturity: item.targetMaturity };
    }

    return {
      props: {
        assessmentId: id,
        assessmentName: assessment.name,
        status: assessment.status,
        editable: EDITABLE_STATUSES.includes(assessment.status),
        accessToken: session.accessToken,
        tree: frameworkTree.functions,
        initialAnswers,
        errorMessage: null,
      },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { notFound: true };
    }
    const message = error instanceof ApiError ? error.message : 'Failed to load this assessment.';
    return {
      props: {
        assessmentId: id,
        assessmentName: '',
        status: '',
        editable: false,
        accessToken: session.accessToken,
        tree: [],
        initialAnswers: {},
        errorMessage: message,
      },
    };
  }
};
