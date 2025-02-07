import { createAuthClient } from "better-auth/solid";
import { passkeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.VITE_MULBERRY_URL,
  plugins: [passkeyClient()],
});

export const signIn = async () => {
  const data = await authClient.signIn.social({
    provider: "google",
  });
  console.log({ data });
};
