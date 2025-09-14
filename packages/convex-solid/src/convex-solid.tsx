import { ConvexClient } from 'convex/browser'
import type {
  ArgsAndOptions,
  FunctionReference,
  GenericActionCtx,
  GenericDocument,
  GenericMutationCtx,
  GenericQueryCtx,
  OptionalRestArgs,
  PaginationOptions,
  PaginationResult,
} from 'convex/server'
import {
  Accessor,
  JSX,
  Show,
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createResource,
  onCleanup,
  untrack,
  useContext,
  ErrorBoundary,
  Suspense,
} from 'solid-js'

// Enhanced Error Types for SolidJS
export class ConvexError extends Error {
  constructor(
    message: string,
    public code?: string,
    public data?: any,
  ) {
    super(message)
    this.name = 'ConvexError'
  }

  // SolidJS-specific error serialization
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      data: this.data,
      stack: this.stack,
    }
  }
}

export class ConvexNetworkError extends ConvexError {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(message, 'NETWORK_ERROR')
    this.name = 'ConvexNetworkError'
  }
}

export class ConvexAuthError extends ConvexError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR')
    this.name = 'ConvexAuthError'
  }
}

export class ConvexSubscriptionError extends ConvexError {
  constructor(
    message: string,
    public queryName?: string,
  ) {
    super(message, 'SUBSCRIPTION_ERROR')
    this.name = 'ConvexSubscriptionError'
  }
}

// Typed Convex Client Interface - simplified to match actual ConvexClient API
export interface TypedConvexClient extends ConvexClient {
  // These methods already exist on ConvexClient, we're just ensuring type safety
}

// Types
export type ConvexSolidClient = ConvexClient & TypedConvexClient

export interface AuthTokenFetcher {
  (): Promise<string | null | undefined>
}

export interface ConvexProviderProps {
  children: JSX.Element
  client: ConvexSolidClient
}

export interface UseQueryOptions {
  enabled?: boolean
  refetchOnMount?: boolean
  retry?: number | boolean
  staleTime?: number
  refetchInterval?: number
  onError?: (error: Error) => void
  onSuccess?: (data: any) => void
  debug?: boolean
  suspense?: boolean
}

export interface UseMutationOptions {
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}

export interface UseActionOptions {
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}

// SolidJS-optimized state interfaces
export interface SolidQueryState<T> {
  data: Accessor<T | undefined>
  error: Accessor<Error | undefined>
  isLoading: Accessor<boolean>
  isSuccess: Accessor<boolean>
  isError: Accessor<boolean>
  refetch: () => Promise<void>
}

export interface SolidMutationState<T> {
  data: Accessor<T | undefined>
  error: Accessor<Error | undefined>
  isLoading: Accessor<boolean>
  isSuccess: Accessor<boolean>
  isError: Accessor<boolean>
  reset: () => void
}

export interface SolidActionState<T> {
  data: Accessor<T | undefined>
  error: Accessor<Error | undefined>
  isLoading: Accessor<boolean>
  isSuccess: Accessor<boolean>
  isError: Accessor<boolean>
  reset: () => void
}

// Legacy interfaces for backward compatibility
export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
}

export interface MutationState {
  isLoading: boolean
  error: Error | undefined
}

export interface ActionState {
  isLoading: boolean
  error: Error | undefined
}

// SolidJS-optimized Query Subscription Manager
class SolidQuerySubscriptionManager {
  private subscriptions = new Map<
    string,
    {
      unsubscribe: () => void
      callbacks: Set<(value: any) => void>
      refCount: number
      lastValue?: any
      isStale: boolean
    }
  >()

  // Memoized key generation for better performance
  private keyCache = new Map<string, string>()

  subscribe<T>(
    client: ConvexSolidClient,
    query: FunctionReference<'query'>,
    args: any[],
    callback: (value: T) => void,
    options: {
      onError?: (error: Error) => void
      debug?: boolean
    } = {},
  ): () => void {
    const key = this.getQueryKey(query, args)
    const { onError, debug = false } = options

    let subscription = this.subscriptions.get(key)

    if (!subscription) {
      // Create new subscription using the client's onUpdate method
      const callbacks = new Set<(value: any) => void>()
      let lastValue: any

      try {
        // Use the client's onUpdate method with proper error handling
        const unsubscribe = (client as any).onUpdate(
          query,
          ...args,
          (value: any) => {
            lastValue = value
            // Use batch for multiple callback executions
            batch(() => {
              callbacks.forEach((cb) => {
                try {
                  cb(value)
                } catch (error) {
                  const subscriptionError = new ConvexSubscriptionError(
                    `Callback error in subscription for ${this.getFunctionName(query)}`,
                    this.getFunctionName(query),
                  )
                  onError?.(subscriptionError)
                  if (debug) {
                    console.error(
                      '[ConvexSolid] Subscription callback error:',
                      subscriptionError,
                    )
                  }
                }
              })
            })
          },
        )

        subscription = {
          unsubscribe,
          callbacks,
          refCount: 0,
          lastValue,
          isStale: false,
        }
        this.subscriptions.set(key, subscription)

        if (debug) {
          console.log(
            `[ConvexSolid] Created subscription for ${this.getFunctionName(query)}`,
          )
        }
      } catch (error) {
        const subscriptionError = new ConvexSubscriptionError(
          `Failed to create subscription for ${this.getFunctionName(query)}`,
          this.getFunctionName(query),
        )
        onError?.(subscriptionError)
        throw subscriptionError
      }
    }

    subscription.callbacks.add(callback)
    subscription.refCount++

    // If we have a cached value, immediately call the callback
    if (subscription.lastValue !== undefined) {
      try {
        callback(subscription.lastValue)
      } catch (error) {
        const callbackError = new ConvexSubscriptionError(
          `Initial callback error for ${this.getFunctionName(query)}`,
          this.getFunctionName(query),
        )
        onError?.(callbackError)
      }
    }

    // Return unsubscribe function with proper cleanup
    return () => {
      const sub = this.subscriptions.get(key)
      if (sub) {
        sub.callbacks.delete(callback)
        sub.refCount--

        if (sub.refCount === 0) {
          try {
            sub.unsubscribe()
            this.subscriptions.delete(key)
            if (debug) {
              console.log(
                `[ConvexSolid] Cleaned up subscription for ${this.getFunctionName(query)}`,
              )
            }
          } catch (error) {
            if (debug) {
              console.warn(
                `[ConvexSolid] Error cleaning up subscription:`,
                error,
              )
            }
          }
        }
      }
    }
  }

  private getQueryKey(query: FunctionReference<'query'>, args: any[]): string {
    const functionName = this.getFunctionName(query)
    const argsKey = JSON.stringify(args)
    const cacheKey = `${functionName}:${argsKey}`

    if (!this.keyCache.has(cacheKey)) {
      this.keyCache.set(cacheKey, cacheKey)
    }

    return this.keyCache.get(cacheKey)!
  }

  private getFunctionName(query: FunctionReference<'query'>): string {
    return (query as any)._functionName || (query as any).name || 'unknown'
  }

  // Utility method to invalidate subscriptions
  invalidate(query: FunctionReference<'query'>, args?: any[]): void {
    if (args) {
      const key = this.getQueryKey(query, args)
      const subscription = this.subscriptions.get(key)
      if (subscription) {
        subscription.isStale = true
      }
    } else {
      // Invalidate all subscriptions for this query
      const functionName = this.getFunctionName(query)
      for (const [key, subscription] of this.subscriptions.entries()) {
        if (key.startsWith(`${functionName}:`)) {
          subscription.isStale = true
        }
      }
    }
  }

  // Get subscription stats for debugging
  getStats() {
    return {
      totalSubscriptions: this.subscriptions.size,
      cacheSize: this.keyCache.size,
      subscriptionDetails: Array.from(this.subscriptions.entries()).map(
        ([key, sub]) => ({
          key,
          refCount: sub.refCount,
          isStale: sub.isStale,
          hasValue: sub.lastValue !== undefined,
        }),
      ),
    }
  }
}

// Global subscription manager instance - SolidJS optimized
const subscriptionManager = new SolidQuerySubscriptionManager()

// Context
const ConvexContext = createContext<ConvexSolidClient>()

// SolidJS-optimized Provider Component with error boundary
export function ConvexProvider(
  props: ConvexProviderProps & {
    fallback?: (error: Error, reset: () => void) => JSX.Element
    debug?: boolean
  },
) {
  const { fallback, debug = false, ...providerProps } = props

  // Create memoized client value to prevent unnecessary re-renders
  const clientValue = createMemo(() => providerProps.client)

  if (debug) {
    console.log('[ConvexSolid] ConvexProvider initialized')
  }

  const defaultFallback = (error: Error, reset: () => void) => (
    <div style="padding: 1rem; border: 1px solid #ff6b6b; border-radius: 4px; background: #ffe0e0;">
      <h3>Convex Connection Error</h3>
      <p>{error.message}</p>
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

// Hook to get Convex client
export function useConvex(): ConvexSolidClient {
  const client = useContext(ConvexContext)
  if (!client) {
    throw new Error('useConvex must be used within a ConvexProvider')
  }
  return client
}

// SolidJS-optimized useQuery Hook
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgs<Query>
): SolidQueryState<Query['_returnType']> {
  return useQueryWithOptions(query, args)
}

// Legacy useQuery for backward compatibility
export function useQueryLegacy<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgs<Query>
): Accessor<QueryState<Query['_returnType']>> {
  const solidState = useQueryWithOptions(query, args)

  // Convert SolidJS state to legacy format
  return createMemo(() => ({
    data: solidState.data(),
    error: solidState.error(),
    isLoading: solidState.isLoading(),
  }))
}

// SolidJS-optimized useQuery with proper reactivity patterns
export function useQueryWithOptions<Query extends FunctionReference<'query'>>(
  query: Query,
  args: OptionalRestArgs<Query>,
  options: UseQueryOptions = {},
): SolidQueryState<Query['_returnType']> {
  const client = useConvex()

  // State management with proper signals - no stable state anti-pattern
  const [data, setData] = createSignal<Query['_returnType'] | undefined>(
    undefined,
  )
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [isLoading, setIsLoading] = createSignal(true)
  const [isEnabled, setIsEnabled] = createSignal(options.enabled !== false)

  // Derived state using createMemo for performance
  const isSuccess = createMemo(
    () => !isLoading() && !error() && data() !== undefined,
  )
  const isError = createMemo(() => !isLoading() && error() !== undefined)

  // Create memoized query identifier that properly tracks argument changes
  const queryParams = createMemo(() => ({
    query,
    args: args as ArgsAndOptions<Query, 'query'>,
    enabled: isEnabled(),
  }))

  // Refetch function
  const refetch = async (): Promise<void> => {
    const { query: currentQuery, args: currentArgs } = queryParams()

    try {
      setIsLoading(true)
      setError(undefined)

      const result = await (client as any).query(currentQuery, ...currentArgs)
      setData(result)
      setIsLoading(false)
      options.onSuccess?.(result)
    } catch (err) {
      const convexError =
        err instanceof ConvexError
          ? err
          : err instanceof Error
            ? new ConvexError(err.message, 'QUERY_ERROR', {
                originalError: err,
              })
            : new ConvexError(String(err), 'UNKNOWN_ERROR')

      setError(convexError)
      setIsLoading(false)
      options.onError?.(convexError)
      throw convexError
    }
  }

  // Single effect to manage the entire query lifecycle
  createEffect(() => {
    const { query: currentQuery, args: currentArgs, enabled } = queryParams()

    if (!enabled) {
      setIsLoading(false)
      return
    }

    let unsubscribe: (() => void) | undefined
    let isCancelled = false

    const executeQuery = async () => {
      try {
        setIsLoading(true)
        setError(undefined)

        // Execute initial query with proper typing
        const result = await (client as any).query(currentQuery, ...currentArgs)

        if (!isCancelled) {
          setData(result)
          setIsLoading(false)
          options.onSuccess?.(result)
        }

        // Set up subscription for real-time updates using the enhanced subscription manager
        if (!isCancelled) {
          unsubscribe = subscriptionManager.subscribe(
            client,
            currentQuery,
            currentArgs,
            (newValue: Query['_returnType']) => {
              if (!isCancelled) {
                batch(() => {
                  setData(newValue)
                  setError(undefined)
                })
              }
            },
            {
              onError: (err) => {
                if (!isCancelled) {
                  setError(err)
                  options.onError?.(err)
                }
              },
              debug: options.debug,
            },
          )
        }
      } catch (err) {
        if (!isCancelled) {
          const convexError =
            err instanceof ConvexError
              ? err
              : err instanceof Error
                ? new ConvexError(err.message, 'QUERY_ERROR', {
                    originalError: err,
                  })
                : new ConvexError(String(err), 'UNKNOWN_ERROR')

          setError(convexError)
          setIsLoading(false)
          options.onError?.(convexError)
        }
      }
    }

    // Execute query in untracked context to avoid infinite loops
    untrack(() => executeQuery())

    // Cleanup function
    onCleanup(() => {
      isCancelled = true
      unsubscribe?.()
    })
  })

  // Return proper SolidJS state interface - no stable state anti-pattern
  return {
    data,
    error,
    isLoading,
    isSuccess,
    isError,
    refetch,
  }
}

// SolidJS-optimized useMutation Hook
export function useMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: UseMutationOptions,
): SolidMutationState<Mutation['_returnType']> & {
  mutate: (
    ...args: ArgsAndOptions<Mutation, 'mutation'>
  ) => Promise<Mutation['_returnType']>
  mutateAsync: (
    ...args: ArgsAndOptions<Mutation, 'mutation'>
  ) => Promise<Mutation['_returnType']>
} {
  const client = useConvex()
  const [data, setData] = createSignal<Mutation['_returnType'] | undefined>(
    undefined,
  )
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  // Derived state using createMemo for performance
  const isSuccess = createMemo(
    () => !isLoading() && !error() && data() !== undefined,
  )
  const isError = createMemo(() => !isLoading() && error() !== undefined)

  const mutate = async (...args: ArgsAndOptions<Mutation, 'mutation'>) => {
    batch(() => {
      setIsLoading(true)
      setError(undefined)
    })

    try {
      const result = await (client as any).mutation(mutation, ...args)

      batch(() => {
        setData(result)
        setIsLoading(false)
      })

      options?.onSuccess?.(result)
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
        setIsLoading(false)
      })

      options?.onError?.(convexError)
      throw convexError
    }
  }

  const reset = () => {
    batch(() => {
      setData(undefined)
      setIsLoading(false)
      setError(undefined)
    })
  }

  return {
    data,
    error,
    isLoading,
    isSuccess,
    isError,
    mutate,
    mutateAsync: mutate,
    reset,
  }
}

// SolidJS-optimized useAction Hook
export function useAction<Action extends FunctionReference<'action'>>(
  action: Action,
  options?: UseActionOptions,
): SolidActionState<Action['_returnType']> & {
  execute: (
    ...args: ArgsAndOptions<Action, 'action'>
  ) => Promise<Action['_returnType']>
  executeAsync: (
    ...args: ArgsAndOptions<Action, 'action'>
  ) => Promise<Action['_returnType']>
} {
  const client = useConvex()
  const [data, setData] = createSignal<Action['_returnType'] | undefined>(
    undefined,
  )
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  // Derived state using createMemo for performance
  const isSuccess = createMemo(
    () => !isLoading() && !error() && data() !== undefined,
  )
  const isError = createMemo(() => !isLoading() && error() !== undefined)

  const execute = async (...args: ArgsAndOptions<Action, 'action'>) => {
    batch(() => {
      setIsLoading(true)
      setError(undefined)
    })

    try {
      const result = await (client as any).action(action, ...args)

      batch(() => {
        setData(result)
        setIsLoading(false)
      })

      options?.onSuccess?.(result)
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
        setIsLoading(false)
      })

      options?.onError?.(convexError)
      throw convexError
    }
  }

  const reset = () => {
    batch(() => {
      setData(undefined)
      setIsLoading(false)
      setError(undefined)
    })
  }

  return {
    data,
    error,
    isLoading,
    isSuccess,
    isError,
    execute,
    executeAsync: execute,
    reset,
  }
}

// Paginated Query Hook
export function usePaginatedQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Omit<Query['_args'], 'paginationOpts'>,
  options: { initialNumItems: number },
): {
  results: Accessor<Query['_returnType'][] | undefined>
  status: Accessor<
    'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
  >
  loadMore: (numItems: number) => void
  isLoading: Accessor<boolean>
} {
  const client = useConvex()
  const [results, setResults] = createSignal<Query['_returnType'][]>([])
  const [status, setStatus] = createSignal<
    'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
  >('LoadingFirstPage')
  const [cursor, setCursor] = createSignal<string | null>(null)
  const [isLoading, setIsLoading] = createSignal(true)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  // Create Solidive query parameters that reset pagination when args change
  const queryParams = createMemo(() => ({ query, args }))

  // Reset pagination when query parameters change
  createEffect(() => {
    const { query: currentQuery, args: currentArgs } = queryParams()

    // Reset state when query params change
    batch(() => {
      setResults([])
      setCursor(null)
      setStatus('LoadingFirstPage')
      setIsLoading(true)
      setError(undefined)
    })

    // Load initial page with untrack to avoid infinite loops
    untrack(() => {
      loadPage(options.initialNumItems, null, currentQuery, currentArgs)
    })
  })

  const loadPage = async (
    numItems: number,
    currentCursor: string | null = null,
    currentQuery = query,
    currentArgs = args,
  ) => {
    try {
      const paginationOpts: PaginationOptions = {
        numItems,
        cursor: currentCursor,
      }

      const queryArgs = {
        ...currentArgs,
        paginationOpts,
      }

      const result = (await (client as any).query(
        currentQuery,
        queryArgs,
      )) as PaginationResult<Query['_returnType']>

      // Use batch for multiple state updates
      batch(() => {
        if (currentCursor === null) {
          // First page
          setResults(result.page)
        } else {
          // Additional pages
          setResults((prev: Query['_returnType'][]) => [
            ...prev,
            ...result.page,
          ])
        }
        setCursor(result.continueCursor)
        setStatus(result.isDone ? 'Exhausted' : 'CanLoadMore')
        setError(undefined)
      })
    } catch (err) {
      const convexError =
        err instanceof ConvexError
          ? err
          : err instanceof Error
            ? new ConvexError(err.message, 'PAGINATION_ERROR', {
                originalError: err,
              })
            : new ConvexError(String(err), 'UNKNOWN_ERROR')

      console.error('Error loading paginated query:', convexError)
      setError(convexError)
      setStatus('CanLoadMore')
    } finally {
      setIsLoading(false)
    }
  }

  const loadMore = (numItems: number) => {
    if (status() === 'CanLoadMore') {
      setStatus('LoadingMore')
      setIsLoading(true)
      loadPage(numItems, cursor())
    }
  }

  return {
    results,
    status,
    loadMore,
    isLoading,
  }
}

// Authentication helpers
export function useConvexAuth(): {
  isLoading: Accessor<boolean>
  isAuthenticated: Accessor<boolean>
} {
  const client = useConvex()
  const [isLoading, setIsLoading] = createSignal(true)
  const [isAuthenticated, setIsAuthenticated] = createSignal(false)

  createEffect(() => {
    // Check if client has auth token - using proper property access
    const clientWithAuth = client as ConvexClient & { _authToken?: string }
    const hasAuth = clientWithAuth._authToken !== undefined
    setIsAuthenticated(hasAuth)
    setIsLoading(false)
  })

  return {
    isLoading,
    isAuthenticated,
  }
}

// Query invalidation helper
export function useQueryInvalidation() {
  const client = useConvex()

  return {
    invalidateQuery: (query: FunctionReference<'query'>) => {
      // Force refetch by clearing any cached data
      // This is a simplified implementation - in a real app you'd want more sophisticated caching
      console.warn(
        'Query invalidation not fully implemented - consider using refetch instead',
      )
    },
  }
}

// SolidJS-optimized Error boundary component for Convex errors
export function ConvexErrorBoundary(props: {
  children: JSX.Element
  fallback?: (error: Error, reset: () => void) => JSX.Element
  onError?: (error: Error) => void
  debug?: boolean
}) {
  const { fallback, onError, debug = false } = props

  const defaultFallback = (error: Error, reset: () => void) => {
    if (debug) {
      console.error('[ConvexSolid] Error boundary caught error:', error)
    }

    return (
      <div style="padding: 1rem; border: 1px solid #ff6b6b; border-radius: 4px; background: #ffe0e0; margin: 1rem 0;">
        <h3 style="margin: 0 0 0.5rem 0; color: #d63031;">Convex Error</h3>
        <p style="margin: 0 0 1rem 0; font-family: monospace; font-size: 0.9em;">
          {error.message}
        </p>
        <Show when={error instanceof ConvexError && error.code}>
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
        <Show when={debug}>
          <details style="margin-top: 1rem;">
            <summary style="cursor: pointer; color: #636e72;">
              Stack Trace
            </summary>
            <pre style="margin: 0.5rem 0 0 0; font-size: 0.8em; overflow: auto; background: #f8f9fa; padding: 0.5rem; border-radius: 4px;">
              {error.stack}
            </pre>
          </details>
        </Show>
      </div>
    )
  }

  const handleError = (error: Error, reset: () => void) => {
    onError?.(error)
    return (fallback || defaultFallback)(error, reset)
  }

  return <ErrorBoundary fallback={handleError}>{props.children}</ErrorBoundary>
}

// Hook for managing multiple queries with better error handling (legacy)
export function useConvexQueries<
  T extends Record<string, FunctionReference<'query'>>,
>(
  queries: T,
  options: {
    enabled?: boolean
    onError?: (error: Error, queryKey: keyof T) => void
  } = {},
) {
  const results = {} as { [K in keyof T]: SolidQueryState<T[K]['_returnType']> }
  const errors = {} as { [K in keyof T]: Accessor<Error | undefined> }

  for (const [key, query] of Object.entries(queries)) {
    const [error, setError] = createSignal<Error | undefined>(undefined)
    errors[key as keyof T] = error

    results[key as keyof T] = useQueryWithOptions(query as any, [], {
      enabled: options.enabled,
      onError: (err: Error) => {
        setError(err)
        options.onError?.(err, key as keyof T)
      },
    })
  }

  return {
    queries: results,
    errors,
    isLoading: createMemo(() =>
      Object.values(results).some((result) => result.isLoading()),
    ),
    hasError: createMemo(() =>
      Object.values(errors).some((error) => error() !== undefined),
    ),
  }
}

// Legacy multiple queries hook for backward compatibility
export function useQueries<
  T extends Record<string, FunctionReference<'query'>>,
>(queries: T): Accessor<{ [K in keyof T]: QueryState<T[K]['_returnType']> }> {
  const queryResults = {} as {
    [K in keyof T]: SolidQueryState<T[K]['_returnType']>
  }

  for (const [key, query] of Object.entries(queries)) {
    queryResults[key as keyof T] = useQuery(query as any)
  }

  return createMemo(() => {
    const results = {} as { [K in keyof T]: QueryState<T[K]['_returnType']> }
    for (const [key, queryResult] of Object.entries(queryResults)) {
      const state = queryResult as SolidQueryState<T[keyof T]['_returnType']>
      results[key as keyof T] = {
        data: state.data(),
        error: state.error(),
        isLoading: state.isLoading(),
      }
    }
    return results
  })
}

// SolidJS Resource-based query hook for better Suspense integration
export function createConvexQuery<Query extends FunctionReference<'query'>>(
  query: () => Query,
  args: () => OptionalRestArgs<Query>,
  options: {
    initialValue?: Query['_returnType']
    onError?: (error: Error) => void
    debug?: boolean
  } = {},
) {
  const client = useConvex()
  const { initialValue, onError, debug = false } = options

  // Create a resource for better Suspense integration
  const [resource] = createResource(
    () => ({ query: query(), args: args() }),
    async ({ query: currentQuery, args: currentArgs }) => {
      try {
        if (debug) {
          console.log(
            `[ConvexSolid] Fetching resource for ${(currentQuery as any)._functionName || 'unknown'}`,
          )
        }

        const result = await (client as any).query(currentQuery, ...currentArgs)
        return result as Query['_returnType']
      } catch (error) {
        const convexError =
          error instanceof ConvexError
            ? error
            : error instanceof Error
              ? new ConvexError(error.message, 'RESOURCE_ERROR', {
                  originalError: error,
                })
              : new ConvexError(String(error), 'UNKNOWN_ERROR')

        onError?.(convexError)
        throw convexError
      }
    },
    { initialValue },
  )

  // Set up real-time subscription
  createEffect(() => {
    const currentQuery = query()
    const currentArgs = args()

    if (!currentQuery) return

    const unsubscribe = subscriptionManager.subscribe(
      client,
      currentQuery,
      currentArgs,
      (newValue: Query['_returnType']) => {
        // Update the resource with new data
        ;(resource as any).mutate?.(newValue)
      },
      {
        onError,
        debug,
      },
    )

    onCleanup(unsubscribe)
  })

  return resource
}

// SolidJS-optimized multiple queries hook
export function createConvexQueries<
  T extends Record<string, { query: FunctionReference<'query'>; args: any[] }>,
>(
  queries: () => T,
  options: {
    enabled?: boolean
    onError?: (error: Error, queryKey: keyof T) => void
    debug?: boolean
  } = {},
) {
  const { enabled = true, onError, debug = false } = options

  // Create individual query states
  const queryStates = createMemo(() => {
    const currentQueries = queries()
    const states = {} as { [K in keyof T]: SolidQueryState<any> }

    for (const [key, { query, args }] of Object.entries(currentQueries)) {
      states[key as keyof T] = useQueryWithOptions(query as any, args as any, {
        enabled,
        onError: (err: Error) => onError?.(err, key as keyof T),
        debug,
      })
    }

    return states
  })

  // Aggregate state
  const isLoading = createMemo(() =>
    Object.values(queryStates()).some((state) => state.isLoading()),
  )

  const hasError = createMemo(() =>
    Object.values(queryStates()).some((state) => state.isError()),
  )

  const allSuccess = createMemo(() =>
    Object.values(queryStates()).every((state) => state.isSuccess()),
  )

  return {
    queries: queryStates,
    isLoading,
    hasError,
    allSuccess,
    refetchAll: () => {
      const states = queryStates()
      return Promise.all(Object.values(states).map((state) => state.refetch()))
    },
  }
}

// Utility function to create a Convex client with SolidJS optimizations
export function createConvexClient(
  url: string,
  options: {
    debug?: boolean
    onError?: (error: Error) => void
  } = {},
): ConvexSolidClient {
  const client = new ConvexClient(url) as ConvexSolidClient
  const { debug = false, onError } = options

  if (debug) {
    console.log('[ConvexSolid] Created Convex client for:', url)
  }

  // Add error handling wrapper
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
      onError?.(convexError)
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
      onError?.(convexError)
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
      onError?.(convexError)
      throw convexError
    }
  }

  return client
}

// SolidJS-specific debugging utilities
export function useConvexDebug() {
  const client = useConvex()

  return {
    getSubscriptionStats: () => subscriptionManager.getStats(),
    logClient: () => console.log('[ConvexSolid] Client:', client),
    clearSubscriptions: () => {
      // This would need to be implemented in the subscription manager
      console.warn('[ConvexSolid] Clear subscriptions not implemented')
    },
  }
}

// SolidJS-optimized Suspense wrapper for Convex queries
export function ConvexSuspense(props: {
  children: JSX.Element
  fallback?: JSX.Element
  onError?: (error: Error, reset: () => void) => JSX.Element
}) {
  const defaultFallback = (
    <div style="display: flex; align-items: center; justify-content: center; padding: 2rem;">
      <div style="text-align: center;">
        <div style="margin-bottom: 1rem; font-size: 1.2em;">Loading...</div>
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0984e3; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
    </div>
  )

  return (
    <ConvexErrorBoundary fallback={props.onError}>
      <Suspense fallback={props.fallback || defaultFallback}>
        {props.children}
      </Suspense>
    </ConvexErrorBoundary>
  )
}

// Export enhanced types and client
export { ConvexClient }
export type {
  ArgsAndOptions,
  FunctionReference,
  GenericActionCtx,
  GenericDocument,
  GenericMutationCtx,
  GenericQueryCtx,
  OptionalRestArgs,
  PaginationOptions,
  PaginationResult,
}

// Re-export subscription manager for advanced usage
export { subscriptionManager as convexSubscriptionManager }

// Version and feature detection
export const CONVEX_SOLID_VERSION = '1.0.0'
export const CONVEX_SOLID_FEATURES = {
  suspense: true,
  errorBoundaries: true,
  resources: true,
  subscriptionDeduplication: true,
  debugUtilities: true,
} as const
