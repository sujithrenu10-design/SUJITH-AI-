import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import handleApi from "./src/lib/gateway.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  // Direct download for complete Android Studio project ZIP
  app.get("/api/export/android-zip", (_req, res) => {
    const zipPath = path.resolve(__dirname, "sujith-ai-android-studio-project.zip");
    if (fs.existsSync(zipPath)) {
      res.setHeader("Content-Disposition", 'attachment; filename="sujith-ai-android-studio-project.zip"');
      res.setHeader("Content-Type", "application/zip");
      return res.sendFile(zipPath);
    }
    return res.status(404).json({ error: "Android Studio project ZIP not found. Run npm run export:android-zip first." });
  });

  const isProduction = process.env.NODE_ENV === "production";

  // Prevent exposing hidden dotfiles (except .well-known and dev Vite deps cache) or internal server scripts
  app.use((req, res, next) => {
    const cleanPath = req.path || "/";
    const isDevViteCache = !isProduction && cleanPath.startsWith("/node_modules/.vite/");
    if (
      /\/\.[^/]+/.test(cleanPath) &&
      !cleanPath.startsWith("/.well-known/") &&
      !isDevViteCache
    ) {
      return res.status(404).end();
    }
    if (
      cleanPath === "/gateway.mjs" ||
      cleanPath === "/mediaEngine.mjs" ||
      cleanPath === "/builderAgent.mjs" ||
      cleanPath === "/server.ts" ||
      cleanPath === "/export-android-zip.js" ||
      cleanPath.startsWith("/tests/")
    ) {
      return res.status(404).end();
    }
    return next();
  });

  // Preserve the full /api/... path for the gateway handler
  app.use(async (req, res, next) => {
    if (!req.path.startsWith("/api")) {
      return next();
    }
    try {
      await handleApi(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal Server Error" });
      }
    }
  });

  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || "0.0.0.0";

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: PORT, allowedHosts: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`SUJITH AI full-stack server running on http://${HOST}:${PORT}`);
  });
}

startServer();
