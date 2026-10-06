const BASE = "http://localhost:3000";

/** Builds a JSON request for a route handler. Pass a string body to send it verbatim (e.g. malformed JSON). */
export function jsonRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const post = (path: string, body?: unknown) => jsonRequest(path, "POST", body);
export const patch = (path: string, body?: unknown) => jsonRequest(path, "PATCH", body);
export const get = (path: string) => new Request(`${BASE}${path}`);

/** Second argument for dynamic route handlers, e.g. `PATCH(req, params({ id: "3" }))`. */
export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

export async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}
