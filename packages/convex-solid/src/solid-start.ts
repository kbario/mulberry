import { betterAuth } from 'better-auth'
import { createCookieGetter } from 'better-auth/cookies'
import { betterFetch } from '@better-fetch/fetch'
import {
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
} from 'convex/server'
import { JWT_COOKIE_NAME } from '@convex-dev/better-auth/plugins'
import { ConvexHttpClient } from 'convex/browser'

export const getCookieName = (
  createAuth: (ctx: any) => ReturnType<typeof betterAuth>,
) => {
  const createCookie = createCookieGetter(createAuth({} as any).options)
  const cookie = createCookie(JWT_COOKIE_NAME)
  return cookie.name
}

export const setupFetchClient = async (
  createAuth: (ctx: any) => ReturnType<typeof betterAuth>,
) => {
  const { getCookie } = await import('@tanstack/solid-start/server')
  const createClient = () => {
    const sessionCookieName = getCookieName(createAuth)
    const token = getCookie(sessionCookieName)
    const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!)
    if (token) {
      client.setAuth(token)
    }
    return client
  }
  return {
    fetchQuery<
      Query extends FunctionReference<'query'>,
      FuncRef extends FunctionReference<any, any>,
    >(
      query: Query,
      args: FuncRef['_args'],
    ): Promise<FunctionReturnType<Query>> {
      return createClient().query(query, args)
    },
    fetchMutation<
      Mutation extends FunctionReference<'mutation'>,
      FuncRef extends FunctionReference<any, any>,
    >(
      mutation: Mutation,
      args: FuncRef['_args'],
    ): Promise<FunctionReturnType<Mutation>> {
      return createClient().mutation(mutation, args)
    },
    fetchAction<
      Action extends FunctionReference<'action'>,
      FuncRef extends FunctionReference<any, any>,
    >(
      action: Action,
      args: FuncRef['_args'],
    ): Promise<FunctionReturnType<Action>> {
      return createClient().action(action, args)
    },
  }
}

export const fetchSession = async <
  T extends (ctx: GenericActionCtx<any>) => ReturnType<typeof betterAuth>,
>(
  request: Request,
  opts?: {
    convexSiteUrl?: string
    verbose?: boolean
  },
) => {
  type Session = ReturnType<T>['$Infer']['Session']

  if (!request) {
    throw new Error('No request found')
  }
  const convexSiteUrl = opts?.convexSiteUrl ?? process.env.VITE_CONVEX_SITE_URL
  if (!convexSiteUrl) {
    throw new Error('VITE_CONVEX_SITE_URL is not set')
  }
  const { data: session } = await betterFetch<Session>(
    '/api/auth/get-session',
    {
      baseURL: convexSiteUrl,
      headers: {
        cookie: request.headers.get('cookie') ?? '',
      },
    },
  )
  return {
    session,
  }
}

export const getAuth = async (
  request: Request,
  createAuth: (ctx: any) => ReturnType<typeof betterAuth>,
  opts?: { convexSiteUrl?: string },
) => {
  const { getCookie } = await import('@tanstack/solid-start/server')
  const sessionCookieName = getCookieName(createAuth)
  const token = getCookie(sessionCookieName)
  const { session } = await fetchSession(request, opts)
  return {
    userId: session?.user.id,
    token,
  }
}

export const solidStartHandler = (
  request: Request,
  opts?: { convexSiteUrl?: string; verbose?: boolean },
) => {
  const requestUrl = new URL(request.url)
  const convexSiteUrl = opts?.convexSiteUrl ?? process.env.VITE_CONVEX_SITE_URL
  if (!convexSiteUrl) {
    throw new Error('VITE_CONVEX_SITE_URL is not set')
  }
  const nextUrl = `${convexSiteUrl}${requestUrl.pathname}${requestUrl.search}`
  request.headers.set('accept-encoding', 'application/json')
  return fetch(nextUrl, new Request(request, { redirect: 'manual' }))
}
