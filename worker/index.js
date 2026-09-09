// Sync server (U9, KTD1, KTD12). One Worker serves the built app from dist/
// and runs each board as a Durable Object backed by y-partyserver's YServer.
//
// DO NOT CHANGE WITHOUT A MIGRATION (the board's storage is keyed by these):
//   - the exported class name `Board`   (wrangler.toml: class_name = "Board")
//   - the binding name `main`           (wrangler.toml: name = "main"; the
//                                        client's YProvider default party)
//   - the room mapping: the `room` query parameter (default `gym`) is the
//     Durable Object name, so the URL /parties/main/<room> -> idFromName(room)
//   - the migration tag `v1` (new_sqlite_classes = ["Board"])
// Renaming the class needs a `renamed_classes` migration in wrangler.toml;
// changing the binding or the room mapping silently orphans every board.
//
// Persistence: the encoded Yjs document is stored as rows of a `doc_chunks`
// SQLite table (seq INTEGER PRIMARY KEY, chunk BLOB), each row under 1 MB,
// because a single Durable Object key plus value cannot exceed 2 MB. A failed
// save is written to meta.lastSaveError in the document so the toolbar can
// show it instead of it being only a log line.
import * as Y from "yjs";
import { YServer } from "y-partyserver";
import { routePartykitRequest } from "partyserver";
import { joinChunks, splitChunks } from "./chunks.js";

const CREATE_TABLE =
  "CREATE TABLE IF NOT EXISTS doc_chunks (seq INTEGER PRIMARY KEY, chunk BLOB NOT NULL)";
const LAST_SAVE_ERROR = "lastSaveError";
const SERVER_ORIGIN = "board-server";

/** SQLite BLOB bindings want an ArrayBuffer that spans exactly the bytes. */
function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export class Board extends YServer {
  // Hibernate between messages so an idle room costs nothing on the free plan.
  // A hibernated object restarts from scratch, which is why onLoad rebuilds the
  // document from SQLite every time.
  static options = { hibernate: true };

  // y-partyserver option names (dist/server/index.js CALLBACK_DEFAULTS):
  // debounceWait and debounceMaxWait drive the lodash debounce around onSave;
  // timeout is declared by the library for completeness.
  static callbackOptions = {
    debounceWait: 1000,
    debounceMaxWait: 5000,
    timeout: 10000,
  };

  async onLoad() {
    const sql = this.ctx.storage.sql;
    sql.exec(CREATE_TABLE);
    const chunks = [];
    for (const row of sql.exec("SELECT seq, chunk FROM doc_chunks ORDER BY seq ASC")) {
      chunks.push(new Uint8Array(row.chunk));
    }
    if (chunks.length === 0) return;
    const bytes = joinChunks(chunks);
    if (bytes.length > 0) Y.applyUpdate(this.document, bytes, SERVER_ORIGIN);
    // Return nothing: YServer treats a returned value as a source Y.Doc.
  }

  async onSave() {
    const meta = this.document.getMap("meta");
    try {
      const bytes = Y.encodeStateAsUpdate(this.document);
      const chunks = splitChunks(bytes);
      const sql = this.ctx.storage.sql;
      this.ctx.storage.transactionSync(() => {
        sql.exec(CREATE_TABLE);
        sql.exec("DELETE FROM doc_chunks");
        for (let seq = 0; seq < chunks.length; seq += 1) {
          sql.exec("INSERT INTO doc_chunks (seq, chunk) VALUES (?, ?)", seq, toArrayBuffer(chunks[seq]));
        }
      });
      if (meta.has(LAST_SAVE_ERROR)) {
        this.document.transact(() => meta.delete(LAST_SAVE_ERROR), SERVER_ORIGIN);
      }
    } catch (err) {
      console.error(`Board ${this.name}: save failed`, err);
      const message = String(err?.message ?? err);
      // Only write when the text changes: every document update re-arms the
      // debounced onSave, so rewriting the same value would loop forever.
      if (meta.get(LAST_SAVE_ERROR) !== message) {
        this.document.transact(() => meta.set(LAST_SAVE_ERROR, message), SERVER_ORIGIN);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    return (await routePartykitRequest(request, env)) ?? env.ASSETS.fetch(request);
  },
};
