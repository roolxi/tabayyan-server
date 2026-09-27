const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  file = path.join(root, "package.json"),
  original = fs.readFileSync(file, "utf8");
const output = path.resolve(
  process.argv[2] || path.join(root, ".visual-preview"),
);
try {
  const pkg = JSON.parse(original);
  pkg.main = "scripts/visual-entry.tsx";
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  cp.execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/expo/bin/cli"),
      "export",
      "--platform",
      "web",
      "--output-dir",
      output,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        EXPO_OFFLINE: "1",
        EXPO_NO_DOTENV: "1",
        EXPO_PUBLIC_API_BASE_URL: "https://fixture.invalid",
      },
    },
  );
  const html = path.join(output, "index.html");
  let page = fs
    .readFileSync(html, "utf8")
    .replace('src="/_expo/', 'src="./_expo/');
  page = page.replace(
    "</head>",
    "<style>html,body{margin:0;background:#020a06}#root{width:390px;height:844px;position:relative;overflow:hidden;margin:0 auto}</style></head>",
  );
  fs.writeFileSync(html, page);
  fs.writeFileSync(
    path.join(output, "review.html"),
    `<!doctype html><html><meta charset="utf-8"><style>body{background:#09130e;color:#9eb6a8;font:13px system-ui;display:grid;place-items:center;margin:20px}iframe{border:1px solid #49614f;border-radius:38px;width:390px;height:844px;background:#061410}p{margin:12px}</style><p>Tabayyan · React Native Web UI review · fixture responses, not live verification</p><iframe src="index.html"></iframe></html>`,
  );
} finally {
  fs.writeFileSync(file, original);
}
