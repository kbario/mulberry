import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/db";
import { passkey } from "better-auth/plugins/passkey";
import { createContext } from "solid-js";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  plugins: [
    passkey({
      rpID: process.env.VITE_MULBERRY_URL,
      rpName: "Mulberry",
      origin: process.env.VITE_MULBERRY_URL,
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
});
