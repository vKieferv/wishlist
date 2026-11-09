// Arma el HTML de la revista a partir de window.DATOS. Lo usan index.html y editor.html.
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // *texto* -> cursiva roja
  function enfasis(s) { return esc(s).replace(/\*(.+?)\*/g, "<em>$1</em>"); }
  function limpiarUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    return /^https?:\/\//i.test(u) ? u : "https://" + u;
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  function enlaces(ls) {
    ls = (ls || []).filter(function (l) { return l && String(l.url || "").trim(); });
    if (!ls.length) return "";
    return '<div class="enlaces">' + ls.map(function (l) {
      return '<a class="boton" href="' + esc(limpiarUrl(l.url)) + '" target="_blank" rel="noopener">' +
        esc(l.texto || "Dónde comprar") + ' ↗</a>';
    }).join("") + "</div>";
  }

  function foto(ruta, res, clase) {
    if (!ruta) return "";
    return '<img class="' + clase + '" src="' + esc(res(ruta)) + '" alt="" loading="lazy">';
  }

  function ficha(it, res) {
    var visual = "";
    if (it.foto) visual = foto(it.foto, res, "ficha-foto");
    else if (it.dorsal && (it.dorsal.nombre || it.dorsal.numero)) {
      visual = '<div class="dorsal" aria-hidden="true"><span class="nombre">' + esc(it.dorsal.nombre) +
        '</span><span class="n13">' + esc(it.dorsal.numero) + "</span></div>";
    }
    var det = (it.detalles || []).filter(function (d) { return d.clave || d.valor; });
    return '<div class="ficha' + (visual ? "" : " sin-visual") + '">' +
      (visual ? '<div class="ficha-visual">' + visual + "</div>" : "") +
      "<div>" +
      (it.etiqueta ? '<span class="etiqueta roja">' + esc(it.etiqueta) + "</span>" : "") +
      '<h3 class="ficha-titulo">' + esc(it.titulo) + "</h3>" +
      (it.descripcion ? '<p class="ficha-desc">' + esc(it.descripcion) + "</p>" : "") +
      (det.length ? "<dl>" + det.map(function (d) {
        return "<dt>" + esc(d.clave) + "</dt><dd>" + esc(d.valor) + "</dd>";
      }).join("") + "</dl>" : "") +
      enlaces(it.links) + "</div></div>";
  }

  function tarjeta(it, res) {
    return '<article class="item">' + foto(it.foto, res, "item-foto") +
      (it.etiqueta ? '<span class="etiqueta">' + esc(it.etiqueta) + "</span>" : "") +
      "<h3>" + esc(it.titulo) + "</h3>" +
      (it.descripcion ? "<p>" + esc(it.descripcion) + "</p>" : "") +
      enlaces(it.links) + "</article>";
  }

  // [1,2,3,5] -> "del 1 al 3 y el 5"
  function rangos(ns) {
    var g = [];
    ns.forEach(function (n) {
      var u = g[g.length - 1];
      if (u && n === u[1] + 1) u[1] = n; else g.push([n, n]);
    });
    var t = g.map(function (r) { return r[0] === r[1] ? "el " + r[0] : "del " + r[0] + " al " + r[1]; });
    return t.length > 1 ? t.slice(0, -1).join(", ") + " y " + t[t.length - 1] : t[0];
  }

  function saga(s) {
    var total = Math.max(1, parseInt(s.total, 10) || 1);
    var tengo = {};
    (s.tengo || []).forEach(function (n) { tengo[n] = true; });
    var t = [], f = [], lomos = "";
    for (var i = 1; i <= total; i++) {
      if (tengo[i]) t.push(i); else f.push(i);
      lomos += '<span class="lomo ' + (tengo[i] ? "tengo" : "falta") + '">' + i + "</span>";
    }
    var resumen;
    if (total === 1) resumen = t.length ? "Ya lo tengo." : "No lo tengo.";
    else if (!t.length) resumen = "No tengo ninguno.";
    else if (!f.length) resumen = "¡Saga completa!";
    else resumen = "Tengo " + rangos(t) + ". Me falta" + (f.length > 1 ? "n " : " ") + rangos(f) + ".";
    return '<div class="saga"><div><h3>' + esc(s.titulo) + "</h3>" +
      '<div class="autor">' + esc(s.autor) + (s.autor ? " · " : "") + total + (total === 1 ? " libro" : " libros") + "</div>" +
      '<div class="nota">' + esc(resumen) + (s.nota ? " " + esc(s.nota) : "") + "</div>" +
      enlaces(s.links) + "</div>" +
      '<div class="lomos" aria-label="' + esc(resumen) + '">' + lomos + "</div></div>";
  }

  function seccion(s, i, res) {
    var id = "s" + (i + 1), num = pad(i + 1);
    if (s.tipo === "premio") {
      return '<section class="premio" id="' + id + '"><div class="rotulo">' + num + " · " + esc(s.titulo) + "</div>" +
        "<h2>" + esc(s.grande) + "</h2><p>" + enfasis(s.texto) + "</p>" + enlaces(s.links) + "</section>";
    }
    var cab = '<div class="seccion-cab"><span class="num">' + num + "</span><h2>" + esc(s.titulo) + "</h2>" +
      (s.pie ? '<span class="pie">' + esc(s.pie) + "</span>" : "") + "</div>";
    var cuerpo = "";
    if (s.tipo === "libros") {
      cuerpo = (s.sagas || []).map(saga).join("") +
        '<div class="leyenda"><span><i class="t"></i> Ya lo tengo</span><span><i></i> Me falta, regálalo</span></div>';
    } else {
      var items = s.items || [];
      var dest = items.filter(function (it) { return it.destacado; });
      var normales = items.filter(function (it) { return !it.destacado; });
      cuerpo = dest.map(function (it) { return ficha(it, res); }).join("") +
        (normales.length ? '<div class="grilla' + (normales.length >= 3 ? " tres" : "") + '">' +
          normales.map(function (it) { return tarjeta(it, res); }).join("") + "</div>" : "");
    }
    return '<section class="seccion" id="' + id + '">' + cab + cuerpo + "</section>";
  }

  window.renderRevista = function (d, res) {
    res = res || function (r) { return r; };
    var nombre = d.nombre || "";
    var mitad = Math.floor(nombre.length / 2);
    var secciones = d.secciones || [];
    var parrafos = String(d.editorial || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); });

    return '<header class="portada"><div class="hoja">' +
      '<div class="barra"><span>' + esc(d.edicion) + "</span><span>Nº " + esc(d.numero) + " · " + esc(d.lugar) +
      " · " + esc(d.anio) + "</span><span>Precio: " + esc(d.precio) + "</span></div>" +
      '<h1 class="cabecera">' + esc(nombre.slice(0, mitad)) + "<span>" + esc(nombre.slice(mitad)) + "</span></h1>" +
      '<div class="bajada"><p class="titular">' + enfasis(d.titular) + "</p>" +
      '<ul class="sumario" aria-label="En esta edición">' + secciones.map(function (s, i) {
        return "<li><b>" + pad(i + 1) + '</b><a href="#s' + (i + 1) + '">' + esc(s.titulo) + "</a></li>";
      }).join("") + "</ul></div></div></header>" +
      '<main class="hoja">' +
      (parrafos.length ? '<section class="editorial"><div class="rotulo">Editorial</div><div>' +
        parrafos.map(function (p) { return "<p>" + enfasis(p.trim()) + "</p>"; }).join("") + "</div></section>" : "") +
      secciones.map(function (s, i) { return seccion(s, i, res); }).join("") +
      "<footer><span>Revista " + esc(nombre) + " · Nº " + esc(d.numero) + " · " + esc(d.edicion) + " " + esc(d.anio) +
      "</span><span>" + esc(d.pie) + "</span></footer></main>";
  };
})();
