import http from "node:http";
import { AccessToken } from "livekit-server-sdk";

const {
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  LIVEKIT_URL,
  PORT = 8787,
  ALLOWED_ORIGIN = "*",
  MONNIFY_API_KEY,
  MONNIFY_SECRET_KEY,
  MONNIFY_BASE_URL = "https://sandbox.monnify.com",
  MONNIFY_CONTRACT_CODE,
  MONNIFY_WALLET_ACCOUNT_NUMBER,
  SUBSCRIPTION_AMOUNT_NGN = "2000",
  SUBSCRIPTION_CREDITS = "100",
} = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error(
    "Missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET in env. Run with: node --env-file=../sparklearn-ai/.env server.mjs",
  );
  process.exit(1);
}

const SUBSCRIPTION_AMOUNT = Number(SUBSCRIPTION_AMOUNT_NGN);
const CREDITS = Number(SUBSCRIPTION_CREDITS);

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(res, status, body) {
  res.writeHead(status, { ...cors, "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getMonnifyToken() {
  if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY) {
    throw new Error("Monnify keys missing from env (MONNIFY_API_KEY / MONNIFY_SECRET_KEY)");
  }
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) return cachedToken;

  const basic = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString("base64");
  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json();
  if (!data.requestSuccessful || !data.responseBody?.accessToken) {
    throw new Error(data.responseMessage || "Monnify login failed");
  }
  cachedToken = data.responseBody.accessToken;
  const expiresIn = Number(data.responseBody.expiresIn ?? 3600);
  cachedTokenExpiresAt = now + expiresIn * 1000;
  return cachedToken;
}

async function monnifyFetch(path, { method = "GET", body } = {}) {
  const token = await getMonnifyToken();
  const res = await fetch(`${MONNIFY_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function makePaymentReference() {
  return `lumen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function handleToken(url, res) {
  const room = url.searchParams.get("room");
  const identity = url.searchParams.get("identity");
  const name = url.searchParams.get("name") ?? "Learner";
  if (!room || !identity) {
    return json(res, 400, { error: "room and identity required" });
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: "15m",
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return json(res, 200, { token, url: LIVEKIT_URL ?? null });
}

async function handlePaymentInit(req, res) {
  if (!MONNIFY_CONTRACT_CODE) {
    return json(res, 500, {
      error:
        "MONNIFY_CONTRACT_CODE is missing. Copy it from Monnify dashboard → Developers → API Keys & Contracts.",
    });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: "invalid json body" });
  }

  const customerName = String(body.customerName || "").trim();
  const customerEmail = String(body.customerEmail || "").trim();
  const redirectUrl = String(body.redirectUrl || "").trim();

  if (!customerName || !customerEmail || !redirectUrl) {
    return json(res, 400, {
      error: "customerName, customerEmail, and redirectUrl are required",
    });
  }

  const paymentReference = makePaymentReference();
  const data = await monnifyFetch("/api/v1/merchant/transactions/init-transaction", {
    method: "POST",
    body: {
      amount: SUBSCRIPTION_AMOUNT,
      customerName,
      customerEmail,
      paymentReference,
      paymentDescription: `Lumen starter pack — ${CREDITS} credits`,
      currencyCode: "NGN",
      contractCode: MONNIFY_CONTRACT_CODE,
      redirectUrl,
      paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
      metaData: {
        product: "lumen-starter",
        credits: String(CREDITS),
        walletAccountNumber: MONNIFY_WALLET_ACCOUNT_NUMBER || "",
      },
    },
  });

  if (!data.requestSuccessful || !data.responseBody?.checkoutUrl) {
    return json(res, 502, {
      error: data.responseMessage || "Failed to initialize Monnify payment",
      details: data,
    });
  }

  return json(res, 200, {
    paymentReference: data.responseBody.paymentReference,
    transactionReference: data.responseBody.transactionReference,
    checkoutUrl: data.responseBody.checkoutUrl,
    amount: SUBSCRIPTION_AMOUNT,
    credits: CREDITS,
    currencyCode: "NGN",
  });
}

async function handlePaymentVerify(url, res) {
  const paymentReference = url.searchParams.get("paymentReference");
  const transactionReference = url.searchParams.get("transactionReference");

  if (!paymentReference && !transactionReference) {
    return json(res, 400, { error: "paymentReference or transactionReference required" });
  }

  // Sandbox verify paths from Monnify docs (https://developers.monnify.com/):
  // 1) by paymentReference → GET /api/v1/merchant/transactions/query?paymentReference=
  // 2) by transactionReference → GET /api/v2/transactions/{transactionReference}
  // Try transactionReference first when both are present — SDK callbacks often include a
  // Monnify-generated paymentReference that differs from our local pending ref.
  const attempts = [];
  if (transactionReference) {
    attempts.push({
      kind: "transactionReference",
      path: `/api/v2/transactions/${encodeURIComponent(transactionReference)}`,
    });
  }
  if (paymentReference) {
    attempts.push({
      kind: "paymentReference",
      path: `/api/v1/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`,
    });
  }

  let data = null;
  let lastMessage = "Transaction not found";
  for (const attempt of attempts) {
    data = await monnifyFetch(attempt.path);
    if (data.requestSuccessful && data.responseBody) break;
    lastMessage = data.responseMessage || lastMessage;
    data = null;
  }

  // Not an app-route 404 — Monnify simply has no matching transaction yet / wrong ref.
  // Always return 200 so the browser network tab doesn't look like a broken endpoint.
  if (!data?.responseBody) {
    return json(res, 200, {
      paid: false,
      paymentStatus: "NOT_FOUND",
      amountPaid: 0,
      expectedAmount: SUBSCRIPTION_AMOUNT,
      credits: 0,
      paymentReference: paymentReference || undefined,
      transactionReference: transactionReference || undefined,
      error: lastMessage,
    });
  }

  const body = data.responseBody;
  const status = String(body.paymentStatus || "").toUpperCase();
  const amountPaid = Number(body.amountPaid ?? body.amount ?? 0);
  const paid =
    (status === "PAID" || status === "OVERPAID") && amountPaid >= SUBSCRIPTION_AMOUNT;

  return json(res, 200, {
    paid,
    paymentStatus: status,
    amountPaid,
    expectedAmount: SUBSCRIPTION_AMOUNT,
    credits: paid ? CREDITS : 0,
    paymentReference: body.paymentReference || paymentReference || undefined,
    transactionReference: body.transactionReference || transactionReference || undefined,
  });
}

async function handlePaymentConfig(res) {
  return json(res, 200, {
    amount: SUBSCRIPTION_AMOUNT,
    credits: CREDITS,
    currencyCode: "NGN",
    configured: Boolean(MONNIFY_API_KEY && MONNIFY_SECRET_KEY && MONNIFY_CONTRACT_CODE),
    // API key + contract are required by Monnify's browser Checkout SDK (public by design).
    apiKey: MONNIFY_API_KEY || null,
    contractCode: MONNIFY_CONTRACT_CODE || null,
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/token") {
      return await handleToken(url, res);
    }
    if (req.method === "GET" && url.pathname === "/payments/config") {
      return handlePaymentConfig(res);
    }
    if (req.method === "POST" && url.pathname === "/payments/init") {
      return await handlePaymentInit(req, res);
    }
    if (req.method === "GET" && url.pathname === "/payments/verify") {
      return await handlePaymentVerify(url, res);
    }
    return json(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: err instanceof Error ? err.message : "server error" });
  }
});

server.listen(PORT, () => {
  console.log(`lumen api on :${PORT}`);
  if (!MONNIFY_CONTRACT_CODE) {
    console.warn(
      "⚠ MONNIFY_CONTRACT_CODE missing — payments will fail until you add it to sparklearn-ai/.env",
    );
  }
});
