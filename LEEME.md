# Revista Vicho

Mi wishlist de cumpleaños en formato revista.

## Editar
1. Abre `editor.html` con **Chrome** o **Edge** (doble clic).
2. **Abrir carpeta…** → elige esta carpeta (`wishlist`) → permite **Editar archivos**.
   La próxima vez basta con **Reabrir «wishlist»**.
3. Cambia textos, agrega o quita cosas, sube fotos (botón, arrastrar o Ctrl+V) y pon links de compra.
   En los libros, haz clic en los números para marcar cuáles ya tienes.
4. **Guardar** (Ctrl+S).

Las fotos quedan en `fotos/` (achicadas a 1400 px) y el contenido en `datos.js`.

## Publicar
Doble clic en `publicar.bat`: hace commit y sube todo a GitHub.

### Solo la primera vez
1. En github.com crea un repo **público** y vacío llamado `wishlist`.
2. En una terminal, dentro de esta carpeta:
   ```
   "C:\Program Files\Git\cmd\git.exe" remote add origin https://github.com/vKieferv/wishlist.git
   "C:\Program Files\Git\cmd\git.exe" push -u origin main
   ```
3. En el repo: **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
4. La revista queda en `https://vkieferv.github.io/wishlist/`.
