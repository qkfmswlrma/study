// 로컬에서 확인용 서버. 어떤 주소로 들어와도 index.html 을 준다 (_redirects 와 같은 동작).
//   node serve.js 8788
const http = require("http");
const fs = require("fs");
const path = require("path");
const port = Number(process.argv[2]) || 8788;
const root = __dirname;
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json", ".js": "text/javascript" };

http.createServer((req, res) => {
  const p = decodeURIComponent(String(req.url).split("?")[0]);
  const file = path.join(root, p);
  if (p !== "/" && !p.startsWith("/_") && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  fs.createReadStream(path.join(root, "index.html")).pipe(res);
}).listen(port, () => console.log("http://localhost:" + port));
