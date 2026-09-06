import type { Context } from "hono";
import type { Env, Role } from "./types";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${password}`);
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  return actual === expectedHash;
}

export interface TokenPayload {
  uid: number;
  role: Role;
  name: string;
  /** Personelin sorumlu olduğu yarışmalar. Boş/yok = tüm yarışmalar.
   *  Giriş anında token'a yazılıyor ki her istekte veritabanına sorulmasın. */
  comps?: string[];
  /** Giriş e-postası — yetki varsayılanını çözmek için. */
  email?: string;
  exp: number; // unix seconds
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = await hmacSha256Hex(secret, body);
  return `${body}.${sig}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmacSha256Hex(secret, body);
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Hono middleware factory: Authorization: Bearer <token> zorunlu kılar,
// verilirse belirli rollerle sınırlar. c.set('authUser', payload) ile devam eder.
export function requireAuth(allowedRoles?: Role[]) {
  return async (c: Context<{ Bindings: Env }>, next: () => Promise<void>) => {
    const authHeader = c.req.header("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return c.json({ error: "Giriş gerekli." }, 401);

    const payload = await verifyToken(token, c.env.AUTH_SECRET);
    if (!payload) return c.json({ error: "Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın." }, 401);

    if (allowedRoles && !allowedRoles.includes(payload.role)) {
      return c.json({ error: "Bu işlem için yetkiniz yok." }, 403);
    }

    c.set("authUser" as never, payload as never);
    await next();
  };
}
