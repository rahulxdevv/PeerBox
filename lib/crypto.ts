const encoder = new TextEncoder();

export type SecurityFingerprint = {
  emojis: string[];
  code: string;
  hex: string;
};

// Curated list of distinct, unambiguous emojis for SAS verification
const EMOJI_DICTIONARY = [
  "🛡️", "💎", "⚡", "🔑", "🚀", "🦊", "🌊", "🌸",
  "⭐", "🍀", "🎯", "🔥", "🔮", "🪐", "🦄", "🦅",
  "🌴", "👑", "🌈", "🦋", "🦁", "🐬", "☀️", "🌙",
  "❄️", "🔔", "⚓", "🛸", "🏆", "🧭", "🎸", "🍎"
];

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"],
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    [],
  );
}

/**
 * Derives a deterministic salt from both public keys to prevent static salt vulnerabilities.
 */
async function deriveDeterministicSalt(
  localJwk: JsonWebKey,
  remoteJwk: JsonWebKey,
): Promise<Uint8Array> {
  const localCoord = `${localJwk.x ?? ""}:${localJwk.y ?? ""}`;
  const remoteCoord = `${remoteJwk.x ?? ""}:${remoteJwk.y ?? ""}`;
  // Sort coordinates deterministically so both sender and receiver get the identical string
  const sorted = [localCoord, remoteCoord].sort().join("|");
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sorted));
  return new Uint8Array(hashBuffer);
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  localPublicKeyJwk: JsonWebKey,
  remotePublicKeyJwk: JsonWebKey,
  passphrase?: string,
): Promise<{ key: CryptoKey; rawSharedBits: ArrayBuffer }> {
  const remotePublicKey = await importPublicKey(remotePublicKeyJwk);

  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: remotePublicKey,
    },
    privateKey,
    256,
  );

  const deterministicSalt = await deriveDeterministicSalt(
    localPublicKeyJwk,
    remotePublicKeyJwk,
  );

  // If a passphrase/PIN is provided, combine it with ECDH shared bits
  let combinedKeyMaterial: ArrayBuffer = sharedBits;
  if (passphrase && passphrase.trim().length > 0) {
    const pinBuffer = encoder.encode(passphrase.trim());
    const combinedBytes = new Uint8Array(sharedBits.byteLength + pinBuffer.byteLength);
    combinedBytes.set(new Uint8Array(sharedBits), 0);
    combinedBytes.set(pinBuffer, sharedBits.byteLength);
    combinedKeyMaterial = await crypto.subtle.digest("SHA-256", combinedBytes);
  }

  const hkdfBaseKey = await crypto.subtle.importKey(
    "raw",
    combinedKeyMaterial,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: deterministicSalt,
      info: encoder.encode(passphrase ? "peerbox-v2-pin" : "peerbox-v2"),
    },
    hkdfBaseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );

  return { key, rawSharedBits: combinedKeyMaterial };
}

/**
 * Computes human-verifiable Short Authentication String (SAS) fingerprint
 * to protect against any Man-in-the-Middle on the signaling channel.
 */
export async function generateFingerprint(
  sharedBits: ArrayBuffer,
  localJwk: JsonWebKey,
  remoteJwk: JsonWebKey,
): Promise<SecurityFingerprint> {
  const localCoord = `${localJwk.x ?? ""}:${localJwk.y ?? ""}`;
  const remoteCoord = `${remoteJwk.x ?? ""}:${remoteJwk.y ?? ""}`;
  const sorted = [localCoord, remoteCoord].sort().join("::");

  const combined = new Uint8Array(sharedBits.byteLength + encoder.encode(sorted).byteLength);
  combined.set(new Uint8Array(sharedBits), 0);
  combined.set(encoder.encode(sorted), sharedBits.byteLength);

  const digest = await crypto.subtle.digest("SHA-256", combined);
  const bytes = new Uint8Array(digest);

  // 4 visual emojis from dictionary
  const emojis = [
    EMOJI_DICTIONARY[bytes[0] % EMOJI_DICTIONARY.length],
    EMOJI_DICTIONARY[bytes[1] % EMOJI_DICTIONARY.length],
    EMOJI_DICTIONARY[bytes[2] % EMOJI_DICTIONARY.length],
    EMOJI_DICTIONARY[bytes[3] % EMOJI_DICTIONARY.length],
  ];

  // 6-digit numeric verification code formatted as XXX-XXX
  const num1 = ((bytes[4] << 8) | bytes[5]) % 1000;
  const num2 = ((bytes[6] << 8) | bytes[7]) % 1000;
  const code = `${num1.toString().padStart(3, "0")}-${num2.toString().padStart(3, "0")}`;

  // Formatted hex fingerprint preview (first 8 bytes)
  const hex = Array.from(bytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(":");

  return { emojis, code, hex };
}

export async function encryptMessage(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return combined.buffer;
}

export async function decryptMessage(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);
  if (bytes.byteLength < 12 + 16) {
    throw new Error("Ciphertext too short or corrupted");
  }

  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);

  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext,
  );
}

/**
 * Computes full SHA-256 hash string of a File or ArrayBuffer.
 */
export async function computeSha256(data: Blob | ArrayBuffer): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
