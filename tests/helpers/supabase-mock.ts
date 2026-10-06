/**
 * A stand-in for the Supabase JS client used by the API routes.
 *
 * Every `from(table)` / `rpc(name, args)` returns a chainable builder that accepts any method
 * (`select`, `eq`, `order`, `single`, `maybeSingle`, ...) and records it. Awaiting the builder
 * resolves to the next result queued for that table/RPC via `onTable` / `onRpc`, or to
 * `{ data: null, error: null }` when nothing is queued.
 *
 * Tests assert on behaviour (status codes, response bodies) and on what was sent to the
 * database (`rpcCalls`, `tableCalls`) — not on the exact shape of the query chain.
 */

export type MockResult = {
  data?: unknown;
  error?: { message: string; details?: string } | null;
  count?: number | null;
};

export type ChainCall = { method: string; args: unknown[] };
export type RecordedCall = { kind: "from" | "rpc"; name: string; args?: unknown; chain: ChainCall[] };

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;

export function createSupabaseMock() {
  const calls: RecordedCall[] = [];
  const queues = new Map<string, MockResult[]>();

  const key = (kind: RecordedCall["kind"], name: string) => `${kind}:${name}`;

  function enqueue(kind: RecordedCall["kind"], name: string, results: MockResult[]) {
    const k = key(kind, name);
    queues.set(k, [...(queues.get(k) ?? []), ...results]);
  }

  function take(kind: RecordedCall["kind"], name: string) {
    const result = queues.get(key(kind, name))?.shift() ?? {};
    return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null };
  }

  function builder(call: RecordedCall): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(take(call.kind, call.name)).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            call.chain.push({ method: String(prop), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  const client = {
    from(table: string) {
      const call: RecordedCall = { kind: "from", name: table, chain: [] };
      calls.push(call);
      return builder(call);
    },
    rpc(name: string, args?: unknown) {
      const call: RecordedCall = { kind: "rpc", name, args, chain: [] };
      calls.push(call);
      return builder(call);
    },
  };

  return {
    client,
    calls,
    /** Queue results for successive `from(table)` queries, in order. */
    onTable(table: string, ...results: MockResult[]) {
      enqueue("from", table, results);
    },
    /** Queue results for successive `rpc(name)` calls, in order. */
    onRpc(name: string, ...results: MockResult[]) {
      enqueue("rpc", name, results);
    },
    rpcCalls(name: string) {
      return calls.filter((c) => c.kind === "rpc" && c.name === name).map((c) => c.args);
    },
    tableCalls(table: string) {
      return calls.filter((c) => c.kind === "from" && c.name === table);
    },
  };
}

let current = createSupabaseMock();

/** Fresh mock for this test; `getSupabaseAdmin()` returns its client until the next reset. */
export function mockSupabase(): SupabaseMock {
  current = createSupabaseMock();
  return current;
}

export function currentSupabaseClient() {
  return current.client;
}

/** Shorthand for a Postgres error as Supabase surfaces it. */
export function pgError(message: string): MockResult {
  return { error: { message } };
}
