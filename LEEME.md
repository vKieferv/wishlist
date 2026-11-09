# El álbum de Vicho

Mi lista de regalos de cumpleaños como álbum de láminas: https://vkieferv.github.io/wishlist/

## Editar desde la página (cualquier equipo)
1. Abre la página y toca **Editar**, al final de todo.
2. La primera vez pide una llave de GitHub; el cuadro explica cómo crearla
   (Contents y Actions en «Read and write», solo para el repo `wishlist`).
3. Pega un link en **Agregar desde un link**. Una acción de GitHub (`.github/workflows/agregar.yml`)
   lo lee y agrega la lámina en 1 a 2 minutos.
4. Cada lámina tiene un botón **Editar** para cambiar nombre, precio, categoría, foto o borrarla.

## Editar en este PC (editor local)
1. Doble clic en **`abrir-editor.bat`**. Se abre una ventana negra (déjala abierta) y el editor en el navegador.
2. Pega el link de un producto y toca **Agregar**. Saca solo el nombre, la foto, la descripción y el precio,
   y le elige una categoría según las palabras clave.
3. Corrige lo que quieras: nombre, nota (talla, color), precio, categoría, foto (subir, arrastrar,
   Ctrl+V o elegir otra de la página), destacada, saga de libros.
4. Todo se guarda solo.
5. **Publicar en internet** sube los cambios a GitHub. En uno o dos minutos se ven en la página.

Para cerrar el editor, cierra la ventana negra.

## Archivos
- `datos.js`: todo el contenido (lo escribe el editor).
- `fotos/`: las fotos de los productos.
- `index.html`, `app.js`, `estilos.css`: la página pública.
- `editor.html`, `servidor.js`, `abrir-editor.bat`: el editor (necesita Node.js; solo funciona en este PC).
- `publicar.bat`: otra forma de publicar, sin abrir el editor.

En la página, los precios en dólares se convierten a pesos para los filtros con el valor
del dólar que pongas en **Portada → Dólar en pesos**.
