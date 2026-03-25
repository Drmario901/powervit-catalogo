/**
 * Codificación base64url para el token de imagen (sin exponer la URL real en la ruta).
 * Solo se usa en el servidor (API y SSR).
 */
export function urlToImagenToken(url: string): string {
  const encoded = encodeURIComponent(url);
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(encoded, "utf-8").toString("base64")
      : btoa(encoded);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function imagenTokenToUrl(token: string): string {
  let base64 = token.replace(/_/g, "/").replace(/-/g, "+");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  const decoded =
    typeof Buffer !== "undefined"
      ? Buffer.from(base64, "base64").toString("utf-8")
      : atob(base64);
  return decodeURIComponent(decoded);
}
