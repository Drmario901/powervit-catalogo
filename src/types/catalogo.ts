export interface ProductoCatalogo {
  id: number;
  producto: string;
  venta_bcv: number;
  venta_bs: number | null;
  status?: 'en existencia' | 'agotado';
  en_oferta?: boolean;
  en_camino?: boolean;
  imagen_url: string;
}

export interface PaginationCatalogo {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
  first_page_url: string;
  last_page_url: string;
  next_page_url: string | null;
  prev_page_url: string | null;
}

export interface RespuestaCatalogo {
  tasa_bcv: number | null;
  fecha: string | null;
  search: string | null;
  productos: ProductoCatalogo[];
  pagination: PaginationCatalogo;
}

/** Alias para compatibilidad */
export type CatalogoAPI = RespuestaCatalogo;
