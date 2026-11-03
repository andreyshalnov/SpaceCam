export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBase(path?: string | null): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:|mailto:|#)/i.test(path)) return path;
  if (!BASE_PATH) return path;
  return path.startsWith("/") ? `${BASE_PATH}${path}` : `${BASE_PATH}/${path}`;
}
