import { GitCompare, Loader2, Trash2 } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import {
  ApiError,
  createControlMapping,
  deleteControlMapping,
  getFrameworkCrosswalk,
  listFrameworks,
  type ControlMappingRecord,
  type ControlMappingRelationship,
  type FrameworkCrosswalk,
  type FrameworkSubcategorySummary,
  type FrameworkSummary,
} from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { CONTROL_MAPPING_WRITE_ROLES, hasAnyRole } from '../../lib/roles';

const RELATIONSHIPS: ControlMappingRelationship[] = ['EQUIVALENT', 'PARTIAL', 'RELATED'];

const RELATIONSHIP_COLORS: Record<ControlMappingRelationship, string> = {
  EQUIVALENT: 'bg-emerald-950/40 text-emerald-300 border border-emerald-800',
  PARTIAL: 'bg-indigo-950/40 text-indigo-300 border border-indigo-800',
  RELATED: 'bg-slate-700 text-slate-300 border border-slate-600',
};

interface MappingsPageProps {
  accessToken: string;
  userEmail: string;
  canEdit: boolean;
  frameworks: FrameworkSummary[];
  sourceFrameworkId: string;
  targetFrameworkId: string;
  initialCrosswalk: FrameworkCrosswalk | null;
  errorMessage: string | null;
}

interface ResolvedMapping {
  mapping: ControlMappingRecord;
  source: FrameworkSubcategorySummary;
  target: FrameworkSubcategorySummary;
}

function resolveMappings(crosswalk: FrameworkCrosswalk): ResolvedMapping[] {
  const sourceIds = new Set(crosswalk.sourceFramework.subcategories.map((s) => s.id));
  const bySubcategoryId = new Map<string, FrameworkSubcategorySummary>();
  crosswalk.sourceFramework.subcategories.forEach((s) => bySubcategoryId.set(s.id, s));
  crosswalk.targetFramework.subcategories.forEach((s) => bySubcategoryId.set(s.id, s));

  const resolved: ResolvedMapping[] = [];
  for (const mapping of crosswalk.mappings) {
    const sourceIsFirst = sourceIds.has(mapping.sourceSubcategoryId);
    const sourceId = sourceIsFirst ? mapping.sourceSubcategoryId : mapping.targetSubcategoryId;
    const targetId = sourceIsFirst ? mapping.targetSubcategoryId : mapping.sourceSubcategoryId;
    const source = bySubcategoryId.get(sourceId);
    const target = bySubcategoryId.get(targetId);
    if (source && target) {
      resolved.push({ mapping, source, target });
    }
  }
  return resolved;
}

function CrosswalkPanel({
  accessToken,
  canEdit,
  crosswalk,
}: {
  accessToken: string;
  canEdit: boolean;
  crosswalk: FrameworkCrosswalk;
}) {
  const [mappings, setMappings] = useState(crosswalk.mappings);
  const [sourceSubcategoryId, setSourceSubcategoryId] = useState(crosswalk.sourceFramework.subcategories[0]?.id ?? '');
  const [targetSubcategoryId, setTargetSubcategoryId] = useState(crosswalk.targetFramework.subcategories[0]?.id ?? '');
  const [relationship, setRelationship] = useState<ControlMappingRelationship>('EQUIVALENT');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolved = resolveMappings({ ...crosswalk, mappings });

  async function handleAdd() {
    if (!sourceSubcategoryId || !targetSubcategoryId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createControlMapping(accessToken, {
        sourceSubcategoryId,
        targetSubcategoryId,
        relationship,
        notes: notes.trim() || undefined,
      });
      setMappings((prev) => [...prev, created]);
      setNotes('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the mapping.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteControlMapping(accessToken, id);
      setMappings((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the mapping.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto mb-6">
        {resolved.length === 0 ? (
          <EmptyState icon={GitCompare} title="No mappings yet between these frameworks." />
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                <th className="py-3 px-4 font-medium">{crosswalk.sourceFramework.name}</th>
                <th className="py-3 px-4 font-medium">Relationship</th>
                <th className="py-3 px-4 font-medium">{crosswalk.targetFramework.name}</th>
                <th className="py-3 px-4 font-medium">Notes</th>
                {canEdit && <th className="py-3 px-4 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {resolved.map(({ mapping, source, target }) => (
                <tr key={mapping.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-3 px-4 text-slate-300">
                    <span className="text-slate-500">{source.code}</span> {source.name}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${RELATIONSHIP_COLORS[mapping.relationship]}`}>
                      {mapping.relationship}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    <span className="text-slate-500">{target.code}</span> {target.name}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{mapping.notes ?? '—'}</td>
                  {canEdit && (
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRemove(mapping.id)}
                        disabled={busyId === mapping.id}
                        className="text-red-400 hover:text-red-300 disabled:opacity-50"
                        aria-label="Remove mapping"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canEdit && (
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
          <h2 className="text-white font-semibold mb-3">Add mapping</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">{crosswalk.sourceFramework.name}</label>
              <select
                value={sourceSubcategoryId}
                onChange={(e) => setSourceSubcategoryId(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white"
              >
                {crosswalk.sourceFramework.subcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Relationship</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as ControlMappingRelationship)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">{crosswalk.targetFramework.name}</label>
              <select
                value={targetSubcategoryId}
                onChange={(e) => setTargetSubcategoryId(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white"
              >
                {crosswalk.targetFramework.subcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={busy || !sourceSubcategoryId || !targetSubcategoryId}
            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-1.5 px-4 rounded-md transition-colors flex items-center gap-1.5"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add mapping
          </button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      )}
    </>
  );
}

/**
 * A tenant's own crosswalk between two of its loaded frameworks (e.g. NIST CSF 2.0 to an
 * imported ISO 27001 catalog) — see apps/api/src/control-mappings. Requires at least two
 * frameworks loaded; the source/target picker below re-runs getServerSideProps via a GET form,
 * matching apps/web/pages/audit/index.tsx's filter pattern.
 */
export default function MappingsPage({
  accessToken,
  userEmail,
  canEdit,
  frameworks,
  sourceFrameworkId,
  targetFrameworkId,
  initialCrosswalk,
  errorMessage,
}: MappingsPageProps) {
  return (
    <>
      <Head>
        <title>Cross-Framework Mappings - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader userEmail={userEmail} />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-1">
            <GitCompare className="h-6 w-6 text-slate-400" />
            <h1 className="text-3xl font-bold text-white">Cross-Framework Mappings</h1>
          </div>
          <p className="text-slate-400 text-sm mb-8">
            Build your own crosswalk between two frameworks loaded for your tenant — map subcategories as equivalent, partial, or
            related.
          </p>

          {frameworks.length < 2 && (
            <EmptyState
              icon={GitCompare}
              title="You need at least two frameworks to build a crosswalk."
              description="Import a second framework from the Frameworks page, then come back here."
            />
          )}

          {frameworks.length >= 2 && (
            <>
              <form method="GET" className="flex flex-wrap items-end gap-3 mb-6 bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div>
                  <label htmlFor="source" className="block text-xs font-medium text-slate-400 mb-1">
                    From
                  </label>
                  <select
                    id="source"
                    name="source"
                    defaultValue={sourceFrameworkId}
                    className="rounded-md bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white"
                  >
                    {frameworks.map((fw) => (
                      <option key={fw.id} value={fw.id}>
                        {fw.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="target" className="block text-xs font-medium text-slate-400 mb-1">
                    To
                  </label>
                  <select
                    id="target"
                    name="target"
                    defaultValue={targetFrameworkId}
                    className="rounded-md bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white"
                  >
                    {frameworks.map((fw) => (
                      <option key={fw.id} value={fw.id}>
                        {fw.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md transition-colors"
                >
                  Compare
                </button>
              </form>

              {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

              {!errorMessage && sourceFrameworkId === targetFrameworkId && (
                <div className="bg-amber-950/30 border border-amber-800 text-amber-300 rounded-lg p-4 mb-6">
                  Choose two different frameworks to compare.
                </div>
              )}

              {!errorMessage && initialCrosswalk && (
                <CrosswalkPanel
                  key={`${sourceFrameworkId}:${targetFrameworkId}`}
                  accessToken={accessToken}
                  canEdit={canEdit}
                  crosswalk={initialCrosswalk}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<MappingsPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const canEdit = hasAnyRole(session.roles ?? [], CONTROL_MAPPING_WRITE_ROLES);
  const userEmail = session.user?.email ?? '';

  let frameworks: FrameworkSummary[] = [];
  try {
    frameworks = await listFrameworks(session.accessToken);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load frameworks.';
    return {
      props: {
        accessToken: session.accessToken,
        userEmail,
        canEdit,
        frameworks: [],
        sourceFrameworkId: '',
        targetFrameworkId: '',
        initialCrosswalk: null,
        errorMessage: message,
      },
    };
  }

  const querySource = typeof context.query.source === 'string' ? context.query.source : '';
  const queryTarget = typeof context.query.target === 'string' ? context.query.target : '';
  const sourceFrameworkId = querySource || frameworks[0]?.id || '';
  const targetFrameworkId = queryTarget || frameworks.find((fw) => fw.id !== sourceFrameworkId)?.id || '';

  if (frameworks.length < 2 || !sourceFrameworkId || !targetFrameworkId || sourceFrameworkId === targetFrameworkId) {
    return {
      props: { accessToken: session.accessToken, userEmail, canEdit, frameworks, sourceFrameworkId, targetFrameworkId, initialCrosswalk: null, errorMessage: null },
    };
  }

  try {
    const initialCrosswalk = await getFrameworkCrosswalk(session.accessToken, sourceFrameworkId, targetFrameworkId);
    return {
      props: { accessToken: session.accessToken, userEmail, canEdit, frameworks, sourceFrameworkId, targetFrameworkId, initialCrosswalk, errorMessage: null },
    };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load the crosswalk.';
    return {
      props: { accessToken: session.accessToken, userEmail, canEdit, frameworks, sourceFrameworkId, targetFrameworkId, initialCrosswalk: null, errorMessage: message },
    };
  }
};
