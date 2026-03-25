import type { APIRoute } from "astro";
import { getOfertas, reescribirImagenesCatalogo } from "../../lib/api";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const raw = await getOfertas();
    const data = reescribirImagenesCatalogo(raw);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        tasa_bcv: null,
        fecha: null,
        search: null,
        productos: [],
        pagination: {
          current_page: 1,
          last_page: 1,
          per_page: 50,
          total: 0,
          from: null,
          to: null,
          first_page_url: "",
          last_page_url: "",
          next_page_url: null,
          prev_page_url: null,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
