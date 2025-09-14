import { Outlet, createRootRouteWithContext } from '@tanstack/solid-router'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'
import TanStackQueryProvider from '../integrations/tanstack-query/provider.tsx'

import '@fontsource/inter'

import Header from '../components/Header'

export const Route = createRootRouteWithContext()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <TanStackQueryProvider>
        <Header />

        <Outlet />
        {/* <TanStackRouterDevtools /> */}
      </TanStackQueryProvider>
    </>
  )
}
