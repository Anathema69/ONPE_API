/**
 * Nombres cortos idiomaticos peruanos (apellido paterno + materno cuando
 * hace falta desambiguar) para etiquetas compactas de graficas.
 */
export function shortName(full: string): string {
  const n = full.trim().toUpperCase();
  if (n.includes("FUJIMORI")) return "Fujimori";
  if (n.includes("LÓPEZ ALIAGA") || n.includes("LOPEZ ALIAGA")) return "López Aliaga";
  if (n.includes("NIETO")) return "Nieto";
  if (n.includes("SANCHEZ PALOMINO") || n.includes("SÁNCHEZ PALOMINO")) return "Sánchez Palomino";
  if (n.includes("BELMONT")) return "Belmont";
  if (n.includes("ÁLVAREZ") || n.includes("ALVAREZ")) return "Álvarez";
  if (n.includes("LÓPEZ CHAU") || n.includes("LOPEZ CHAU")) return "López Chau";
  // fallback: primer apellido
  const parts = full.trim().split(/\s+/);
  return parts.length >= 3
    ? parts[parts.length - 2][0] + parts[parts.length - 2].slice(1).toLowerCase()
    : full;
}

/**
 * Paleta editorial sobria para 5 series. Distinguibles entre si pero
 * deliberadamente no partidistas: ninguna combinacion coincide con los
 * colores oficiales de los partidos en competencia.
 */
export const palette5 = [
  "#8B2E2E", // oxblood - primer lugar
  "#3E5C76", // azul tinta
  "#6B7F59", // verde oliva
  "#B5884C", // mostaza
  "#3F3A34", // grafito
];
