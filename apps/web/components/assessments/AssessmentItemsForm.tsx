import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { submitAssessment, upsertAssessmentItem, type FrameworkTreeFunction } from '../../lib/api';

const MATURITY_LEVELS = ['NOT_APPLICABLE', 'INITIAL', 'DEVELOPING', 'DEFINED', 'MANAGED', 'OPTIMISED'] as const;
const MATURITY_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'N/A',
  INITIAL: 'Initial',
  DEVELOPING: 'Developing',
  DEFINED: 'Defined',
  MANAGED: 'Managed',
  OPTIMISED: 'Optimised',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface QuestionAnswer {
  currentMaturity: string;
  targetMaturity: string;
}

interface AssessmentItemsFormProps {
  assessmentId: string;
  accessToken: string;
  editable: boolean;
  tree: FrameworkTreeFunction[];
  initialAnswers: Record<string, QuestionAnswer>;
}

export function AssessmentItemsForm({ assessmentId, accessToken, editable, tree, initialAnswers }: AssessmentItemsFormProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>(initialAnswers);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = tree.reduce(
    (fnSum, fn) =>
      fnSum + fn.categories.reduce((catSum, cat) => catSum + cat.subcategories.reduce((subSum, sub) => subSum + sub.assessmentQuestions.length, 0), 0),
    0,
  );

  async function handleChange(questionId: string, field: 'currentMaturity' | 'targetMaturity', value: string) {
    const next: QuestionAnswer = {
      currentMaturity: answers[questionId]?.currentMaturity ?? 'NOT_APPLICABLE',
      targetMaturity: answers[questionId]?.targetMaturity ?? 'NOT_APPLICABLE',
      [field]: value,
    };
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
    setSaveState((prev) => ({ ...prev, [questionId]: 'saving' }));

    try {
      await upsertAssessmentItem(accessToken, assessmentId, {
        questionId,
        currentMaturity: next.currentMaturity,
        targetMaturity: next.targetMaturity,
      });
      setSaveState((prev) => ({ ...prev, [questionId]: 'saved' }));
    } catch {
      setSaveState((prev) => ({ ...prev, [questionId]: 'error' }));
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitAssessment(accessToken, assessmentId);
      router.push('/assessments');
    } catch {
      setSubmitError('Failed to submit the assessment. Answer at least one question first, then try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 bg-slate-800 rounded-lg p-4 border border-slate-700">
        <p className="text-slate-300 text-sm">
          {answeredCount} of {totalQuestions} questions answered
        </p>
        {editable && (
          <div className="flex items-center gap-3">
            {submitError && <p className="text-red-400 text-xs">{submitError}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Assessment'}
            </button>
          </div>
        )}
        {!editable && <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Read-only</span>}
      </div>

      <div className="space-y-6">
        {tree.map((fn) => (
          <div key={fn.id} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-slate-900/60 px-5 py-3 border-b border-slate-700">
              <h2 className="text-white font-semibold">
                <span className="text-slate-500 font-mono text-xs mr-2">{fn.code}</span>
                {fn.name}
              </h2>
            </div>
            <div className="divide-y divide-slate-700">
              {fn.categories.map((category) =>
                category.subcategories.map((subcategory) =>
                  subcategory.assessmentQuestions.map((question) => {
                    const answer = answers[question.id];
                    const state = saveState[question.id] ?? 'idle';
                    return (
                      <div key={question.id} className="px-5 py-4">
                        <p className="text-slate-200 text-sm mb-3">
                          <span className="text-slate-500 font-mono text-xs mr-2">{subcategory.code}</span>
                          {question.question}
                        </p>
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-2 text-xs text-slate-400">
                            Current
                            <select
                              disabled={!editable}
                              value={answer?.currentMaturity ?? ''}
                              onChange={(e) => handleChange(question.id, 'currentMaturity', e.target.value)}
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm disabled:opacity-50"
                            >
                              <option value="" disabled>
                                Select…
                              </option>
                              {MATURITY_LEVELS.map((level) => (
                                <option key={level} value={level}>
                                  {MATURITY_LABEL[level]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-400">
                            Target
                            <select
                              disabled={!editable}
                              value={answer?.targetMaturity ?? ''}
                              onChange={(e) => handleChange(question.id, 'targetMaturity', e.target.value)}
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm disabled:opacity-50"
                            >
                              <option value="" disabled>
                                Select…
                              </option>
                              {MATURITY_LEVELS.map((level) => (
                                <option key={level} value={level}>
                                  {MATURITY_LABEL[level]}
                                </option>
                              ))}
                            </select>
                          </label>
                          {state === 'saving' && <span className="text-slate-500 text-xs">Saving…</span>}
                          {state === 'saved' && <span className="text-green-500 text-xs">Saved</span>}
                          {state === 'error' && <span className="text-red-400 text-xs">Failed to save</span>}
                        </div>
                      </div>
                    );
                  }),
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
