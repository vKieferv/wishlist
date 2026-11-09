// Lee la lista de deseados de Steam (también privada, con el link de compartir ?st=…)
// y la sincroniza con las láminas de la categoría Juegos.
"use strict";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" };
const CDN = "https://shared.fastly.steamstatic.com/store_item_assets/";

function esLinkWishlist(url) { return /steam(powered|community)\.com\/wishlist\//i.test(String(url || "")); }

// "https://store.steampowered.com/wishlist/id/Kiefer__/?st=123" -> { vanity, steamid, shareToken }
function leerLink(url) {
  const u = new URL(url);
  const id = /\/wishlist\/id\/([^/?#]+)/i.exec(u.pathname);
  const prof = /\/wishlist\/profiles\/(\d+)/i.exec(u.pathname);
  return { vanity: id ? decodeURIComponent(id[1]) : "", steamid: prof ? prof[1] : "", shareToken: u.searchParams.get("st") || "" };
}

async function resolverSteamId(config) {
  if (config.steamid) return config.steamid;
  const xml = await (await fetch(`https://steamcommunity.com/id/${encodeURIComponent(config.vanity)}/?xml=1`, { headers: UA, signal: AbortSignal.timeout(20000) })).text();
  const id = (/<steamID64>(\d+)<\/steamID64>/.exec(xml) || [])[1];
  if (!id) throw new Error("No encontré ese perfil de Steam");
  return id;
}

function resumir(t, max = 200) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max), punto = corte.lastIndexOf(". ");
  return punto > 80 ? corte.slice(0, punto + 1) : corte.replace(/\s+\S*$/, "") + "…";
}

async function leerWishlist(config) {
  const steamid = await resolverSteamId(config);
  const cuerpo = {
    steamid, share_token: config.shareToken || undefined,
    context: { language: "spanish", country_code: "CL" },
    data_request: { include_basic_info: true, include_assets: true, include_all_purchase_options: true },
    start_index: 0, page_size: 500,
  };
  const r = await fetch("https://api.steampowered.com/IWishlistService/GetWishlistSortedFiltered/v1/?input_json=" + encodeURIComponent(JSON.stringify(cuerpo)),
    { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("Steam respondió " + r.status);
  const items = ((await r.json()).response || {}).items || [];
  return {
    steamid,
    juegos: items.map((it) => {
      const s = it.store_item || {};
      const a = s.assets || {};
      const archivo = a.header || a.main_capsule || a.small_capsule;
      const b = s.best_purchase_option || {};
      const centavos = b.final_price_in_cents != null ? Number(b.final_price_in_cents) : null;
      return {
        appid: it.appid,
        nombre: s.name || "Juego " + it.appid,
        descripcion: resumir((s.basic_info || {}).short_description),
        precio: centavos != null && isFinite(centavos) ? Math.round(centavos / 100) : null,
        foto: archivo && a.asset_url_format ? CDN + a.asset_url_format.replace("${FILENAME}", archivo) : `${CDN}steam/apps/${it.appid}/header.jpg`,
        link: `https://store.steampowered.com/app/${it.appid}/${s.store_url_slug || ""}`,
      };
    }),
  };
}

// Agrega los juegos nuevos, actualiza nombre, precio y foto, y saca los que ya no están en la lista.
// Lo que edites a mano (nota, categoría, destacada) se respeta.
async function sincronizar(d, config) {
  const { steamid, juegos } = await leerWishlist(config);
  d.steam = { vanity: config.vanity || "", steamid, shareToken: config.shareToken || "" };
  d.productos = d.productos || [];
  const catJuegos = (d.categorias || []).find((c) => c.id === "juegos") ? "juegos" : ((d.categorias || [])[0] || {}).id || "";
  const enLista = new Set(juegos.map((j) => "steam-" + j.appid));
  let nuevos = 0, actualizados = 0, sacados = 0;
  for (const j of juegos) {
    const id = "steam-" + j.appid;
    const p = d.productos.find((x) => x.id === id);
    if (p) {
      Object.assign(p, { nombre: j.nombre, precio: j.precio, moneda: "CLP", foto: j.foto, link: j.link });
      if (!p.descripcion) p.descripcion = j.descripcion;
      actualizados++;
    } else {
      d.productos.push({
        id, fuente: "steam", categoria: catJuegos, nombre: j.nombre, descripcion: j.descripcion, nota: "",
        precio: j.precio, moneda: "CLP", link: j.link, tienda: "store.steampowered.com", foto: j.foto,
      });
      nuevos++;
    }
  }
  const antes = d.productos.length;
  d.productos = d.productos.filter((p) => p.fuente !== "steam" || enLista.has(p.id));
  sacados = antes - d.productos.length;
  return { total: juegos.length, nuevos, actualizados, sacados };
}

module.exports = { esLinkWishlist, leerLink, sincronizar };
