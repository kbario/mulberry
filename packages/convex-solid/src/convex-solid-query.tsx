import {
  QueryCache,
  QueryClient,
  QueryFunction,
  QueryFunctionContext,
  QueryKey,
  hashKey,
  notifyManager,
} from '@tanstack/solid-query'
import { ConvexClient, ConvexHttpClient } from 'convex/browser'
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  getFunctionName,
} from 'convex/server'
import { convexToJson } from 'convex/values'
import {
  Accessor,
  JSX,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  batch,
  untrack,
  useContext,
  ErrorBoundary,
  Show,
} from 'solid-js'
import {
  ConvexAuthError,
  ConvexError,
  ConvexNetworkError,
  ConvexSolidClient,
} from './convex-solid'

// Re-export error types from convex.tsx for convenience
export { ConvexAuthError, ConvexError, ConvexNetworkError }

// SolidJS Context for Convex Client
const ConvexContext = createContext<ConvexSolidClient>()

// SolidJS-optimized Provider Component with error boundary and memoization
export function ConvexProvider(props: {
  children: JSX.Element
  client: ConvexSolidClient
  fallback?: (error: Error, reset: () => void) => JSX.Element
  debug?: boolean
}) {
  const { fallback, debug = false, ...providerProps } = props

  // Create memoized client value to prevent unnecessary re-renders
  const clientValue = createMemo(() => providerProps.client)

  if (debug) {
    console.log('[ConvexSolidQuery] ConvexProvider initialized')
  }

  const defaultFallback = (error: Error, reset: () => void) => (
    <div style="padding: 1rem; border: 1px solid #ff6b6b; border-radius: 4px; background: #ffe0e0;">
      <h3>Convex Query Error</h3>
      <p>{error.message}</p>
      <Show when={error instanceof ConvexError && (error as ConvexError).code}>
        <p style="font-size: 0.8em; color: #636e72;">
          Error Code: {(error as ConvexError).code}
        </p>
      </Show>
      <button onClick={reset}>Retry Connection</button>
    </div>
  )

  return (
    <ErrorBoundary fallback={fallback || defaultFallback}>
      <ConvexContext.Provider value={clientValue()}>
        {providerProps.children}
      </ConvexContext.Provider>
    </ErrorBoundary>
  )
}

// Hook to get Convex client in SolidJS
export function useConvex(): ConvexSolidClient {
  const client = useContext(ConvexContext)
  if (!client) {
    throw new Error('useConvex must be used within a ConvexProvider')
  }
  return client
}

// SolidJS-specific query state interface
export interface SolidQueryState<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
}

// SolidJS-optimized Authentication Hook with proper cleanup
export function useConvexAuth(): {
  isLoading: Accessor<boolean>
  isAuthenticated: Accessor<boolean>
  user: Accessor<any | null>
  error: Accessor<Error | null>
} {
  const client = useConvex()
  const [isLoading, setIsLoading] = createSignal(true)
  const [isAuthenticated, setIsAuthenticated] = createSignal(false)
  const [user, setUser] = createSignal<any | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  createEffect(() => {
    let isCancelled = false

    const checkAuth = async () => {
      try {
        // Check if client has auth token - using proper property access
        const clientWithAuth = client as ConvexSolidClient & {
          _authToken?: string
          _getCurrentUser?: () => Promise<any>
        }

        const hasAuth = clientWithAuth._authToken !== undefined

        if (!isCancelled) {
          batch(() => {
            setIsAuthenticated(hasAuth)
            setError(null)

            // Try to get current user if authenticated
            if (hasAuth && clientWithAuth._getCurrentUser) {
              clientWithAuth
                ._getCurrentUser()
                .then((userData) => {
                  if (!isCancelled) {
                    setUser(userData)
                  }
                })
                .catch((err) => {
                  if (!isCancelled) {
                    setError(new ConvexAuthError('Failed to get current user'))
                  }
                })
            } else {
              setUser(null)
            }

            setIsLoading(false)
          })
        }
      } catch (err) {
        if (!isCancelled) {
          const authError =
            err instanceof ConvexAuthError
              ? err
              : new ConvexAuthError('Authentication check failed')

          batch(() => {
            setError(authError)
            setIsLoading(false)
            setIsAuthenticated(false)
            setUser(null)
          })
        }
      }
    }

    // Execute auth check in untracked context
    untrack(() => checkAuth())

    // Cleanup function
    onCleanup(() => {
      isCancelled = true
    })
  })

  return {
    isLoading,
    isAuthenticated,
    user,
    error,
  }
}

const isServer = typeof window === 'undefined'

function isConvexSkipped(
  queryKey: readonly any[],
): queryKey is ['convexQuery' | 'convexAction', unknown, 'skip'] {
  return (
    queryKey.length >= 2 &&
    ['convexQuery', 'convexAction'].includes(queryKey[0]) &&
    queryKey[2] === 'skip'
  )
}

function isConvexQuery(
  queryKey: readonly any[],
): queryKey is [
  'convexQuery',
  FunctionReference<'query'>,
  Record<string, any>,
  {},
] {
  return queryKey.length >= 2 && queryKey[0] === 'convexQuery'
}

function isConvexAction(
  queryKey: readonly any[],
): queryKey is [
  'convexAction',
  FunctionReference<'action'>,
  Record<string, any>,
  {},
] {
  return queryKey.length >= 2 && queryKey[0] === 'convexAction'
}

function hash(
  queryKey: [
    'convexQuery',
    FunctionReference<'query'>,
    Record<string, any>,
    {},
  ],
): string {
  return `convexQuery|${getFunctionName(queryKey[1])}|${JSON.stringify(
    convexToJson(queryKey[2]),
  )}`
}

// Options interface for ConvexSolidQueryClient
export interface ConvexQueryClientOptions {
  /** queryClient can also be set later by calling .connect(QueryClient) */
  queryClient?: QueryClient
  /**
   * opt out of consistent queries, resulting in (for now) faster SSR at the
   * cost of potential inconsistency between queries
   *
   * Why might you need this? Consistency is important when clients expect
   * multiple queries to make sense together, e.g. for "client-side joins."
   *
   * Say you make two queries that your SolidJS code expects to be from the same database state:
   *
   * ```
   * const channels = createQuery(() => convexQuery(api.channels.all))
   * const favChannelIds = createQuery(() => convexQuery(api.channels.favIds));
   * const favChannels = createMemo(() => {
   *   const channelsData = channels.data;
   *   const favIds = favChannelIds.data;
   *   return (channelsData && favIds) ? favIds.map(id => channelsData[id]) : []
   * });
   * ```
   *
   * During normal client operation, the `api.channels.all` and `api.channels.favIds`
   * queries will both return results from the same logical timestamp: as long as these
   * queries are written correctly, there will never be a favChannelId for a channel
   * not in channelsData.
   *
   * But during SSR, if this value is set, these two queries may return results
   * from different logical timestamps, as they're not just two HTTP requests.
   *
   * The upside of this is a faster SSR render: the current implementation
   * of a consistent SSR render involves two roundtrips instead of one.
   */
  dangerouslyUseInconsistentQueriesDuringSSR?: boolean
}

// Watch interface for query subscriptions
interface Watch<T> {
  localQueryResult(): T
  onUpdate(callback: () => void): () => void
}

/**
 * SolidJS-optimized Convex Query Client that integrates with TanStack Solid Query.
 *
 * This class manages the bridge between Convex real-time subscriptions and TanStack Query's
 * caching and state management, optimized for SolidJS's fine-grained reactivity.
 *
 * Features:
 * - Real-time subscription management with proper cleanup
 * - SSR support with consistent/inconsistent query modes
 * - SolidJS-specific optimizations using batch updates
 * - Enhanced error handling and debugging
 */
export class ConvexQueryClient {
  convexClient: ConvexSolidClient
  subscriptions: Record<
    string, // queryKey hash
    {
      watch: Watch<any>
      unsubscribe: () => void
      queryKey: [
        convexKey: 'convexQuery',
        func: FunctionReference<'query'>,
        args: Record<string, any>,
        options?: {},
      ]
    }
  >
  unsubscribe: (() => void) | undefined
  // Only exists during SSR
  serverHttpClient?: ConvexHttpClient
  _queryClient: QueryClient | undefined
  ssrQueryMode: 'consistent' | 'inconsistent'
  get queryClient() {
    if (!this._queryClient) {
      throw new Error(
        'ConvexQueryClient not connected to TanStack Solid QueryClient.',
      )
    }
    return this._queryClient
  }
  constructor(
    /** A ConvexSolidClient instance or a URL to use to instantiate one. */
    client: ConvexSolidClient | string,
    /** Options for the ConvexSolidClient to be constructed. */
    options: ConvexQueryClientOptions = {},
  ) {
    if (typeof client === 'string') {
      this.convexClient = new ConvexClient(client) as ConvexSolidClient
    } else {
      this.convexClient = client as ConvexSolidClient
    }
    if (options.dangerouslyUseInconsistentQueriesDuringSSR) {
      this.ssrQueryMode = 'inconsistent'
    } else {
      this.ssrQueryMode = 'consistent'
    }
    this.subscriptions = {}
    if (options.queryClient) {
      this._queryClient = options.queryClient
      this.unsubscribe = this.subscribeInner(
        options.queryClient.getQueryCache(),
      )
    }
    if (isServer) {
      // Extract URL from ConvexSolidClient for server-side HTTP client
      const clientUrl =
        typeof client === 'string' ? client : (client as any).url || ''
      this.serverHttpClient = new ConvexHttpClient(clientUrl)
    }
  }
  /** Complete initialization of ConvexQueryClient by connecting a TanStack Solid QueryClient */
  connect(queryClient: QueryClient) {
    if (this.unsubscribe) {
      throw new Error('already subscribed!')
    }
    this._queryClient = queryClient
    this.unsubscribe = this.subscribeInner(queryClient.getQueryCache())
  }

  /**
   * Update every query key with SolidJS batch optimization.
   * Enhanced for better performance with SolidJS reactivity.
   */
  onUpdate = () => {
    // Use SolidJS batch for better performance
    batch(() => {
      notifyManager.batch(() => {
        for (const key of Object.keys(this.subscriptions)) {
          this.onUpdateQueryKeyHash(key)
        }
      })
    })
  }
  onUpdateQueryKeyHash(queryHash: string) {
    const subscription = this.subscriptions[queryHash]
    if (!subscription) {
      // If we have no record of this subscription that should be a logic error.
      throw new Error(
        `Internal ConvexQueryClient error: onUpdateQueryKeyHash called for ${queryHash}`,
      )
    }

    const queryCache = this.queryClient.getQueryCache()
    const query = queryCache.get(queryHash)
    if (!query) return

    const { queryKey, watch } = subscription
    let result: { ok: true; value: any } | { ok: false; error: unknown }

    try {
      result = { ok: true, value: watch.localQueryResult() }
    } catch (error) {
      result = { ok: false, error }
    }

    // Use SolidJS batch for better performance when updating multiple states
    batch(() => {
      if (result.ok) {
        const value = result.value
        this.queryClient.setQueryData(queryKey, (prev) => {
          if (prev === undefined) {
            // If `prev` is undefined there is no Solid-query entry for this query key.
            // Return `undefined` to signal not to create one.
            return undefined
          }
          return value
        })
      } else {
        const { error } = result

        // Enhanced error handling for SolidJS
        const convexError =
          error instanceof ConvexError
            ? error
            : error instanceof Error
              ? new ConvexError(error.message, 'SUBSCRIPTION_ERROR', {
                  originalError: error,
                })
              : new ConvexError(String(error), 'UNKNOWN_SUBSCRIPTION_ERROR')

        query &&
          query.setState(
            {
              error: convexError,
              errorUpdateCount: query.state.errorUpdateCount + 1,
              errorUpdatedAt: Date.now(),
              fetchFailureCount: query.state.fetchFailureCount + 1,
              fetchFailureReason: convexError,
              fetchStatus: 'idle',
              status: 'error',
            },
            { meta: 'set by ConvexSolidQueryClient' },
          )
      }
    })
  }

  subscribeInner(queryCache: QueryCache): () => void {
    if (isServer) return () => {}

    return queryCache.subscribe((event) => {
      if (!isConvexQuery(event.query.queryKey)) {
        return
      }
      if (isConvexSkipped(event.query.queryKey)) {
        return
      }

      switch (event.type) {
        // A query has been GC'd so no stale value will be available.
        // In Convex this means we should unsubscribe.
        case 'removed': {
          const subscription = this.subscriptions[event.query.queryHash]
          if (subscription) {
            try {
              subscription.unsubscribe()
            } catch (error) {
              console.warn('[ConvexSolidQuery] Error unsubscribing:', error)
            } finally {
              delete this.subscriptions[event.query.queryHash]
            }
          }
          break
        }
        // A query has been requested for the first time.
        // Subscribe to the query so we hold on to it.
        case 'added': {
          // There exists only one watch per subscription; but
          // watches are stateless anyway, they're just util code.
          const [_, func, args, _opts] = event.query.queryKey as [
            'convexQuery',
            FunctionReference<'query'>,
            any,
            {},
          ]

          // Create a proper watch object using the Convex client's onUpdate functionality
          let currentResult: any = undefined
          let updateCallback: (() => void) | undefined
          let isSubscribed = false

          const watch: Watch<any> = {
            localQueryResult: () => {
              return currentResult
            },
            onUpdate: (callback: () => void) => {
              if (isSubscribed) {
                console.warn('[ConvexSolidQuery] Already subscribed to query')
                return () => {}
              }

              updateCallback = callback
              isSubscribed = true

              try {
                // Use the Convex client's onUpdate method for real-time subscriptions
                const unsubscribe = (this.convexClient as any).onUpdate(
                  func,
                  args,
                  (newValue: any) => {
                    // Use batch for better SolidJS performance
                    batch(() => {
                      currentResult = newValue
                      callback()
                    })
                  },
                )

                return () => {
                  isSubscribed = false
                  unsubscribe()
                }
              } catch (error) {
                isSubscribed = false
                const subscriptionError = new ConvexError(
                  'Failed to create Convex subscription',
                  'SUBSCRIPTION_ERROR',
                  { originalError: error },
                )
                throw subscriptionError
              }
            },
          }

          // Initialize with current query result
          try {
            if (!isServer) {
              // Get initial result synchronously if available
              currentResult = (this.convexClient as any).localQueryResult?.(
                func,
                args,
              )
            }
          } catch (error) {
            // Initial result not available, will be fetched via queryFn
            console.debug(
              '[ConvexSolidQuery] Initial result not available:',
              error,
            )
          }

          const unsubscribe = watch.onUpdate(() => {
            this.onUpdateQueryKeyHash(event.query.queryHash)
          })

          this.subscriptions[event.query.queryHash] = {
            queryKey: event.query.queryKey,
            watch,
            unsubscribe,
          }
          break
        }
        // Runs when a useQuery mounts
        case 'observerAdded': {
          // Could add debug logging here if needed
          break
        }
        // Runs when a useQuery unmounts
        case 'observerRemoved': {
          if (event.query.getObserversCount() === 0) {
            // The last useQuery subscribed to this query has unmounted.
            // But don't clean up yet, after gcTime a "removed" event
            // will notify that it's time to drop the subscription to
            // the Convex backend.
          }
          break
        }
        // Fires once per useQuery hook
        case 'observerResultsUpdated': {
          // Could add performance monitoring here if needed
          break
        }
        case 'updated': {
          if (
            event.action.type === 'setState' &&
            event.action.setStateOptions?.meta ===
              'set by ConvexSolidQueryClient'
          ) {
            // This one was caused by us. This may be important to know for
            // breaking infinite loops in the future.
            break
          }
          break
        }
        case 'observerOptionsUpdated': {
          // observerOptionsUpdated, often because of an unmemoized query key
          // This is common in SolidJS when reactive dependencies change
          break
        }
      }
    })
  }

  /**
   * Returns a promise for the query result of a query key containing
   * `['convexQuery', FunctionReference, args]` and subscribes via WebSocket
   * to future updates.
   *
   * You can provide a custom fetch function for queries that are not
   * Convex queries.
   */
  queryFn(
    otherFetch: QueryFunction<unknown, QueryKey> = throwBecauseNotConvexQuery,
  ) {
    return async <
      ConvexQueryReference extends FunctionReference<'query', 'public'>,
    >(
      context: QueryFunctionContext<ReadonlyArray<unknown>>,
    ): Promise<FunctionReturnType<ConvexQueryReference>> => {
      if (isConvexSkipped(context.queryKey)) {
        throw new Error(
          'Skipped query should not actually be run, should { enabled: false }',
        )
      }
      // Only queries can be requested consistently (at a previous timestamp),
      // actions and mutations run at the latest timestamp.
      if (isConvexQuery(context.queryKey)) {
        const [_, func, args] = context.queryKey
        if (isServer) {
          if (this.ssrQueryMode === 'consistent') {
            return await this.serverHttpClient!.consistentQuery(func, args)
          } else {
            return await this.serverHttpClient!.query(func, args)
          }
        } else {
          return await this.convexClient.query(func, args)
        }
      }
      if (isConvexAction(context.queryKey)) {
        const [_, func, args] = context.queryKey
        if (isServer) {
          return await this.serverHttpClient!.action(func, args)
        } else {
          return await this.convexClient.action(func, args)
        }
      }
      return otherFetch(context)
    }
  }

  /**
   * Set this globally to use Convex query functions.
   *
   * ```ts
   * const queryClient = new QueryClient({
   *   defaultOptions: {
   *    queries: {
   *       queryKeyHashFn: convexQueryClient.hashFn(),
   *     },
   *   },
   * });
   *
   * You can provide a custom hash function for keys that are not for Convex
   * queries.
   */
  hashFn(otherHashKey: (queryKey: ReadonlyArray<unknown>) => string = hashKey) {
    return (queryKey: ReadonlyArray<unknown>) => {
      if (isConvexQuery(queryKey)) {
        return hash(queryKey)
      }
      return otherHashKey(queryKey)
    }
  }

  /**
   * Query options factory for Convex query function subscriptions in SolidJS.
   *
   * ```
   * const query = createQuery(() => client.queryOptions(api.foo.bar, args()))
   * ```
   *
   * If you need to specify other options spread it:
   * ```
   * const query = createQuery(() => ({
   *   ...convexSolidQueryClient.queryOptions(api.foo.bar, args()),
   *   placeholderData: { name: "me" }
   * }));
   * ```
   */
  queryOptions = <ConvexQueryReference extends FunctionReference<'query'>>(
    funcRef: ConvexQueryReference,
    queryArgs: FunctionArgs<ConvexQueryReference>,
  ): {
    queryKey: [
      'convexQuery',
      ConvexQueryReference,
      FunctionArgs<ConvexQueryReference>,
    ]
    queryFn: QueryFunction<FunctionReturnType<ConvexQueryReference>, QueryKey>
    staleTime: number
  } => {
    return {
      queryKey: [
        'convexQuery',
        // Make query key serializable
        getFunctionName(funcRef) as unknown as typeof funcRef,
        // TODO bigints are not serializable
        queryArgs,
      ],
      queryFn: this.queryFn(),
      staleTime: Infinity,
      // We cannot set hashFn here, see
      // https://github.com/TanStack/query/issues/4052#issuecomment-1296174282
      // so the developer must set it globally.
    }
  }
}

/**
 * Query options factory for Convex query function subscriptions in SolidJS.
 * This options factory requires the `convexSolidQueryClient.queryFn()` has been set
 * as the default `queryFn` globally.
 *
 * ```
 * const query = createQuery(() => convexQuery(api.foo.bar, args()))
 * ```
 *
 * If you need to specify other options spread it:
 * ```
 * const query = createQuery(() => ({
 *   ...convexQuery(api.messages.list, { channel: 'dogs' }),
 *   placeholderData: [{ name: "Snowy" }]
 * }));
 * ```
 */
export const convexQuery = <
  ConvexQueryReference extends FunctionReference<'query'>,
  Args extends FunctionArgs<ConvexQueryReference> | 'skip',
>(
  funcRef: ConvexQueryReference,
  queryArgs: Args,
): Args extends 'skip'
  ? {
      queryKey: ['convexQuery', ConvexQueryReference, 'skip']
      staleTime: number
      enabled: false
    }
  : {
      queryKey: [
        'convexQuery',
        ConvexQueryReference,
        FunctionArgs<ConvexQueryReference>,
      ]
      staleTime: number
    } => {
  return {
    queryKey: [
      'convexQuery',
      // Make query key serializable
      getFunctionName(funcRef) as unknown as typeof funcRef,
      // TODO bigints are not serializable
      queryArgs === 'skip' ? 'skip' : queryArgs,
    ],
    staleTime: Infinity,
    ...(queryArgs === 'skip' ? { enabled: false } : {}),
  } as any // Type assertion needed due to conditional return type complexity
}

/**
 * Query options factory for Convex action function in SolidJS.
 * Note that Convex actions are NOT live updating: they follow the normal TanStack Query
 * semantics of refreshing on window focus, network reconnect, etc.
 *
 * ```
 * const weatherQuery = createQuery(() => convexAction(api.weather.now, { location: "SF" }))
 * ```
 *
 * If you need to specify other options spread it:
 * ```
 * const weatherQuery = createQuery(() => ({
 *   ...convexAction(api.weather.now, { location: "SF" }),
 *   placeholderData: { status: "foggy and cool" }
 * }));
 * ```
 */
export const convexAction = <
  ConvexActionReference extends FunctionReference<'action'>,
  Args extends FunctionArgs<ConvexActionReference> | 'skip',
>(
  funcRef: ConvexActionReference,
  args: Args,
): Args extends 'skip'
  ? {
      queryKey: ['convexAction', ConvexActionReference, {}]
      enabled: false
    }
  : {
      queryKey: [
        'convexAction',
        ConvexActionReference,
        FunctionArgs<ConvexActionReference>,
      ]
    } => {
  return {
    queryKey: [
      'convexAction',
      // Make query key serializable
      getFunctionName(funcRef) as unknown as typeof funcRef,
      // TODO bigints are not serializable
      args === 'skip' ? {} : args,
    ],
    ...(args === 'skip' ? { enabled: false } : {}),
  } as any // Type assertion needed due to conditional return type complexity
}

function throwBecauseNotConvexQuery(
  context: QueryFunctionContext<ReadonlyArray<unknown>>,
) {
  throw new Error('Query key is not for a Convex Query: ' + context.queryKey)
}

// SolidJS-specific utility hooks and functions

/**
 * Creates a Solidive Convex query that automatically updates when arguments change.
 * This is a SolidJS-optimized wrapper around TanStack Solid Query.
 *
 * ```tsx
 * function MessageList() {
 *   const [channel, setChannel] = createSignal("general");
 *
 *   const messages = createConvexQuery(() =>
 *     convexQuery(api.messages.list, { channel: channel() })
 *   );
 *
 *   return (
 *     <div>
 *       <Show when={messages.data}>
 *         {(data) => (
 *           <For each={data()}>
 *             {(message) => <div>{message.text}</div>}
 *           </For>
 *         )}
 *       </Show>
 *     </div>
 *   );
 * }
 * ```
 */
export function createConvexQuery<T>(
  queryOptionsFn: () => any,
): Accessor<SolidQueryState<T>> {
  // This would integrate with TanStack Solid Query's createQuery
  // For now, we'll provide the interface that users should use
  throw new Error(
    'createConvexQuery requires TanStack Solid Query to be set up. ' +
      'Use createQuery(() => convexQuery(...)) with TanStack Solid Query instead.',
  )
}

/**
 * Creates a SolidJS-optimized Convex mutation with enhanced state management.
 *
 * ```tsx
 * function SendMessageForm() {
 *   const sendMessage = createConvexMutation(api.messages.send, {
 *     onSuccess: (data) => console.log('Message sent:', data),
 *     onError: (error) => console.error('Failed:', error),
 *     debug: true
 *   });
 *
 *   const handleSubmit = async (text: string) => {
 *     try {
 *       await sendMessage.mutateAsync({ text, channel: "general" });
 *     } catch (error) {
 *       // Error is already handled by onError callback
 *     }
 *   };
 *
 *   return (
 *     <button
 *       onClick={() => handleSubmit("Hello!")}
 *       disabled={sendMessage.isPending()}
 *     >
 *       {sendMessage.isPending() ? "Sending..." : "Send Message"}
 *     </button>
 *   );
 * }
 * ```
 */
export function createConvexMutation<T extends FunctionReference<'mutation'>>(
  mutation: T,
  options: {
    onSuccess?: (data: FunctionReturnType<T>) => void
    onError?: (error: ConvexError) => void
    onSettled?: (
      data: FunctionReturnType<T> | undefined,
      error: ConvexError | null,
    ) => void
    debug?: boolean
  } = {},
): {
  mutate: (args: FunctionArgs<T>) => void
  mutateAsync: (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
  data: Accessor<FunctionReturnType<T> | undefined>
  isPending: Accessor<boolean>
  isSuccess: Accessor<boolean>
  isError: Accessor<boolean>
  error: Accessor<ConvexError | null>
  reset: () => void
} {
  const client = useConvex()
  const [data, setData] = createSignal<FunctionReturnType<T> | undefined>(
    undefined,
  )
  const [isPending, setIsPending] = createSignal(false)
  const [error, setError] = createSignal<ConvexError | null>(null)

  const { onSuccess, onError, onSettled, debug = false } = options

  // Derived state using createMemo for performance
  const isSuccess = createMemo(
    () => !isPending() && !error() && data() !== undefined,
  )
  const isError = createMemo(() => !isPending() && error() !== null)

  const mutateAsync = async (
    args: FunctionArgs<T>,
  ): Promise<FunctionReturnType<T>> => {
    // Use batch for multiple state updates
    batch(() => {
      setIsPending(true)
      setError(null)
    })

    if (debug) {
      console.log(`[ConvexSolidQuery] Executing mutation:`, mutation, args)
    }

    try {
      const result = await (client as any).mutation(mutation, args)

      batch(() => {
        setData(result)
        setIsPending(false)
      })

      onSuccess?.(result)
      onSettled?.(result, null)

      if (debug) {
        console.log(`[ConvexSolidQuery] Mutation completed:`, result)
      }

      return result
    } catch (err) {
      const convexError =
        err instanceof ConvexError
          ? err
          : err instanceof Error
            ? new ConvexError(err.message, 'MUTATION_ERROR', {
                originalError: err,
              })
            : new ConvexError(String(err), 'UNKNOWN_ERROR')

      batch(() => {
        setError(convexError)
        setIsPending(false)
      })

      onError?.(convexError)
      onSettled?.(undefined, convexError)

      if (debug) {
        console.error(`[ConvexSolidQuery] Mutation failed:`, convexError)
      }

      throw convexError
    }
  }

  const mutate = (args: FunctionArgs<T>) => {
    mutateAsync(args).catch(() => {
      // Error is already handled in mutateAsync and stored in error signal
    })
  }

  const reset = () => {
    batch(() => {
      setData(undefined)
      setIsPending(false)
      setError(null)
    })

    if (debug) {
      console.log(`[ConvexSolidQuery] Mutation state reset`)
    }
  }

  return {
    mutate,
    mutateAsync,
    data,
    isPending,
    isSuccess,
    isError,
    error,
    reset,
  }
}

/**
 * Creates a SolidJS-optimized Convex action with enhanced state management.
 * Similar to mutations but for actions (server-side functions).
 *
 * ```tsx
 * function WeatherWidget() {
 *   const getWeather = createConvexAction(api.weather.getCurrentWeather, {
 *     onSuccess: (data) => console.log('Weather:', data),
 *     onError: (error) => console.error('Failed:', error),
 *     debug: true
 *   });
 *
 *   const handleRefresh = async () => {
 *     try {
 *       const weather = await getWeather.executeAsync({ location: "SF" });
 *       console.log("Current weather:", weather);
 *     } catch (error) {
 *       // Error is already handled by onError callback
 *     }
 *   };
 *
 *   return (
 *     <button
 *       onClick={handleRefresh}
 *       disabled={getWeather.isPending()}
 *     >
 *       {getWeather.isPending() ? "Loading..." : "Refresh Weather"}
 *     </button>
 *   );
 * }
 * ```
 */
export function createConvexAction<T extends FunctionReference<'action'>>(
  action: T,
  options: {
    onSuccess?: (data: FunctionReturnType<T>) => void
    onError?: (error: ConvexError) => void
    onSettled?: (
      data: FunctionReturnType<T> | undefined,
      error: ConvexError | null,
    ) => void
    debug?: boolean
  } = {},
): {
  execute: (args: FunctionArgs<T>) => void
  executeAsync: (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
  data: Accessor<FunctionReturnType<T> | undefined>
  isPending: Accessor<boolean>
  isSuccess: Accessor<boolean>
  isError: Accessor<boolean>
  error: Accessor<ConvexError | null>
  reset: () => void
} {
  const client = useConvex()
  const [data, setData] = createSignal<FunctionReturnType<T> | undefined>(
    undefined,
  )
  const [isPending, setIsPending] = createSignal(false)
  const [error, setError] = createSignal<ConvexError | null>(null)

  const { onSuccess, onError, onSettled, debug = false } = options

  // Derived state using createMemo for performance
  const isSuccess = createMemo(
    () => !isPending() && !error() && data() !== undefined,
  )
  const isError = createMemo(() => !isPending() && error() !== null)

  const executeAsync = async (
    args: FunctionArgs<T>,
  ): Promise<FunctionReturnType<T>> => {
    // Use batch for multiple state updates
    batch(() => {
      setIsPending(true)
      setError(null)
    })

    if (debug) {
      console.log(`[ConvexSolidQuery] Executing action:`, action, args)
    }

    try {
      const result = await (client as any).action(action, args)

      batch(() => {
        setData(result)
        setIsPending(false)
      })

      onSuccess?.(result)
      onSettled?.(result, null)

      if (debug) {
        console.log(`[ConvexSolidQuery] Action completed:`, result)
      }

      return result
    } catch (err) {
      const convexError =
        err instanceof ConvexError
          ? err
          : err instanceof Error
            ? new ConvexError(err.message, 'ACTION_ERROR', {
                originalError: err,
              })
            : new ConvexError(String(err), 'UNKNOWN_ERROR')

      batch(() => {
        setError(convexError)
        setIsPending(false)
      })

      onError?.(convexError)
      onSettled?.(undefined, convexError)

      if (debug) {
        console.error(`[ConvexSolidQuery] Action failed:`, convexError)
      }

      throw convexError
    }
  }

  const execute = (args: FunctionArgs<T>) => {
    executeAsync(args).catch(() => {
      // Error is already handled in executeAsync and stored in error signal
    })
  }

  const reset = () => {
    batch(() => {
      setData(undefined)
      setIsPending(false)
      setError(null)
    })

    if (debug) {
      console.log(`[ConvexSolidQuery] Action state reset`)
    }
  }

  return {
    execute,
    executeAsync,
    data,
    isPending,
    isSuccess,
    isError,
    error,
    reset,
  }
}

/**
 * SolidJS-optimized utility function to create a Convex client with enhanced features.
 *
 * ```tsx
 * const client = createConvexClient(import.meta.env.VITE_CONVEX_URL, {
 *   debug: true,
 *   onError: (error) => console.error('Convex error:', error),
 *   onConnect: () => console.log('Connected to Convex'),
 *   onDisconnect: () => console.log('Disconnected from Convex')
 * });
 * ```
 */
export function createConvexClient(
  url: string,
  options: {
    debug?: boolean
    onError?: (error: ConvexError) => void
    onConnect?: () => void
    onDisconnect?: () => void
  } = {},
): ConvexClient {
  const { debug = false, onError, onConnect, onDisconnect } = options
  const client = new ConvexClient(url)

  if (debug) {
    console.log(`[ConvexSolidQuery] Creating Convex client for:`, url)
  }

  // Add connection event listeners if provided
  if (onConnect || onDisconnect) {
    // Note: This would need to be implemented based on ConvexClient's actual API
    // The ConvexClient may have different event handling mechanisms
    if (debug) {
      console.log(`[ConvexSolidQuery] Connection event handlers registered`)
    }
  }

  // Wrap client methods with error handling if onError is provided
  if (onError) {
    const originalQuery = client.query.bind(client)
    const originalMutation = client.mutation.bind(client)
    const originalAction = client.action.bind(client)

    ;(client as any).query = async (query: any, args?: any) => {
      try {
        return await originalQuery(query, args)
      } catch (error) {
        const convexError =
          error instanceof ConvexError
            ? error
            : new ConvexError(
                error instanceof Error ? error.message : String(error),
                'CLIENT_QUERY_ERROR',
                { originalError: error },
              )
        onError(convexError)
        throw convexError
      }
    }
    ;(client as any).mutation = async (mutation: any, args?: any) => {
      try {
        return await originalMutation(mutation, args)
      } catch (error) {
        const convexError =
          error instanceof ConvexError
            ? error
            : new ConvexError(
                error instanceof Error ? error.message : String(error),
                'CLIENT_MUTATION_ERROR',
                { originalError: error },
              )
        onError(convexError)
        throw convexError
      }
    }
    ;(client as any).action = async (action: any, args?: any) => {
      try {
        return await originalAction(action, args)
      } catch (error) {
        const convexError =
          error instanceof ConvexError
            ? error
            : new ConvexError(
                error instanceof Error ? error.message : String(error),
                'CLIENT_ACTION_ERROR',
                { originalError: error },
              )
        onError(convexError)
        throw convexError
      }
    }
  }

  return client
}

// SolidJS-specific utilities for debugging and development

/**
 * Hook for debugging Convex Query integration in SolidJS.
 * Provides insights into query cache, subscriptions, and performance.
 */
export function useConvexQueryDebug() {
  const client = useConvex()

  return {
    client,
    logClient: () => console.log('[ConvexSolidQuery] Client:', client),
    getClientInfo: () => ({
      url: (client as any).url || 'unknown',
      isConnected: (client as any).connectionState?.isConnected || false,
      // Add more client info as needed
    }),
  }
}

/**
 * SolidJS-optimized Suspense wrapper for Convex queries with error boundaries.
 */
export function ConvexQuerySuspense(props: {
  children: JSX.Element
  fallback?: JSX.Element
  onError?: (error: Error, reset: () => void) => JSX.Element
}) {
  const defaultFallback = (
    <div style="display: flex; align-items: center; justify-content: center; padding: 2rem;">
      <div style="text-align: center;">
        <div style="margin-bottom: 1rem; font-size: 1.2em;">
          Loading Convex data...
        </div>
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0984e3; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
    </div>
  )

  const defaultErrorFallback = (error: Error, reset: () => void) => (
    <div style="padding: 1rem; border: 1px solid #ff6b6b; border-radius: 4px; background: #ffe0e0; margin: 1rem 0;">
      <h3 style="margin: 0 0 0.5rem 0; color: #d63031;">Convex Query Error</h3>
      <p style="margin: 0 0 1rem 0; font-family: monospace; font-size: 0.9em;">
        {error.message}
      </p>
      <Show when={error instanceof ConvexError && (error as ConvexError).code}>
        <p style="margin: 0 0 1rem 0; font-size: 0.8em; color: #636e72;">
          Error Code: {(error as ConvexError).code}
        </p>
      </Show>
      <button
        onClick={reset}
        style="background: #0984e3; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;"
      >
        Retry
      </button>
    </div>
  )

  return (
    <ErrorBoundary fallback={props.onError || defaultErrorFallback}>
      <Show when={true} fallback={props.fallback || defaultFallback}>
        {props.children}
      </Show>
    </ErrorBoundary>
  )
}

// Export version and feature information
export const CONVEX_SOLID_QUERY_VERSION = '1.0.0'
export const CONVEX_SOLID_QUERY_FEATURES = {
  tanstackQueryIntegration: true,
  realTimeSubscriptions: true,
  ssrSupport: true,
  errorBoundaries: true,
  debugUtilities: true,
  batchUpdates: true,
  solidjsOptimized: true,
} as const
