import type { GetServerSidePropsContext } from 'next';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../pages/api/auth/[...nextauth]';

/** Server-side session lookup for `getServerSideProps` — the same session shape `useSession()` returns client-side. */
export function getAuthSession(context: Pick<GetServerSidePropsContext, 'req' | 'res'>) {
  return getServerSession(context.req, context.res, authOptions);
}
