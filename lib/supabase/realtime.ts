import WebSocket from "ws";

/**
 * Sunucu tarafı Supabase istemcileri için WebSocket. supabase-js istemci kurulurken realtime istemcisini
 * de oluşturur ve Node 20'de yerleşik WebSocket olmadığı için hata verir ("Node.js 20 detected without
 * native WebSocket support"). edoras-admin'in scriptleriyle aynı çözüm: `ws` paketini aktarım olarak ver.
 * Node 22+'da da zararsızdır. Tarayıcı istemcisinde KULLANILMAZ (tarayıcının kendi WebSocket'i var).
 */
export const SERVER_REALTIME = { transport: WebSocket as never };
