import { createAsync, query, revalidate, RouteDefinition, useAction, useSubmissions } from '@solidjs/router';
import { For, Match, Switch, type Component, useContext, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { MUTATIONS } from '~/db/mutations';
import { QUERIES } from '~/db/queries';
import { Dialog } from "@kobalte/core/dialog";
import { Character } from '~/types/characters';
import { authClient, signIn } from '~/lib/auth-client';
import { auth } from '~/lib/auth';
import { getRequestEvent } from 'solid-js/web';
import { SessionContext } from '~/lib/auth-context';
import { AUTH_QUERIES } from '~/lib/queries';
import { createStore } from 'solid-js/store';
import { UploadButton, UploadDropzone, createUploadThing } from '~/lib/uploadthing';
import { Image } from "@kobalte/core/image";
import { HiOutlineXMark } from 'solid-icons/hi'

export const route = {
  preload: () => {
    QUERIES.Characters.GetAll();
  }
} satisfies RouteDefinition;

const CharacterInfo: Component<{ character: Character }> = (props) => {
  return <>
    <span>Age:</span>
    <span>{props.character.age}</span>
    <Show when={props.character.attributes.length}>
      <div>Attributes:</div>
      <ul class='flex flex-col gap-1'>
        <For each={props.character.attributes}>
          {attr => <li class='flex gap-1'>
            <span>{attr.label}:</span>
            <span class='font-bold'>{attr.value}</span>
          </li>
          }
        </For>
      </ul>
    </Show>
  </>
}
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
const signInPasskey = async () => {
  const data = await authClient.signIn.passkey();
  console.log({ data })
}

export default function MyComponent() {

  const { startUpload } = createUploadThing("imageUploader", {
    /**
     * @see https://docs.uploadthing.com/api-reference/react#useuploadthing
     */
    onUploadBegin: (fileName) => {
      console.log("onUploadBegin", fileName);
    },
    onClientUploadComplete: (res) => {
      console.log(`onClientUploadComplete`, res);
      alert("Upload Completed");
    },
  });

  const characters = createAsync(
    async () => QUERIES.Characters.GetAll(),
    { deferStream: true, }
  );
  const session = useContext(SessionContext)
  const addCharacterAction = useAction(MUTATIONS.Characters.AddCharacter);
  const addCharacterSubmissions = useSubmissions(MUTATIONS.Characters.AddCharacter);


  const deleteCharacterAction = useAction(MUTATIONS.Characters.DeleteCharacterById);
  const deleteCharacterSubmissions = useSubmissions(MUTATIONS.Characters.DeleteCharacterById);

  const deleteMap = createMemo(() => new Map(deleteCharacterSubmissions.entries().map(d => [
    d[1].input[0],
    d[1].pending
  ])))

  const [attributesS, setAttributes] = createStore<string[]>([]);
  createEffect(() => console.log({ characters: characters() }))

  return (
    <Switch fallback={
      <>
        <button onClick={() => signIn()}>
          sign in
        </button>
        <button onClick={async () => {
          await signInPasskey();
        }}>
          sign in passkey
        </button>
      </>
    }>
      <Match when={session().isJustRefetching}>
        <span>...loading</span>
      </Match>
      <Match when={session().data?.user}>
        <ul>
          <For each={characters()}>
            {(character) => (
              <li class='flex gap-2 items-center'>
                <CharacterItem character={character} />
              </li>
            )}
          </For>

          <For each={Array.from(addCharacterSubmissions.entries())}>
            {([, data]) => {
              const character = data.input[0].entries().reduce((a, [k, v]) => ({ ...a, [k]: v }), {} as Character)

              return <Show when={data.pending}>
                <li class='flex gap-2 items-center'>
                  <div class="dialog__trigger flex gap-4">
                    <span>
                      {character?.name}
                    </span>
                  </div>
                  <svg class="mr-3 -ml-1 size-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                </li>
              </Show>
            }}
          </For>
        </ul>

        <form
          action={MUTATIONS.Characters.AddCharacter}
          class='flex flex-col gap-2 items-start'
          method='post'
        >
          <label>
            Name:
            <input
              name='name'
              type='text'
            />
          </label>
          <label>
            Age:
            <input
              name='age'
              type='number'
            />
          </label>
          <fieldset>
            <For each={attributesS}>
              {
                (a, i) => <div class="flex gap-2">
                  <input
                    name={'ignore.' + i()}
                    type='text'
                    value={a}
                    onChange={(e) => setAttributes(i(), e.target.value)}
                  />
                  <span>:</span>
                  <input
                    name={`attr.${a}`}
                    type='number'
                  />
                </div>
              }
            </For>
          </fieldset>
          <button class='bg-slate-200 px-4 py-1 rounded' type='button' onClick={e => {
            e.stopPropagation()
            setAttributes(attributesS.length, '')
          }}> add attribute </button>
          <button class='bg-slate-200 px-4 py-1 rounded' type='submit'>Submit</button>
        </form>


      </Match>
    </Switch>
  );
}

const CharacterItem = (props: { character: Character }) => {
  const updateCharacterImage = useAction(MUTATIONS.Characters.UpdateImage);
  return <Dialog>
    <Dialog.Trigger class=" flex gap-4">
      <span>
        {props.character?.name}
      </span>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-50 bg-slate-950/20 " />
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <Dialog.Content class="bg-slate-50 z-50 rounded-sm shadow-md flex flex-col w-2xl">
          <Show when={props.character.image}>
            <Image fallbackDelay={600} class="w-56 h-48 inline-flex items-center justify-center overflow-hidden rounded-t-sm">
              <Image.Img
                class="image__img bg-cover w-full"
                src={props.character.image || ''}
                alt={props.character.name}
              />
              {/*<Image.Fallback class="image__fallback">{character.name.split(' ').map(x => x.charAt(0)).join().toUpperCase()}</Image.Fallback>*/}
            </Image>
          </Show>
          <div class="flex flex-col p-4 gap-4 items-center w-full">
            <div class="flex justify-between items-center w-full">
              <Dialog.Title class="dialog__title flex gap-2">
                {props.character.name}
              </Dialog.Title>
              <Dialog.CloseButton class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200">
                <HiOutlineXMark size={20} />
              </Dialog.CloseButton>
            </div>
            <Dialog.Description class="flex w-full flex-col gap-4">
              <CharacterInfo character={props.character} />

              <UploadButton
                /**
                 * @see https://docs.uploadthing.com/api-reference/react#uploadbutton
                 */
                endpoint="imageUploader"
                onUploadBegin={(fileName) => {
                  console.log("onUploadBegin", fileName);
                }}
                onUploadAborted={() => {
                  alert("Upload Aborted");
                }}
                onClientUploadComplete={async (res) => {
                  console.log(`onClientUploadComplete`, res[0].ufsUrl);
                  await updateCharacterImage(props.character.id, res[0].ufsUrl);
                  alert("Upload Completed");
                }}
              />
            </Dialog.Description>
          </div>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog >
}


// <div class="flex flex-col gap-4 p-8">
// <UploadButton
//   /**
//    * @see https://docs.uploadthing.com/api-reference/react#uploadbutton
//    */
//   endpoint="imageUploader"
//   onUploadBegin={(fileName) => {
//     console.log("onUploadBegin", fileName);
//   }}
//   onUploadAborted={() => {
//     alert("Upload Aborted");
//   }}
//   onClientUploadComplete={(res) => {
//     console.log(`onClientUploadComplete`, res);
//     alert("Upload Completed");
//   }}
// />
//   <UploadDropzone
//     /**
//      * @see https://docs.uploadthing.com/api-reference/react#uploaddropzone
//      */
//     endpoint={(routeRegistry) => routeRegistry.imageUploader}
//     onUploadBegin={(fileName) => {
//       console.log("onUploadBegin", fileName);
//     }}
//     onUploadAborted={() => {
//       alert("Upload Aborted");
//     }}
//     onClientUploadComplete={(res) => {
//       console.log(`onClientUploadComplete`, res);
//       alert("Upload Completed");
//     }}
//   />
//   <input
//     type="file"
//     onChange={async (e) => {
//       const file = e.target.files?.[0];
//       console.log({ file })
//       if (!file) return;
//
//       // Do something with files
//
//       // Then start the upload
//       await startUpload([file]);
//     }}
//   />
        // </div>
