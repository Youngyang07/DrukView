import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { ROOT } from './lib.mjs';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json', '.svg': 'image/svg+xml' };
export function serve(root = ROOT, port = Number(process.env.PORT) || 8080) {
  const s = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(root, p));
    if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
    let body;
    try { body = await readFile(f); } catch { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }).end(body);
  });
  return new Promise(r => s.listen(port, () => r(s)));
}
if (process.argv[1].endsWith('serve.mjs')) serve().then(() => console.log('http://localhost:' + (process.env.PORT || 8080)));
