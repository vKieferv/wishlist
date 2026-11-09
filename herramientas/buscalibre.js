// Libros de Buscalibre: a partir del link de un tomo, encuentra los demás tomos de la misma
// edición (editorial, encuadernación y estilo de título), y el pack de la saga si existe.
"use strict";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept-Language": "es-CL,es;q=0.9" };
const BASE = "https://www.buscalibre.cl";
const PACK = /\b(estuche|pack|trilogia|bilogia|tetralogia|box|saga completa|coleccion completa|obra completa)\b/;
const ESPECIAL = /limitad|ilustrad|coleccionista|aniversario|lujo/i;
const VACIAS = new Set(["de", "la", "el", "los", "las", "y", "del", "en", "a", "the", "of", "saga", "serie", "libro", "tomo", "vol", "trilogia"]);

function esLinkBuscalibre(url) { return /buscalibre\.[a-z.]+\/libro-/i.test(String(url || "")); }

function decodificar(s) {
  return String(s == null ? "" : s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function normal(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function palabras(s) { return normal(s).split(" ").filter((w) => w && !VACIAS.has(w) && !/^\d+$/.test(w)); }
function parecido(a, b) {
  const pa = palabras(a), pb = new Set(palabras(b));
  if (!pa.length) return 0;
  return pa.filter((w) => pb.has(w)).length / pa.length;
}
function mismoAutor(a, b) {
  const A = normal(a).split(" ").filter((w) => w.length > 2), B = new Set(normal(b).split(" "));
  if (!A.length || !B.size) return false;
  return A.filter((w) => B.has(w)).length >= Math.min(2, A.length);
}
function formatoDe(s) {
  s = normal(s);
  if (/hardcover|tapa dura/.test(s)) return "tapa dura";
  if (/paperback|tapa blanda|rustica/.test(s)) return "tapa blanda";
  return "";
}
// "Nacidos de la Bruma (Nacidos de la Bruma [Mistborn] 1)" -> { linea: "Nacidos de la Bruma [Mistborn]", numero: 1 }
function partirTitulo(t) {
  const m = /\(([^()]+?)\s+(\d{1,2})\)\s*$/.exec(String(t || "").trim());
  return m ? { linea: m[1].trim(), numero: Number(m[2]) } : { linea: "", numero: null };
}
// "Fundación E Imperio / Foundation and Empire" -> "fundacion e imperio"
function tituloPrincipal(t) { return normal(String(t || "").split(" / ")[0].replace(/\([^)]*\)|\[[^\]]*\]/g, " ")); }
// Cómo titula la edición: sirve para no mezclar ediciones de la misma editorial.
function estilo(t) { return / \/ /.test(t) ? "bilingue" : partirTitulo(t).numero ? "numerada" : "simple"; }
function esPack(nombre) { return PACK.test(normal(nombre)); }
// "Trilogia [Fundacion/Fundacion e Imperio/Segunda Fundacion]" -> ["fundacion", "fundacion e imperio", "segunda fundacion"]
function enumerar(nombre) {
  const m = /\[([^\]]+)\]/.exec(nombre) || /\((?:estuche\s+)?(?:contiene|con)\s*:?\s*([^)]+)\)/i.exec(nombre);
  if (!m) return null;
  const partes = m[1].split(/\s*[\/|,]\s*/).map(normal).filter(Boolean);
  return partes.length >= 2 ? partes : null;
}
function resumir(t, max = 200) {
  t = decodificar(String(t || "").replace(/<[^>]+>/g, " "));
  if (t.length <= max) return t;
  const corte = t.slice(0, max), punto = corte.lastIndexOf(". ");
  return punto > 80 ? corte.slice(0, punto + 1) : corte.replace(/\s+\S*$/, "") + "…";
}
async function traer(url) {
  const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error("Buscalibre respondió " + r.status);
  return { html: await r.text(), url: r.url || url };
}

// "Llega Mañana a Santiago…" -> "Mañana"; "Llega entre el 24 Nov y el 30 Nov a …" -> "entre el 24 Nov y el 30 Nov"
function leerEntrega(html) {
  const i = html.search(/>\s*Llega\s/);
  if (i < 0) return "";
  const t = decodificar(html.slice(i + 1, i + 800).replace(/<[^>]+>/g, " "));
  const m = /Llega\s+(.+?)(?:\s+a\s+[A-ZÁÉÍÓÚÑ]|\s*\.\s*Seleccionar|$)/.exec(t);
  return m ? m[1].replace(/\s+\.$/, "").trim() : "";
}

async function leerLibro(url) {
  const { html, url: final } = await traer(url);
  const ld = [...html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } })
    .find((o) => o && [].concat(o["@type"] || []).includes("Book"));
  if (!ld) throw new Error("No encontré los datos del libro en esa página");
  const oferta = [].concat(ld.offers || [])[0] || {};
  const nombre = decodificar(ld.name);
  return {
    link: final.split("?")[0], nombre, ...partirTitulo(nombre),
    autor: decodificar([].concat(ld.author || [])[0] && [].concat(ld.author)[0].name),
    editorial: decodificar(ld.publisher && ld.publisher.name),
    formato: formatoDe(ld.bookFormat),
    isbn: String(ld.isbn || ""),
    precio: oferta.price != null ? Math.round(Number(oferta.price)) : null,
    foto: String(ld.image || ""),
    descripcion: resumir(ld.description),
    entrega: leerEntrega(html),
  };
}

async function buscar(q) {
  const { html } = await traer(`${BASE}/libros/search?q=${encodeURIComponent(q)}`);
  const out = [];
  for (const [bloque] of html.matchAll(/<div class="box-producto[\s\S]*?<\/a>\s*<\/div>/g)) {
    const href = (/<a href="([^"]+)"/.exec(bloque) || [])[1];
    const titulo = decodificar((/title="([^"]+)"/.exec(bloque) || [])[1]);
    if (!href || !titulo) continue;
    const metas = decodificar((/class="autor color-dark-gray metas[^"]*">([^<]+)</.exec(bloque) || [])[1]).split(",").map((x) => x.trim());
    const img = (/data-src="([^"]+)"/.exec(bloque) || [])[1] || "";
    out.push({
      link: new URL(href, BASE).href, nombre: titulo, ...partirTitulo(titulo),
      autor: decodificar((/<div class="autor">([^<]+)</.exec(bloque) || [])[1]),
      editorial: metas[0] || "", formato: formatoDe(metas.find((x) => /tapa|rustica/i.test(x)) || ""),
      usado: /usado/i.test(metas.join(" ")),
      precio: Number((/data-precio="(\d+)"/.exec(bloque) || [])[1]) || null,
      isbn: (/data-isbn="(\d+)"/.exec(bloque) || [])[1] || "",
      foto: img.replace(/\/fit-in\/\d+x\d+\//, "/fit-in/360x360/"),
    });
  }
  return out;
}

// Junta resultados de varias búsquedas sin repetir.
function bolsa() {
  const vistos = new Map();
  return {
    vistos,
    async juntar(q) { try { for (const r of await buscar(q)) if (!vistos.has(r.link)) vistos.set(r.link, r); } catch (e) { /* sigue */ } },
    validos(libro) {
      return [...vistos.values()].filter((r) => !r.usado && r.precio && !/ebook|audiolibro/i.test(r.editorial) &&
        ESPECIAL.test(r.nombre) === ESPECIAL.test(libro.nombre) && (!r.autor || !libro.autor || mismoAutor(libro.autor, r.autor)));
    },
  };
}
// Misma editorial vale 2, misma encuadernación 1, mismo estilo de título 1. Entre iguales, el más barato.
function puntaje(libro, r) {
  return (libro.editorial && normal(r.editorial) === normal(libro.editorial) ? 2 : 0) +
    (libro.formato && r.formato === libro.formato ? 1 : 0) + (estilo(r.nombre) === estilo(libro.nombre) ? 1 : 0);
}
function mejor(libro, candidatos) {
  let m = null;
  for (const r of candidatos) {
    if (!m || puntaje(libro, r) > puntaje(libro, m) || (puntaje(libro, r) === puntaje(libro, m) && r.precio < m.precio)) m = r;
  }
  if (m) m.otraEdicion = !!libro.editorial && normal(m.editorial) !== normal(libro.editorial);
  return m;
}

// Sagas numeradas: "(Mistborn 1)", "(Mistborn 2)"…
async function tomosNumerados(libro, hasta, b) {
  const tomos = {};
  if (libro.numero) tomos[libro.numero] = libro;
  const lineaN = normal(libro.linea);
  const nombreLinea = libro.linea.replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim();
  const elegir = () => {
    const porNumero = {};
    for (const r of b.validos(libro)) {
      if (!r.numero || normal(r.linea) !== lineaN || esPack(r.nombre)) continue;
      (porNumero[r.numero] = porNumero[r.numero] || []).push(r);
    }
    for (const n of Object.keys(porNumero)) if (tomos[n] !== libro) tomos[n] = mejor(libro, porNumero[n]);
  };
  await b.juntar(nombreLinea + " " + libro.autor);
  await b.juntar(nombreLinea);
  elegir();
  const tope = Math.min(20, Math.max(Number(hasta) || 0, ...Object.keys(tomos).map(Number)) + 2);
  let fallos = 0;
  for (let n = 1; n <= tope && fallos < 3; n++) {
    if (tomos[n]) { fallos = 0; continue; }
    await b.juntar(nombreLinea + " " + n);
    elegir();
    if (tomos[n]) fallos = 0; else if (n > Math.max(Number(hasta) || 0, 1)) fallos++;
  }
  return tomos;
}

// Sagas sin número ("Fundación / Foundation"): el orden sale de un pack que enumera sus libros,
// por ejemplo "Trilogía [Fundación/Fundación e Imperio/Segunda Fundación]".
async function tomosPorPack(libro, saga, total, b) {
  const propio = tituloPrincipal(libro.nombre);
  await b.juntar(saga + " " + libro.autor);
  await b.juntar(libro.nombre.split(" / ")[0] + " " + libro.autor + " " + libro.editorial);
  const listas = b.validos(libro).filter((r) => esPack(r.nombre)).map((r) => enumerar(r.nombre)).filter((l) => l && l.includes(propio));
  if (!listas.length) return null;
  const lista = listas.find((l) => l.length === Number(total)) || listas.sort((x, y) => y.length - x.length)[0];
  const tomos = {};
  for (let i = 0; i < lista.length; i++) {
    if (lista[i] === propio) { tomos[i + 1] = libro; continue; }
    await b.juntar(lista[i] + " " + libro.autor + " " + libro.editorial);
    const m = mejor(libro, b.validos(libro).filter((r) => !esPack(r.nombre) && tituloPrincipal(r.nombre) === lista[i]));
    if (m) tomos[i + 1] = m;
  }
  return tomos;
}

// El pack o estuche de la saga, de preferencia de la misma editorial.
async function buscarPack(libro, saga, b) {
  await b.juntar(saga + " " + libro.autor);
  await b.juntar("estuche " + saga + " " + libro.autor);
  const propio = tituloPrincipal(libro.nombre);
  const lineaN = normal(String(libro.linea || "").replace(/\[[^\]]*\]/g, " "));
  const candidatos = b.validos(libro).filter((r) => {
    if (!esPack(r.nombre)) return false;
    const lista = enumerar(r.nombre);
    return (lista && lista.includes(propio)) || parecido(saga, r.nombre) >= 0.6 || (lineaN && normal(r.nombre).includes(lineaN));
  });
  // En un pack no importa cómo esté escrito el título: misma editorial y encuadernación, y el más barato.
  const sinEstilo = Object.assign({}, libro, { nombre: "" });
  const pts = (r) => puntaje(sinEstilo, r) - (estilo(r.nombre) === "simple" ? 1 : 0);
  let m = null;
  for (const r of candidatos) if (!m || pts(r) > pts(m) || (pts(r) === pts(m) && r.precio < m.precio)) m = r;
  if (!m) return null;
  m.otraEdicion = !!libro.editorial && normal(m.editorial) !== normal(libro.editorial);
  const lista = enumerar(m.nombre);
  return Object.assign(m, { cubre: lista ? lista.length : null });
}

// Abre la ficha de cada libro para confirmar precio, portada y plazo de entrega.
async function completar(t) {
  if (!t || t.entrega !== undefined) return t;
  try {
    const f = await leerLibro(t.link);
    t.entrega = f.entrega;
    if (f.precio) t.precio = f.precio;
    if (f.foto) t.foto = f.foto;
  } catch (e) { t.entrega = ""; }
  return t;
}
function ficha(t) {
  const f = { link: t.link, foto: t.foto, precio: t.precio, isbn: t.isbn, nombre: t.nombre, editorial: t.editorial, entrega: t.entrega || "" };
  if (t.otraEdicion) f.otraEdicion = true;
  return f;
}

// Agrega el libro (y su saga) al álbum. "para" es el id de la saga, si ya se sabe.
async function agregarLibro(d, url, para) {
  const libro = await leerLibro(url);
  d.productos = d.productos || [];
  const catLibros = (d.categorias || []).find((c) => c.id === "libros") ? "libros" : "";

  // ¿A qué saga del álbum pertenece?
  let p = para && d.productos.find((x) => x.id === para);
  if (!p) {
    const base = libro.linea || libro.nombre.split(" / ")[0];
    const candidatas = d.productos.filter((x) => x.serie)
      .map((x) => ({ x, n: Math.max(parecido(base, x.nombre + " " + (x.linea ? x.linea.nombre : "")), parecido(x.nombre, base)) }))
      .sort((a, c) => c.n - a.n);
    if (candidatas[0] && candidatas[0].n >= 0.5) p = candidatas[0].x;
  }
  const saga = p ? p.nombre : (libro.linea || "").replace(/\s*\[[^\]]*\]/, "").trim();
  const total = p && p.serie ? Number(p.serie.total) || 0 : 0;

  const b = bolsa();
  let tomos = null;
  if (libro.linea) tomos = await tomosNumerados(libro, total, b);
  else if (saga) tomos = await tomosPorPack(libro, saga, total, b);
  const pack = saga ? await buscarPack(libro, saga, b) : null;

  if (!tomos && !p) {
    // Libro suelto: lámina normal con la portada y el precio de Buscalibre.
    p = { id: "p" + Date.now().toString(36), categoria: catLibros, nombre: libro.nombre.split(" / ")[0], descripcion: libro.autor ? libro.autor + "." : "", nota: "", moneda: "CLP" };
    d.productos.unshift(p);
    Object.assign(p, { link: libro.link, origen: url, tienda: "buscalibre.cl", foto: libro.foto, precio: libro.precio, moneda: "CLP", entrega: libro.entrega });
    return { saga: p.nombre, tomos: 0, encontrados: [], nueva: true };
  }

  const nueva = !p;
  if (!p) {
    p = { id: "p" + Date.now().toString(36), categoria: catLibros, nombre: saga, descripcion: libro.autor ? libro.autor + "." : "", nota: "", precio: null, moneda: "CLP", serie: { total: 1, tengo: [] } };
    d.productos.unshift(p);
  }
  p.serie = p.serie || { total: 1, tengo: [] };
  p.linea = { nombre: libro.linea || saga, editorial: libro.editorial, formato: libro.formato, origen: url };
  p.tienda = "buscalibre.cl";
  p.origen = url;
  // Los datos sueltos de antes ya no mandan: ahora mandan los tomos y el pack.
  p.link = ""; p.foto = /^https?:\/\/images\.[^/]*buscalibre/.test(p.foto || "") ? "" : (p.foto || ""); p.precio = null;

  const numeros = Object.keys(tomos || {}).map(Number).sort((x, y) => x - y);
  if (tomos) {
    for (const n of numeros) await completar(tomos[n]);
    p.serie.total = Math.max(Number(p.serie.total) || 1, ...numeros);
    p.tomos = {};
    for (const n of numeros) p.tomos[n] = ficha(tomos[n]);
  }
  if (pack) {
    await completar(pack);
    p.pack = Object.assign(ficha(pack), { cubre: pack.cubre });
  } else delete p.pack;
  return { saga: p.nombre, tomos: numeros.length, encontrados: numeros, pack: pack ? pack.nombre : "", nueva, sinOrden: !tomos };
}

// Pone a mano el link de un tomo específico.
async function ponerTomo(d, para, n, url) {
  const p = (d.productos || []).find((x) => x.id === para);
  if (!p || !p.serie) throw new Error("No encontré esa saga");
  if (!String(url || "").trim()) { if (p.tomos) delete p.tomos[n]; return { saga: p.nombre, n, quitado: true }; }
  const libro = await leerLibro(url);
  p.tomos = p.tomos || {};
  p.tomos[n] = ficha(libro);
  p.tienda = "buscalibre.cl";
  return { saga: p.nombre, n, nombre: libro.nombre };
}

module.exports = { esLinkBuscalibre, leerLibro, agregarLibro, ponerTomo, partirTitulo, enumerar };
