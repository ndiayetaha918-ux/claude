#!/usr/bin/env python3
"""
TAct Hand — Dépôt d'assets
Double-clique sur ce fichier (ou lance `python3 tools/upload.py`).
Une page s'ouvre : glisse tes images, choisis le dossier, c'est enregistré.
Aucune dépendance à installer — tout est en Python de base.
"""
from __future__ import annotations

import http.server
import json
import os
import re
import socketserver
import sys
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = 8787
ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

ALLOWED_FOLDERS = {
    "assets":               ASSETS,
    "assets/realisations":  ASSETS / "realisations",
    "assets/editions":      ASSETS / "editions",
    "assets/slides":        ASSETS / "slides",
}

SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")

PAGE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TAct Hand — Dépôt d'assets</title>
<style>
  :root {
    --ink:#0F1018; --paper:#F4EDDC; --line:rgba(244,237,220,.18);
    --accent:#B07848;
  }
  * { box-sizing:border-box; }
  body{
    margin:0; min-height:100vh; background:var(--ink); color:var(--paper);
    font-family:-apple-system,BlinkMacSystemFont,Inter,Helvetica,sans-serif;
    padding:40px 24px; line-height:1.5;
  }
  .wrap{ max-width:760px; margin:0 auto; }
  h1{
    font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:44px;
    margin:0 0 6px; letter-spacing:-.02em;
  }
  .sub{ opacity:.7; margin:0 0 34px; font-size:15px; }
  .row{ display:flex; gap:14px; flex-wrap:wrap; margin-bottom:22px; }
  label.field{
    flex:1 1 260px; display:flex; flex-direction:column; gap:8px;
    font-size:12px; letter-spacing:.2em; text-transform:uppercase; opacity:.7;
  }
  select,input[type=text]{
    font:inherit; padding:12px 14px; background:#1b1d27;
    border:1px solid var(--line); color:var(--paper); border-radius:10px;
    font-size:14px; letter-spacing:0; text-transform:none; opacity:1;
  }
  .drop{
    border:2px dashed rgba(244,237,220,.25); border-radius:18px;
    padding:60px 24px; text-align:center; transition:all .25s ease;
    background:rgba(255,255,255,.02); cursor:pointer;
  }
  .drop.hover{ border-color:var(--accent); background:rgba(176,120,72,.08); }
  .drop strong{ font-size:18px; display:block; margin-bottom:8px; }
  .drop span{ opacity:.6; font-size:13px; }
  .drop input{ display:none; }
  ul.list{ list-style:none; padding:0; margin:26px 0 0; }
  ul.list li{
    display:flex; align-items:center; justify-content:space-between;
    gap:12px; padding:12px 16px; border:1px solid var(--line);
    border-radius:10px; margin-bottom:8px; background:rgba(255,255,255,.03);
  }
  ul.list li .name{ font-size:14px; }
  ul.list li .meta{ font-size:12px; opacity:.6; }
  ul.list li.ok{ border-color:#3c7a52; background:rgba(60,122,82,.12); }
  ul.list li.err{ border-color:#a24141; background:rgba(162,65,65,.12); }
  ul.list li.ok::after{ content:"✓ enregistré"; font-size:12px; color:#8fd6a4; }
  ul.list li.err::after{ content:attr(data-err); font-size:12px; color:#ffb0b0; }
  .foot{ opacity:.5; font-size:12px; margin-top:30px; }
  code{ background:#1b1d27; padding:2px 6px; border-radius:4px; font-size:12px; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Dépôt d'assets</h1>
    <p class="sub">Glisse tes images ici. Elles seront enregistrées directement dans le dossier choisi du site.</p>

    <div class="row">
      <label class="field">
        Dossier de destination
        <select id="folder">
          <option value="assets">assets/ (emblèmes, logo, icône)</option>
          <option value="assets/realisations">assets/realisations/ (logotypes)</option>
          <option value="assets/editions">assets/editions/ (éditions, kakemonos)</option>
          <option value="assets/slides">assets/slides/ (slides / présentations)</option>
        </select>
      </label>
      <label class="field">
        Renommer (optionnel, sans extension)
        <input type="text" id="rename" placeholder="ex : armee-air-before" />
      </label>
    </div>

    <label class="drop" id="drop">
      <input type="file" id="file" multiple accept="image/*,.svg" />
      <strong>Glisse tes fichiers ici</strong>
      <span>ou clique pour choisir — plusieurs fichiers possibles</span>
    </label>

    <ul class="list" id="list"></ul>

    <p class="foot">Astuce : pour les emblèmes Armée de l'Air, utilise les noms <code>armee-air-before</code> et <code>armee-air-after</code> — le site les prendra automatiquement.</p>
  </div>

<script>
const drop = document.getElementById('drop');
const file = document.getElementById('file');
const list = document.getElementById('list');
const folder = document.getElementById('folder');
const rename = document.getElementById('rename');

['dragenter','dragover'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('hover'); }));
['dragleave','drop'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('hover'); }));

drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
file.addEventListener('change', e => handleFiles(e.target.files));

async function handleFiles(files){
  const arr = Array.from(files);
  for (let i = 0; i < arr.length; i++){
    const f = arr[i];
    const li = document.createElement('li');
    const target = buildName(f.name, arr.length, i);
    li.innerHTML = `<span class="name">${target}</span><span class="meta">${prettySize(f.size)}</span>`;
    list.prepend(li);
    try {
      const buf = await f.arrayBuffer();
      const url = `/upload?folder=${encodeURIComponent(folder.value)}&name=${encodeURIComponent(target)}`;
      const r = await fetch(url, { method:'POST', body: buf });
      const j = await r.json();
      if (j.ok){ li.classList.add('ok'); }
      else { li.classList.add('err'); li.setAttribute('data-err', '✕ ' + (j.error||'erreur')); }
    } catch(err){
      li.classList.add('err'); li.setAttribute('data-err', '✕ ' + err.message);
    }
  }
  file.value = '';
}

function buildName(original, total, index){
  const dot = original.lastIndexOf('.');
  const ext = dot >= 0 ? original.slice(dot) : '';
  const base = rename.value.trim();
  if (!base) return original;
  if (total === 1) return base + ext;
  return `${base}-${index+1}${ext}`;
}

function prettySize(n){
  if (n < 1024) return n + ' o';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' ko';
  return (n/1024/1024).toFixed(2) + ' Mo';
}
</script>
</body>
</html>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stdout.write("  " + (fmt % args) + "\n")

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/upload":
            self.send_error(404)
            return
        params = parse_qs(parsed.query)
        folder_key = (params.get("folder") or ["assets"])[0]
        name = (params.get("name") or [""])[0].strip()

        if folder_key not in ALLOWED_FOLDERS:
            return self._json(400, {"ok": False, "error": "dossier invalide"})
        if not name:
            return self._json(400, {"ok": False, "error": "nom manquant"})

        safe = SAFE_NAME.sub("-", name).strip("-")
        if not safe:
            return self._json(400, {"ok": False, "error": "nom invalide"})

        dest_dir = ALLOWED_FOLDERS[folder_key]
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / safe

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            return self._json(400, {"ok": False, "error": "fichier vide"})
        if length > 40 * 1024 * 1024:
            return self._json(413, {"ok": False, "error": "fichier > 40 Mo"})

        data = self.rfile.read(length)
        try:
            dest.write_bytes(data)
        except OSError as err:
            return self._json(500, {"ok": False, "error": str(err)})

        rel = dest.relative_to(ROOT)
        print(f"  ✓ enregistré : {rel}  ({length} octets)")
        return self._json(200, {"ok": True, "path": str(rel)})

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    for folder in ALLOWED_FOLDERS.values():
        folder.mkdir(parents=True, exist_ok=True)

    url = f"http://127.0.0.1:{PORT}/"
    print("")
    print("  TAct Hand — Dépôt d'assets")
    print("  --------------------------")
    print(f"  Ouvre ton navigateur sur : {url}")
    print("  (Il va s'ouvrir tout seul dans 1 seconde.)")
    print("  Pour arrêter : ferme cette fenêtre ou appuie sur Ctrl+C.")
    print("")

    try:
        webbrowser.open(url)
    except Exception:
        pass

    with ReusableServer(("127.0.0.1", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Arrêt du serveur. À plus.")


if __name__ == "__main__":
    main()
