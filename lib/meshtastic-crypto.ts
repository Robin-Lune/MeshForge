import { createCipheriv, createDecipheriv } from "crypto";

const DEFAULT_PSK = Buffer.from([
  0xd4, 0xf1, 0xbb, 0x3a, 0x20, 0x29, 0x07, 0x59,
  0xf0, 0xbc, 0xff, 0xab, 0xcf, 0x4e, 0x69, 0x01,
]);

export function normalizeMeshtasticKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length === 16 || key.length === 32) return key;
  if (key.length === 1) {
    if (key[0] === 0) return Buffer.alloc(0);
    const psk = Buffer.from(DEFAULT_PSK);
    psk[psk.length - 1] = (psk[psk.length - 1] + key[0] - 1) & 0xff;
    return psk;
  }

  const normalized = Buffer.alloc(key.length < 16 ? 16 : 32);
  key.copy(normalized);
  return normalized;
}

export function encryptMeshtasticPayload(
  payload: Uint8Array,
  keyB64: string,
  packetId: number,
  from: number,
): Buffer {
  const key = normalizeMeshtasticKey(keyB64);
  const cipher = createCipheriv(
    cipherName(key),
    key,
    nonce(packetId, from),
  );
  return Buffer.concat([cipher.update(payload), cipher.final()]);
}

export function decryptMeshtasticPayload(
  payload: Uint8Array,
  keyB64: string,
  packetId: number,
  from: number,
): Buffer {
  const key = normalizeMeshtasticKey(keyB64);
  const decipher = createDecipheriv(
    cipherName(key),
    key,
    nonce(packetId, from),
  );
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

export function meshtasticChannelHash(
  channel: string,
  keyB64: string,
): number {
  const key = normalizeMeshtasticKey(keyB64);
  return Buffer.from(channel, "utf8").reduce(
    (hash, byte) => hash ^ byte,
    key.reduce((hash, byte) => hash ^ byte, 0),
  );
}

function cipherName(key: Buffer): "aes-128-ctr" | "aes-256-ctr" {
  return key.length === 32 ? "aes-256-ctr" : "aes-128-ctr";
}

function nonce(packetId: number, from: number): Buffer {
  const out = Buffer.alloc(16);
  out.writeUInt32LE(packetId >>> 0, 0);
  out.writeUInt32LE(from >>> 0, 8);
  return out;
}
