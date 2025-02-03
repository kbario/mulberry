import { createAsync, RouteDefinition } from '@solidjs/router';
import { For } from 'solid-js';
import { MUTATIONS } from '~/db/mutations';
import { QUERIES } from '~/db/queries';

export const route = {
  preload: () => QUERIES.Characters.GetAll(),
} satisfies RouteDefinition;

export default function Home() {
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
