import { subscribe } from "@/lib/realtime";
import type { NodeUpdate } from "@/types";

// Flux SSE : connexion longue durée, surtout pas de cache/buffering.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true; // contrôleur déjà fermé : on arrête d'émettre
        }
      };

      // Commentaire SSE initial : confirme l'ouverture côté navigateur.
      safeEnqueue(`: connected\n\n`);

      // Fan-out des mises à jour de nodes publics (cf. lib/realtime).
      const unsubscribe = subscribe((u: NodeUpdate) =>
        safeEnqueue(`event: node_update\ndata: ${JSON.stringify(u)}\n\n`),
      );

      // Heartbeat : garde la connexion vivante à travers les proxys.
      const heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), 25_000);

      const close = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      };
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // désactive le buffering nginx (self-host)
    },
  });
}
