import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { submitAssessment, upsertAssessmentItem, type FrameworkTreeFunction, type UpsertAssessmentItemInput } from '../../lib/api';

const MATURITY_LEVELS = ['NOT_APPLICABLE', 'INITIAL', 'DEVELOPING', 'DEFINED', 'MANAGED', 'OPTIMISED'] as const;
const MATURITY_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'N/A',
  INITIAL: 'Initial',
  DEVELOPING: 'Developing',
  DEFINED: 'Defined',
  MANAGED: 'Managed',
  OPTIMISED: 'Optimised',
};

const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'] as const;
const RISK_LEVEL_LABEL: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  MINIMAL: 'Minimal',
};

const CONTROL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'] as const;
const CONTROL_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
};

const BUSINESS_CRITICALITY_LEVELS = ['1', '2', '3', '4', '5'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Every field the API tracks per assessment item. Text-valued even where the API's own type is a
 * number (weight, businessCriticality) since these are always bound to plain form inputs — parsed
 * back to a number only at the point of saving. */
export interface QuestionAnswer {
  currentMaturity: string;
  targetMaturity: string;
  weight: string;
  riskLevel: string;
  businessCriticality: string;
  controlStatus: string;
  rationale: string;
  evidence: string;
  assessorComments: string;
  ownerName: string;
  ownerEmail: string;
  remediationDueDate: string;
}

const DEFAULT_ANSWER: QuestionAnswer = {
  currentMaturity: '',
  targetMaturity: '',
  weight: '1',
  riskLevel: 'MEDIUM',
  businessCriticality: '3',
  controlStatus: 'NOT_STARTED',
  rationale: '',
  evidence: '',
  assessorComments: '',
  ownerName: '',
  ownerEmail: '',
  remediationDueDate: '',
};

/** Fields saved immediately on change — all discrete choices, never free-typed. */
type ImmediateField = 'currentMaturity' | 'targetMaturity' | 'riskLevel' | 'controlStatus' | 'businessCriticality' | 'remediationDueDate';
/** Fields saved on blur instead — free-typed, so an API call per keystroke would be wasteful. */
type BlurField = 'rationale' | 'evidence' | 'assessorComments' | 'ownerName' | 'ownerEmail' | 'weight';

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = tree.reduce(
    (fnSum, fn) =>
      fnSum + fn.categories.reduce((catSum, cat) => catSum + cat.subcategories.reduce((subSum, sub) => subSum + sub.assessmentQuestions.length, 0), 0),
    0,
  );

  function updateLocal(questionId: string, patch: Partial<QuestionAnswer>) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...DEFAULT_ANSWER, ...prev[questionId], ...patch } }));
  }

  async function save(questionId: string, patch: UpsertAssessmentItemInput) {
    setSaveState((prev) => ({ ...prev, [questionId]: 'saving' }));
    try {
      await upsertAssessmentItem(accessToken, assessmentId, patch);
      setSaveState((prev) => ({ ...prev, [questionId]: 'saved' }));
    } catch {
      setSaveState((prev) => ({ ...prev, [questionId]: 'error' }));
    }
  }

  async function handleImmediateChange(questionId: string, field: ImmediateField, value: string) {
    updateLocal(questionId, { [field]: value });
    const patch: UpsertAssessmentItemInput =
      field === 'businessCriticality' ? { questionId, businessCriticality: Number(value) } : { questionId, [field]: value };
    await save(questionId, patch);
  }

  function handleTextInput(questionId: string, field: BlurField, value: string) {
    updateLocal(questionId, { [field]: value });
  }

  async function handleTextBlur(questionId: string, field: BlurField) {
    const value = answers[questionId]?.[field] ?? DEFAULT_ANSWER[field];
    const patch: UpsertAssessmentItemInput = field === 'weight' ? { questionId, weight: Number(value) || 1 } : { questionId, [field]: value };
    await save(questionId, patch);
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
                    const answer = { ...DEFAULT_ANSWER, ...answers[question.id] };
                    const state = saveState[question.id] ?? 'idle';
                    const isExpanded = expanded[question.id] ?? false;
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
                              value={answer.currentMaturity}
                              onChange={(e) => handleImmediateChange(question.id, 'currentMaturity', e.target.value)}
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
                              value={answer.targetMaturity}
                              onChange={(e) => handleImmediateChange(question.id, 'targetMaturity', e.target.value)}
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
                          {state === 'saved' && !isExpanded && <span className="text-green-500 text-xs">Saved</span>}
                          {state === 'error' && <span className="text-red-400 text-xs">Failed to save</span>}
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => ({ ...prev, [question.id]: !isExpanded }))}
                            className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                          >
                            Details
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                              <label className="flex flex-col gap-1 text-xs text-slate-400">
                                Risk Level
                                <select
                                  disabled={!editable}
                                  value={answer.riskLevel}
                                  onChange={(e) => handleImmediateChange(question.id, 'riskLevel', e.target.value)}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50"
                                >
                                  {RISK_LEVELS.map((level) => (
                                    <option key={level} value={level}>
                                      {RISK_LEVEL_LABEL[level]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-400">
                                Control Status
                                <select
                                  disabled={!editable}
                                  value={answer.controlStatus}
                                  onChange={(e) => handleImmediateChange(question.id, 'controlStatus', e.target.value)}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50"
                                >
                                  {CONTROL_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {CONTROL_STATUS_LABEL[status]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-400">
                                Business Criticality
                                <select
                                  disabled={!editable}
                                  value={answer.businessCriticality}
                                  onChange={(e) => handleImmediateChange(question.id, 'businessCriticality', e.target.value)}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50"
                                >
                                  {BUSINESS_CRITICALITY_LEVELS.map((level) => (
                                    <option key={level} value={level}>
                                      {level}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-400">
                                Weight
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  disabled={!editable}
                                  value={answer.weight}
                                  onChange={(e) => handleTextInput(question.id, 'weight', e.target.value)}
                                  onBlur={() => handleTextBlur(question.id, 'weight')}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-400">
                                Owner Name
                                <input
                                  type="text"
                                  disabled={!editable}
                                  value={answer.ownerName}
                                  onChange={(e) => handleTextInput(question.id, 'ownerName', e.target.value)}
                                  onBlur={() => handleTextBlur(question.id, 'ownerName')}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-400">
                                Owner Email
                                <input
                                  type="email"
                                  disabled={!editable}
                                  value={answer.ownerEmail}
                                  onChange={(e) => handleTextInput(question.id, 'ownerEmail', e.target.value)}
                                  onBlur={() => handleTextBlur(question.id, 'ownerEmail')}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-400">
                                Remediation Due Date
                                <input
                                  type="date"
                                  disabled={!editable}
                                  value={answer.remediationDueDate}
                                  onChange={(e) => handleImmediateChange(question.id, 'remediationDueDate', e.target.value)}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50"
                                />
                              </label>
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-slate-400">
                              Rationale
                              <textarea
                                rows={2}
                                disabled={!editable}
                                value={answer.rationale}
                                onChange={(e) => handleTextInput(question.id, 'rationale', e.target.value)}
                                onBlur={() => handleTextBlur(question.id, 'rationale')}
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50 resize-y"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-slate-400">
                              Evidence
                              <textarea
                                rows={2}
                                disabled={!editable}
                                value={answer.evidence}
                                onChange={(e) => handleTextInput(question.id, 'evidence', e.target.value)}
                                onBlur={() => handleTextBlur(question.id, 'evidence')}
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50 resize-y"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-slate-400">
                              Assessor Comments
                              <textarea
                                rows={2}
                                disabled={!editable}
                                value={answer.assessorComments}
                                onChange={(e) => handleTextInput(question.id, 'assessorComments', e.target.value)}
                                onBlur={() => handleTextBlur(question.id, 'assessorComments')}
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm disabled:opacity-50 resize-y"
                              />
                            </label>
                            <div className="flex items-center gap-3 text-xs">
                              {state === 'saving' && <span className="text-slate-500">Saving…</span>}
                              {state === 'saved' && <span className="text-green-500">Saved</span>}
                              {state === 'error' && <span className="text-red-400">Failed to save</span>}
                            </div>
                          </div>
                        )}
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
