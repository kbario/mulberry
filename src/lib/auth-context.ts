import { User, Session, BetterAuthError } from "better-auth";
import { Accessor, createContext } from "solid-js";

export type SessionInfo = {
  isPending: boolean;
  isRefetching: boolean;
  isJustRefetching: boolean;
  data: {
    user: User | undefined;
    session: Session | undefined;
  };
  error: BetterAuthError | null;
};

export const SessionContext = createContext<Accessor<SessionInfo>>();
