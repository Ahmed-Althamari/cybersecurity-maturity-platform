import { signOut } from 'next-auth/react';

import { api } from './api';

// Every "Sign Out" button in the app should call this, not next-auth's
// signOut() directly: NextAuth's signOut() only clears the browser's own
// session cookie -- it has no idea the CMMP API's JWT (session.accessToken)
// exists, so without this, the token stayed valid server-side for its full
// 24h lifetime even after the user "signed out" (docs/threat-model.md's
// token-revocation gap). Best-effort: if the API call fails (already
// expired, network blip), the user should still be signed out client-side
// rather than getting stuck.
export async function signOutAndRevoke(accessToken: string | undefined, callbackUrl: string) {
  if (accessToken) {
    await api.logout(accessToken).catch(() => undefined);
  }
  await signOut({ callbackUrl });
}
