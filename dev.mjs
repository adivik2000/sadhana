/**
 * Local dev server. Vercel-shaped, without needing `vercel dev` or a login.
 *
 *   node dev.mjs        →  http://127.0.0.1:4321
 *
 * Serves public/ as static and routes /api/<name> to api/<name>.js, calling the
 * default export with just enough of a req/res shim to match what Vercel's Node
 * runtime hands a function. Exists so the whole app can be exercised locally
 * before anything is deployed — deploying is not a debugging tool.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

// Minimal .env loader — no dependency worth installing for six lines.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    const v = rest.join("=").trim();
    if (v) process.env[k.trim()] ??= v;
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9_-]/gi, "");
    try {
      const mod = await import(`./api/${name}.js?t=${Date.now()}`); // ?t = no cache
      req.query = Object.fromEntries(url.searchParams);
      req.body = await readBody(req);

      // Deliberately minimal — status() and send() only, matching what
      // store.js's shared json() helper actually needs. No res.json() shim:
      // that was added once to patch over a local/prod mismatch (draft.js
      // called res.json() directly, assuming Vercel provides it; it doesn't,
      // on this project's runtime — worked locally, 502'd in production).
      // Every API route now goes through store.js's json() instead, and this
      // shim is kept intentionally narrow so a regression back to res.json()
      // fails here too, not just in prod.
      res.status = (code) => ((res.statusCode = code), res);
      res.send = (payload) => res.end(payload);

      await mod.default(req, res);
    } catch (err) {
      console.error(`api/${name}:`, err);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
    return;
  }

  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    const body = await readFile(join("public", path));
    res.setHeader("content-type", TYPES[extname(path)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});

function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(raw);
      }
    });
  });
}

server.listen(4321, () =>
  console.log("Sadhana · http://127.0.0.1:4321  (ctrl-c to stop)")
);
