import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { BackLink } from '../../components/layout/BackLink';
import { RiskLevelBadge } from '../../components/risks/RiskLevelBadge';
import { StrategicStatusBadge } from '../../components/strategic-plan/StrategicStatusBadge';
import {
  addMilestone,
  ApiError,
  deleteMilestone,
  deleteStrategicInitiative,
  deleteStrategicProgress,
  getStrategicInitiative,
  linkStrategicInitiative,
  listRisks,
  recordStrategicProgress,
  unlinkStrategicInitiative,
  updateMilestone,
  updateStrategicInitiative,
  type RiskRecord,
  type StrategicInitiativeRecord,
} from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, STRATEGIC_DELETE_ROLES, STRATEGIC_WRITE_ROLES } from '../../lib/roles';

interface InitiativeDetailPageProps {
  initiative: StrategicInitiativeRecord | null;
  linkableRisks: RiskRecord[];
  accessToken: string;
  canEdit: boolean;
  canDelete: boolean;
  errorMessage: string | null;
}

const SCALE = [1, 2, 3, 4, 5];
const STATUS_OPTIONS = ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const MILESTONE_STATUS_OPTIONS = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function toMonthLabel(iso: string): string {
  const [year, month] = iso.slice(0, 7).split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function InitiativeDetailPage({ initiative, linkableRisks, accessToken, canEdit, canDelete, errorMessage }: InitiativeDetailPageProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initiative?.title ?? '');
  const [description, setDescription] = useState(initiative?.description ?? '');
  const [strategicObjective, setStrategicObjective] = useState(initiative?.strategicObjective ?? '');
  const [owner, setOwner] = useState(initiative?.owner ?? '');
  const [priority, setPriority] = useState(initiative?.priority ?? 3);
  const [weight, setWeight] = useState(initiative ? String(initiative.weight) : '1');
  const [status, setStatus] = useState(initiative?.status ?? 'NOT_STARTED');
  const [startDate, setStartDate] = useState(toDateInputValue(initiative?.startDate ?? null));
  const [targetDate, setTargetDate] = useState(toDateInputValue(initiative?.targetDate ?? null));
  const [notes, setNotes] = useState(initiative?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [milestones, setMilestones] = useState(initiative?.milestones ?? []);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDueDate, setMilestoneDueDate] = useState('');
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  const [monthlyProgress, setMonthlyProgress] = useState(initiative?.monthlyProgress ?? []);
  const [progressMonth, setProgressMonth] = useState('');
  const [progressPercent, setProgressPercent] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [progressError, setProgressError] = useState<string | null>(null);
  const [currentPercent, setCurrentPercent] = useState(initiative?.percentComplete ?? 0);

  const [linkedRisks, setLinkedRisks] = useState(initiative?.risks ?? []);
  const [riskSearch, setRiskSearch] = useState('');
  const [selectedRiskId, setSelectedRiskId] = useState('');
  const [riskLinkError, setRiskLinkError] = useState<string | null>(null);

  if (!initiative) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8">
          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4">{errorMessage}</div>}
        </div>
      </div>
    );
  }

  function toIsoDate(dateInput: string): string | undefined {
    return dateInput ? new Date(`${dateInput}T00:00:00.000Z`).toISOString() : undefined;
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      await updateStrategicInitiative(accessToken, initiative!.id, {
        title,
        description,
        strategicObjective,
        owner,
        priority,
        weight: weight ? Number(weight) : undefined,
        status,
        notes,
        startDate: toIsoDate(startDate),
        targetDate: toIsoDate(targetDate),
      });
      setSaveMessage('Saved.');
      router.replace(router.asPath);
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteStrategicInitiative(accessToken, initiative!.id);
      router.push('/strategic-plan');
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : 'Failed to delete this initiative.');
      setDeleting(false);
    }
  }

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    setMilestoneError(null);
    try {
      const updated = await addMilestone(accessToken, initiative!.id, {
        title: milestoneTitle,
        dueDate: toIsoDate(milestoneDueDate),
      });
      setMilestones(updated.milestones);
      setMilestoneTitle('');
      setMilestoneDueDate('');
    } catch (err) {
      setMilestoneError(err instanceof ApiError ? err.message : 'Failed to add milestone.');
    }
  }

  async function handleToggleMilestone(milestoneId: string, nextStatus: string) {
    setMilestoneError(null);
    try {
      const updated = await updateMilestone(accessToken, initiative!.id, milestoneId, { status: nextStatus });
      setMilestones((current) => current.map((m) => (m.id === milestoneId ? updated : m)));
    } catch (err) {
      setMilestoneError(err instanceof ApiError ? err.message : 'Failed to update milestone.');
    }
  }

  async function handleDeleteMilestone(milestoneId: string) {
    setMilestoneError(null);
    try {
      await deleteMilestone(accessToken, initiative!.id, milestoneId);
      setMilestones((current) => current.filter((m) => m.id !== milestoneId));
    } catch (err) {
      setMilestoneError(err instanceof ApiError ? err.message : 'Failed to delete milestone.');
    }
  }

  async function handleRecordProgress(e: React.FormEvent) {
    e.preventDefault();
    setProgressError(null);
    if (!progressMonth || progressPercent === '') return;
    try {
      const updated = await recordStrategicProgress(accessToken, initiative!.id, {
        month: progressMonth,
        percentComplete: Number(progressPercent),
        note: progressNote || undefined,
      });
      setMonthlyProgress(updated.monthlyProgress);
      setCurrentPercent(updated.percentComplete);
      setProgressMonth('');
      setProgressPercent('');
      setProgressNote('');
    } catch (err) {
      setProgressError(err instanceof ApiError ? err.message : 'Failed to record progress.');
    }
  }

  async function handleDeleteProgress(progressId: string) {
    setProgressError(null);
    try {
      const updated = await deleteStrategicProgress(accessToken, initiative!.id, progressId);
      setMonthlyProgress(updated.monthlyProgress);
      setCurrentPercent(updated.percentComplete);
    } catch (err) {
      setProgressError(err instanceof ApiError ? err.message : 'Failed to delete this entry.');
    }
  }

  async function handleLinkRisk() {
    if (!selectedRiskId) return;
    setRiskLinkError(null);
    try {
      await linkStrategicInitiative(accessToken, initiative!.id, selectedRiskId);
      const risk = linkableRisks.find((r) => r.id === selectedRiskId);
      if (risk) {
        setLinkedRisks((current) => [...current, { id: risk.id, title: risk.title, riskLevel: risk.riskLevel, status: risk.status }]);
      }
      setSelectedRiskId('');
    } catch (err) {
      setRiskLinkError(err instanceof ApiError ? err.message : 'Failed to link risk.');
    }
  }

  async function handleUnlinkRisk(riskId: string) {
    setRiskLinkError(null);
    try {
      await unlinkStrategicInitiative(accessToken, initiative!.id, riskId);
      setLinkedRisks((current) => current.filter((r) => r.id !== riskId));
    } catch (err) {
      setRiskLinkError(err instanceof ApiError ? err.message : 'Failed to unlink risk.');
    }
  }

  const unlinkedMatches = linkableRisks.filter(
    (r) => !linkedRisks.some((linked) => linked.id === r.id) && r.title.toLowerCase().includes(riskSearch.trim().toLowerCase()),
  );

  return (
    <>
      <Head>
        <title>{initiative.title} - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <BackLink href="/strategic-plan">Strategic Plan</BackLink>
          <div className="flex items-center justify-between mt-1 mb-1 gap-3">
            <h1 className="text-3xl font-bold text-white">
              <span className="text-slate-500">{initiative.code}</span> {initiative.title}
            </h1>
            <StrategicStatusBadge status={initiative.status} />
          </div>
          <div className="flex items-center gap-2 mb-8">
            <div className="flex-1 rounded-full bg-slate-700 overflow-hidden h-2">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${currentPercent}%` }} />
            </div>
            <span className="text-sm text-slate-400 w-12 text-right">{currentPercent}%</span>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4">
            <div>
              <label htmlFor="initiative-title" className="block text-sm text-slate-300 mb-1">
                Title
              </label>
              <input
                id="initiative-title"
                disabled={!canEdit}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="initiative-description" className="block text-sm text-slate-300 mb-1">
                Description
              </label>
              <textarea
                id="initiative-description"
                disabled={!canEdit}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="initiative-objective" className="block text-sm text-slate-300 mb-1">
                Strategic Objective
              </label>
              <input
                id="initiative-objective"
                disabled={!canEdit}
                value={strategicObjective}
                onChange={(e) => setStrategicObjective(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-priority" className="block text-sm text-slate-300 mb-1">
                  Priority (1 = highest)
                </label>
                <select
                  id="initiative-priority"
                  disabled={!canEdit}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                >
                  {SCALE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="initiative-weight" className="block text-sm text-slate-300 mb-1">
                  Weight
                </label>
                <input
                  id="initiative-weight"
                  type="number"
                  min={0}
                  step="0.1"
                  disabled={!canEdit}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-status" className="block text-sm text-slate-300 mb-1">
                  Status
                </label>
                <select
                  id="initiative-status"
                  disabled={!canEdit}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="initiative-owner" className="block text-sm text-slate-300 mb-1">
                  Owner
                </label>
                <input
                  id="initiative-owner"
                  disabled={!canEdit}
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-start-date" className="block text-sm text-slate-300 mb-1">
                  Start Date
                </label>
                <input
                  id="initiative-start-date"
                  type="date"
                  disabled={!canEdit}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="initiative-target-date" className="block text-sm text-slate-300 mb-1">
                  Target Date
                </label>
                <input
                  id="initiative-target-date"
                  type="date"
                  disabled={!canEdit}
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
            </div>
            <div>
              <label htmlFor="initiative-notes" className="block text-sm text-slate-300 mb-1">
                Comments / Notes
              </label>
              <textarea
                id="initiative-notes"
                disabled={!canEdit}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>

            {saveMessage && <p className="text-sm text-slate-300">{saveMessage}</p>}

            <div className="flex items-center justify-between pt-2">
              {canEdit ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              ) : (
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Read-only</span>
              )}
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-red-400 hover:text-red-300 disabled:opacity-50 text-sm font-medium"
                >
                  {deleting ? 'Deleting…' : 'Delete Initiative'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-3 mt-6">
            <h2 className="text-lg font-semibold text-white">Key Milestones</h2>
            {milestones.length === 0 ? (
              <p className="text-sm text-slate-500">No milestones yet.</p>
            ) : (
              <ul className="space-y-2">
                {milestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-center justify-between rounded-md border border-slate-700 p-3 text-sm gap-3">
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${milestone.status === 'COMPLETED' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                        {milestone.title}
                      </p>
                      <p className="text-xs text-slate-500">{milestone.dueDate ? `Due ${toDateInputValue(milestone.dueDate)}` : 'No due date'}</p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={milestone.status}
                          onChange={(e) => handleToggleMilestone(milestone.id, e.target.value)}
                          className="rounded-md bg-slate-900 border border-slate-600 px-2 py-1 text-xs text-white"
                        >
                          {MILESTONE_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteMilestone(milestone.id)}
                          className="text-red-400 hover:text-red-300 text-xs font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form onSubmit={handleAddMilestone} className="flex items-end gap-2 pt-2 border-t border-slate-700">
                <div className="flex-1">
                  <label htmlFor="milestone-title" className="block text-xs text-slate-400 mb-1">
                    New milestone
                  </label>
                  <input
                    id="milestone-title"
                    required
                    value={milestoneTitle}
                    onChange={(e) => setMilestoneTitle(e.target.value)}
                    className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label htmlFor="milestone-due-date" className="block text-xs text-slate-400 mb-1">
                    Due date
                  </label>
                  <input
                    id="milestone-due-date"
                    type="date"
                    value={milestoneDueDate}
                    onChange={(e) => setMilestoneDueDate(e.target.value)}
                    className="rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <button type="submit" className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
                  Add
                </button>
              </form>
            )}
            {milestoneError && <p className="text-sm text-red-400">{milestoneError}</p>}
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-3 mt-6">
            <h2 className="text-lg font-semibold text-white">Monthly Progress History</h2>
            {monthlyProgress.length === 0 ? (
              <p className="text-sm text-slate-500">No monthly updates recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase">
                    <th className="pb-2">Month</th>
                    <th className="pb-2">Progress</th>
                    <th className="pb-2">Note</th>
                    {canEdit && <th className="pb-2" />}
                  </tr>
                </thead>
                <tbody>
                  {monthlyProgress.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-700">
                      <td className="py-2 text-slate-300">{toMonthLabel(entry.month)}</td>
                      <td className="py-2 text-slate-300">{entry.percentComplete}%</td>
                      <td className="py-2 text-slate-500">{entry.note ?? '—'}</td>
                      {canEdit && (
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteProgress(entry.id)}
                            className="text-red-400 hover:text-red-300 text-xs font-medium"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canEdit && (
              <form onSubmit={handleRecordProgress} className="grid grid-cols-[1fr_1fr_2fr_auto] items-end gap-2 pt-2 border-t border-slate-700">
                <div>
                  <label htmlFor="progress-month" className="block text-xs text-slate-400 mb-1">
                    Month
                  </label>
                  <input
                    id="progress-month"
                    type="month"
                    required
                    value={progressMonth}
                    onChange={(e) => setProgressMonth(e.target.value)}
                    className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label htmlFor="progress-percent" className="block text-xs text-slate-400 mb-1">
                    Progress %
                  </label>
                  <input
                    id="progress-percent"
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={progressPercent}
                    onChange={(e) => setProgressPercent(e.target.value)}
                    className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label htmlFor="progress-note" className="block text-xs text-slate-400 mb-1">
                    Update note
                  </label>
                  <input
                    id="progress-note"
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <button type="submit" className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500">
                  Save
                </button>
              </form>
            )}
            {progressError && <p className="text-sm text-red-400">{progressError}</p>}
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-3 mt-6">
            <h2 className="text-lg font-semibold text-white">Linked Risks</h2>
            <p className="text-xs text-slate-500">
              Progress on this initiative also shows on each linked risk&apos;s own detail page as supporting context for its treatment status.
            </p>
            {linkedRisks.length === 0 ? (
              <p className="text-sm text-slate-500">No risks linked yet.</p>
            ) : (
              <ul className="space-y-2">
                {linkedRisks.map((risk) => (
                  <li key={risk.id}>
                    <div className="flex items-center justify-between rounded-md border border-slate-700 p-3 text-sm">
                      <Link href={`/risks/${risk.id}`} className="min-w-0 flex-1 hover:text-blue-400 transition-colors">
                        <p className="font-medium text-slate-200 truncate">{risk.title}</p>
                        <p className="text-xs text-slate-500">{risk.status}</p>
                      </Link>
                      <div className="flex items-center gap-3 shrink-0">
                        <RiskLevelBadge riskLevel={risk.riskLevel} />
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleUnlinkRisk(risk.id)}
                            className="text-red-400 hover:text-red-300 text-xs font-medium"
                          >
                            Unlink
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className="space-y-2 pt-2 border-t border-slate-700">
                <label htmlFor="risk-search" className="block text-sm text-slate-300 mb-1">
                  Link an existing risk
                </label>
                <input
                  id="risk-search"
                  type="text"
                  value={riskSearch}
                  onChange={(e) => setRiskSearch(e.target.value)}
                  placeholder="Search risks by title…"
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-600"
                />
                <div className="max-h-48 overflow-y-auto rounded-md border border-slate-700">
                  {unlinkedMatches.length === 0 && (
                    <p className="p-3 text-sm text-slate-500">
                      {riskSearch ? 'No matching risks.' : 'Every open risk is already linked to this initiative.'}
                    </p>
                  )}
                  {unlinkedMatches.map((risk) => (
                    <button
                      key={risk.id}
                      type="button"
                      onClick={() => setSelectedRiskId(risk.id)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                        selectedRiskId === risk.id ? 'bg-blue-600/30 text-white' : 'text-slate-300 hover:bg-slate-700/40'
                      }`}
                    >
                      <span className="truncate">{risk.title}</span>
                      <RiskLevelBadge riskLevel={risk.riskLevel} />
                    </button>
                  ))}
                </div>
                {riskLinkError && <p className="text-sm text-red-400">{riskLinkError}</p>}
                <button
                  type="button"
                  onClick={handleLinkRisk}
                  disabled={!selectedRiskId}
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 disabled:opacity-50"
                >
                  Link
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<InitiativeDetailPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { notFound: true };
  }

  const canEdit = hasAnyRole(session.roles ?? [], STRATEGIC_WRITE_ROLES);
  const canDelete = hasAnyRole(session.roles ?? [], STRATEGIC_DELETE_ROLES);

  try {
    const initiative = await getStrategicInitiative(session.accessToken, id);
    // Only fetched for the "link a risk" picker, which only a writer sees — a read-only viewer's
    // page has no use for the full org risk list beyond what's already linked on `initiative`.
    let linkableRisks: RiskRecord[] = [];
    if (canEdit) {
      try {
        linkableRisks = await listRisks(session.accessToken, initiative.organisationId);
      } catch {
        linkableRisks = [];
      }
    }
    return { props: { initiative, linkableRisks, accessToken: session.accessToken, canEdit, canDelete, errorMessage: null } };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { notFound: true };
    }
    const message = error instanceof ApiError ? error.message : 'Failed to load this initiative.';
    return { props: { initiative: null, linkableRisks: [], accessToken: session.accessToken, canEdit, canDelete, errorMessage: message } };
  }
};
