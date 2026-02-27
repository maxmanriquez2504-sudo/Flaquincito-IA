import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("flaquincito.db");
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    subscription_status TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  -- Add subscription_status if it doesn't exist (for existing DBs)
  PRAGMA foreign_keys=off;
  BEGIN TRANSACTION;
  CREATE TABLE IF NOT EXISTS users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    subscription_status TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO users_new (id, email, created_at) SELECT id, email, created_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;
  COMMIT;
  PRAGMA foreign_keys=on;

  CREATE TABLE IF NOT EXISTS thumbnails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    transcript TEXT,
    image_prompt TEXT,
    image_url TEXT,
    click_advice TEXT,
    suggested_title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_email) REFERENCES users(email)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.post("/api/auth", (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    try {
      const stmt = db.prepare("INSERT OR IGNORE INTO users (email) VALUES (?)");
      stmt.run(email);
      
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    const { email, priceId, planName } = req.body;
    
    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured. Please add STRIPE_SECRET_KEY to environment variables." });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: priceId === 'basic_mxn' ? "mxn" : "usd",
              product_data: {
                name: `Flaquincito IA - ${planName}`,
              },
              unit_amount: priceId === 'basic_mxn' ? 3300 : (priceId === 'standard' ? 1900 : 4900), 
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.APP_URL || 'http://localhost:3000'}?session_id={CHECKOUT_SESSION_ID}&status=success`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}?status=cancel`,
        customer_email: email,
        metadata: {
          email: email,
          plan: priceId
        }
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Webhook for Stripe (In a real app, you'd use this to update DB)
  // For this demo, we'll simulate the update on the success page or via a simple endpoint
  app.post("/api/update-subscription", (req, res) => {
    const { email, status } = req.body;
    try {
      const stmt = db.prepare("UPDATE users SET subscription_status = ? WHERE email = ?");
      stmt.run(status, email);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/thumbnails", (req, res) => {
    const { email, transcript, imagePrompt, imageUrl, clickAdvice, suggestedTitle } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    try {
      const stmt = db.prepare(`
        INSERT INTO thumbnails (user_email, transcript, image_prompt, image_url, click_advice, suggested_title)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(email, transcript, imagePrompt, imageUrl, clickAdvice, suggestedTitle);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/thumbnails/:email", (req, res) => {
    const { email } = req.params;
    try {
      const stmt = db.prepare("SELECT * FROM thumbnails WHERE user_email = ? ORDER BY created_at DESC");
      const thumbnails = stmt.all(email);
      res.json(thumbnails);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
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
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Flaquincito Server running on http://localhost:${PORT}`);
  });
}

startServer();
