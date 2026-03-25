import axios from 'axios';
import type { RespuestaCatalogo } from '../types/catalogo';
import { urlToImagenToken } from './imagen-proxy';

export const API_BASE = 'https://api.mjeimports.store/api';
const API_ORIGIN = 'https://api.mjeimports.store';

/** Prefijo para URLs de imagen servidas por el proxy SSR (la URL real no se expone en el front). */
export const IMAGEN_PROXY_PATH = '/api/imagen';

/** Convierte una URL de imagen (absoluta o relativa) en una URL del proxy con token. */
function toProxyImagenUrl(imagenUrl: string | null | undefined): string | null | undefined {
  if (!imagenUrl || typeof imagenUrl !== 'string' || !imagenUrl.trim()) return imagenUrl;
  const trimmed = imagenUrl.trim();
  const absolute =
    trimmed.startsWith('http')
      ? trimmed
      : `${API_ORIGIN}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  return `${IMAGEN_PROXY_PATH}/${urlToImagenToken(absolute)}`;
}

/**
 * Reescribe las URLs de imagen del catálogo a rutas del proxy con token.
 * Acepta URLs absolutas (http) y relativas (se resuelven contra el origen del API).
 */
export function reescribirImagenesCatalogo(data: RespuestaCatalogo): RespuestaCatalogo {
  return {
    ...data,
    productos: data.productos.map((p) => ({
      ...p,
      imagen_url: toProxyImagenUrl(p.imagen_url) ?? p.imagen_url,
    })),
  };
}

export interface GetCatalogoParams {
  page?: number;
  per_page?: number;
  search?: string;
}

export async function getCatalogo(
  params?: GetCatalogoParams
): Promise<RespuestaCatalogo> {
  const searchParams = new URLSearchParams();
  if (params?.page != null) searchParams.set('page', String(params.page));
  if (params?.per_page != null)
    searchParams.set('per_page', String(params.per_page));
  if (params?.search != null && params.search.trim() !== '')
    searchParams.set('search', params.search.trim());

  const url =
    searchParams.toString() === ''
      ? `${API_BASE}/catalogo`
      : `${API_BASE}/catalogo?${searchParams.toString()}`;

  const { data } = await axios.get<RespuestaCatalogo>(url, {
    timeout: 10000,
  });
  return data;
}

/** Obtiene los productos en oferta (misma estructura que el catálogo). */
export async function getOfertas(): Promise<RespuestaCatalogo> {
  const { data } = await axios.get<RespuestaCatalogo>(`${API_BASE}/catalogo/ofertas`, {
    timeout: 10000,
  });
  return data;
}
