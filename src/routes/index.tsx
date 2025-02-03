import { createAsync, RouteDefinition } from '@solidjs/router';
import {
  ClerkLoaded,
  ClerkLoading,
  SignedIn,
  SignedOut,
  SignInButton,
  useAuth,
  UserButton,
} from 'clerk-solidjs';
import { For } from 'solid-js';
import { MUTATIONS } from '~/db/mutations';
import { QUERIES } from '~/db/queries';

export const route = {
  preload: () => QUERIES.Characters.GetAll(),
} satisfies RouteDefinition;

function Home() {
  const characters = createAsync(async () => QUERIES.Characters.GetAll(), {
    deferStream: true,
  });

  return (
    <>
      <ul>
        <For each={characters()}>
          {(character) => (
            <li class='flex gap-2'>
              <span>{character.name}</span>
              <form
                action={MUTATIONS.Characters.DeleteCharacterById.with(
                  character.id
                )}
                method='post'>
                <button type='submit'>x</button>
              </form>
            </li>
          )}
        </For>
      </ul>
      <form
        action={MUTATIONS.Characters.AddCharacter}
        method='post'>
        <label>
          Name:
          <input
            type='text'
            name='name'
          />
        </label>
        <label>
          Age:
          <input
            type='number'
            name='age'
          />
        </label>
        <button type='submit'>Submit</button>
      </form>
    </>
  );
}

export default function MyComponent() {
  const { userId } = useAuth();

  return (
    <div>
      <ClerkLoading>
        <p>Loading...</p>
      </ClerkLoading>
      <ClerkLoaded>
        <SignedIn>
          <UserButton />
          <Home />
        </SignedIn>
        <SignedOut>
          <SignInButton />
        </SignedOut>
      </ClerkLoaded>
    </div>
  );
}
