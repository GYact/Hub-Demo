/**
 * Web Push implementation using Web Crypto API (Deno / Supabase Edge Functions compatible).
 * Implements RFC 8291 (Message Encryption for Web Push) and RFC 8292 (VAPID).
 *
 * The Node.js `web-push` library uses `crypto.createECDH()` which is NOT available
 * in Deno runtime. This module replaces it with the Web Crypto API.
 */

// ── Base64url utilities ──

function base64UrlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── VAPID (RFC 8292) ──

async function createVapidAuthHeader(
  endpoint: string,
  subject: string,
  publicKeyBytes: Uint8Array,
  privateKeyBytes: Uint8Array,
): Promise<string> {
  const audience = new URL(endpoint).origin;

  // Build JWK for the ECDSA P-256 private key
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: uint8ArrayToBase64Url(publicKeyBytes.slice(1, 33)),
    y: uint8ArrayToBase64Url(publicKeyBytes.slice(33, 65)),
    d: uint8ArrayToBase64Url(privateKeyBytes),
  };

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  // JWT header + payload
  const header = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = uint8ArrayToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject }),
    ),
  );

  const unsignedToken = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    signingKey,
    new TextEncoder().encode(unsignedToken),
  );

  const jwt = `${unsignedToken}.${uint8ArrayToBase64Url(new Uint8Array(sig))}`;
  return `vapid t=${jwt},k=${uint8ArrayToBase64Url(publicKeyBytes)}`;
}

// ── Payload Encryption (RFC 8291 aes128gcm) ──

async function encryptPayload(
  p256dhBytes: Uint8Array,
  authBytes: Uint8Array,
  payload: Uint8Array,
): Promise<Uint8Array> {
  // 1. Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  // 2. Import subscription public key
  const subPubKey = await crypto.subtle.importKey(
    "raw",
    p256dhBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // 3. ECDH shared secret
  const sharedSecretBuf = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subPubKey },
    localKeyPair.privateKey,
    256,
  );
  const sharedSecret = new Uint8Array(sharedSecretBuf);

  // 4. Export local public key (65 bytes, uncompressed)
  const localPubBuf = await crypto.subtle.exportKey(
    "raw",
    localKeyPair.publicKey,
  );
  const localPubKey = new Uint8Array(localPubBuf);

  // 5. Derive IKM via HKDF (auth secret as salt)
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info\0"),
    ...p256dhBytes,
    ...localPubKey,
  ]);
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const ikmBuf = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authBytes, info: authInfo },
    hkdfKey,
    256,
  );
  const ikm = new Uint8Array(ikmBuf);

  // 6. Generate 16-byte random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 7. Derive CEK (128 bits) and nonce (96 bits) from IKM
  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  const cekBuf = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    },
    ikmKey,
    128,
  );
  const nonceBuf = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("Content-Encoding: nonce\0"),
    },
    ikmKey,
    96,
  );

  // 8. Pad payload: data + delimiter (0x02 = last record)
  const padded = new Uint8Array(payload.length + 1);
  padded.set(payload);
  padded[payload.length] = 2;

  // 9. Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(cekBuf),
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt"],
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonceBuf) },
    aesKey,
    padded,
  );
  const ciphertext = new Uint8Array(cipherBuf);

  // 10. Build aes128gcm body: header + ciphertext
  //     header = salt(16) + rs(4, big-endian) + idlen(1) + keyid(idlen)
  const rs = 4096;
  const idlen = localPubKey.length; // 65
  const headerLen = 16 + 4 + 1 + idlen;
  const body = new Uint8Array(headerLen + ciphertext.length);
  body.set(salt, 0);
  new DataView(body.buffer).setUint32(16, rs, false);
  body[20] = idlen;
  body.set(localPubKey, 21);
  body.set(ciphertext, headerLen);

  return body;
}

// ── Public API ──

export type WebPushResult = {
  success: boolean;
  statusCode: number;
  body: string;
};

/**
 * Send a Web Push notification to a single subscription.
 */
export async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<WebPushResult> {
  const p256dhBytes = base64UrlToUint8Array(p256dh);
  const authBytes = base64UrlToUint8Array(auth);
  const vapidPubBytes = base64UrlToUint8Array(vapidPublicKey);
  const vapidPrivBytes = base64UrlToUint8Array(vapidPrivateKey);

  const authorization = await createVapidAuthHeader(
    endpoint,
    vapidSubject,
    vapidPubBytes,
    vapidPrivBytes,
  );

  const encryptedBody = await encryptPayload(
    p256dhBytes,
    authBytes,
    new TextEncoder().encode(payload),
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: authorization,
    },
    body: encryptedBody,
  });

  const responseBody = await response.text();
  return {
    success: response.status >= 200 && response.status < 300,
    statusCode: response.status,
    body: responseBody,
  };
}
