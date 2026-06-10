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

// ============================================================
//  LOCAL PROXY (default)  —  or  —  CLOUD BACKEND
// ============================================================
// DEFAULT (local proxy): leave the values below as-is and run proxy/server.js.
//
// CLOUD (AWS, see cloud/README.md): after `terraform apply`, paste the outputs:
//   - USER_API_KEY      = the shared token  (terraform output -raw auth_token)
//   - USER_API_ENDPOINT = game_endpoint     (.../v1/chat/completions)
//   - USER_CLOUD_API_BASE = api_base_url     (same host, NO /v1/chat/completions)
// The token is sent as the Bearer the gateway checks, so the same value unlocks
// both AI questions and the data API (profiles/leaderboard/class/events).

// For the local proxy this is just a placeholder; for the cloud it is the real
// shared access token from Terraform.
export const USER_API_KEY = "local-proxy";
export const USER_API_PROVIDER = "openai_compatible";

// AI questions endpoint. Local proxy by default; swap to the cloud game_endpoint.
export const USER_API_ENDPOINT = "http://127.0.0.1:8787/v1/chat/completions";
export const USER_API_MODEL = "claude-haiku-4-5-20251001";

// Cloud data API base (everything except /v1/chat/completions), e.g.
//   https://abc123.execute-api.us-east-1.amazonaws.com
// LEAVE BLANK to disable all cloud sync and stay fully local/offline-friendly.
export const USER_CLOUD_API_BASE = "";
