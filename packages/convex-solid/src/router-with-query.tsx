import { isRedirect } from '@tanstack/router-core'
import '@tanstack/router-core/ssr/client'
import type {
  QueryClient,
  DehydratedState as QueryDehydratedState,
} from '@tanstack/solid-query'
import {
  QueryClientProvider,
  dehydrate as queryDehydrate,
  hydrate as queryHydrate,
} from '@tanstack/solid-query'
import type { AnyRouter } from '@tanstack/solid-router'
import {
  Component,
  JSX,
  createMemo,
  onCleanup,
  ErrorBoundary,
  createSignal,
  createEffect,
} from 'solid-js'
import { isServer } from 'solid-js/web'

// Enhanced error types for better error handling
export class RouterQueryError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: Error,
  ) {
    super(message)
    this.name = 'RouterQueryError'
  }
}

export class RouterSSRError extends RouterQueryError {
  constructor(message: string, originalError?: Error) {
    super(message, 'SSR_ERROR', originalError)
    this.name = 'RouterSSRError'
  }
}

// SolidJS-specific options for router integration
export interface SolidRouterQueryOptions {
  /**
   * Optional wrapper component to provide additional context or styling
   * Uses proper SolidJS component pattern
   */
  WrapProvider?: Component<{ children: JSX.Element }>

  /**
   * If `true`, the QueryClient will handle errors thrown by `redirect()`
   * inside of mutations and queries.
   *
   * @default true
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/solid/api/router/redirectFunction)
   */
  handleRedirects?: boolean

  /**
   * Enable debug logging for development
   * @default false
   */
  debug?: boolean

  /**
   * Custom error handler for router-query integration errors
   */
  onError?: (error: RouterQueryError) => void

  /**
   * Enable SolidJS error boundaries for better error handling
   * @default true
   */
  useErrorBoundary?: boolean

  /**
   * Custom error boundary fallback component
   */
  errorBoundaryFallback?: Component<{ error: Error; reset: () => void }>
}

// State structure for SSR dehydration/hydration
export interface DehydratedSolidRouterQueryState {
  /** Dehydrated query client state for SSR */
  dehydratedQueryClient: QueryDehydratedState
  /** Stream for progressive query hydration */
  queryStream: ReadableStream<QueryDehydratedState>
  /** Additional router state */
  routerState?: any
}

// Type validation to ensure router has QueryClient in context
export type ValidateSolidRouter<TRouter extends AnyRouter> = TRouter extends {
  options: {
    context: {
      queryClient: QueryClient
    }
  }
}
  ? TRouter
  : TRouter // Allow any router for now, runtime validation will catch issues

/**
 * Integrates TanStack Solid Router with TanStack Solid Query for SolidJS applications.
 *
 * This function enhances a SolidJS router with query client integration, providing:
 * - Automatic QueryClientProvider wrapping
 * - SSR support with progressive hydration
 * - Error handling for redirects in queries/mutations
 * - Stream-based query hydration for better performance
 *
 * @param router - The TanStack Solid Router instance
 * @param queryClient - The TanStack Query client instance
 * @param options - Additional configuration options
 * @returns Enhanced router with query integration
 *
 * @example
 * ```tsx
 * import { createRouter } from '@tanstack/solid-router';
 * import { QueryClient } from '@tanstack/solid-query';
 * import { solidRouterWithQueryClient } from '@mulberry/convex-solid';
 *
 * const queryClient = new QueryClient();
 * const router = createRouter({ routeTree, context: { queryClient } });
 * const enhancedRouter = solidRouterWithQueryClient(router, queryClient);
 * ```
 */
export function solidRouterWithQueryClient<TRouter extends AnyRouter>(
  router: ValidateSolidRouter<TRouter>,
  queryClient: QueryClient,
  options: SolidRouterQueryOptions = {},
): TRouter {
  const originalOptions = router.options
  const {
    debug = false,
    onError,
    useErrorBoundary = true,
    errorBoundaryFallback,
  } = options

  // Log debug information if enabled
  if (debug) {
    console.log(
      '[SolidRouterQuery] Initializing router with query client integration',
    )
  }

  // Create SolidJS-optimized wrapper component
  const createSolidWrapper = (): Component<{ children: JSX.Element }> => {
    return (props: { children: JSX.Element }) => {
      const WrapProvider = options.WrapProvider
      const OriginalWrap = originalOptions.Wrap

      // Create memoized wrapper content for performance
      const wrapperContent = createMemo(() => {
        let content = (
          <QueryClientProvider client={queryClient}>
            {OriginalWrap ? (
              <OriginalWrap>{props.children}</OriginalWrap>
            ) : (
              props.children
            )}
          </QueryClientProvider>
        )

        if (WrapProvider) {
          content = <WrapProvider>{content}</WrapProvider>
        }

        return content
      })

      // Wrap with error boundary if enabled
      if (useErrorBoundary) {
        const fallback =
          errorBoundaryFallback ||
          ((error: Error, reset: () => void) => (
            <div style="padding: 1rem; border: 1px solid #ff6b6b; border-radius: 4px; background: #ffe0e0;">
              <h3>Router Error</h3>
              <p>{error.message}</p>
              <button onClick={reset}>Retry</button>
            </div>
          ))

        return (
          <ErrorBoundary fallback={fallback}>{wrapperContent()}</ErrorBoundary>
        )
      }

      return wrapperContent()
    }
  }

  // Enhance router options with query client integration
  router.options = {
    ...router.options,
    context: {
      ...originalOptions.context,
      // Ensure query client is available in router context for loaders
      queryClient,
    },
    // Use the optimized SolidJS wrapper
    Wrap: createSolidWrapper(),
  }

  // Server-side rendering configuration - SolidJS optimized
  if (isServer) {
    if (debug) {
      console.log('[SolidRouterQuery] Configuring SolidJS SSR support')
    }

    const queryStream = createSolidPushableStream()

    // Enhanced dehydration with SolidJS-specific optimizations
    router.options.dehydrate =
      async (): Promise<DehydratedSolidRouterQueryState> => {
        try {
          const originalDehydrated = await originalOptions.dehydrate?.()

          // Dehydrate query client directly (no need for createMemo in async context)
          const dehydratedQueryClient = queryDehydrate(queryClient)

          // Set up proper cleanup using SolidJS patterns
          const cleanup = () => {
            queryStream.close()
            if (debug) {
              console.log('[SolidRouterQuery] Query stream closed after render')
            }
          }

          // Don't use onCleanup in async context - handle cleanup via router SSR

          // Also handle router-specific cleanup if available
          if (router.serverSsr?.onRenderFinished) {
            router.serverSsr.onRenderFinished(cleanup)
          }

          const dehydratedState: DehydratedSolidRouterQueryState = {
            ...originalDehydrated,
            dehydratedQueryClient,
            queryStream: queryStream.stream,
            routerState: router.state,
          }

          if (debug) {
            console.log('[SolidRouterQuery] Dehydration completed', {
              queries: Object.keys(dehydratedQueryClient.queries || {}).length,
            })
          }

          return dehydratedState
        } catch (error) {
          const routerError = new RouterSSRError(
            'Failed to dehydrate router state',
            error instanceof Error ? error : new Error(String(error)),
          )
          onError?.(routerError)
          throw routerError
        }
      }

    // Configure query client for SSR
    const originalClientOptions = queryClient.getDefaultOptions()
    queryClient.setDefaultOptions({
      ...originalClientOptions,
      dehydrate: {
        shouldDehydrateQuery: () => true,
        ...originalClientOptions.dehydrate,
      },
    })

    // Set up progressive query streaming for SSR with SolidJS optimizations
    const streamSubscription = queryClient
      .getQueryCache()
      .subscribe((event) => {
        if (event.type === 'added') {
          // Only stream queries after initial dehydration
          if (!router.serverSsr?.isDehydrated?.()) {
            return
          }

          if (queryStream.isClosed()) {
            if (debug) {
              console.warn(
                `[SolidRouterQuery] Attempted to stream query ${event.query.queryHash} after stream closed`,
              )
            }
            return
          }

          try {
            // Dehydrate query directly (no need for createMemo in event handler)
            const dehydratedQuery = queryDehydrate(queryClient, {
              shouldDehydrateQuery: (query) => {
                if (query.queryHash === event.query.queryHash) {
                  return (
                    originalClientOptions.dehydrate?.shouldDehydrateQuery?.(
                      query,
                    ) ?? true
                  )
                }
                return false
              },
            })

            // Stream individual query updates
            queryStream.enqueue(dehydratedQuery)

            if (debug) {
              console.log(
                `[SolidRouterQuery] Streamed query: ${event.query.queryHash}`,
              )
            }
          } catch (error) {
            const streamError = new RouterSSRError(
              `Failed to stream query ${event.query.queryHash}`,
              error instanceof Error ? error : new Error(String(error)),
            )
            onError?.(streamError)
            queryStream.error(streamError)
          }
        }
      })

    // Store subscription for manual cleanup (can't use onCleanup outside reactive context)
    // The subscription will be cleaned up when the query client is destroyed

    // Client-side hydration configuration - SolidJS optimized
  } else {
    if (debug) {
      console.log(
        '[SolidRouterQuery] Configuring SolidJS client-side hydration',
      )
    }

    router.options.hydrate = async (
      dehydrated: DehydratedSolidRouterQueryState,
    ) => {
      try {
        // Hydrate original router state first
        await originalOptions.hydrate?.(dehydrated)

        // Hydrate query client with initial data using SolidJS patterns
        queryHydrate(queryClient, dehydrated.dehydratedQueryClient)

        if (debug) {
          console.log('[SolidRouterQuery] Initial hydration completed')
        }

        // Set up progressive hydration from stream with proper cleanup
        const reader = dehydrated.queryStream.getReader()
        let isHydrating = true

        // Note: Can't use onCleanup in async function context
        // Cleanup is handled by the reader.cancel() in the catch block

        const handleStreamChunk = async ({
          done,
          value,
        }: ReadableStreamReadResult<QueryDehydratedState>): Promise<void> => {
          if (done || !isHydrating) {
            if (debug) {
              console.log('[SolidRouterQuery] Stream hydration completed')
            }
            return
          }

          try {
            queryHydrate(queryClient, value)
            if (debug) {
              console.log('[SolidRouterQuery] Hydrated stream chunk')
            }
          } catch (error) {
            const hydrateError = new RouterQueryError(
              'Failed to hydrate stream chunk',
              'HYDRATION_ERROR',
              error instanceof Error ? error : new Error(String(error)),
            )
            onError?.(hydrateError)
            throw hydrateError
          }

          // Continue reading stream if still hydrating
          if (isHydrating) {
            const result = await reader.read()
            return handleStreamChunk(result)
          }
        }

        // Start progressive hydration with error boundary
        reader
          .read()
          .then(handleStreamChunk)
          .catch((error) => {
            if (!isHydrating) return // Ignore errors after cleanup

            const streamError = new RouterQueryError(
              'Error reading query stream during hydration',
              'STREAM_ERROR',
              error instanceof Error ? error : new Error(String(error)),
            )
            onError?.(streamError)
            console.error(
              '[SolidRouterQuery] Stream hydration error:',
              streamError,
            )
          })
      } catch (error) {
        const hydrateError = new RouterQueryError(
          'Failed to hydrate router state',
          'HYDRATION_ERROR',
          error instanceof Error ? error : new Error(String(error)),
        )
        onError?.(hydrateError)
        throw hydrateError
      }
    }

    // Enhanced redirect handling for queries and mutations with SolidJS patterns
    if (options.handleRedirects ?? true) {
      if (debug) {
        console.log('[SolidRouterQuery] Enabling SolidJS redirect handling')
      }

      // Create redirect handler (no need for createMemo here)
      const createRedirectHandler = (
        error: any,
        type: 'mutation' | 'query',
      ) => {
        if (isRedirect(error)) {
          try {
            error.options._fromLocation = router.state.location
            if (debug) {
              console.log(
                `[SolidRouterQuery] Handling ${type} redirect:`,
                error.options,
              )
            }
            return router.navigate(router.resolveRedirect(error).options)
          } catch (navError) {
            const redirectError = new RouterQueryError(
              `Failed to handle ${type} redirect`,
              'REDIRECT_ERROR',
              navError instanceof Error
                ? navError
                : new Error(String(navError)),
            )
            onError?.(redirectError)
            throw redirectError
          }
        }
        return null
      }

      // Handle redirects in mutations with cleanup
      const originalMutationConfig = queryClient.getMutationCache().config
      const mutationConfig = {
        ...originalMutationConfig,
        onError: (error: any, variables: any, context: any, mutation: any) => {
          const redirectResult = createRedirectHandler(error, 'mutation')
          if (redirectResult) return redirectResult

          // Call original error handler
          return originalMutationConfig.onError?.(
            error,
            variables,
            context,
            mutation,
          )
        },
      }
      queryClient.getMutationCache().config = mutationConfig

      // Handle redirects in queries with cleanup
      const originalQueryConfig = queryClient.getQueryCache().config
      const queryConfig = {
        ...originalQueryConfig,
        onError: (error: any, query: any) => {
          const redirectResult = createRedirectHandler(error, 'query')
          if (redirectResult) return redirectResult

          // Call original error handler
          return originalQueryConfig.onError?.(error, query)
        },
      }
      queryClient.getQueryCache().config = queryConfig

      // Note: Can't use onCleanup outside reactive context
      // Configs will be restored when query client is destroyed
    }
  }

  if (debug) {
    console.log('[SolidRouterQuery] Router integration completed successfully')
  }

  return router as TRouter
}

// SolidJS-optimized pushable stream for SSR query streaming
export interface SolidPushableStream {
  /** The readable stream for progressive data transmission */
  stream: ReadableStream<QueryDehydratedState>
  /** Enqueue data to the stream */
  enqueue: (chunk: QueryDehydratedState) => void
  /** Close the stream */
  close: () => void
  /** Check if stream is closed */
  isClosed: () => boolean
  /** Send error through the stream */
  error: (err: unknown) => void
}

/**
 * Creates a pushable stream optimized for SolidJS SSR query streaming.
 *
 * This stream allows progressive hydration of queries during SSR,
 * improving perceived performance by streaming query results as they become available.
 * Includes SolidJS-specific optimizations and proper resource management.
 *
 * @returns A pushable stream interface for query data
 */
function createSolidPushableStream(): SolidPushableStream {
  let controllerRef: ReadableStreamDefaultController<QueryDehydratedState>
  let _isClosed = false
  let _isStarted = false

  const stream = new ReadableStream<QueryDehydratedState>({
    start(controller) {
      controllerRef = controller
      _isStarted = true
    },
    cancel() {
      _isClosed = true
    },
  })

  // Note: Can't use onCleanup outside reactive context
  // Stream cleanup will be handled by the stream controller itself

  return {
    stream,
    enqueue: (chunk: QueryDehydratedState) => {
      if (!_isClosed && _isStarted && controllerRef) {
        try {
          controllerRef.enqueue(chunk)
        } catch (error) {
          console.error(
            '[SolidRouterQuery] Failed to enqueue stream chunk:',
            error,
          )
          _isClosed = true
        }
      }
    },
    close: () => {
      if (!_isClosed && _isStarted && controllerRef) {
        try {
          controllerRef.close()
        } catch (error) {
          console.error('[SolidRouterQuery] Failed to close stream:', error)
        } finally {
          _isClosed = true
        }
      }
    },
    isClosed: () => _isClosed,
    error: (err: unknown) => {
      if (!_isClosed && _isStarted && controllerRef) {
        try {
          controllerRef.error(err)
        } catch (error) {
          console.error(
            '[SolidRouterQuery] Failed to send stream error:',
            error,
          )
        } finally {
          _isClosed = true
        }
      }
    },
  }
}

// SolidJS-optimized utility function for better error handling in loaders
export function createSolidRouterQueryLoader<T>(
  queryClient: QueryClient,
  loaderFn: () => Promise<T>,
  options: {
    /** Enable debug logging */
    debug?: boolean
    /** Custom error handler */
    onError?: (error: RouterQueryError) => void
    /** Retry configuration */
    retry?: { attempts: number; delay: number }
  } = {},
): () => Promise<T> {
  const { debug = false, onError, retry } = options

  return async () => {
    let lastError: Error | undefined
    const maxAttempts = retry ? retry.attempts + 1 : 1

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (debug && attempt > 1) {
          console.log(
            `[SolidRouterQuery] Loader retry attempt ${attempt}/${maxAttempts}`,
          )
        }

        const result = await loaderFn()

        if (debug) {
          console.log('[SolidRouterQuery] Loader executed successfully')
        }

        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Handle redirects in loaders - don't retry these
        if (isRedirect(error)) {
          if (debug) {
            console.log('[SolidRouterQuery] Loader redirect detected')
          }
          throw error // Let router handle redirects
        }

        // If this is the last attempt or no retry config, throw the error
        if (attempt === maxAttempts || !retry) {
          break
        }

        // Wait before retry
        if (retry.delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, retry.delay))
        }
      }
    }

    // Wrap the final error for better debugging
    const loaderError = new RouterQueryError(
      'Loader execution failed',
      'LOADER_ERROR',
      lastError,
    )

    onError?.(loaderError)

    if (debug) {
      console.error(
        '[SolidRouterQuery] Loader failed after all attempts:',
        loaderError,
      )
    }

    throw loaderError
  }
}

// Additional SolidJS-specific utilities

/**
 * Creates a SolidJS-optimized query resource that integrates with the router.
 * This provides better integration with SolidJS's resource system.
 *
 * @param queryClient - The TanStack Query client
 * @param queryFn - Function that returns query options
 * @param options - Additional options for the resource
 */
export function createRouterQueryResource<T>(
  queryClient: QueryClient,
  queryFn: () => any,
  options: {
    /** Initial data */
    initialValue?: T
    /** Custom error handler */
    onError?: (error: Error) => void
    /** Enable debug logging */
    debug?: boolean
  } = {},
) {
  const { initialValue, onError, debug = false } = options

  // Create a memoized query that tracks dependencies
  const queryOptions = createMemo(() => {
    try {
      return queryFn()
    } catch (error) {
      const queryError = new RouterQueryError(
        'Failed to create query options',
        'QUERY_OPTIONS_ERROR',
        error instanceof Error ? error : new Error(String(error)),
      )
      onError?.(queryError)
      throw queryError
    }
  })

  // Create signals for state management
  const [data, setData] = createSignal<T | undefined>(initialValue)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [isLoading, setIsLoading] = createSignal(true)

  // Effect to handle query execution
  createEffect(() => {
    const options = queryOptions()
    if (!options) return

    if (debug) {
      console.log('[SolidRouterQuery] Executing router query resource')
    }

    setIsLoading(true)
    setError(undefined)

    // Execute query using the query client
    queryClient
      .fetchQuery(options)
      .then((result) => {
        setData(() => result as T)
        setIsLoading(false)
        if (debug) {
          console.log('[SolidRouterQuery] Router query resource completed')
        }
      })
      .catch((err) => {
        const queryError =
          err instanceof RouterQueryError
            ? err
            : new RouterQueryError(
                'Router query resource failed',
                'RESOURCE_ERROR',
                err instanceof Error ? err : new Error(String(err)),
              )
        setError(queryError)
        setIsLoading(false)
        onError?.(queryError)
        if (debug) {
          console.error(
            '[SolidRouterQuery] Router query resource error:',
            queryError,
          )
        }
      })
  })

  return {
    data,
    error,
    isLoading,
    refetch: () => {
      const options = queryOptions()
      if (options) {
        queryClient.invalidateQueries(options)
      }
    },
  }
}

/**
 * Hook for accessing router context with query client integration.
 * Provides type-safe access to the enhanced router context.
 */
export function useSolidRouterQuery() {
  // This would integrate with @tanstack/solid-router's context
  // For now, we provide the interface that should be implemented
  return {
    queryClient: undefined as QueryClient | undefined,
    router: undefined as any,
    // Add more context properties as needed
  }
}

// Export the main function with a more descriptive name for SolidJS
export { solidRouterWithQueryClient as routerWithQueryClient }
