// Servidor local del editor. Se abre con abrir-editor.bat (solo escucha en este PC).
// - Sirve la página y el editor.
// - Lee un link de producto y extrae nombre, descripción, precio y fotos.
// - Guarda datos.js y las fotos, y publica en GitHub.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile, exec } = require("child_process");

const RAIZ = __dirname;
const PUERTO = 4013;
const GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ORIGENES = [`http://127.0.0.1:${PUERTO}`, `http://localhost:${PUERTO}`];
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

// ---------- datos ----------
const ARCHIVO_DATOS = path.join(RAIZ, "datos.js");
function leerDatos() {
  const t = fs.readFileSync(ARCHIVO_DATOS, "utf8");
  return JSON.parse(t.replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
}
function escribirDatos(d) {
  d.actualizado = new Date().toISOString();
  fs.writeFileSync(ARCHIVO_DATOS, "window.DATOS = " + JSON.stringify(d, null, 2) + ";\n");
}

// ---------- utilidades http ----------
function leerCuerpo(req, limite = 20e6) {
  return new Promise((ok, mal) => {
    const partes = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limite) { mal(new Error("El archivo es demasiado grande")); req.destroy(); } else partes.push(c); });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", mal);
  });
}
function responder(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
async function traer(url, extra = {}) {
  const u = new URL(url);
  const headers = { "User-Agent": UA, "Accept-Language": "es-CL,es;q=0.9,en;q=0.7", ...extra };
  if (/steampowered\.com$/.test(u.hostname)) headers.Cookie = "birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1";
  return fetch(u, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
}

// ---------- extracción de productos ----------
function decodificar(s) {
  return String(s == null ? "" : s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function leerMetas(html) {
  const m = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = (/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    const v = (/content\s*=\s*"([^"]*)"/i.exec(tag) || /content\s*=\s*'([^']*)'/i.exec(tag) || [])[1];
    if (k && v != null && !(k.toLowerCase() in m)) m[k.toLowerCase()] = decodificar(v);
  }
  return m;
}
function leerJsonLd(html) {
  const productos = [];
  for (const [, bloque] of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(bloque.trim()); } catch (e) { continue; }
    const cola = [j];
    while (cola.length) {
      const o = cola.shift();
      if (Array.isArray(o)) { cola.push(...o); continue; }
      if (!o || typeof o !== "object") continue;
      if (o["@graph"]) cola.push(o["@graph"]);
      if ([].concat(o["@type"] || []).some((t) => /product|book|videogame/i.test(String(t)))) productos.push(o);
      if (o.mainEntity) cola.push(o.mainEntity);
    }
  }
  return productos;
}
// "12.990" -> 12990 ; "12,990.50" -> 12990.5 ; "19,99" -> 19.99
function aNumero(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v || "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const ultPunto = s.lastIndexOf("."), ultComa = s.lastIndexOf(",");
  if (ultPunto >= 0 && ultComa >= 0) {
    const dec = ultPunto > ultComa ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else if (ultComa >= 0 || ultPunto >= 0) {
    const sep = ultComa >= 0 ? "," : ".";
    const partes = s.split(sep);
    s = (partes.length > 2 || partes[partes.length - 1].length === 3) ? partes.join("") : partes.join(".");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function imagenesDe(img) {
  const out = [];
  for (const x of [].concat(img || [])) {
    if (typeof x === "string") out.push(x);
    else if (x && (x.url || x.contentUrl)) out.push(x.url || x.contentUrl);
  }
  return out;
}
function resumir(t, max = 220) {
  t = decodificar(String(t || "").replace(/<[^>]+>/g, " "));
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const punto = corte.lastIndexOf(". ");
  return (punto > 80 ? corte.slice(0, punto + 1) : corte.replace(/\s+\S*$/, "") + "…");
}

async function extraer(url) {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const r = await traer(url, { Accept: "text/html,application/xhtml+xml" });
  if (!r.ok) throw new Error(`la tienda respondió ${r.status}`);
  const html = (await r.text()).slice(0, 3e6);
  const final = r.url || url;
  const m = leerMetas(html);
  const ld = leerJsonLd(html)[0] || {};
  const ofertas = [].concat(ld.offers || []).flatMap((o) => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  const oferta = ofertas.find((o) => o.price != null || o.lowPrice != null || (o.priceSpecification && o.priceSpecification.price != null)) || {};

  let precio = aNumero(oferta.price ?? oferta.lowPrice ?? (oferta.priceSpecification || {}).price);
  let moneda = oferta.priceCurrency || (oferta.priceSpecification || {}).priceCurrency || "";
  if (precio == null) {
    precio = aNumero(m["product:price:amount"] || m["og:price:amount"] || m["price"] || m["twitter:data1"]);
    moneda = m["product:price:currency"] || m["og:price:currency"] || m["pricecurrency"] || moneda;
  }
  if (precio == null) {
    const steam = /data-price-final="(\d+)"/.exec(html);
    if (steam) precio = Number(steam[1]) / 100;
  }
  const titulo = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1];
  const nombre = decodificar(ld.name || m["og:title"] || m["twitter:title"] || titulo || "")
    .replace(/\s+(en|on)\s+Steam$/i, "").replace(/^[«"“](.+)[»"”]$/, "$1")
    .replace(/[（(]precio fijo[^)）]*[)）]/i, "").replace(/\s+[|·]\s+[^|·]{2,40}$/, "").trim();
  const imagenes = [...new Set([
    ...imagenesDe(ld.image), m["og:image"], m["og:image:secure_url"], m["twitter:image"],
    (/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)/i.exec(html) || [])[1],
  ].filter(Boolean).map((x) => { try { return new URL(decodificar(x), final).href; } catch (e) { return null; } }).filter(Boolean))].slice(0, 8);

  return {
    link: final,
    tienda: new URL(final).hostname.replace(/^www\./, ""),
    nombre,
    descripcion: resumir(ld.description || m["og:description"] || m["description"] || m["twitter:description"] || ""),
    precio,
    moneda: String(moneda || (precio != null ? "CLP" : "")).toUpperCase(),
    imagenes,
  };
}

// ---------- git ----------
function git(args) {
  return new Promise((ok) => execFile(GIT, args, { cwd: RAIZ }, (err, so, se) => ok({ ok: !err, salida: (so + se).trim() })));
}

// ---------- rutas ----------
async function api(req, res, u) {
  if (req.method === "POST" && !ORIGENES.includes(req.headers.origin)) return responder(res, 403, { error: "Origen no permitido" });

  if (u.pathname === "/api/datos" && req.method === "GET") return responder(res, 200, leerDatos());
  if (u.pathname === "/api/datos" && req.method === "POST") {
    const d = JSON.parse((await leerCuerpo(req)).toString("utf8"));
    if (!d || !Array.isArray(d.productos)) return responder(res, 400, { error: "Datos inválidos" });
    escribirDatos(d);
    return responder(res, 200, { ok: true, actualizado: d.actualizado });
  }
  if (u.pathname === "/api/extraer" && req.method === "POST") {
    const { url } = JSON.parse((await leerCuerpo(req)).toString("utf8"));
    try { return responder(res, 200, await extraer(String(url || "").trim())); }
    catch (e) { return responder(res, 502, { error: "No pude leer la página: " + (e.name === "TimeoutError" ? "se demoró demasiado" : e.message) }); }
  }
  if (u.pathname === "/api/imagen" && req.method === "GET") {
    const destino = u.searchParams.get("url") || "";
    if (!/^https?:\/\//i.test(destino)) return responder(res, 400, { error: "URL inválida" });
    try {
      const r = await traer(destino, { Accept: "image/avif,image/webp,image/*,*/*", Referer: new URL(destino).origin + "/" });
      const tipo = r.headers.get("content-type") || "";
      if (!r.ok || !tipo.startsWith("image/")) return responder(res, 502, { error: "Eso no es una imagen" });
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-store" });
      return res.end(buf);
    } catch (e) { return responder(res, 502, { error: "No pude bajar la imagen" }); }
  }
  if (u.pathname === "/api/foto" && req.method === "POST") {
    const base = (u.searchParams.get("nombre") || "foto").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "foto";
    const nombre = `${base}-${Date.now().toString(36)}.jpg`;
    fs.mkdirSync(path.join(RAIZ, "fotos"), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, "fotos", nombre), await leerCuerpo(req));
    return responder(res, 200, { ruta: "fotos/" + nombre });
  }
  if (u.pathname === "/api/publicar" && req.method === "POST") {
    const log = [];
    const a = await git(["add", "-A"]); log.push(a.salida);
    const c = await git(["commit", "-m", "Actualizar wishlist"]); log.push(c.salida);
    const p = await git(["push"]); log.push(p.salida);
    const nada = !c.ok && /nothing to commit|nada para hacer commit/i.test(c.salida);
    return responder(res, 200, { ok: p.ok, nada, salida: log.filter(Boolean).join("\n") });
  }
  return responder(res, 404, { error: "No existe" });
}

function estatico(req, res, u) {
  let ruta = decodeURIComponent(u.pathname);
  if (ruta === "/") ruta = "/index.html";
  const archivo = path.normalize(path.join(RAIZ, ruta));
  if (!archivo.startsWith(RAIZ + path.sep) || /[\\/]\.git([\\/]|$)/.test(archivo)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
}

const servidor = http.createServer(async (req, res) => {
  const host = String(req.headers.host || "");
  if (!ORIGENES.some((o) => o.endsWith("//" + host))) { res.writeHead(403); return res.end(); }
  const u = new URL(req.url, `http://${host}`);
  try {
    if (u.pathname.startsWith("/api/")) await api(req, res, u);
    else estatico(req, res, u);
  } catch (e) {
    responder(res, 500, { error: e.message });
  }
});

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log("El editor ya estaba abierto. Lo abro en el navegador.");
    if (!process.argv.includes("--sin-abrir")) exec(`start "" "http://127.0.0.1:${PUERTO}/editor.html"`);
    setTimeout(() => process.exit(0), 500);
  } else throw e;
});
if (require.main === module) {
  servidor.listen(PUERTO, "127.0.0.1", () => {
    console.log(`Editor listo en http://127.0.0.1:${PUERTO}/editor.html`);
    console.log("Deja esta ventana abierta mientras editas. Ciérrala para apagar el editor.");
    if (!process.argv.includes("--sin-abrir")) exec(`start "" "http://127.0.0.1:${PUERTO}/editor.html"`);
  });
}

module.exports = { extraer, aNumero, traer };
