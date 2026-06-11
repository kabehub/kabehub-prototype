const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

function getKey(): Promise<CryptoKey> {
  const hex = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY が未設定または不正です");
  }

  const keyBytes = new Uint8Array(
    hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );

  return crypto.subtle.importKey("raw", keyBytes, ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);

  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);

  return Buffer.from(combined).toString("base64");
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await getKey();
  const combined = new Uint8Array(Buffer.from(ciphertext, "base64"));
  const iv = combined.slice(0, IV_LENGTH);
  const cipher = combined.slice(IV_LENGTH);
  const plain = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, cipher);

  return new TextDecoder().decode(plain);
}
