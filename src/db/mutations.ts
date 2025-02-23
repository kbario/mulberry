import { action, json } from "@solidjs/router";
import { eq } from "drizzle-orm";
import { objectifyFormData } from "~/helpers/formdata";
import { Character } from "~/types/characters";
import { db } from "./db";
import { QUERIES } from "./queries";
import { attributes, characters } from "./schema/characters";

type a = { [k: string]: a | string };

export const MUTATIONS = {
  Characters: {
    AddCharacter: action(async (data: FormData) => {
      "use server";
      try {
        console.group("Adding Character");
        console.log(
          `trying to add character with form data: ${objectifyFormData(data)}`,
        );
        const character: any = data
          .entries()
          .filter(([x]) => !x.includes("ignore"))
          .reduce((acc, [k, value]) => {
            const keys: string[] = k.split(".");
            //@ts-expect-error
            keys.reduce((obj, key, i, arr) => {
              if (i === arr.length - 1) {
                obj[key] = value as string;
              } else {
                obj[key] = obj[key] || {};
              }
              return obj[key];
            }, acc);
            return acc;
          }, {} as a);
        const attrs = character.attr;
        delete character.attr;
        console.log({ attrs: character.attr, character });
        const res = await db.insert(characters).values(character).returning();
        const attrRes = await db
          .insert(attributes)
          .values(
            Object.entries(attrs).map(([label, value]) => ({
              label,
              value: Number(value),
              characterId: res[0].id,
            })),
          )
          .returning();
        console.log(
          `successfully added user: ${JSON.stringify(res[0])} and attrs:${JSON.stringify(attrRes)}`,
        );
        console.groupEnd();
        return json(
          { added: res[0].id },
          {
            revalidate: [QUERIES.Characters.GetAll.key],
          },
        );
      } catch (error) {
        console.warn(
          `error occur trying to add character with formdata ${objectifyFormData(data)}`,
        );
        console.groupEnd();
      }
    }),
    DeleteCharacterById: action(async (id: number) => {
      "use server";
      try {
        console.group("Deleting Character");
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
          },
        );
      } catch (error) {
        console.warn(`error occured trying to delete character with id ${id}`);
        console.groupEnd();
      }
    }),
    UpdateImage: action(async (id: number, imageUrl: string) => {
      "use server";
      try {
        console.group("Updating Character Image");
        console.log(
          `trying to update character with id: ${id} and image: ${imageUrl}`,
        );
        const res = await db
          .update(characters)
          .set({ image: imageUrl })
          .where(eq(characters.id, id))
          .returning();
        console.log(`successfully added image:`, JSON.stringify(res[0]));
        console.groupEnd();
        return json(
          { updated: res[0].id },
          {
            revalidate: [QUERIES.Characters.GetAll.key],
          },
        );
      } catch (error) {
        console.warn(
          `error occured trying to update character image with id: ${id} and url: ${imageUrl}`,
        );
        console.groupEnd();
      }
    }),
  },
};
