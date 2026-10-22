import { ErrorResponses, jsonResponse } from '@/lib/api/response'

/**
 * Odpowiedzi endpointów pobierania e-booka. Presigned URL i (w ścieżce) token z maila nie mogą
 * trafić do cache ani do nagłówka Referer.
 */
const NO_LEAK_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
}

/** 302 na presigned URL (R2). */
export function downloadRedirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url, ...NO_LEAK_HEADERS } })
}

/** 404 – jedna odpowiedź na: zły token / ciasteczko, cudza pozycja, brak płatności lub potwierdzenia. */
export function downloadNotFound(): Response {
  return jsonResponse(ErrorResponses.NOT_FOUND(), 404, NO_LEAK_HEADERS)
}

export function downloadError(): Response {
  return jsonResponse(ErrorResponses.INTERNAL_SERVER_ERROR, 500, NO_LEAK_HEADERS)
}
