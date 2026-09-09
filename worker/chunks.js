// Pure helpers for chunked persistence (KTD12). A Durable Object SQLite value
// cannot exceed 2 MB (key plus value), so the encoded Yjs document is stored as
// rows of at most MAX_CHUNK_BYTES each and reassembled in sequence order.
// No Cloudflare APIs here so the helpers run under Vitest.

export const MAX_CHUNK_BYTES = 900 * 1024;

/**
 * Split bytes into copies of at most maxBytes each. An empty input yields no
 * chunks; an input of exactly maxBytes yields one. Chunks never alias `bytes`.
 * @param {Uint8Array} bytes
 * @param {number} [maxBytes]
 * @returns {Uint8Array[]}
 */
export function splitChunks(bytes, maxBytes = MAX_CHUNK_BYTES) {
  if (!(maxBytes > 0)) throw new RangeError(`maxBytes must be positive, got ${maxBytes}`);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += maxBytes) {
    chunks.push(bytes.slice(offset, Math.min(bytes.length, offset + maxBytes)));
  }
  return chunks;
}

/**
 * Concatenate chunks (in the given order) into one fresh Uint8Array.
 * @param {Uint8Array[]} chunks
 * @returns {Uint8Array}
 */
export function joinChunks(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
