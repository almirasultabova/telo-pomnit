import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("body_diary.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT DEFAULT CURRENT_TIMESTAMP,
    zone_id TEXT NOT NULL,
    sensation_id TEXT NOT NULL,
    note TEXT,
    view TEXT NOT NULL, -- 'front' or 'back'
    depth TEXT DEFAULT 'surface' -- 'surface' or 'deep'
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/entries", (req, res) => {
    const { zone_id, sensation_id, note, view, depth } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO entries (zone_id, sensation_id, note, view, depth) VALUES (?, ?, ?, ?, ?)");
      const info = stmt.run(zone_id, sensation_id, note, view, depth || 'surface');
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to save entry" });
    }
  });

  app.get("/api/entries", (req, res) => {
    try {
      const entries = db.prepare("SELECT * FROM entries ORDER BY date DESC").all();
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch entries" });
    }
  });

  app.get("/api/stats/heatmap", (req, res) => {
    try {
      const stats = db.prepare("SELECT zone_id, COUNT(*) as count FROM entries GROUP BY zone_id").all();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/stats/summary", (req, res) => {
    try {
      const total = db.prepare("SELECT COUNT(*) as count FROM entries").get() as any;
      const topZone = db.prepare("SELECT zone_id, COUNT(*) as count FROM entries GROUP BY zone_id ORDER BY count DESC LIMIT 1").get() as any;
      const topSensation = db.prepare("SELECT sensation_id, COUNT(*) as count FROM entries GROUP BY sensation_id ORDER BY count DESC LIMIT 1").get() as any;
      res.json({
        total: total.count,
        topZone: topZone?.zone_id || "Нет данных",
        topSensation: topSensation?.sensation_id || "Нет данных"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
