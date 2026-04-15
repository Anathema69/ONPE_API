/**
 * Toma un SVG string producido por Observable Plot y lo deja responsivo:
 *   - retira atributos width/height del tag raiz
 *   - anade style="width:100%; height:auto; display:block;"
 *   - conserva el viewBox para que el contenido escale proporcionalmente
 */
export function responsive(svg: string): string {
  return svg
    .replace(/<svg([^>]*)\s(width|height)="[^"]*"/g, "<svg$1")
    .replace(
      /<svg([^>]*?)>/,
      '<svg$1 style="width:100%;height:auto;display:block;max-width:100%;">',
    );
}
