// ============================================================
//  STUDY QUIZ - AI CONNECTION (uses the local gateway/proxy)
// ============================================================
// Your API key is NOT stored here anymore. It lives only in the proxy
// (proxy/anthropic-key.txt) so it never touches the game files.
//
// TO USE:
//   1. Put your key in  proxy/anthropic-key.txt
//   2. Run the proxy:    double-click proxy/start-proxy.bat  (or: node server.js)
//   3. Start the Minecraft server. Quizzes route through the proxy.
//
// To change models or providers, edit the proxy (proxy/server.js) - not this file.
// ============================================================

// "local-proxy" is just a placeholder so the game knows AI is configured.
// The real key is held by the proxy, not here.
export const USER_API_KEY = "local-proxy";
export const USER_API_PROVIDER = "openai_compatible";

// Points at the local gateway. Change the port here only if you changed it in the proxy.
export const USER_API_ENDPOINT = "http://127.0.0.1:8787/v1/chat/completions";
export const USER_API_MODEL = "claude-haiku-4-5-20251001";
