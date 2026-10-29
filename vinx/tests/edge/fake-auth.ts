import { FakeClient } from "../../fakedb.ts";
export type Caller = { kind: "service" } | { kind: "user"; userId: string };
export async function authenticate(req: Request): Promise<Caller | null> {
  const h = req.headers.get("Authorization") || "";
  if (h === "Bearer service") return { kind: "service" };
  if (h === "Bearer user-A") return { kind: "user", userId: "UA" };
  if (h === "Bearer user-B") return { kind: "user", userId: "UB" };
  return null;
}
export function adminClient() { return new FakeClient() as any; }
export function hasWorkerSecret(r: Request) { return r.headers.get("x-worker-secret") === "w"; }
