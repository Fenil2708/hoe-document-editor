type SSEClient = {
  clientId: string;
  controller: ReadableStreamDefaultController;
};

declare global {
  var sseClientsGlobal: undefined | Map<string, SSEClient[]>;
}

const sseClients = globalThis.sseClientsGlobal ?? new Map<string, SSEClient[]>();

if (process.env.NODE_ENV !== 'production') {
  globalThis.sseClientsGlobal = sseClients;
}

export { sseClients };

export function addSSEClient(documentId: string, clientId: string, controller: ReadableStreamDefaultController) {
  const clients = sseClients.get(documentId) || [];
  // Evict any previous connection for this client ID
  const filtered = clients.filter(c => c.clientId !== clientId);
  filtered.push({ clientId, controller });
  sseClients.set(documentId, filtered);
}

export function removeSSEClient(documentId: string, clientId: string) {
  const clients = sseClients.get(documentId) || [];
  const updated = clients.filter(c => c.clientId !== clientId);
  if (updated.length === 0) {
    sseClients.delete(documentId);
  } else {
    sseClients.set(documentId, updated);
  }
}

export function broadcastToDocument(documentId: string, excludeClientId: string | null, eventType: string, data: any) {
  const clients = sseClients.get(documentId) || [];
  const payload = {
    type: eventType,
    sender: excludeClientId,
    timestamp: new Date().toISOString(),
    data,
  };
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  const staleClients: string[] = [];

  for (const client of clients) {
    if (excludeClientId && client.clientId === excludeClientId) continue;
    try {
      client.controller.enqueue(encoded);
    } catch (err) {
      console.error(`Error broadcasting to client ${client.clientId}:`, err);
      staleClients.push(client.clientId);
    }
  }

  // Clean up broken/stale clients
  if (staleClients.length > 0) {
    const active = sseClients.get(documentId) || [];
    sseClients.set(documentId, active.filter(c => !staleClients.includes(c.clientId)));
  }
}
