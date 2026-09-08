import { CheckCircle2, KeyRound, Loader2, Sparkles, Trash2, XCircle } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import {
  ApiError,
  deleteLlmProviderSetting,
  listLlmProviderSettings,
  testLlmProviderSetting,
  upsertLlmProviderSetting,
  type LlmProviderFormat,
  type LlmProviderSettingView,
} from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, LLM_SETTINGS_WRITE_ROLES } from '../../lib/roles';

interface AiSettingsPageProps {
  accessToken: string;
  userEmail: string;
  canEdit: boolean;
  initialSettings: LlmProviderSettingView[];
  loadError: string | null;
}

interface SlotFormState {
  format: LlmProviderFormat;
  baseUrl: string;
  model: string;
  apiKey: string;
}

function emptyForm(setting: LlmProviderSettingView): SlotFormState {
  return { format: setting.format, baseUrl: setting.baseUrl ?? '', model: setting.model, apiKey: '' };
}

function statusBadge(setting: LlmProviderSettingView) {
  if (setting.configured) {
    return (
      <span className="text-xs px-2 py-1 rounded-full border bg-emerald-950/40 border-emerald-800 text-emerald-300">
        Configured for this organisation
      </span>
    );
  }
  if (setting.platformDefaultAvailable) {
    return (
      <span className="text-xs px-2 py-1 rounded-full border bg-indigo-950/40 border-indigo-800 text-indigo-300">
        Using platform default
      </span>
    );
  }
  return <span className="text-xs px-2 py-1 rounded-full border bg-slate-800 border-slate-700 text-slate-400">Not configured</span>;
}

/**
 * The "AI Assisted" panel — lets a tenant admin configure its own LLM provider credentials
 * (Claude, or any OpenAI-compatible endpoint) from the UI instead of only via server env vars.
 * Once a slot is configured here, both the import wizard's column-mapping suggestions and the
 * Data Analysis page's "ai" mode run on this tenant's own key (see apps/api/src/llm-settings).
 */
export default function AiSettingsPage({ accessToken, userEmail, canEdit, initialSettings, loadError }: AiSettingsPageProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [forms, setForms] = useState<Record<number, SlotFormState>>(() =>
    Object.fromEntries(initialSettings.map((s) => [s.slot, emptyForm(s)])),
  );
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; error?: string } | undefined>>({});
  const [errors, setErrors] = useState<Record<number, string | undefined>>({});

  function updateForm(slot: number, patch: Partial<SlotFormState>) {
    setForms((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
  }

  async function handleSave(slot: number) {
    const form = forms[slot];
    setBusySlot(slot);
    setErrors((prev) => ({ ...prev, [slot]: undefined }));
    try {
      const updated = await upsertLlmProviderSetting(accessToken, slot, {
        format: form.format,
        baseUrl: form.baseUrl || undefined,
        model: form.model,
        apiKey: form.apiKey,
      });
      setSettings((prev) => prev.map((s) => (s.slot === slot ? updated : s)));
      setForms((prev) => ({ ...prev, [slot]: emptyForm(updated) }));
      setEditingSlot(null);
      setTestResults((prev) => ({ ...prev, [slot]: undefined }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [slot]: err instanceof ApiError ? err.message : 'Failed to save.' }));
    } finally {
      setBusySlot(null);
    }
  }

  async function handleTest(slot: number) {
    const form = forms[slot];
    setBusySlot(slot);
    setTestResults((prev) => ({ ...prev, [slot]: undefined }));
    try {
      // Test the in-progress form if a new key was typed; otherwise test the already-saved row.
      const result = await testLlmProviderSetting(
        accessToken,
        slot,
        form.apiKey ? { format: form.format, baseUrl: form.baseUrl || undefined, model: form.model, apiKey: form.apiKey } : undefined,
      );
      setTestResults((prev) => ({ ...prev, [slot]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [slot]: { ok: false, error: err instanceof ApiError ? err.message : 'Test failed.' } }));
    } finally {
      setBusySlot(null);
    }
  }

  async function handleRemove(slot: number) {
    setBusySlot(slot);
    try {
      await deleteLlmProviderSetting(accessToken, slot);
      const [refreshed] = await Promise.all([listLlmProviderSettings(accessToken)]);
      setSettings(refreshed);
      setForms((prev) => ({ ...prev, [slot]: emptyForm(refreshed.find((s) => s.slot === slot)!) }));
      setTestResults((prev) => ({ ...prev, [slot]: undefined }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [slot]: err instanceof ApiError ? err.message : 'Failed to remove.' }));
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <>
      <Head>
        <title>AI Assisted Settings - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader userEmail={userEmail} />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-6 w-6 text-indigo-400" />
            <h1 className="text-3xl font-bold text-white">AI Assisted Settings</h1>
          </div>
          <p className="text-slate-400 text-sm mb-8">
            Configure your organisation&apos;s own LLM provider credentials — Claude (Anthropic) or any OpenAI-compatible endpoint
            (OpenRouter, Groq, a self-hosted server). Once a slot is configured here, it takes over the import wizard&apos;s
            column-mapping suggestions and the Data Analysis page&apos;s AI-Powered mode for this organisation, in place of the
            platform-wide defaults. Slots are tried in order (1 first) — configure more than one for automatic fallback.
          </p>

          {!canEdit && (
            <div className="mb-6 rounded-md border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
              You can view what&apos;s configured, but only an organisation or platform admin can add, change, or remove credentials.
            </div>
          )}

          {loadError && <p className="text-sm text-red-400 mb-6">{loadError}</p>}

          <div className="space-y-4">
            {settings.map((setting) => {
              const form = forms[setting.slot];
              const isEditing = editingSlot === setting.slot;
              const isBusy = busySlot === setting.slot;
              const testResult = testResults[setting.slot];
              const error = errors[setting.slot];

              return (
                <div key={setting.slot} className="bg-slate-800 rounded-lg p-5 border border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-slate-400" />
                      <h2 className="text-white font-semibold">Provider Slot {setting.slot}</h2>
                    </div>
                    {statusBadge(setting)}
                  </div>

                  {!isEditing && (
                    <div className="text-sm text-slate-300 space-y-1">
                      <p>
                        <span className="text-slate-500">Format:</span> {setting.format}
                      </p>
                      {setting.baseUrl && (
                        <p>
                          <span className="text-slate-500">Base URL:</span> {setting.baseUrl}
                        </p>
                      )}
                      <p>
                        <span className="text-slate-500">Model:</span> {setting.model || '(none set)'}
                      </p>
                      {setting.apiKeyPreview && (
                        <p>
                          <span className="text-slate-500">API key:</span> {setting.apiKeyPreview}
                        </p>
                      )}
                    </div>
                  )}

                  {isEditing && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Format</label>
                          <select
                            value={form.format}
                            onChange={(e) => updateForm(setting.slot, { format: e.target.value as LlmProviderFormat })}
                            className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white"
                          >
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="openai">OpenAI-compatible</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Model</label>
                          <input
                            type="text"
                            value={form.model}
                            onChange={(e) => updateForm(setting.slot, { model: e.target.value })}
                            placeholder={form.format === 'anthropic' ? 'claude-opus-5' : 'e.g. gpt-4.1'}
                            className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                          />
                        </div>
                      </div>
                      {form.format === 'openai' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Base URL</label>
                          <input
                            type="text"
                            value={form.baseUrl}
                            onChange={(e) => updateForm(setting.slot, { baseUrl: e.target.value })}
                            placeholder="https://openrouter.ai/api/v1"
                            className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">API Key</label>
                        <input
                          type="password"
                          value={form.apiKey}
                          onChange={(e) => updateForm(setting.slot, { apiKey: e.target.value })}
                          placeholder={setting.configured ? 'Leave blank to keep the saved key' : 'sk-...'}
                          className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                        />
                      </div>
                    </div>
                  )}

                  {testResult && (
                    <div
                      className={`mt-3 flex items-center gap-1.5 text-sm ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {testResult.ok ? 'Connection succeeded.' : testResult.error}
                    </div>
                  )}
                  {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

                  {canEdit && (
                    <div className="mt-4 flex items-center gap-2">
                      {!isEditing && (
                        <button
                          onClick={() => setEditingSlot(setting.slot)}
                          className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors"
                        >
                          {setting.configured ? 'Edit' : 'Configure'}
                        </button>
                      )}
                      {isEditing && (
                        <>
                          <button
                            onClick={() => handleSave(setting.slot)}
                            disabled={isBusy || !form.model || (!setting.configured && !form.apiKey)}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors flex items-center gap-1.5"
                          >
                            {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Save
                          </button>
                          <button
                            onClick={() => handleTest(setting.slot)}
                            disabled={isBusy || !form.model}
                            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => {
                              setEditingSlot(null);
                              setForms((prev) => ({ ...prev, [setting.slot]: emptyForm(setting) }));
                            }}
                            className="text-slate-400 hover:text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {!isEditing && setting.configured && (
                        <>
                          <button
                            onClick={() => handleTest(setting.slot)}
                            disabled={isBusy}
                            className="text-slate-400 hover:text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => handleRemove(setting.slot)}
                            disabled={isBusy}
                            className="ml-auto text-red-400 hover:text-red-300 text-sm font-medium py-1.5 px-3 rounded-md transition-colors flex items-center gap-1.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AiSettingsPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const canEdit = hasAnyRole(session.roles ?? [], LLM_SETTINGS_WRITE_ROLES);
  try {
    const initialSettings = await listLlmProviderSettings(session.accessToken);
    return { props: { accessToken: session.accessToken, userEmail: session.user?.email ?? '', canEdit, initialSettings, loadError: null } };
  } catch (error) {
    return {
      props: {
        accessToken: session.accessToken,
        userEmail: session.user?.email ?? '',
        canEdit,
        initialSettings: [],
        loadError: error instanceof ApiError ? error.message : 'Failed to load AI settings.',
      },
    };
  }
};
