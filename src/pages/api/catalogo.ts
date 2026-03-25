import type { APIRoute } from "astro";
import { getCatalogo, reescribirImagenesCatalogo } from "../../lib/api";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const per_page = Math.min(24, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "12", 10) || 12));
  const search = url.searchParams.get("search")?.trim() ?? undefined;

  try {
    const raw = await getCatalogo({ page, per_page, search: search || undefined });
    const data = reescribirImagenesCatalogo(raw);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        tasa_bcv: null,
        fecha: null,
        search: search ?? null,
        productos: [],
        pagination: {
          current_page: page,
          last_page: 1,
          per_page,
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
