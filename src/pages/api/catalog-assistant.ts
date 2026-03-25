import type { APIRoute } from "astro";
import axios from "axios";
import { API_BASE } from "../../lib/api";

export const prerender = false;

const CATALOG_ASSISTANT_URL = `${API_BASE}/catalog-assistant`;

export const POST: APIRoute = async ({ request }) => {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const res = await axios.post(CATALOG_ASSISTANT_URL, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
      responseType: "text",
      validateStatus: () => true,
    });

    return new Response(res.data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers["content-type"] ?? "application/json",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to reach catalog assistant" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};
