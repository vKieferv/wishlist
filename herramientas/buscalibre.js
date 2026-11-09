// Libros de Buscalibre: a partir del link de un tomo, encuentra los demás tomos de la misma
// línea, editorial y encuadernación, y los guarda en la saga del álbum.
"use strict";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept-Language": "es-CL,es;q=0.9" };
const BASE = "https://www.buscalibre.cl";
const RARAS = /limitad|ilustrad|estuche|pack|box|coleccionista|aniversario|lujo/i;
const VACIAS = new Set(["de", "la", "el", "los", "las", "y", "del", "en", "a", "the", "of", "saga", "serie", "libro", "tomo", "vol"]);

function esLinkBuscalibre(url) { return /buscalibre\.[a-z.]+\/libro-/i.test(String(url || "")); }

function decodificar(s) {
  return String(s == null ? "" : s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function normal(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function palabras(s) { return normal(s).split(" ").filter((w) => w && !VACIAS.has(w) && !/^\d+$/.test(w)); }
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

// "Llega Mañana a Santiago…" -> "Mañana"; "Llega entre el 3 y el 10 de dic. a …" -> "entre el 3 y el 10 de dic."
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

// Abre la ficha de cada tomo para confirmar precio, portada y plazo de entrega.
async function completarTomos(tomos) {
  for (const n of Object.keys(tomos)) {
    const t = tomos[n];
    if (t.entrega !== undefined) continue;
    try {
      const f = await leerLibro(t.link);
      t.entrega = f.entrega;
      if (f.precio) t.precio = f.precio;
      if (f.foto) t.foto = f.foto;
    } catch (e) { t.entrega = ""; }
  }
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

// Todos los tomos de la misma línea, editorial y encuadernación que el libro dado.
async function tomosDeLaLinea(libro, hasta) {
  const tomos = {};
  if (libro.numero) tomos[libro.numero] = libro;
  if (!libro.linea) return tomos;
  const lineaN = normal(libro.linea), editorialN = normal(libro.editorial);
  const raraOriginal = RARAS.test(libro.nombre);
  const nombreLinea = libro.linea.replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim();
  const vistos = new Map();
  const juntar = async (q) => { try { for (const r of await buscar(q)) vistos.set(r.link, r); } catch (e) { /* sigue */ } };
  // Puntaje: misma editorial vale 2 y misma encuadernación 1. Entre iguales, el más barato.
  // Si un tomo no existe en la misma editorial, queda el de otra marcado como «otra edición».
  const puntaje = (r) => (editorialN && normal(r.editorial) === editorialN ? 2 : 0) + (libro.formato && r.formato === libro.formato ? 1 : 0);
  const elegir = () => {
    for (const r of vistos.values()) {
      if (!r.numero || normal(r.linea) !== lineaN || r.usado || !r.precio) continue;
      if (RARAS.test(r.nombre) !== raraOriginal || /ebook/i.test(r.editorial)) continue;
      const actual = tomos[r.numero];
      if (actual === libro) continue;
      const pr = puntaje(r), pa = actual ? puntaje(actual) : -1;
      if (pr > pa || (pr === pa && r.precio < actual.precio)) tomos[r.numero] = Object.assign(r, { otraEdicion: pr < 2 && !!editorialN });
    }
  };
  await juntar(nombreLinea + " " + libro.autor);
  await juntar(nombreLinea);
  elegir();
  // Busca uno por uno los números que faltan, hasta dos seguidos sin resultado más allá de lo conocido.
  const tope = Math.min(20, Math.max(Number(hasta) || 0, ...Object.keys(tomos).map(Number)) + 2);
  let fallos = 0;
  for (let n = 1; n <= tope && fallos < 3; n++) {
    if (tomos[n]) { fallos = 0; continue; }
    await juntar(nombreLinea + " " + n);
    elegir();
    if (tomos[n]) fallos = 0; else if (n > Math.max(Number(hasta) || 0, 1)) fallos++;
  }
  return tomos;
}

function parecido(a, b) {
  const pa = palabras(a), pb = new Set(palabras(b));
  if (!pa.length) return 0;
  return pa.filter((w) => pb.has(w)).length / pa.length;
}

// Agrega el libro (y su línea) al álbum. "para" es el id de la saga, si ya se sabe.
async function agregarLibro(d, url, para) {
  const libro = await leerLibro(url);
  d.productos = d.productos || [];
  const catLibros = (d.categorias || []).find((c) => c.id === "libros") ? "libros" : "";
  const previa = para && d.productos.find((x) => x.id === para);
  const tomos = await tomosDeLaLinea(libro, previa && previa.serie ? previa.serie.total : 0);
  await completarTomos(tomos);
  const numeros = Object.keys(tomos).map(Number);

  if (!libro.linea) {
    // Libro suelto: lámina normal con la portada y el precio de Buscalibre.
    let p = para && d.productos.find((x) => x.id === para);
    if (!p) {
      p = { id: "p" + Date.now().toString(36), categoria: catLibros, nombre: libro.nombre, descripcion: libro.autor ? libro.autor + "." : "", nota: "", moneda: "CLP" };
      d.productos.unshift(p);
    }
    Object.assign(p, { link: libro.link, origen: url, tienda: "buscalibre.cl", foto: libro.foto, precio: libro.precio, moneda: "CLP", entrega: libro.entrega });
    return { saga: p.nombre, tomos: 0, nueva: !para };
  }

  let p = para && d.productos.find((x) => x.id === para);
  if (!p) {
    const candidatas = d.productos.filter((x) => x.serie || x.categoria === catLibros)
      .map((x) => ({ x, n: Math.max(parecido(libro.linea, x.nombre + " " + (x.linea ? x.linea.nombre : "")), parecido(x.nombre, libro.linea)) }))
      .sort((a, b) => b.n - a.n);
    if (candidatas[0] && candidatas[0].n >= 0.5) p = candidatas[0].x;
  }
  const nueva = !p;
  if (!p) {
    p = { id: "p" + Date.now().toString(36), categoria: catLibros, nombre: libro.linea.replace(/\s*\[[^\]]*\]/, "").trim(),
      descripcion: libro.autor ? libro.autor + "." : "", nota: "", precio: null, moneda: "CLP", serie: { total: 1, tengo: [] } };
    d.productos.unshift(p);
  }
  p.serie = p.serie || { total: 1, tengo: [] };
  p.serie.total = Math.max(Number(p.serie.total) || 1, ...numeros);
  p.linea = { nombre: libro.linea, editorial: libro.editorial, formato: libro.formato, origen: url };
  p.tomos = {};
  for (const n of numeros.sort((a, b) => a - b)) {
    const t = tomos[n];
    p.tomos[n] = { link: t.link, foto: t.foto, precio: t.precio, isbn: t.isbn, nombre: t.nombre, editorial: t.editorial, entrega: t.entrega || "" };
    if (t.otraEdicion) p.tomos[n].otraEdicion = true;
  }
  p.tienda = "buscalibre.cl";
  p.origen = url;
  return { saga: p.nombre, tomos: numeros.length, encontrados: numeros.sort((a, b) => a - b), nueva };
}

module.exports = { esLinkBuscalibre, leerLibro, tomosDeLaLinea, agregarLibro, partirTitulo };
