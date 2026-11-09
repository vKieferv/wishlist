// Arma el álbum a partir de window.DATOS, con filtros por categoría y precio.
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

  // ---------- precios ----------
  var CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  function enPesos(p) {
    if (p.precio === null || p.precio === "" || p.precio === undefined) return null;
    var n = Number(p.precio);
    if (!isFinite(n)) return null;
    var m = String(p.moneda || "CLP").toUpperCase();
    if (m === "CLP") return n;
    if (m === "USD") return n * (Number(D.tasaUSD) || 950);
    return null;
  }
  function precioHtml(p) {
    var v = enPesos(p), m = String(p.moneda || "CLP").toUpperCase();
    if (p.precio === null || p.precio === "" || p.precio === undefined) return '<span class="precio sin">Sin precio</span>';
    if (m === "CLP") return '<span class="precio">' + CLP.format(Number(p.precio)) + "</span>";
    var entero = Number(p.precio) % 1 === 0;
    var txt = (m === "USD" ? "US$ " : m + " ") + Number(p.precio).toLocaleString("es-CL", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 });
    return '<span class="precio">' + esc(txt) + (v != null ? "<small>≈ " + CLP.format(Math.round(v / 100) * 100) + "</small>" : "") + "</span>";
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

  // ---------- categorías y numeración fija ----------
  var cats = (D.categorias || []).slice();
  var idsCat = cats.map(function (c) { return c.id; });
  if ((D.productos || []).some(function (p) { return idsCat.indexOf(p.categoria) < 0; })) cats.push({ id: "__otros", nombre: "Otros" });
  function catDe(p) { return idsCat.indexOf(p.categoria) >= 0 ? p.categoria : "__otros"; }
  function deCategoria(id) {
    return (D.productos || []).filter(function (p) { return catDe(p) === id; })
      .sort(function (a, b) { return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) || porPrecio(1)(a, b); });
  }
  var numero = {}, n = 0;
  cats.forEach(function (c) { deCategoria(c.id).forEach(function (p) { numero[p.id] = ++n; }); });
  var nombreCat = {};
  cats.forEach(function (c) { nombreCat[c.id] = c.nombre; });

  // ---------- sagas ----------
  function rangos(ns) {
    var g = [];
    ns.forEach(function (k) { var u = g[g.length - 1]; if (u && k === u[1] + 1) u[1] = k; else g.push([k, k]); });
    var t = g.map(function (r) { return r[0] === r[1] ? "el " + r[0] : "del " + r[0] + " al " + r[1]; });
    return t.length > 1 ? t.slice(0, -1).join(", ") + " y " + t[t.length - 1] : t[0];
  }
  function serieHtml(s) {
    var total = Math.max(1, parseInt(s.total, 10) || 1), tengo = {}, t = [], f = [], lomos = "";
    (s.tengo || []).forEach(function (k) { tengo[k] = true; });
    for (var i = 1; i <= total; i++) {
      (tengo[i] ? t : f).push(i);
      lomos += '<span class="lomo' + (tengo[i] ? " tengo" : "") + '">' + i + "</span>";
    }
    var txt = !t.length ? "No tengo ninguno." : !f.length ? "Saga completa." :
      "Tengo " + rangos(t) + ". Me falta" + (f.length > 1 ? "n " : " ") + rangos(f) + ".";
    return '<p>' + esc(txt) + '</p><div class="lomos" aria-label="' + esc(txt) + '">' + lomos + "</div>";
  }

  // ---------- lámina ----------
  function lamina(p) {
    var foto = fotoSegura(p.foto), link = urlSegura(p.link), num = numero[p.id] || 0;
    return '<article class="lamina' + (p.destacado ? " destacada" : "") + '">' +
      '<div class="lamina-sup"><b>Nº ' + pad(num) + "</b><span>" + esc(nombreCat[catDe(p)] || "") + "</span></div>" +
      (foto ? '<div class="lamina-foto"><img src="' + esc(foto) + '" alt="' + esc(p.nombre) + '" loading="lazy"></div>'
            : '<div class="lamina-foto sin-foto" aria-hidden="true"><span>' + num + "</span></div>") +
      '<div class="lamina-cuerpo"><h3>' + esc(p.nombre) + "</h3>" +
      (p.descripcion ? "<p>" + esc(p.descripcion) + "</p>" : "") +
      (p.serie ? serieHtml(p.serie) : "") +
      (p.nota ? '<div class="nota">' + esc(p.nota) + "</div>" : "") + "</div>" +
      '<div class="lamina-pie">' + precioHtml(p) +
      (link ? '<a class="ir" href="' + esc(link) + '" target="_blank" rel="noopener" title="' + esc(p.tienda || link) + '">Dónde comprar ↗</a>' : "") +
      "</div></article>";
  }

  // ---------- estado ----------
  var estado = { cat: "todas", rango: "todos", orden: "categoria" };
  try { var g = JSON.parse(localStorage.getItem("album-filtros") || "null"); if (g) estado = Object.assign(estado, g); } catch (e) {}

  function filtrados() {
    return (D.productos || []).filter(function (p) {
      return (estado.cat === "todas" || catDe(p) === estado.cat) && enRango(p, estado.rango);
    });
  }

  function chip(grupo, id, texto, cuenta) {
    var activo = estado[grupo] === id;
    return '<button type="button" class="chip" data-grupo="' + grupo + '" data-id="' + esc(id) + '" aria-pressed="' + activo + '">' +
      esc(texto) + (cuenta != null ? "<i>" + cuenta + "</i>" : "") + "</button>";
  }

  function pintarFiltros() {
    var todos = D.productos || [];
    var enCat = todos.filter(function (p) { return estado.cat === "todas" || catDe(p) === estado.cat; });
    var cCats = chip("cat", "todas", "Todas", todos.length) + cats.map(function (c) {
      var k = todos.filter(function (p) { return catDe(p) === c.id; }).length;
      return k ? chip("cat", c.id, c.nombre, k) : "";
    }).join("");
    var cPrecios = chip("rango", "todos", "Cualquier precio", null) + RANGOS.map(function (r) {
      var k = enCat.filter(function (p) { return enRango(p, r.id); }).length;
      return k || estado.rango === r.id ? chip("rango", r.id, r.nombre, k) : "";
    }).join("");
    document.getElementById("filtros").innerHTML =
      '<div class="ancho"><div class="fila-filtros" role="group" aria-label="Categoría"><span>Categoría</span>' + cCats + "</div>" +
      '<div class="fila-filtros" role="group" aria-label="Precio"><span>Precio</span>' + cPrecios +
      '<label class="orden"><span class="sr">Orden</span><select id="orden" aria-label="Orden">' +
      '<option value="categoria">Por categoría</option><option value="barato">Más baratos primero</option><option value="caro">Más caros primero</option>' +
      "</select></label></div></div>";
    document.getElementById("orden").value = estado.orden;
  }

  function pintarLaminas() {
    var lista = filtrados(), html = "";
    if (!lista.length) {
      html = '<p class="vacio">No hay láminas con esos filtros. Prueba con otro precio o categoría.</p>';
    } else if (estado.orden === "categoria") {
      cats.forEach(function (c) {
        var ps = deCategoria(c.id).filter(function (p) { return lista.indexOf(p) >= 0; });
        if (!ps.length) return;
        html += '<section class="categoria" id="cat-' + esc(c.id) + '"><div class="categoria-cab"><h2>' + esc(c.nombre) +
          "</h2><span>" + pad(ps.length, 2) + (ps.length === 1 ? " lámina" : " láminas") + "</span></div>" +
          '<div class="grilla">' + ps.map(lamina).join("") + "</div></section>";
      });
    } else {
      var ord = lista.slice().sort(porPrecio(estado.orden === "caro" ? -1 : 1));
      html = '<section class="categoria"><div class="categoria-cab"><h2>' + (estado.orden === "caro" ? "De más a menos" : "De menos a más") +
        "</h2><span>" + pad(ord.length, 2) + " láminas · ordenadas por precio</span></div>" +
        '<div class="grilla">' + ord.map(function (p) { return lamina(Object.assign({}, p, { destacado: false })); }).join("") + "</div></section>";
    }
    document.getElementById("laminas").innerHTML = html;
  }

  function guardarEstado() { try { localStorage.setItem("album-filtros", JSON.stringify(estado)); } catch (e) {} }

  // ---------- portada ----------
  function fecha(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "";
    return pad(d.getDate(), 2) + "." + pad(d.getMonth() + 1, 2) + "." + d.getFullYear();
  }
  var conPrecio = (D.productos || []).filter(function (p) { return enPesos(p) != null; }).length;
  raiz.innerHTML =
    '<header class="portada"><div class="ancho">' +
    '<div class="portada-sup"><span>Álbum de cumpleaños</span><span>Temporada ' + esc(D.temporada) + "</span></div>" +
    '<span class="dorsal" aria-hidden="true">' + esc(D.numero) + "</span>" +
    "<h1><small>El álbum de</small>" + esc(D.nombre) + "</h1>" +
    '<div class="portada-inf"><p>' + esc(D.intro) + "</p>" +
    '<div class="marcador"><div><b>' + pad((D.productos || []).length, 2) + "</b><span>Láminas</span></div>" +
    "<div><b>" + pad(cats.length, 2) + "</b><span>Categorías</span></div>" +
    "<div><b>" + pad(conPrecio, 2) + "</b><span>Con precio</span></div></div></div>" +
    "</div></header>" +
    '<nav class="filtros" id="filtros" aria-label="Filtros"></nav>' +
    '<main class="ancho" id="laminas"></main>' +
    '<footer><div class="ancho"><span>El álbum de ' + esc(D.nombre) + " · Nº " + esc(D.numero) + "</span>" +
    (D.actualizado ? "<span>Actualizado " + fecha(D.actualizado) + "</span>" : "") +
    "<span>Precios en dólares convertidos a US$1 = " + CLP.format(Number(D.tasaUSD) || 950) + "</span></div></footer>";

  document.getElementById("filtros").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    estado[b.getAttribute("data-grupo")] = b.getAttribute("data-id");
    if (b.getAttribute("data-grupo") === "cat") estado.rango = "todos";
    guardarEstado(); pintarFiltros(); pintarLaminas();
  });
  document.getElementById("filtros").addEventListener("change", function (e) {
    if (e.target.id !== "orden") return;
    estado.orden = e.target.value;
    guardarEstado(); pintarLaminas();
  });
  if (D.nombre) document.title = "El álbum de " + D.nombre;
  pintarFiltros();
  pintarLaminas();
})();
