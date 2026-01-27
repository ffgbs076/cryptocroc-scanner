import path from "path";
import Database from "better-sqlite3";

const dbPath = path.join(process.cwd(), "cryptocroc.db");

let db: any;

if (!db) {
  db = new Database(dbPath);
}

export default db;
