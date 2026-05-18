// Hocuspocus collaboration server for ScoutingNote (TipTap collab).
//
// - Document name == scouting_notes.id (UUID)
// - Persists yjs state to scouting_notes.ydoc_state (bytea)
// - On every save, derives plain_text from the doc (XML stripped) for search.
//
// The Go API is the only writer of new ScoutingNote rows (POST /scouting-notes),
// so Hocuspocus assumes the row already exists when a client connects with a
// matching documentName. If not, it returns null state and the first store will
// fail loudly — that's intentional during Phase 2 to surface mis-wiring early.

import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import pg from "pg";
import * as Y from "yjs";

const PORT = parseInt(process.env.HOCUSPOCUS_PORT ?? "1234", 10);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function shutdown() {
  console.log("shutting down hocuspocus");
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function extractPlainText(state) {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const frag = doc.getXmlFragment("default");
    const xml = frag.toString();
    // Strip tags + collapse whitespace.
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch (err) {
    console.warn("plain_text extraction failed:", err);
    return "";
  }
}

const server = new Server({
  port: PORT,
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const res = await pool.query(
          "SELECT ydoc_state FROM scouting_notes WHERE id = $1",
          [documentName],
        );
        if (res.rowCount === 0) {
          console.warn(`fetch: no scouting_notes row for ${documentName}`);
          return null;
        }
        const buf = res.rows[0].ydoc_state;
        return buf ? new Uint8Array(buf) : null;
      },
      store: async ({ documentName, state }) => {
        const plain = extractPlainText(state);
        await pool.query(
          `UPDATE scouting_notes
             SET ydoc_state = $2, plain_text = $3, updated_at = now()
           WHERE id = $1`,
          [documentName, Buffer.from(state), plain],
        );
      },
    }),
  ],
});

server.listen().then(() => {
  console.log(`hocuspocus listening on :${PORT}`);
});
