const DEFAULT_ENGINE_HASH_SEED = 0x12345678;

function u32(value) {
  return value >>> 0;
}

function engineHashBytes(bytes, seed = DEFAULT_ENGINE_HASH_SEED) {
  let a = 0x9e3779b9 >>> 0;
  let b = 0x9e3779b9 >>> 0;
  let c = seed >>> 0;
  let offset = 0;
  let remaining = bytes.length;

  function mix() {
    a = u32((a - u32(b + c)) ^ (c >>> 13));
    b = u32((b - u32(c + a)) ^ u32(a << 8));
    c = u32((c - u32(a + b)) ^ (b >>> 13));
    a = u32((a - u32(b + c)) ^ (c >>> 12));
    b = u32((b - u32(c + a)) ^ u32(a << 16));
    c = u32((c - u32(a + b)) ^ (b >>> 5));
    a = u32((a - u32(b + c)) ^ (c >>> 3));
    b = u32((b - u32(c + a)) ^ u32(a << 10));
    c = u32((c - u32(a + b)) ^ (b >>> 15));
  }

  function readUint32(index) {
    return u32(bytes[index] | (bytes[index + 1] << 8) | (bytes[index + 2] << 16) | (bytes[index + 3] << 24));
  }

  while (remaining >= 12) {
    a = u32(a + readUint32(offset));
    b = u32(b + readUint32(offset + 4));
    c = u32(c + readUint32(offset + 8));
    mix();
    offset += 12;
    remaining -= 12;
  }

  c = u32(c + bytes.length);
  if (remaining >= 11) c = u32(c + bytes[offset + 10] * 0x1000000);
  if (remaining >= 10) c = u32(c + bytes[offset + 9] * 0x10000);
  if (remaining >= 9) c = u32(c + bytes[offset + 8] * 0x100);
  if (remaining >= 8) b = u32(b + bytes[offset + 7] * 0x1000000);
  if (remaining >= 7) b = u32(b + bytes[offset + 6] * 0x10000);
  if (remaining >= 6) b = u32(b + bytes[offset + 5] * 0x100);
  if (remaining >= 5) b = u32(b + bytes[offset + 4]);
  if (remaining >= 4) a = u32(a + bytes[offset + 3] * 0x1000000);
  if (remaining >= 3) a = u32(a + bytes[offset + 2] * 0x10000);
  if (remaining >= 2) a = u32(a + bytes[offset + 1] * 0x100);
  if (remaining >= 1) a = u32(a + bytes[offset]);
  mix();

  return c >>> 0;
}

function engineHashString(value, seed = DEFAULT_ENGINE_HASH_SEED) {
  return engineHashBytes(Buffer.from(String(value), "utf8"), seed);
}

function engineHashHex(value, seed = DEFAULT_ENGINE_HASH_SEED) {
  return engineHashString(value, seed).toString(16).padStart(8, "0").toUpperCase();
}

module.exports = {
  DEFAULT_ENGINE_HASH_SEED,
  engineHashBytes,
  engineHashHex,
  engineHashString,
};
