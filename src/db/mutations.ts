import { action, json } from '@solidjs/router';
import { eq } from 'drizzle-orm';
import { objectifyFormData } from '~/helpers/formdata';
import { Character } from '~/types/characters';
import { db } from './db';
import { QUERIES } from './queries';
import { characters } from './schema/characters';

export const MUTATIONS = {
  Characters: {
    AddCharacter: action(async (data: FormData) => {
      'use server';
      try {
        console.group('Adding Character');
        console.log(
          `trying to add character with form data: ${objectifyFormData(data)}`
        );
        const name = String(data.get('name'));
        const age = Number(data.get('age'));
        const character = {
          name,
          age,
        } satisfies Character;
        const res = await db.insert(characters).values(character).returning();
        console.log(`successfully added user: ${JSON.stringify(res[0])}`);
        console.groupEnd();
        return json(
          { added: res[0].id },
          {
            revalidate: [QUERIES.Characters.GetAll.key],
          }
        );
      } catch (error) {
        console.warn(
          `error occur trying to add character with formdata ${objectifyFormData(data)}`
        );
        console.groupEnd();
      }
    }),
    DeleteCharacterById: action(async (id: number) => {
      'use server';
      try {
        console.group('Deleting Character');
        console.log(`trying to delete character with id: ${id}`);
        const res = await db
          .delete(characters)
          .where(eq(characters.id, id))
          .returning();
        console.log(`successfully deleted user:`, JSON.stringify(res[0]));
        console.groupEnd();
        return json(
          { deleted: res[0].id },
          {
            revalidate: [QUERIES.Characters.GetAll.key],
          }
        );
      } catch (error) {
        console.warn(`error occured trying to delete character with id ${id}`);
        console.groupEnd();
      }
    }),
  },
};
