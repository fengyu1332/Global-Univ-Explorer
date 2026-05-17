import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.set('trust proxy', true);

  const usageCounters = new Map<string, { count: number, resetAt: number }>();
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const MAX_REQUESTS = 2;

  // API Route to proxy Gemini API calls
  app.post("/api/generateContent", async (req, res) => {
    try {
      const { model, contents, usageType } = req.body;
      
      if (usageType === 'student_consultation') {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const record = usageCounters.get(ip);
        
        if (record) {
          if (now > record.resetAt) {
            usageCounters.set(ip, { count: 1, resetAt: now + WINDOW_MS });
          } else if (record.count >= MAX_REQUESTS) {
            return res.status(429).json({ error: "由于资源限制，同一IP地址24小时内最多只能使用2次AI解读功能，您的额度已用尽，请明天再来吧！" });
          } else {
            record.count += 1;
          }
        } else {
          usageCounters.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY not set on server" });
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({ model, contents });
      res.json(response);
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || 'Error communicating with AI' });
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
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    const clientPath = path.join(distPath, 'client');
    // Using simple approach to check what vite outputted
    app.use(express.static(clientPath));
    app.use(express.static(distPath)); // fallback if not in client/
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) res.sendFile(path.join(clientPath, 'index.html'));
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
