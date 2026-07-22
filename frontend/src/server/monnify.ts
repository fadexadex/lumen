/**
 * Monnify helpers for TanStack Start API routes.
 * Secrets stay on the server (no VITE_ prefix).
 */

const MONNIFY_BASE_URL = () => process.env.MONNIFY_BASE_URL || "https://sandbox.monnify.com";

export function subscriptionAmount() {
  return Number(process.env.SUBSCRIPTION_AMOUNT_NGN || "2000");
}

export function subscriptionCredits() {
  return Number(process.env.SUBSCRIPTION_CREDITS || "100");
}

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

async function getMonnifyToken() {
  const apiKey = process.env.MONNIFY_API_KEY;
  const secret = process.env.MONNIFY_SECRET_KEY;
  if (!apiKey || !secret) {
    throw new Error("Monnify keys missing from env (MONNIFY_API_KEY / MONNIFY_SECRET_KEY)");
  }
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) return cachedToken;

  const basic = Buffer.from(`${apiKey}:${secret}`).toString("base64");
  const res = await fetch(`${MONNIFY_BASE_URL()}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json()) as {
    requestSuccessful?: boolean;
    responseMessage?: string;
    responseBody?: { accessToken?: string; expiresIn?: number };
  };
  if (!data.requestSuccessful || !data.responseBody?.accessToken) {
    throw new Error(data.responseMessage || "Monnify login failed");
  }
  cachedToken = data.responseBody.accessToken;
  const expiresIn = Number(data.responseBody.expiresIn ?? 3600);
  cachedTokenExpiresAt = now + expiresIn * 1000;
  return cachedToken;
}

export async function monnifyFetch(path: string, opts: { method?: string; body?: unknown } = {}) {
  const token = await getMonnifyToken();
  const res = await fetch(`${MONNIFY_BASE_URL()}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json() as Promise<{
    requestSuccessful?: boolean;
    responseMessage?: string;
    responseBody?: Record<string, unknown>;
  }>;
}

export function makePaymentReference() {
  return `lumen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function monnifyConfigured() {
  return Boolean(
    process.env.MONNIFY_API_KEY &&
      process.env.MONNIFY_SECRET_KEY &&
      process.env.MONNIFY_CONTRACT_CODE,
  );
}
