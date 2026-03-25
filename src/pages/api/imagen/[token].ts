import type { APIRoute } from "astro";
import { API_BASE } from "../../../lib/api";
import { imagenTokenToUrl } from "../../../lib/imagen-proxy";

export const prerender = false;

const ALLOWED_ORIGINS = [
  new URL(API_BASE).origin,
  "https://api.mjeimports.store",
  "http://api.mjeimports.store",
  "https://mjeimports.store",
  "http://mjeimports.store",
];

function isAllowedImageUrl(imageUrl: string): boolean {
  if (!imageUrl || !imageUrl.startsWith("http")) return false;
  try {
    const u = new URL(imageUrl);
    return ALLOWED_ORIGINS.some((origin) => u.origin === origin);
  } catch {
    return false;
  }
}

export const GET: APIRoute = async ({ params }) => {
  let token = params.token;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    token = decodeURIComponent(token);
  } catch {
    /* usar token tal cual */
  }

  let imageUrl: string;
  try {
    imageUrl = imagenTokenToUrl(token);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isAllowedImageUrl(imageUrl)) {
    return new Response(JSON.stringify({ error: "URL not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(imageUrl, {
      headers: { Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Upstream image failed", status: res.status }),
        {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const contentType = res.headers.get("Content-Type") || "image/jpeg";
    const body = await res.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to fetch image" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
