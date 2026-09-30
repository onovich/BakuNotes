import { hmac } from '@noble/hashes/hmac.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytesAsync,
} from 'expo-crypto';
import type { Dream } from './dreams';

const N = 1 << 16; // 64 MiB of scrypt memory with r=8.
const R = 8;
const P = 1;
const VAULT_AAD = utf8ToBytes('mengjian:vault:v1');

export type VaultEnvelope = {
  version: 1;
  kdf: 'scrypt';
  n: number;
  r: number;
  p: number;
  saltHex: string;
  wrappedKey: string;
};

export type EncryptedDream = { id: string; payload: string };

async function passwordKey(passphrase: string, salt: Uint8Array): Promise<AESEncryptionKey> {
  const bytes = await scryptAsync(utf8ToBytes(passphrase), salt, {
    N, r: R, p: P, dkLen: 32, maxmem: 128 * R * (N + P + 1),
  });
  try { return await AESEncryptionKey.import(bytes); }
  finally { bytes.fill(0); }
}

export async function createVault(passphrase: string): Promise<{ envelope: VaultEnvelope; key: AESEncryptionKey }> {
  if (passphrase.length < 16) throw new Error('加密口令至少需要 16 个字符');
  const salt = await getRandomBytesAsync(16);
  const key = await AESEncryptionKey.generate(256);
  const wrappingKey = await passwordKey(passphrase, salt);
  const wrapped = await aesEncryptAsync(await key.bytes(), wrappingKey, { additionalData: VAULT_AAD });
  return {
    envelope: { version: 1, kdf: 'scrypt', n: N, r: R, p: P, saltHex: bytesToHex(salt), wrappedKey: await wrapped.combined('base64') as string },
    key,
  };
}

export async function openVault(passphrase: string, envelope: VaultEnvelope): Promise<AESEncryptionKey> {
  if (envelope.version !== 1 || envelope.kdf !== 'scrypt' || envelope.n !== N || envelope.r !== R || envelope.p !== P ||
      !/^[0-9a-f]{32}$/.test(envelope.saltHex) || !envelope.wrappedKey) {
    throw new Error('不支持的加密档案格式');
  }
  const wrappingKey = await passwordKey(passphrase, hexToBytes(envelope.saltHex));
  try {
    const keyBytes = await aesDecryptAsync(AESSealedData.fromCombined(envelope.wrappedKey), wrappingKey, { additionalData: VAULT_AAD });
    if (keyBytes.length !== 32) throw new Error('加密档案密钥长度不正确');
    try { return await AESEncryptionKey.import(keyBytes); }
    finally { keyBytes.fill(0); }
  } catch {
    throw new Error('口令不正确，或加密档案已损坏');
  }
}

export async function cloudIdForDream(dreamId: string, key: AESEncryptionKey): Promise<string> {
  const raw = await key.bytes();
  try { return bytesToHex(hmac(sha256, raw, utf8ToBytes(`mengjian:dream-id:v1:${dreamId}`))); }
  finally { raw.fill(0); }
}

function dreamAad(cloudId: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(cloudId)) throw new Error('加密记录标识不正确');
  return utf8ToBytes(`mengjian:dream:v1:${cloudId}`);
}

export async function encryptDream(dream: Dream, key: AESEncryptionKey): Promise<EncryptedDream> {
  const id = await cloudIdForDream(dream.id, key);
  const sealed = await aesEncryptAsync(utf8ToBytes(JSON.stringify(dream)), key, { additionalData: dreamAad(id) });
  return { id, payload: await sealed.combined('base64') as string };
}

export async function decryptDream(record: EncryptedDream, key: AESEncryptionKey): Promise<Dream> {
  const bytes = await aesDecryptAsync(AESSealedData.fromCombined(record.payload), key, { additionalData: dreamAad(record.id) });
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object') throw new Error('解密后的记录格式不正确');
  const dream = value as Partial<Dream>;
  if (typeof dream.id !== 'string' || typeof dream.title !== 'string' || typeof dream.body !== 'string' ||
      typeof dream.dreamDate !== 'string' || typeof dream.createdAt !== 'string' || typeof dream.updatedAt !== 'string' ||
      !Array.isArray(dream.tags) || !dream.tags.every((tag) => typeof tag === 'string')) {
    throw new Error('解密后的记录格式不正确');
  }
  if (await cloudIdForDream(dream.id, key) !== record.id) throw new Error('加密记录标识不匹配');
  return dream as Dream;
}
