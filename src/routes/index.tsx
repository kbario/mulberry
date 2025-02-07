import { createAsync, query, RouteDefinition } from '@solidjs/router';
import { createEffect, For, Match, Show, createMemo, Suspense, Switch, type Component } from 'solid-js';
import { MUTATIONS } from '~/db/mutations';
import { QUERIES } from '~/db/queries';
import { Dialog } from "@kobalte/core/dialog";
import { Character } from '~/types/characters';
import { authClient, signIn } from '~/lib/auth-client';
import { auth } from '~/lib/auth';
import { getRequestHeaders, useSession } from 'vinxi/http';
import { getRequestEvent } from 'solid-js/web';
import { Button } from '@kobalte/core/src/index.jsx';

const getInitialSession = query(async () => {
  'use server';
  return await auth.api.getSession({ headers: getRequestEvent()?.request.headers! })
}, 'get-initial-session')

export const route = {
  preload: () => {
    QUERIES.Characters.GetAll();
    getInitialSession()
  }
} satisfies RouteDefinition;

const CharacterInfo: Component<{ character: Character }> = (props) => {
  return <>
    <span>Age:</span>
    <span>{props.character.age}</span>
  </>
}

export default function MyComponent() {
  const characters = createAsync(
    async () => QUERIES.Characters.GetAll(),
    { deferStream: true, }
  );
  const initialSession = createAsync(
    async () => getInitialSession(),
    { deferStream: true, }
  );

  const clientSession = authClient.useSession();

  const session = createMemo(() => ({
    isPending: clientSession().isPending,
    isRefetching: clientSession().isRefetching,
    isJustRefetching: clientSession().isRefetching && !clientSession().isPending,
    data: {
      user: clientSession()?.data?.user ?? initialSession()?.user,
      session: clientSession()?.data?.session ?? initialSession()?.session
    },
    error: clientSession().error
  }))

  createEffect(() => console.log({ s: session() }))
  const makePassKey = async () => {
    const data = await authClient.passkey.addPasskey();
    console.log(data)
  }
  const refresh = async () => {
    const data = await authClient.revokeSessions()
    console.log(data)
    const a = await signIn()
    console.log(a)
  }
  const signOut = async () => {
    const data = await authClient.signOut()
    console.log(data)
  }
  const signInPasskey = async () => {
    const data = await authClient.signIn.passkey();
    console.log({ data })

  }

  return (
    <Switch fallback={<><button onClick={() => signIn()} > sign in </button>
      <button onClick={async () => {
        await signInPasskey();
        //@ts-expect-error
        session().refetch();
      }}>
        sign in passkey
      </button></>
    } >
      <Match when={session().isJustRefetching}>
        <span>...loading</span>
      </Match>
      <Match when={session()?.data?.user}>
        <div class='flex gap-4'>
          <div>isPending: {`${session().isPending}`}</div>
          <div>isRefetching: {`${session().isRefetching}`}</div>
          <span>{session()?.data?.user?.name}</span>
          <img src={session()?.data?.user?.image || ""} />
          <button onClick={async () => await makePassKey()}>
            makePassKey
          </button>
          <button onClick={async () => await refresh()}>
            reset
          </button>
          <button onClick={async () => await signOut()}>
            sign out
          </button>
        </div>
        <ul>
          <For each={characters()}>
            {(character) => (
              <li >
                <Dialog>
                  <Dialog.Trigger class="dialog__trigger flex gap-4">
                    <span>
                      {character.name}
                    </span>
                    <form
                      onClick={(e) => e.stopPropagation()}
                      action={MUTATIONS.Characters.DeleteCharacterById.with(
                        character.id
                      )}
                      method='post'>
                      <button type='submit'>x</button>
                    </form>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay class="dialog__overlay" />
                    <div class="dialog__positioner">
                      <Dialog.Content class="dialog__content">
                        <div class="dialog__header">
                          <Dialog.Title class="dialog__title">{character.name}</Dialog.Title>
                          <Dialog.CloseButton class="dialog__close-button">
                            {/* <CrossIcon /> */} X
                          </Dialog.CloseButton>
                        </div>
                        <Dialog.Description class="dialog__description">
                          <CharacterInfo character={character} />
                        </Dialog.Description>
                      </Dialog.Content>
                    </div>
                  </Dialog.Portal>
                </Dialog>
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
      </Match>
    </Switch>
  );
}


