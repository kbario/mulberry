import { solidStartHandler } from '@mulberry/convex-solid';
import { createServerFileRoute } from '@tanstack/solid-start/server';

export const ServerRoute = createServerFileRoute('/api/auth/$').methods({
  GET: ({ request }) => {
    return solidStartHandler(request);
  },
  POST: ({ request }) => {
    return solidStartHandler(request);
  },
});
