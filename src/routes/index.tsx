import { createAsync, RouteDefinition } from "@solidjs/router";
import { For } from "solid-js";
import { QUERIES } from "~/db/queries";

export const route = {
  preload() {
    QUERIES.getUsers()
  }
} satisfies RouteDefinition;


export default function Home() {
  const users = createAsync(async () => 
    QUERIES.getUsers(), { deferStream: true });

  return <ul>
    <For each={users()}>
      {(user) => <li>{user.name}</li>}
      </For>
  </ul>;
}
