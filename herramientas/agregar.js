// Lo corre GitHub Actions cuando agregas un link desde la página.
// Uso: node herramientas/agregar.js "https://tienda.cl/producto"
"use strict";
const fs = require("fs");
const path = require("path");
const { extraer, traer } = require("../servidor.js");
const steam = require("./steam.js");
const buscalibre = require("./buscalibre.js");

const RAIZ = path.join(__dirname, "..");
const ARCHIVO = path.join(RAIZ, "datos.js");
let sharp = null;
try { sharp = require("sharp"); } catch (e) { /* sin sharp se guarda la imagen tal cual */ }

function leer() {
  const t = fs.readFileSync(ARCHIVO, "utf8");
  return JSON.parse(t.replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
}
function escribir(d) {
  d.actualizado = new Date().toISOString();
  fs.writeFileSync(ARCHIVO, "window.DATOS = " + JSON.stringify(d, null, 2) + ";\n");
}
function slug(s) {
  return String(s || "foto").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";
}
function adivinarCategoria(d, texto) {
  const t = " " + String(texto || "").toLowerCase() + " ";
  let mejor = null, puntos = 0;
  for (const c of d.categorias || []) {
    const n = String(c.pistas || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).filter((x) => t.includes(x)).length;
    if (n > puntos) { mejor = c.id; puntos = n; }
  }
  const cats = d.categorias || [];
  return mejor || (cats.find((c) => c.id === "varios") || cats[cats.length - 1] || {}).id || "";
}
async function bajarFoto(url, nombre) {
  const r = await traer(url, { Accept: "image/avif,image/webp,image/*,*/*", Referer: new URL(url).origin + "/" });
  const tipo = r.headers.get("content-type") || "";
  if (!r.ok || !tipo.startsWith("image/")) throw new Error("no es una imagen");
  let buf = Buffer.from(await r.arrayBuffer());
  let ext = (tipo.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z]/g, "") || "jpg";
  if (sharp) {
    buf = await sharp(buf).rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 86 }).toBuffer();
    ext = "jpg";
  } else if (buf.length > 3e6) throw new Error("imagen demasiado grande");
  const nombreArchivo = `${slug(nombre)}-${Date.now().toString(36)}.${ext}`;
  fs.mkdirSync(path.join(RAIZ, "fotos"), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, "fotos", nombreArchivo), buf);
  return "fotos/" + nombreArchivo;
}

(async () => {
  const url = String(process.argv[2] || "").trim();
  const d = leer();
  d.productos = d.productos || [];

  // Lista de deseados de Steam: un link de wishlist, o "--steam" para volver a revisar la guardada.
  if (url === "--steam" || steam.esLinkWishlist(url)) {
    const config = url === "--steam" ? d.steam : steam.leerLink(url);
    if (!config || (!config.vanity && !config.steamid)) { console.log("No hay lista de Steam guardada."); return; }
    const r = await steam.sincronizar(d, config);
    escribir(d);
    console.log(`Steam: ${r.total} juegos (${r.nuevos} nuevos, ${r.actualizados} actualizados, ${r.sacados} sacados).`);
    return;
  }

  if (!/^https?:\/\/\S+$/i.test(url)) { console.error("Link inválido:", url); process.exit(1); }

  // Libro de Buscalibre: busca los demás tomos de la misma línea y editorial.
  if (buscalibre.esLinkBuscalibre(url)) {
    const para = (process.argv.find((a) => a.startsWith("--para=")) || "").slice(7) || null;
    const r = await buscalibre.agregarLibro(d, url, para);
    escribir(d);
    console.log(`Buscalibre: «${r.saga}», tomos encontrados: ${(r.encontrados || []).join(", ") || "ninguno"}.`);
    return;
  }
  if (d.productos.some((p) => p.origen === url || p.link === url)) { console.log("Ese link ya está en el álbum."); return; }

  let info = {};
  try { info = await extraer(url); }
  catch (e) { console.log("No pude leer la página (" + e.message + "). Lo agrego solo con el link."); }

  const p = {
    id: "p" + Date.now().toString(36),
    categoria: "",
    nombre: info.nombre || "Producto nuevo",
    descripcion: info.descripcion || "",
    nota: "",
    precio: info.precio ?? null,
    moneda: info.moneda || "CLP",
    link: info.link || url,
    origen: url,
    tienda: info.tienda || new URL(url).hostname.replace(/^www\./, ""),
    foto: "",
  };
  p.categoria = adivinarCategoria(d, [p.nombre, p.descripcion, p.link].join(" "));
  for (const img of info.imagenes || []) {
    try { p.foto = await bajarFoto(img, p.nombre); break; } catch (e) { console.log("Foto descartada:", img, e.message); }
  }
  d.productos.unshift(p);
  escribir(d);
  console.log("Agregado:", JSON.stringify(p));
})().catch((e) => { console.error(e); process.exit(1); });
