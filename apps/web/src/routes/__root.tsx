import { Outlet, createRootRouteWithContext } from '@tanstack/solid-router';
import { QueryClient } from '@tanstack/solid-query';
import { useRouteContext } from '@tanstack/solid-router';
import { createServerFn } from '@tanstack/solid-start';
import {
  ConvexQueryClient,
  ConvexBetterAuthProvider,
  getAuth,
} from '@mulberry/convex-solid';
import { getWebRequest } from '@tanstack/solid-start/server';
import { ConvexReactClient } from 'convex/react';
import { authClient } from '../lib/auth';

import '@fontsource/inter';

// Get auth information for SSR using available cookies
const fetchAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const { createAuth } = await import('@mulberry/convex/auth');
  const { userId, token } = await getAuth(getWebRequest(), createAuth);
  return {
    userId,
    token,
  };
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  beforeLoad: async (ctx) => {
    // all queries, mutations and action made with TanStack Query will be
    // authenticated by an identity token.
    const { userId, token } = await fetchAuth();

    // During SSR only (the only time serverHttpClient exists),
    // set the auth token to make HTTP queries with.
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    }

    return { userId, token };
  },
  component: RootComponent,
});

function RootComponent() {
  const context = useRouteContext({ from: Route.id });
  return (
    <ConvexBetterAuthProvider
      client={context.convexClient}
      authClient={authClient}>
      <Outlet />
    </ConvexBetterAuthProvider>
  );
}
