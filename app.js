// Arma el álbum a partir de window.DATOS, con filtros por categoría y precio.
// En vkieferv.github.io tiene además un modo edición: con una llave de GitHub se agregan
// links (los lee una acción de GitHub) y se editan las láminas guardando directo en el repo.
(function () {
  "use strict";
  var D = window.DATOS || { productos: [], categorias: [] };
  var raiz = document.getElementById("album");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function urlSegura(u) { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : (u ? "https://" + u : ""); }
  function fotoSegura(f) { f = String(f || "").trim(); return /^(https?:\/\/|fotos\/)/i.test(f) ? f : ""; }
  function pad(n, k) { return String(n).padStart(k || 3, "0"); }
  function $(id) { return document.getElementById(id); }

  // ---------- GitHub ----------
  var GH = (function () {
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return null;
    var dueno = m[1], repo = location.pathname.split("/")[1] || (dueno + ".github.io");
    return { dueno: dueno, repo: repo, api: "https://api.github.com/repos/" + dueno + "/" + repo };
  })();
  var edit = { activo: false, llave: null, pendientes: [] };
  try { edit.llave = localStorage.getItem("album-llave"); } catch (e) {}

  // ---------- precios ----------
  var CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  // Sagas con tomos de Buscalibre: la lámina muestra el siguiente tomo que falta.
  function siguienteTomo(p) {
    if (!p.tomos || !p.serie) return null;
    var tengo = p.serie.tengo || [], total = Math.max(1, parseInt(p.serie.total, 10) || 1);
    for (var n = 1; n <= total; n++) if (tengo.indexOf(n) < 0 && p.tomos[n]) return { n: n, t: p.tomos[n] };
    return null;
  }
  // El pack de la saga manda cuando conviene: faltan 2 o más tomos, el pack cubre la saga
  // y no sale más caro que comprar los tomos que faltan por separado.
  function packPrincipal(p) {
    if (!p.pack || p.pack.oculto || !p.serie || !p.pack.precio) return null;
    var total = Math.max(1, parseInt(p.serie.total, 10) || 1), tengo = p.serie.tengo || [], faltan = [];
    for (var n = 1; n <= total; n++) if (tengo.indexOf(n) < 0) faltan.push(n);
    if (faltan.length < 2) return null;
    if (!(total <= 4 || (p.pack.cubre && p.pack.cubre >= total))) return null;
    var suma = 0, completo = true;
    faltan.forEach(function (k) { var t = (p.tomos || {})[k]; if (t && t.precio) suma += t.precio; else completo = false; });
    if (completo && p.pack.precio > suma) return null;
    return { pack: p.pack, ahorro: completo ? suma - p.pack.precio : null, total: total };
  }
  function efectivo(p) {
    var k = packPrincipal(p);
    if (k) {
      return Object.assign({}, p, { foto: k.pack.foto || p.foto, precio: k.pack.precio, moneda: "CLP", link: k.pack.link, tienda: "buscalibre.cl",
        entrega: k.pack.entrega || p.entrega, _pack: k });
    }
    var s = siguienteTomo(p);
    if (!s) return p;
    return Object.assign({}, p, { foto: s.t.foto || p.foto, precio: s.t.precio, moneda: "CLP", link: s.t.link, tienda: "buscalibre.cl",
      entrega: s.t.entrega || p.entrega, _sig: s });
  }
  function sinPrecio(p) { p = efectivo(p); return p.precio === null || p.precio === "" || p.precio === undefined; }
  // Envío: el de la lámina, o el de la tienda (Portada → envíos), o desconocido (null).
  function envioDe(p) {
    if (p.envio !== undefined && p.envio !== null && p.envio !== "") return Number(p.envio);
    var e = (D.envios || {})[p.tienda];
    return e === undefined || e === null || e === "" ? null : Number(e);
  }
  function entregaDe(p) { return p.entrega || (D.entregas || {})[p.tienda] || ""; }
  // Precio del producto en pesos, sin envío.
  function basePesos(p) {
    p = efectivo(p);
    if (sinPrecio(p)) return null;
    var n = Number(p.precio);
    if (!isFinite(n)) return null;
    var m = String(p.moneda || "CLP").toUpperCase();
    if (m === "CLP") return n;
    if (m === "USD") return n * (Number(D.tasaUSD) || 950);
    return null;
  }
  // Precio real: producto + envío. Es el que se muestra en grande y el que usan los filtros.
  function enPesos(p) {
    var b = basePesos(p);
    if (b == null) return null;
    var e = envioDe(efectivo(p));
    return Math.round((b + (e || 0)) / 10) * 10;
  }
  function precioHtml(p) {
    p = efectivo(p);
    if (sinPrecio(p)) return '<span class="precio sin">Sin precio</span>';
    var total = enPesos(p), m = String(p.moneda || "CLP").toUpperCase(), e = envioDe(p), det = [];
    if (total == null) return '<span class="precio">' + esc(m + " " + p.precio) + "</span>";
    if (m !== "CLP") {
      var entero = Number(p.precio) % 1 === 0;
      det.push((m === "USD" ? "US$ " : m + " ") + Number(p.precio).toLocaleString("es-CL", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 }));
    } else if (e) det.push(CLP.format(Number(p.precio)));
    if (e === 0) { if (p.tienda !== "store.steampowered.com") det.push("envío gratis"); }
    else if (e) det.push("+ envío " + CLP.format(e));
    else det.push("+ envío");
    return '<span class="precio">' + (m !== "CLP" && !e ? "≈ " : "") + CLP.format(total) + (det.length ? "<small>" + esc(det.join(" ")) + "</small>" : "") + "</span>";
  }
  var RANGOS = [
    { id: "r1", nombre: "Hasta $15 mil", min: -1, max: 15000 },
    { id: "r2", nombre: "$15 a 40 mil", min: 15000, max: 40000 },
    { id: "r3", nombre: "$40 a 100 mil", min: 40000, max: 100000 },
    { id: "r4", nombre: "Más de $100 mil", min: 100000, max: Infinity },
    { id: "sin", nombre: "Sin precio" }
  ];
  function enRango(p, id) {
    if (id === "todos") return true;
    var r = RANGOS.filter(function (x) { return x.id === id; })[0], v = enPesos(p);
    if (!r) return true;
    if (r.id === "sin") return v == null;
    return v != null && v > r.min && v <= r.max;
  }
  function porPrecio(dir) {
    return function (a, b) {
      var x = enPesos(a), y = enPesos(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return dir * (x - y);
    };
  }

  // ---------- categorías y numeración ----------
  var cats = [], idsCat = [], numero = {}, nombreCat = {};
  function catDe(p) { return idsCat.indexOf(p.categoria) >= 0 ? p.categoria : "__otros"; }
  function deCategoria(id) {
    return visibles.filter(function (p) { return catDe(p) === id; })
      .sort(function (a, b) { return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) || porPrecio(1)(a, b); });
  }
  // La lámina "cualquier juego de mi lista de Steam" sobra cuando los juegos ya están en el álbum:
  // pasa a ser un link en el título de la sección.
  var visibles = [];
  function esAtajoSteam(p) { return /steam(powered|community)\.com\/wishlist\//i.test(p.link || ""); }
  function tipoDe(p) {
    if (p.fuente === "steam" || /steampowered\.com/.test(p.tienda || "")) return "juego";
    if (p.serie || p.tomos || p.tienda === "buscalibre.cl" || p.categoria === "libros") return "libro";
    return "cosa";
  }
  function preparar() {
    D.productos = D.productos || [];
    D.categorias = D.categorias || [];
    var haySteam = D.productos.some(function (p) { return p.fuente === "steam"; });
    visibles = D.productos.filter(function (p) { return !(haySteam && esAtajoSteam(p)); });
    cats = D.categorias.slice();
    idsCat = cats.map(function (c) { return c.id; });
    if (D.productos.some(function (p) { return idsCat.indexOf(p.categoria) < 0; })) cats.push({ id: "__otros", nombre: "Otros" });
    numero = {}; nombreCat = {};
    var n = 0;
    cats.forEach(function (c) { nombreCat[c.id] = c.nombre; deCategoria(c.id).forEach(function (p) { numero[p.id] = ++n; }); });
  }

  // ---------- sagas ----------
  function rangos(ns) {
    var g = [];
    ns.forEach(function (k) { var u = g[g.length - 1]; if (u && k === u[1] + 1) u[1] = k; else g.push([k, k]); });
    var t = g.map(function (r) { return r[0] === r[1] ? "el " + r[0] : "del " + r[0] + " al " + r[1]; });
    return t.length > 1 ? t.slice(0, -1).join(", ") + " y " + t[t.length - 1] : t[0];
  }
  function serieHtml(p) {
    var s = p.serie, tomos = p.tomos || {};
    var total = Math.max(1, parseInt(s.total, 10) || 1), tengo = {}, t = [], f = [], lomos = "";
    (s.tengo || []).forEach(function (k) { tengo[k] = true; });
    for (var i = 1; i <= total; i++) {
      (tengo[i] ? t : f).push(i);
      var tomo = !tengo[i] && tomos[i];
      lomos += tomo
        ? '<a class="lomo' + (tomo.otraEdicion ? " otra" : "") + '" href="' + esc(urlSegura(tomo.link)) + '" target="_blank" rel="noopener" title="' +
          esc("Tomo " + i + ": " + (tomo.nombre || "") + (tomo.precio ? " · " + CLP.format(tomo.precio) : "") + (tomo.editorial ? " · " + tomo.editorial : "")) + '">' + i + "</a>"
        : '<span class="lomo' + (tengo[i] ? " tengo" : "") + '">' + i + "</span>";
    }
    var txt = !t.length ? "No tengo ninguno." : !f.length ? "Saga completa." :
      "Tengo " + rangos(t) + ". Me falta" + (f.length > 1 ? "n " : " ") + rangos(f) + ".";
    var sig = siguienteTomo(p), extra = "", k = packPrincipal(p);
    if (k) {
      extra = '<p class="siguiente">Pack con ' + (k.pack.cubre || k.total) + " tomos" + (k.pack.editorial ? " · " + esc(k.pack.editorial) : "") +
        (k.ahorro > 0 ? " · " + CLP.format(k.ahorro) + " menos que por separado" : "") + ". Los números llevan a cada tomo.</p>";
    } else if (sig) {
      extra = '<p class="siguiente">Siguiente: tomo ' + sig.n + (sig.t.editorial ? " · " + esc(sig.t.editorial) : "") +
        (sig.t.otraEdicion ? " <em>(otra edición)</em>" : "") + "</p>";
    }
    return "<p>" + esc(txt) + '</p><div class="lomos" aria-label="' + esc(txt) + '">' + lomos + "</div>" + extra;
  }

  // ---------- lámina ----------
  function fotoUrl(f) {
    f = fotoSegura(f);
    // En modo edición las fotos nuevas todavía no están en la página publicada: se leen del repo.
    if (f && edit.activo && GH && /^fotos\//.test(f)) return "https://raw.githubusercontent.com/" + GH.dueno + "/" + GH.repo + "/main/" + f;
    return f;
  }
  function tiendaCorta(p) {
    var t = String(p.tienda || "");
    if (!t) return "";
    if (/steampowered/.test(t)) return "Steam";
    return t.replace(/^(www|store|articulo|listado)\./, "").split(".")[0];
  }
  // Cada tipo tiene su carta: "juego" (cápsula apaisada de Steam), "libro" (portada vertical) y "cosa" (foto al tamaño que venga).
  function lamina(original, plano) {
    var p = efectivo(original), tipo = tipoDe(original);
    var foto = fotoUrl(p.foto), link = urlSegura(p.link), num = numero[original.id] || 0;
    var destacada = original.destacado && !plano;
    var nota = p.nota && !(tipo === "juego" && /^se regala desde steam\.?$/i.test(p.nota)) ? p.nota : "";
    var entrega = tipo === "juego" ? "" : entregaDe(p);
    var boton = tipo === "juego" ? "Regalar en Steam" : p._pack ? "Ver el pack" : p._sig ? "Tomo " + p._sig.n : "Dónde comprar";
    var etiqueta = estado.orden !== "categoria" ? nombreCat[catDe(original)] : tiendaCorta(p);
    var imagen;
    if (foto) imagen = '<div class="lamina-foto"><img src="' + esc(foto) + '" alt="' + esc(p.nombre) + '" loading="lazy"></div>';
    else if (tipo === "libro") imagen = '<div class="lamina-foto"><div class="tapa-falsa" aria-hidden="true"><b>' + esc(p.nombre) + "</b><span>" + esc(String(p.descripcion || "").replace(/\.$/, "")) + "</span></div></div>";
    else imagen = '<div class="lamina-foto sin-foto" aria-hidden="true"><span>' + num + "</span></div>";
    return '<article class="lamina ' + tipo + (destacada ? " destacada" : "") + (foto ? "" : " sin-imagen") + '">' +
      '<div class="lamina-num"><b>Nº ' + pad(num) + "</b>" + (destacada ? "<i>Brillante</i>" : "") +
      (edit.activo ? '<button type="button" class="editar-lamina" data-editar="' + esc(original.id) + '">Editar</button>' : "") + "</div>" +
      imagen +
      '<div class="lamina-cuerpo">' + (etiqueta ? '<span class="lamina-tienda">' + esc(etiqueta) + "</span>" : "") +
      "<h3>" + esc(p.nombre) + "</h3>" +
      (p.descripcion ? '<p class="desc">' + esc(p.descripcion) + "</p>" : "") +
      (p.serie ? serieHtml(original) : "") +
      (nota ? '<div class="nota">' + esc(nota) + "</div>" : "") +
      (entrega ? '<div class="entrega">Llega: ' + esc(entrega) + "</div>" : "") + "</div>" +
      '<div class="lamina-pie">' + precioHtml(p) +
      (link ? '<a class="ir" href="' + esc(link) + '" target="_blank" rel="noopener" title="' + esc(p.tienda || link) + '">' + boton + " ↗</a>" : "") +
      "</div></article>";
  }

  // ---------- filtros ----------
  var estado = { cat: "todas", rango: "todos", orden: "categoria" };
  try { var g = JSON.parse(localStorage.getItem("album-filtros") || "null"); if (g) estado = Object.assign(estado, g); } catch (e) {}
  function guardarEstado() { try { localStorage.setItem("album-filtros", JSON.stringify(estado)); } catch (e) {} }

  function filtrados() {
    return visibles.filter(function (p) {
      return (estado.cat === "todas" || catDe(p) === estado.cat) && enRango(p, estado.rango);
    });
  }
  function chip(grupo, id, texto, cuenta) {
    return '<button type="button" class="chip" data-grupo="' + grupo + '" data-id="' + esc(id) + '" aria-pressed="' + (estado[grupo] === id) + '">' +
      esc(texto) + (cuenta != null ? "<i>" + cuenta + "</i>" : "") + "</button>";
  }
  function pintarFiltros() {
    var todos = visibles;
    if (estado.cat !== "todas" && !todos.some(function (p) { return catDe(p) === estado.cat; })) estado.cat = "todas";
    var enCat = todos.filter(function (p) { return estado.cat === "todas" || catDe(p) === estado.cat; });
    var cCats = chip("cat", "todas", "Todas", todos.length) + cats.map(function (c) {
      var k = todos.filter(function (p) { return catDe(p) === c.id; }).length;
      return k ? chip("cat", c.id, c.nombre, k) : "";
    }).join("");
    var cPrecios = chip("rango", "todos", "Cualquier precio", null) + RANGOS.map(function (r) {
      var k = enCat.filter(function (p) { return enRango(p, r.id); }).length;
      return k || estado.rango === r.id ? chip("rango", r.id, r.nombre, k) : "";
    }).join("");
    $("filtros").innerHTML =
      '<div class="ancho"><div class="fila-filtros" role="group" aria-label="Categoría"><span>Categoría</span>' + cCats + "</div>" +
      '<div class="fila-filtros" role="group" aria-label="Precio"><span>Precio</span>' + cPrecios +
      '<label class="orden"><select id="orden" aria-label="Orden">' +
      '<option value="categoria">Por categoría</option><option value="barato">Más baratos primero</option><option value="caro">Más caros primero</option>' +
      "</select></label></div></div>";
    $("orden").value = estado.orden;
  }
  function pintarLaminas() {
    var lista = filtrados(), html = "";
    if (!lista.length) {
      html = '<p class="vacio">No hay láminas con esos filtros. Prueba con otro precio o categoría.</p>';
    } else if (estado.orden === "categoria") {
      cats.forEach(function (c) {
        var ps = deCategoria(c.id).filter(function (p) { return lista.indexOf(p) >= 0; });
        if (!ps.length) return;
        var juegos = ps.every(function (p) { return tipoDe(p) === "juego"; });
        var libros = ps.every(function (p) { return tipoDe(p) === "libro"; });
        var carrusel = juegos && ps.length >= 4;
        var atajo = D.productos.filter(function (p) { return catDe(p) === c.id && visibles.indexOf(p) < 0; })[0];
        html += '<section class="categoria" id="cat-' + esc(c.id) + '"><div class="categoria-cab"><h2>' + esc(c.nombre) +
          "</h2><span>" + pad(ps.length, 2) + (ps.length === 1 ? " lámina" : " láminas") + "</span>" +
          (atajo ? '<a class="cab-link" href="' + esc(urlSegura(atajo.link)) + '" target="_blank" rel="noopener">Ver mi lista completa en Steam ↗</a>' : "") +
          (carrusel ? '<span class="flechas"><button type="button" class="flecha" data-mover="-1" aria-label="Juegos anteriores">←</button>' +
            '<button type="button" class="flecha" data-mover="1" aria-label="Juegos siguientes">→</button></span>' : "") + "</div>" +
          '<div class="' + (carrusel ? "carrusel" : "grilla" + (libros ? " de-libros" : "")) + '"' + (carrusel ? ' tabindex="0"' : "") + ">" +
          ps.map(function (p) { return lamina(p, carrusel); }).join("") + "</div></section>";
      });
    } else {
      var ord = lista.slice().sort(porPrecio(estado.orden === "caro" ? -1 : 1));
      html = '<section class="categoria"><div class="categoria-cab"><h2>' + (estado.orden === "caro" ? "De más a menos" : "De menos a más") +
        "</h2><span>" + pad(ord.length, 2) + " láminas · ordenadas por precio</span></div>" +
        '<div class="grilla">' + ord.map(function (p) { return lamina(p, true); }).join("") + "</div></section>";
    }
    $("laminas").innerHTML = html;
  }

  // ---------- página ----------
  function fecha(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "";
    return pad(d.getDate(), 2) + "." + pad(d.getMonth() + 1, 2) + "." + d.getFullYear();
  }
  function barraEdicion() {
    if (!edit.activo) return "";
    return '<div class="edicion"><div class="ancho">' +
      '<form id="formLink" class="edicion-form"><label for="nuevoLink">Agregar desde un link</label>' +
      '<div class="edicion-fila"><input id="nuevoLink" type="url" placeholder="https://tienda.cl/producto…" required autocomplete="off">' +
      '<button type="submit">Agregar</button><button type="button" id="nuevoManual" class="sec">Sin link</button>' +
      '<button type="button" id="cambiarLlave" class="sec">Cambiar llave</button>' +
      '<button type="button" id="salirEdicion" class="sec">Salir</button></div></form>' +
      '<p id="estadoEdicion" role="status">' + esc(edit.mensaje || "Modo edición. Los cambios se guardan en GitHub y la página pública se actualiza en 1 a 2 minutos.") + "</p>" +
      (edit.pendientes.length ? '<ul class="pendientes">' + edit.pendientes.map(function (x) {
        return "<li>" + (x.fallo ? "No se pudo agregar: " : "Leyendo… ") + esc(x.url) + "</li>";
      }).join("") + "</ul>" : "") +
      "</div></div>";
  }
  function pintarTodo() {
    preparar();
    var precios = visibles.map(enPesos).filter(function (v) { return v != null; });
    var desde = precios.length ? CLP.format(Math.min.apply(null, precios)) : "—";
    raiz.innerHTML =
      '<header class="portada"><div class="ancho">' +
      '<div class="portada-sup"><span>Álbum de cumpleaños</span><span>Temporada ' + esc(D.temporada) + "</span></div>" +
      '<span class="dorsal" aria-hidden="true">' + esc(D.numero) + "</span>" +
      "<h1><small>El álbum de</small>" + esc(D.nombre) + "</h1>" +
      '<div class="portada-inf"><p>' + esc(D.intro) + "</p>" +
      '<div class="marcador"><div><b>' + pad(visibles.length, 2) + "</b><span>Láminas</span></div>" +
      "<div><b>" + pad(cats.length, 2) + "</b><span>Categorías</span></div>" +
      "<div><b>" + desde + "</b><span>Regalos desde</span></div></div></div>" +
      "</div></header>" +
      barraEdicion() +
      '<nav class="filtros" id="filtros" aria-label="Filtros"></nav>' +
      '<main class="ancho" id="laminas"></main>' +
      '<footer><div class="ancho"><span>El álbum de ' + esc(D.nombre) + " · Nº " + esc(D.numero) + "</span>" +
      (D.actualizado ? "<span>Actualizado " + fecha(D.actualizado) + "</span>" : "") +
      "<span>US$1 = " + CLP.format(Number(D.tasaUSD) || 950) + "</span>" +
      (GH && !edit.activo ? '<button type="button" id="entrarEdicion" class="entrar-edicion">Editar</button>' : "") +
      "</div></footer>";
    pintarFiltros();
    pintarLaminas();
    if (D.nombre) document.title = "El álbum de " + D.nombre;
  }

  // ---------- API de GitHub ----------
  function aBase64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function textoDeBase64(b) {
    var bin = atob(String(b).replace(/\s/g, "")), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(u);
  }
  function gh(ruta, metodo, cuerpo) {
    return fetch(GH.api + ruta, {
      method: metodo || "GET",
      cache: "no-store",
      headers: { Authorization: "Bearer " + edit.llave, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    }).then(function (r) {
      if (r.status === 204) return {};
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ("Error " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function explicarError(e) {
    if (e.status === 401) return "La llave no sirve o venció. Sal del modo edición y pon una nueva.";
    if (e.status === 403 || e.status === 404) return "La llave no tiene permiso de escritura en el repo «" + GH.repo + "». Crea una nueva con Repository access → «Only select repositories» → " + GH.repo + ", y en Repository permissions: Contents y Actions en «Read and write». Después toca «Cambiar llave» y pégala. (GitHub dijo: " + e.message + ")";
    return e.message;
  }
  function leerRemoto() {
    return gh("/contents/datos.js?ref=main").then(function (j) {
      var t = textoDeBase64(j.content);
      return { datos: JSON.parse(t.replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, "")), sha: j.sha };
    });
  }
  // Lee lo último del repo, aplica el cambio y guarda. Si alguien guardó entremedio, reintenta.
  function guardarCambio(mutar, mensaje, intento) {
    intento = intento || 1;
    return leerRemoto().then(function (r) {
      mutar(r.datos);
      r.datos.actualizado = new Date().toISOString();
      var texto = "window.DATOS = " + JSON.stringify(r.datos, null, 2) + ";\n";
      return gh("/contents/datos.js", "PUT", { message: mensaje, content: aBase64(new TextEncoder().encode(texto)), sha: r.sha, branch: "main" })
        .then(function () { D = r.datos; });
    }).catch(function (e) {
      if ((e.status === 409 || e.status === 422) && intento < 4) return guardarCambio(mutar, mensaje, intento + 1);
      throw e;
    });
  }
  function subirFoto(archivo, nombre) {
    return createImageBitmap(archivo).then(function (bmp) {
      var k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      var x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (ok) { c.toBlob(ok, "image/jpeg", 0.86); });
    }).then(function (blob) { return blob.arrayBuffer(); }).then(function (buf) {
      var slug = String(nombre || "foto").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";
      var ruta = "fotos/" + slug + "-" + Date.now().toString(36) + ".jpg";
      return gh("/contents/" + ruta, "PUT", { message: "Subir foto", content: aBase64(new Uint8Array(buf)), branch: "main" })
        .then(function () { return ruta; });
    });
  }

  function mensaje(t) {
    edit.mensaje = t;
    var e = $("estadoEdicion");
    if (e) e.textContent = t;
  }

  // ---------- entrar y salir ----------
  function abrirDialogo(html, alAbrir) {
    var d = $("dialogo");
    if (!d) { d = document.createElement("dialog"); d.id = "dialogo"; d.className = "dialogo"; document.body.appendChild(d); }
    d.innerHTML = html;
    d.querySelectorAll("[data-cerrar]").forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    if (alAbrir) alAbrir(d);
    d.showModal();
    return d;
  }
  function entrarEdicion() {
    if (edit.llave) return activarEdicion();
    abrirDialogo(
      '<form id="formLlave" class="dlg-cuerpo"><h2>Llave de GitHub</h2>' +
      "<p>Para editar desde aquí, la página necesita una llave tuya con permiso sobre el repo <b>" + esc(GH.dueno + "/" + GH.repo) + "</b>. Se crea una sola vez:</p>" +
      '<ol><li>Abre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → nueva llave ↗</a>.</li>' +
      "<li><b>Token name</b>: album. <b>Expiration</b>: la que quieras (por ejemplo, 1 año).</li>" +
      "<li><b>Repository access</b>: cambia «Public repositories» por <b>Only select repositories</b> y elige <b>" + esc(GH.repo) + "</b>. (Si queda en «Public repositories», la llave solo puede leer.)</li>" +
      "<li>Abajo aparece <b>Permissions → Repositories → Add permissions</b>: agrega <b>Contents</b> y <b>Actions</b>, y deja ambos en <b>Read and write</b>.</li>" +
      "<li><b>Generate token</b>, cópiala y pégala aquí.</li></ol>" +
      '<label for="llave">Llave</label><input id="llave" type="password" autocomplete="off" required placeholder="github_pat_…">' +
      '<p class="dlg-nota">Queda guardada solo en este navegador. Úsala en tus equipos.</p>' +
      '<p id="errLlave" class="dlg-error" role="alert"></p>' +
      '<div class="dlg-botones"><button type="button" class="sec" data-cerrar>Cancelar</button><button type="submit">Entrar</button></div></form>',
      function (d) {
        d.querySelector("#formLlave").addEventListener("submit", function (ev) {
          ev.preventDefault();
          var v = d.querySelector("#llave").value.trim(), err = d.querySelector("#errLlave");
          err.textContent = "Probando la llave…";
          edit.llave = v;
          gh("").then(function (repo) {
            if (repo.permissions && !repo.permissions.push) throw Object.assign(new Error(""), { status: 403 });
            try { localStorage.setItem("album-llave", v); } catch (e) {}
            d.close();
            activarEdicion();
          }).catch(function (e) { edit.llave = null; err.textContent = explicarError(e); });
        });
      });
  }
  function activarEdicion() {
    edit.activo = true;
    edit.mensaje = "Cargando lo último del repo…";
    pintarTodo();
    leerRemoto().then(function (r) {
      D = r.datos;
      edit.mensaje = "";
      pintarTodo();
    }).catch(function (e) {
      if (e.status === 401) { try { localStorage.removeItem("album-llave"); } catch (x) {} edit.llave = null; }
      mensaje(explicarError(e));
    });
  }
  function salirEdicion() { edit.activo = false; edit.mensaje = ""; pintarTodo(); }

  // ---------- agregar ----------
  function agregarLink(url, para) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    var pend = { url: url, desde: Date.now(), steam: /steam(powered|community)\.com\/wishlist\//i.test(url) };
    edit.pendientes.push(pend);
    mensaje(pend.steam ? "Pedí a GitHub que lea tu lista de Steam. Los juegos aparecen en 1 a 2 minutos."
      : "Pedí a GitHub que lea el link. Aparece aquí en 1 a 2 minutos.");
    pintarTodo();
    gh("/actions/workflows/agregar.yml/dispatches", "POST", { ref: "main", inputs: { url: url, para: para || "" } })
      .then(function () { esperar(pend); })
      .catch(function (e) { pend.fallo = true; mensaje(explicarError(e)); pintarTodo(); });
  }
  function esperar(pend) {
    setTimeout(function () {
      leerRemoto().then(function (r) {
        var p = r.datos.productos.filter(function (x) {
          return x.origen === pend.url || x.link === pend.url || (x.linea && x.linea.origen === pend.url);
        })[0];
        if (pend.steam && r.datos.actualizado && new Date(r.datos.actualizado).getTime() > pend.desde && r.datos.steam) {
          p = { nombre: "tu lista de Steam (" + r.datos.productos.filter(function (x) { return x.fuente === "steam"; }).length + " juegos)" };
        }
        if (p) {
          D = r.datos;
          edit.pendientes = edit.pendientes.filter(function (x) { return x !== pend; });
          mensaje("Agregado: " + p.nombre + ". Revisa la categoría y el precio con «Editar».");
          pintarTodo();
        } else if (Date.now() - pend.desde > 4 * 60 * 1000) {
          pend.fallo = true;
          mensaje("Se demoró demasiado. Mira el detalle en GitHub → Actions del repo.");
          pintarTodo();
        } else esperar(pend);
      }).catch(function () { esperar(pend); });
    }, 10000);
  }
  function agregarManual() {
    var p = { id: "p" + Date.now().toString(36), categoria: (cats.filter(function (c) { return c.id === "varios"; })[0] || cats[0] || {}).id || "",
      nombre: "Algo nuevo", descripcion: "", nota: "", precio: null, moneda: "CLP", link: "", tienda: "", foto: "" };
    editarProducto(p, true);
  }

  // ---------- editar una lámina ----------
  function editarProducto(p, esNuevo) {
    var opcionesCat = D.categorias.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === p.categoria ? " selected" : "") + ">" + esc(c.nombre) + "</option>";
    }).join("") + '<option value="__nueva">+ Nueva categoría…</option>';
    var serie = p.serie || { total: 3, tengo: [] };
    abrirDialogo(
      '<form id="formProd" class="dlg-cuerpo"><h2>' + (esNuevo ? "Nueva lámina" : "Editar lámina") + "</h2>" +
      '<div class="dlg-grid">' +
      '<div class="dlg-foto">' + (fotoUrl(p.foto) ? '<img id="vistaFoto" src="' + esc(fotoUrl(p.foto)) + '" alt="">' : '<div id="vistaFoto" class="sin">Sin foto</div>') +
      '<label class="boton-archivo">Cambiar foto<input id="fFoto" type="file" accept="image/*"></label>' +
      (p.foto ? '<label class="check"><input id="fSinFoto" type="checkbox"> Quitar foto</label>' : "") + "</div>" +
      '<div class="dlg-campos">' +
      '<label for="fNombre">Nombre</label><input id="fNombre" type="text" required value="' + esc(p.nombre) + '">' +
      '<label for="fDesc">Descripción</label><textarea id="fDesc" rows="3">' + esc(p.descripcion) + "</textarea>" +
      '<label for="fNota">Nota para quien regala</label><input id="fNota" type="text" placeholder="Talla, color…" value="' + esc(p.nota) + '">' +
      '<div class="dlg-dos"><div><label for="fPrecio">Precio</label><input id="fPrecio" type="number" min="0" step="any" placeholder="Sin precio" value="' + (sinPrecio(p) ? "" : esc(p.precio)) + '"></div>' +
      '<div><label for="fMoneda">Moneda</label><select id="fMoneda"><option' + (p.moneda !== "USD" ? " selected" : "") + '>CLP</option><option' + (p.moneda === "USD" ? " selected" : "") + ">USD</option></select></div></div>" +
      '<label for="fCat">Categoría</label><select id="fCat">' + opcionesCat + "</select>" +
      '<input id="fCatNueva" type="text" placeholder="Nombre de la nueva categoría" hidden>' +
      '<label for="fLink">Link de compra</label><input id="fLink" type="url" placeholder="https://…" value="' + esc(p.link) + '">' +
      '<label class="check"><input id="fDest" type="checkbox"' + (p.destacado ? " checked" : "") + "> Destacada (lámina doble)</label>" +
      '<label class="check"><input id="fSerie" type="checkbox"' + (p.serie ? " checked" : "") + "> Es una saga de libros</label>" +
      '<div id="cajaSerie"' + (p.serie ? "" : " hidden") + '><label for="fTotal">Cuántos libros son</label><input id="fTotal" type="number" min="1" value="' + esc(serie.total) + '">' +
      '<label for="fTengo">Cuáles tengo (números separados por coma)</label><input id="fTengo" type="text" value="' + esc((serie.tengo || []).join(", ")) + '">' +
      '<label for="fBl">Link de un tomo en Buscalibre, de tu edición</label><input id="fBl" type="url" placeholder="https://www.buscalibre.cl/libro-…" value="' + esc(p.linea ? p.linea.origen : "") + '">' +
      '<p class="dlg-nota">Con ese link busco los demás tomos de la misma línea y editorial, con portada y precio.</p></div>' +
      "</div></div>" +
      '<p id="errProd" class="dlg-error" role="alert"></p>' +
      '<div class="dlg-botones">' + (esNuevo ? "" : '<button type="button" id="borrarProd" class="peligro">Borrar</button><span class="espacio"></span>') +
      '<button type="button" class="sec" data-cerrar>Cancelar</button><button type="submit" id="guardarProd">Guardar</button></div></form>',
      function (d) {
        var q = function (s) { return d.querySelector(s); };
        q("#fCat").addEventListener("change", function () { q("#fCatNueva").hidden = q("#fCat").value !== "__nueva"; });
        q("#fSerie").addEventListener("change", function () { q("#cajaSerie").hidden = !q("#fSerie").checked; });
        q("#fFoto").addEventListener("change", function () {
          var f = q("#fFoto").files[0];
          if (!f) return;
          var v = q("#vistaFoto"), img = document.createElement("img");
          img.id = "vistaFoto"; img.alt = ""; img.src = URL.createObjectURL(f);
          v.replaceWith(img);
        });
        var borrar = q("#borrarProd"), confirmar = false;
        if (borrar) borrar.addEventListener("click", function () {
          if (!confirmar) { confirmar = true; borrar.textContent = "¿Seguro? Clic otra vez"; return; }
          borrar.disabled = true; q("#errProd").textContent = "Borrando…";
          guardarCambio(function (datos) { datos.productos = datos.productos.filter(function (x) { return x.id !== p.id; }); }, "Borrar lámina: " + p.nombre)
            .then(function () { d.close(); mensaje("Borrada: " + p.nombre + "."); pintarTodo(); })
            .catch(function (e) { borrar.disabled = false; q("#errProd").textContent = explicarError(e); });
        });
        q("#formProd").addEventListener("submit", function (ev) {
          ev.preventDefault();
          var boton = q("#guardarProd"); boton.disabled = true;
          q("#errProd").textContent = "Guardando…";
          var nuevaCat = null, cat = q("#fCat").value;
          if (cat === "__nueva") {
            var nom = q("#fCatNueva").value.trim();
            if (!nom) { q("#errProd").textContent = "Escribe el nombre de la nueva categoría."; boton.disabled = false; return; }
            nuevaCat = { id: "c" + Date.now().toString(36), nombre: nom, pistas: "" };
            cat = nuevaCat.id;
          }
          var link = q("#fLink").value.trim();
          var cambios = {
            nombre: q("#fNombre").value.trim() || "Sin nombre",
            descripcion: q("#fDesc").value.trim(),
            nota: q("#fNota").value.trim(),
            precio: q("#fPrecio").value === "" ? null : Number(q("#fPrecio").value),
            moneda: q("#fMoneda").value,
            categoria: cat,
            link: link,
            tienda: link ? (function () { try { return new URL(urlSegura(link)).hostname.replace(/^www\./, ""); } catch (e) { return ""; } })() : "",
            destacado: q("#fDest").checked
          };
          var conSerie = q("#fSerie").checked;
          var tot = Math.max(1, parseInt(q("#fTotal").value, 10) || 1);
          var tengo = q("#fTengo").value.split(/[^0-9]+/).map(Number).filter(function (n) { return n >= 1 && n <= tot; });
          var archivo = q("#fFoto").files[0];
          var quitar = q("#fSinFoto") && q("#fSinFoto").checked;
          (archivo ? subirFoto(archivo, cambios.nombre) : Promise.resolve(null)).then(function (ruta) {
            if (ruta) cambios.foto = ruta; else if (quitar) cambios.foto = "";
            return guardarCambio(function (datos) {
              if (nuevaCat) datos.categorias.push(nuevaCat);
              var actual = datos.productos.filter(function (x) { return x.id === p.id; })[0];
              if (!actual) { actual = Object.assign({}, p); datos.productos.unshift(actual); }
              Object.assign(actual, cambios);
              if (conSerie) actual.serie = { total: tot, tengo: tengo.filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(function (a, b) { return a - b; }) };
              else delete actual.serie;
            }, (esNuevo ? "Nueva lámina: " : "Editar lámina: ") + cambios.nombre);
          }).then(function () {
            d.close();
            mensaje("Guardado: " + cambios.nombre + ". La página pública se actualiza en 1 a 2 minutos.");
            pintarTodo();
            var bl = conSerie ? q("#fBl").value.trim() : "";
            if (bl && bl !== (p.linea ? p.linea.origen : "")) agregarLink(bl, p.id);
          }).catch(function (e) { boton.disabled = false; q("#errProd").textContent = explicarError(e); });
        });
      });
  }

  // ---------- eventos ----------
  raiz.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.classList.contains("chip")) {
      estado[b.getAttribute("data-grupo")] = b.getAttribute("data-id");
      if (b.getAttribute("data-grupo") === "cat") estado.rango = "todos";
      guardarEstado(); pintarFiltros(); pintarLaminas();
    } else if (b.classList.contains("flecha")) {
      var car = b.closest(".categoria").querySelector(".carrusel");
      if (car) car.scrollBy({ left: Number(b.getAttribute("data-mover")) * car.clientWidth * 0.85, behavior: "smooth" });
    } else if (b.id === "entrarEdicion") entrarEdicion();
    else if (b.id === "salirEdicion") salirEdicion();
    else if (b.id === "cambiarLlave") {
      try { localStorage.removeItem("album-llave"); } catch (x) {}
      edit.llave = null;
      salirEdicion();
      entrarEdicion();
    }
    else if (b.id === "nuevoManual") agregarManual();
    else if (b.hasAttribute("data-editar")) {
      var p = D.productos.filter(function (x) { return x.id === b.getAttribute("data-editar"); })[0];
      if (p) editarProducto(p, false);
    }
  });
  raiz.addEventListener("change", function (e) {
    if (e.target.id !== "orden") return;
    estado.orden = e.target.value;
    guardarEstado(); pintarLaminas();
  });
  raiz.addEventListener("submit", function (e) {
    if (e.target.id !== "formLink") return;
    e.preventDefault();
    var v = $("nuevoLink").value;
    if (v.trim()) agregarLink(v);
  });

  pintarTodo();
})();
