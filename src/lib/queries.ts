import { query } from "@solidjs/router";
import { getRequestEvent } from "solid-js/web";
import { auth } from "./auth";

export const AUTH_QUERIES = {
  getInitialSession: query(async () => {
    "use server";
    return await auth.api.getSession({
      headers: getRequestEvent()?.request.headers!,
    });
  }, "get-initial-session"),
};
