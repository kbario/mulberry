# @mulberry/convex-solid

A production-ready SolidJS integration for Convex that provides:

- **Real-time queries, mutations, and actions** with SolidJS reactivity
- **TanStack Solid Query integration** for advanced caching and data fetching
- **SolidJS Router integration** with SSR support and progressive hydration
- **Full TypeScript support** with excellent developer experience

## Installation

```bash
npm install @mulberry/convex-solid convex
```

## Setup

### 1. Create a Convex Client

```tsx
import { createConvexClient } from '@mulberry/convex-solid'

const convex = createConvexClient(import.meta.env.VITE_CONVEX_URL)
```

### 2. Wrap Your App with ConvexProvider

```tsx
import { render } from 'solid-js/web'
import { ConvexProvider } from '@mulberry/convex-solid'
import App from './App'

const convex = createConvexClient(import.meta.env.VITE_CONVEX_URL)

render(
  () => (
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  ),
  document.getElementById('root')!,
)
```

## Usage

### Queries

Use `useQuery` to fetch data reactively with real-time updates:

```tsx
import { useQuery } from '@mulberry/convex-solid'
import { api } from '../convex/_generated/api'

function MessageList() {
  const messages = useQuery(api.messages.list)

  return (
    <div>
      <Show when={messages().isLoading}>
        <div>Loading...</div>
      </Show>
      <Show when={messages().error}>
        <div>Error: {messages().error?.message}</div>
      </Show>
      <Show when={messages().data}>
        <For each={messages().data}>
          {(message) => <div>{message.text}</div>}
        </For>
      </Show>
    </div>
  )
}
```

### Mutations

Use `useMutation` to modify data:

```tsx
import { useMutation } from '@mulberry/convex-solid'
import { api } from '../convex/_generated/api'

function SendMessage() {
  const [message, setMessage] = createSignal('')
  const sendMessage = useMutation(api.messages.send, {
    onSuccess: () => {
      setMessage('')
      console.log('Message sent!')
    },
    onError: (error) => {
      console.error('Failed to send message:', error)
    },
  })

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (message().trim()) {
      await sendMessage.mutate({ text: message() })
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={message()}
        onInput={(e) => setMessage(e.currentTarget.value)}
        placeholder="Type a message..."
      />
      <button type="submit" disabled={sendMessage.state().isLoading}>
        {sendMessage.state().isLoading ? 'Sending...' : 'Send'}
      </button>
      <Show when={sendMessage.state().error}>
        <div>Error: {sendMessage.state().error?.message}</div>
      </Show>
    </form>
  )
}
```

### Actions

Use `useAction` for server-side actions:

```tsx
import { useAction } from '@mulberry/convex-solid'
import { api } from '../convex/_generated/api'

function ProcessData() {
  const processAction = useAction(api.processing.processData, {
    onSuccess: (result) => {
      console.log('Processing completed:', result)
    },
    onError: (error) => {
      console.error('Processing failed:', error)
    },
  })

  const handleProcess = async () => {
    await processAction.execute({ data: 'some data' })
  }

  return (
    <button onClick={handleProcess} disabled={processAction.state().isLoading}>
      {processAction.state().isLoading ? 'Processing...' : 'Process Data'}
    </button>
  )
}
```

### Paginated Queries

Use `usePaginatedQuery` for paginated data:

```tsx
import { usePaginatedQuery } from '@mulberry/convex-solid'
import { api } from '../convex/_generated/api'

function PaginatedMessages() {
  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.messages.listPaginated,
    {},
    { initialNumItems: 10 },
  )

  return (
    <div>
      <For each={results()}>{(message) => <div>{message.text}</div>}</For>

      <Show when={status() === 'CanLoadMore'}>
        <button onClick={() => loadMore(10)} disabled={isLoading()}>
          {isLoading() ? 'Loading...' : 'Load More'}
        </button>
      </Show>

      <Show when={status() === 'Exhausted'}>
        <div>No more messages</div>
      </Show>
    </div>
  )
}
```

### Authentication

Use `useConvexAuth` to check authentication status:

```tsx
import { useConvexAuth } from '@mulberry/convex-solid'

function AuthStatus() {
  const { isLoading, isAuthenticated } = useConvexAuth()

  return (
    <Show when={!isLoading()} fallback={<div>Loading auth...</div>}>
      <div>{isAuthenticated() ? 'Authenticated' : 'Not authenticated'}</div>
    </Show>
  )
}
```

### Setting Authentication

To set up authentication, configure your Convex client:

```tsx
import { createConvexClient } from '@mulberry/convex-solid'

const convex = createConvexClient(import.meta.env.VITE_CONVEX_URL)

// Set up authentication
convex.setAuth(async () => {
  // Return your auth token here
  return await getAuthToken()
})
```

## API Reference

### Hooks

- `useQuery(query, ...args)` - Subscribe to a Convex query with real-time updates
- `useMutation(mutation, options?)` - Create a mutation function
- `useAction(action, options?)` - Create an action function
- `usePaginatedQuery(query, args, options)` - Handle paginated queries
- `useConvex()` - Get the Convex client instance
- `useConvexAuth()` - Get authentication status

### Components

- `ConvexProvider` - Provides Convex client to child components

### Utilities

- `createConvexClient(url)` - Create a new Convex client instance

## Features

- ✅ Real-time query subscriptions
- ✅ Mutations with loading states
- ✅ Actions with loading states
- ✅ Paginated queries
- ✅ Authentication support
- ✅ Error handling
- ✅ TypeScript support
- ✅ SolidJS reactive primitives
- ✅ Same API as React version

## Recent Improvements (v2.0)

This version includes major improvements to align with SolidJS best practices and fix critical issues:

### 🚀 Performance & Reactivity Fixes

- **Fixed critical reactivity bug**: Query arguments now properly update when changed
- **Eliminated dual data flow**: Removed conflicting `createResource` and `createEffect` patterns
- **Query deduplication**: Multiple components using the same query now share subscriptions
- **Optimized re-renders**: State objects are now stable and don't recreate unnecessarily

### 🔒 Type Safety Improvements

- **Enhanced error types**: Added `ConvexError`, `ConvexNetworkError`, and `ConvexAuthError`
- **Reduced type casting**: Minimized use of `any` types for better type safety
- **Better TypeScript integration**: Improved IntelliSense and compile-time error detection

### 🏗️ Architecture Improvements

- **Single effect pattern**: Each hook now uses one `createEffect` for cleaner lifecycle management
- **Proper cleanup**: Enhanced subscription cleanup prevents memory leaks
- **Reactive pagination**: `usePaginatedQuery` now properly resets when arguments change
- **Stable state objects**: Using getter properties to prevent unnecessary object recreation

## Differences from React Version

This SolidJS wrapper provides the same functionality as the Convex React integration but uses SolidJS reactive primitives:

- Uses `createSignal` instead of `useState`
- Uses `createEffect` instead of `useEffect`
- Uses `createMemo` for computed values
- Returns `Accessor<T>` functions instead of direct values
- Uses `untrack` for side effects that shouldn't trigger reactivity
- Uses `batch` for multiple state updates to prevent unnecessary renders

The API surface is designed to be as close as possible to the React version while feeling natural in SolidJS.

## 🛣️ Router Integration

For applications using TanStack Solid Router, we provide seamless integration with data fetching and SSR support:

```tsx
import { createRouter } from '@tanstack/solid-router'
import { QueryClient } from '@tanstack/solid-query'
import {
  ConvexSolidQueryClient,
  solidRouterWithQueryClient,
  createSolidRouterQueryLoader,
} from '@mulberry/convex-solid'

// Setup
const convexClient = new ConvexSolidQueryClient(url)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { queryKeyHashFn: convexClient.hashFn() },
  },
})
convexClient.connect(queryClient)

// Create enhanced router
const router = createRouter({ routeTree, context: { queryClient } })
const enhancedRouter = solidRouterWithQueryClient(router, queryClient)

// Route with data loading
const messagesRoute = createRoute({
  path: '/messages',
  loader: createSolidRouterQueryLoader(queryClient, async () => {
    return await queryClient.fetchQuery(
      convexQuery(api.messages.list, { channel: 'general' }),
    )
  }),
  component: () => {
    const messages = createQuery(() =>
      convexQuery(api.messages.list, { channel: channel() }),
    )
    return <MessageList messages={messages} />
  },
})
```

### Router Features

- **SSR Support**: Full server-side rendering with progressive hydration
- **Route-level Data Loading**: Pre-load data before components render
- **Error Handling**: Enhanced error handling for redirects and failures
- **Type Safety**: Full TypeScript integration with route parameters
- **Performance**: Stream-based query hydration for better performance

See [ROUTER_INTEGRATION.md](./ROUTER_INTEGRATION.md) for complete documentation.
