import { createAuthClient } from "better-auth/solid";
import { passkeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.VITE_MULBERRY_URL,
  plugins: [passkeyClient()],
});

export const signIn = async () => {
  console.group("[auth]: sign in");
  const { data, error } = await authClient.signIn.social({
    provider: "google",
  });
  console.log({ data, error });
  console.groupEnd();
};
