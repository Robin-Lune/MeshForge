export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return new URL(raw).origin;
}

export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === appBaseUrl();
  } catch {
    return false;
  }
}
