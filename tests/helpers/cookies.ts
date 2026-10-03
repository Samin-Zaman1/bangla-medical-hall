/**
 * In-memory replacement for `cookies()` from next/headers (wired up in tests/setup/unit.ts).
 * Route handlers read and write it exactly as they would the real request/response cookies.
 */

type CookieOptions = { name: string; value: string; maxAge?: number; [key: string]: unknown };

const jar = new Map<string, CookieOptions>();

export const cookieStore = {
  get(name: string) {
    const cookie = jar.get(name);
    return cookie ? { name, value: cookie.value } : undefined;
  },
  getAll() {
    return [...jar.values()].map(({ name, value }) => ({ name, value }));
  },
  has(name: string) {
    return jar.has(name);
  },
  set(nameOrOptions: string | CookieOptions, value?: string, options?: Record<string, unknown>) {
    const cookie =
      typeof nameOrOptions === "string" ? { ...options, name: nameOrOptions, value: value ?? "" } : nameOrOptions;
    jar.set(cookie.name, cookie);
  },
  delete(name: string) {
    jar.delete(name);
  },
};

/** The full options object last passed to `cookies().set()` for this name, for assertions. */
export function getSetCookie(name: string): CookieOptions | undefined {
  return jar.get(name);
}

export function setCookie(name: string, value: string) {
  jar.set(name, { name, value });
}

export function clearCookies() {
  jar.clear();
}
