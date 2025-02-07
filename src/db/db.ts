import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";

import * as characters from "./schema/characters";
import * as auth from "./schema/auth";

export const db = drizzle({
  connection: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
  schema: { ...auth, ...characters },
});
