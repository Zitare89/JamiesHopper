const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const port = Number(process.argv[2]) || 8000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const full = path.join(rootDir, rel);
  if (!full.startsWith(rootDir)) {
    return null;
  }
  return full;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url || "/");
  if (!filePath) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, () => {
  // Log so the bat file shows a clear "server started" message.
  console.log(`Server running at http://localhost:${port}`);
});
