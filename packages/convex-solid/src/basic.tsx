import { ConvexClient, ConvexHttpClient } from 'convex/browser'
import { FunctionReference } from 'convex/server'
import {
  Accessor,
  Context,
  createContext,
  from,
  JSX,
  useContext,
} from 'solid-js'
import { isServer } from 'solid-js/web'

export const ConvexContext: Context<
  ConvexHttpClient | ConvexClient | undefined
> = createContext()

export const ConvexProvider = (props: {
  children: JSX.Element
  client: ConvexHttpClient | ConvexClient
}) => {
  return (
    <ConvexContext.Provider value={props.client}>
      {props.children}
    </ConvexContext.Provider>
  )
}

export const useConvex = () => {
  const client = useContext(ConvexContext)
  if (!client) {
    throw new Error(
      '[mulberry:convex-solid] useConvex must be used within a ConvexProvider',
    )
  }
  return client
}

export const createConvexClient = (url: string) => {
  return isServer ? new ConvexHttpClient(url) : new ConvexClient(url)
}

type QueryState<T> = {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isError: boolean
}

// Create a reactive SolidJS atom attached to a Convex query function.
export function createQuery<T>(
  query: FunctionReference<'query', 'public', {}, T>,
  args?: {},
): Accessor<QueryState<T> | undefined> {
  const convex = useConvex()
  let fullArgs = args ?? {}
  return from(
    (setter) => {
      // Use the correct method depending on the client type
      if ('onUpdate' in convex && typeof convex.onUpdate === 'function') {
        // ConvexClient (browser, realtime)
        return convex.onUpdate(
          query,
          fullArgs,
          (x) =>
            setter({
              data: x,
              error: undefined,
              isLoading: false,
              isError: false,
            }),
          (error) =>
            setter({
              data: undefined,
              error,
              isLoading: false,
              isError: true,
            }),
        )
      } else if ('query' in convex && typeof convex.query === 'function') {
        // ConvexHttpClient (server, HTTP)
        let stopped = false
        // Initial fetch
        convex
          .query(query, fullArgs)
          .then((x) =>
            setter({
              data: x,
              error: undefined,
              isLoading: false,
              isError: false,
            }),
          )
          .catch((error) =>
            setter({
              data: undefined,
              error,
              isLoading: false,
              isError: true,
            }),
          )
        // No live updates, so return a no-op unsubscribe
        return () => {
          stopped = true
        }
      } else {
        return () => ({
          data: undefined,
          error: new Error(
            '[mulberry:convex-solid] Unknown Convex client type in createQuery',
          ),
          isLoading: false,
          isError: true,
        })
      }
    },
    {
      data: undefined,
      error: undefined,
      isLoading: true,
      isError: false,
    } as QueryState<T>,
  )
}

export function createMutation<T>(
  mutation: FunctionReference<'mutation'>,
): (args?: {}) => Promise<T> {
  const convex = useConvex()
  return (args) => {
    let fullArgs = args ?? {}
    return convex.mutation(mutation, fullArgs)
  }
}

export function createAction<T>(
  action: FunctionReference<'action'>,
): (args?: {}) => Promise<T> {
  const convex = useConvex()
  return (args) => {
    let fullArgs = args ?? {}
    return convex.action(action, fullArgs)
  }
}
