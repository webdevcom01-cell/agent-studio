import { AsyncLocalStorage } from "async_hooks";

const orgContext = new AsyncLocalStorage<string | null>();

export function runWithOrgId<T>(orgId: string | null, fn: () => Promise<T>): Promise<T> {
  return orgContext.run(orgId, fn);
}

export function getCurrentOrgId(): string | null {
  const store = orgContext.getStore();
  return store === undefined ? null : store;
}
