import { db } from "~/db/db";

export type Character = NonNullable<
  Awaited<ReturnType<typeof db.query.characters.findFirst>>
>;
