import { describe, it, expect } from "vitest";
import { splitChunks, joinChunks, MAX_CHUNK_BYTES } from "../worker/chunks.js";

function randomBytes(n) {
  const out = new Uint8Array(n);
  // crypto.getRandomValues caps at 64 KiB per call.
  for (let i = 0; i < n; i += 65536) {
    crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  }
  return out;
}

describe("worker/chunks", () => {
  it("keeps every chunk at or under MAX_CHUNK_BYTES (under the 1 MB DO value limit)", () => {
    expect(MAX_CHUNK_BYTES).toBe(900 * 1024);
    expect(MAX_CHUNK_BYTES).toBeLessThan(1024 * 1024);
  });

  it("splits a 2.5 MB buffer into bounded chunks and joins it back byte for byte", () => {
    const bytes = randomBytes(Math.floor(2.5 * 1024 * 1024));
    const chunks = splitChunks(bytes);
    expect(chunks.length).toBe(Math.ceil(bytes.length / MAX_CHUNK_BYTES));
    for (const c of chunks) {
      expect(c).toBeInstanceOf(Uint8Array);
      expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
      expect(c.length).toBeGreaterThan(0);
    }
    const joined = joinChunks(chunks);
    expect(joined).toBeInstanceOf(Uint8Array);
    expect(joined.length).toBe(bytes.length);
    expect(Buffer.from(joined).equals(Buffer.from(bytes))).toBe(true);
  });

  it("yields zero chunks for an empty buffer and joins them to an empty array", () => {
    expect(splitChunks(new Uint8Array(0))).toEqual([]);
    const joined = joinChunks([]);
    expect(joined).toBeInstanceOf(Uint8Array);
    expect(joined.length).toBe(0);
  });

  it("yields exactly one chunk for a buffer of exactly MAX_CHUNK_BYTES", () => {
    const bytes = randomBytes(MAX_CHUNK_BYTES);
    const chunks = splitChunks(bytes);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(MAX_CHUNK_BYTES);
    expect(Buffer.from(joinChunks(chunks)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("honours a custom maxBytes and one-past-the-limit spills into a second chunk", () => {
    const bytes = randomBytes(11);
    const chunks = splitChunks(bytes, 10);
    expect(chunks.map((c) => c.length)).toEqual([10, 1]);
    expect(Buffer.from(joinChunks(chunks)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("does not alias the source buffer (chunks survive the source being zeroed)", () => {
    const bytes = randomBytes(30);
    const copy = new Uint8Array(bytes);
    const chunks = splitChunks(bytes, 10);
    bytes.fill(0);
    expect(Buffer.from(joinChunks(chunks)).equals(Buffer.from(copy))).toBe(true);
  });
});
