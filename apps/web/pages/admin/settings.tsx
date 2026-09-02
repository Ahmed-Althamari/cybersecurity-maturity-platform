import type { IntegrationSettingsStatus } from '@cmmp/shared';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';

const inputClass =
  'w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none';

const SOURCE_LABEL: Record<IntegrationSettingsStatus['anthropicApiKeySource'], string> = {
  database: 'Configured (saved here)',
  environment: 'Configured (server environment variable)',
  none: 'Not configured',
};

export default function AdminSettingsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [settings, setSettings] = useState<IntegrationSettingsStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [sessionStatus, router]);

  function loadSettings() {
    if (!session) return;
    api
      .getIntegrationSettings(session.accessToken)
      .then((result) => {
        setSettings(result);
        setForbidden(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
        } else {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load settings');
        }
      });
  }

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session]);

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && !settings && !loadError && !forbidden)) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (sessionStatus !== 'authenticated') {
    return null;
  }

  async function handleSave() {
    if (!session || !apiKeyInput.trim()) return;
    setSaving(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await api.setAnthropicApiKey(session.accessToken, apiKeyInput.trim());
      setSettings(result);
      setApiKeyInput(''); // write-only: never keep the pasted value around after a successful save
      setActionMessage('API key saved. It takes effect immediately -- no restart needed.');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to save the API key');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!session) return;
    setClearing(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await api.clearAnthropicApiKey(session.accessToken);
      setSettings(result);
      setActionMessage('Stored API key removed.');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to clear the API key');
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <Head>
        <title>Settings · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto max-w-2xl px-4 py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <Link href="/assessments" className="text-sm text-slate-400 hover:text-slate-200">
                &larr; Assessments
              </Link>
              <h1 className="mt-1 text-3xl font-bold text-white">Settings</h1>
              <p className="text-slate-400">Platform-wide integration configuration</p>
            </div>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
              Sign Out
            </Button>
          </div>

          {forbidden && (
            <p className="text-sm text-red-400">You don&apos;t have permission to view platform settings.</p>
          )}
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}

          {settings && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Anthropic API Key</CardTitle>
                  <Badge variant={settings.anthropicApiKeyConfigured ? 'minimal' : 'default'}>
                    {SOURCE_LABEL[settings.anthropicApiKeySource]}
                  </Badge>
                </div>
                <CardDescription>
                  Powers the AI-assisted column-mapping suggestion in the spreadsheet importer. Optional -- without
                  it, imports still work, just without that one enhancement (unmatched columns are left for a
                  human to map by hand). The key is encrypted before it&apos;s stored and is never shown again once
                  saved -- this form is write-only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-slate-400" htmlFor="anthropic-api-key">
                    {settings.anthropicApiKeyConfigured ? 'Replace the API key' : 'Set an API key'}
                  </label>
                  <input
                    id="anthropic-api-key"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-ant-..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={handleSave} disabled={saving || !apiKeyInput.trim()}>
                    {saving ? 'Saving…' : 'Save Key'}
                  </Button>
                  {settings.anthropicApiKeySource === 'database' && (
                    <Button variant="outline" onClick={handleClear} disabled={clearing}>
                      {clearing ? 'Clearing…' : 'Clear Stored Key'}
                    </Button>
                  )}
                </div>

                {actionMessage && <p className="text-sm text-emerald-400">{actionMessage}</p>}
                {actionError && <p className="text-sm text-red-400">{actionError}</p>}

                {settings.anthropicApiKeySource === 'environment' && (
                  <p className="text-xs text-slate-500">
                    Currently sourced from this server&apos;s <code>ANTHROPIC_API_KEY</code> environment variable.
                    Saving a key here overrides it (takes effect immediately, without removing the env var);
                    clearing a saved key falls back to the environment variable again.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
      <p className="text-slate-400">{children}</p>
    </div>
  );
}
