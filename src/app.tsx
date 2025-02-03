import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { ClerkProvider } from 'clerk-solidjs';
import { Suspense } from 'solid-js';
import Nav from '~/components/Nav';
import './app.css';

export default function App() {
  return (
    <Router
      root={(props) => (
        <ClerkProvider
          publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
          <Nav />
          <Suspense>{props.children}</Suspense>
        </ClerkProvider>
      )}>
      <FileRoutes />
    </Router>
  );
}
