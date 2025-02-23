import { createAsync, query, revalidate, RouteSectionProps } from '@solidjs/router';
import { BetterAuthError, Session, User } from 'better-auth';
import { Accessor, Component, createContext, createEffect, createMemo, For, ParentComponent, Show } from 'solid-js';
import { HiOutlineUser } from 'solid-icons/hi';
import { getRequestEvent } from 'solid-js/web';
import { auth } from '~/lib/auth';
import { authClient } from '~/lib/auth-client';
import { SessionContext, SessionInfo } from '~/lib/auth-context';
import { Image } from "@kobalte/core/image";
import { AUTH_QUERIES } from '~/lib/queries';
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { session } from '~/db/schema/auth';

const signOut = async () => {
  const data = await authClient.signOut()
  await revalidate(AUTH_QUERIES.getInitialSession.name)
}


export default function Home(props: RouteSectionProps) {
  const initialSession = createAsync(
    async () => await AUTH_QUERIES.getInitialSession(),
    { deferStream: true, }
  );

  const clientSession = authClient.useSession();

  const session = createMemo(() => ({
    isPending: clientSession().isPending,
    isRefetching: clientSession().isRefetching,
    isJustRefetching: clientSession().isRefetching && !clientSession().isPending,
    data: {
      user: clientSession().isPending ? initialSession()?.user : clientSession()?.data?.user,
      session: clientSession().isPending ? initialSession()?.session : clientSession()?.data?.session
    },
    error: clientSession().error
  }) satisfies SessionInfo)

  createEffect(() => console.log({ s: session(), clientSession: clientSession(), initialSession: initialSession() }))

  const menuItems = [{
    func: async () => await signOut(),
    label: 'Sign out',
    show: createMemo(() => !!session().data.user?.id)
  }]

  return (
    <SessionContext.Provider value={session}>
      <header class="flex justify-between h-12 items-center p-4 bg-slate-800 text-slate-50">
        Mulberry
        <Show when={session().data.user?.id} fallback={
          <Avatar />
        }>
          <DropdownMenu>
            <DropdownMenu.Trigger>
              <Avatar
                name={session().data.user?.name}
                img={session().data.user?.image}
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content>
                <For each={menuItems}>
                  {it =>
                    <Show when={it.show()}>

                      <DropdownMenu.Item>
                        <DropdownMenu.ItemLabel>
                          <button onClick={it.func}>{it.label}</button>
                        </DropdownMenu.ItemLabel>
                        <DropdownMenu.ItemDescription >
                        </DropdownMenu.ItemDescription>
                      </DropdownMenu.Item>
                    </Show>
                  }
                </For>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </Show>
      </header>
      <main>{props.children}</main>
    </SessionContext.Provider >
  )
}

const Avatar: Component<{ name?: string, img?: string | null }> = (props) => <Image fallbackDelay={!!props.name ? 600 : undefined} class="image">
  <Image.Img
    class="w-8 h-8 rounded-full"
    src={props.img || ''}
    alt={props.name}
  />
  <Image.Fallback class="image__fallback">
    <Show fallback={
      <HiOutlineUser />
    } when={props.name}>
      {props.name}
    </Show>
  </Image.Fallback>
</Image>

