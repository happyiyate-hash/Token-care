from http.server import BaseHTTPRequestHandler
import json
import os
import time
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
WORKER_BASE_URL = os.environ.get(
    "WORKER_BASE_URL",
    "https://rough-meadow-6435.happyiyate.workers.dev/",
).rstrip("/")

ALLOWED_ACTIONS = {
    "getAllTokens",
    "getTokensByBlockchain",
    "getTokenByAddress",
    "getTokenDetails",
    "getTokenPrice",
    "getTokenPrices",
    "inspectToken",
    "inspectContract",
    "getTokenChart",
}


def supabase_rpc(function_name: str, payload: dict):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Server Supabase environment is not configured")

    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{function_name}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def send_json(handler, status: int, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
    handler.end_headers()
    handler.wfile.write(body)


def normalize_action(body: dict):
    action = str(body.get("action") or "").strip()
    aliases = {
        "get_all_tokens": "getAllTokens",
        "get_tokens_by_blockchain": "getTokensByBlockchain",
        "get_token_by_address": "getTokenByAddress",
        "get_token_details": "getTokenDetails",
        "get_token_price": "getTokenPrice",
        "get_token_prices": "getTokenPrices",
        "inspect_contract": "inspectContract",
        "inspect_token": "inspectToken",
        "get_token_chart": "getTokenChart",
    }
    return aliases.get(action, action)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_json(self, 200, {"success": True})

    def do_GET(self):
        send_json(
            self,
            405,
            {
                "success": False,
                "error": "METHOD_NOT_ALLOWED",
                "message": "Use POST with an x-api-key header.",
            },
        )

    def do_POST(self):
        started = time.perf_counter()
        api_key = (self.headers.get("x-api-key") or self.headers.get("X-API-Key") or "").strip()
        if not api_key:
            send_json(self, 401, {"success": False, "error": "MISSING_API_KEY", "message": "x-api-key header is required."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(content_length) if content_length else b"{}"
            body = json.loads(raw.decode("utf-8"))
            if not isinstance(body, dict):
                raise ValueError("JSON body must be an object")
        except Exception as exc:
            send_json(self, 400, {"success": False, "error": "INVALID_JSON", "message": str(exc)})
            return

        action = normalize_action(body)
        if action not in ALLOWED_ACTIONS:
            send_json(
                self,
                400,
                {
                    "success": False,
                    "error": "UNSUPPORTED_ACTION",
                    "message": "Unsupported developer API action.",
                    "allowedActions": sorted(ALLOWED_ACTIONS),
                },
            )
            return

        endpoint = f"/api/developer?action={action}"
        project_id = None

        try:
            authorization = supabase_rpc(
                "authorize_developer_call",
                {"p_api_key": api_key, "p_endpoint": endpoint},
            )

            if not authorization.get("allowed"):
                send_json(self, int(authorization.get("status", 403)), {"success": False, **authorization})
                return

            project_id = authorization.get("project_id")

            worker_payload = dict(body)
            worker_payload["action"] = action
            worker_payload.pop("apiKey", None)
            worker_payload.pop("api_key", None)

            worker_response = requests.post(
                f"{WORKER_BASE_URL}/",
                headers={"Content-Type": "application/json"},
                json=worker_payload,
                timeout=30,
            )

            try:
                worker_data = worker_response.json()
            except ValueError:
                worker_data = {"success": worker_response.ok, "data": worker_response.text}

            latency_ms = round((time.perf_counter() - started) * 1000)
            status = worker_response.status_code
            error_code = None if 200 <= status < 300 else "WORKER_REQUEST_FAILED"

            if project_id:
                try:
                    supabase_rpc(
                        "record_developer_call_result",
                        {
                            "p_project_id": project_id,
                            "p_endpoint": endpoint,
                            "p_status_code": status,
                            "p_latency_ms": latency_ms,
                            "p_error_code": error_code,
                        },
                    )
                except Exception:
                    pass

            if isinstance(worker_data, dict):
                response_payload = dict(worker_data)
                response_payload["developerUsage"] = {
                    "used": authorization.get("used"),
                    "limit": authorization.get("limit"),
                    "remaining": authorization.get("remaining"),
                }
            else:
                response_payload = {
                    "success": worker_response.ok,
                    "data": worker_data,
                    "developerUsage": {
                        "used": authorization.get("used"),
                        "limit": authorization.get("limit"),
                        "remaining": authorization.get("remaining"),
                    },
                }

            send_json(self, status, response_payload)
        except requests.RequestException as exc:
            latency_ms = round((time.perf_counter() - started) * 1000)
            if project_id:
                try:
                    supabase_rpc(
                        "record_developer_call_result",
                        {
                            "p_project_id": project_id,
                            "p_endpoint": endpoint,
                            "p_status_code": 502,
                            "p_latency_ms": latency_ms,
                            "p_error_code": "WORKER_CONNECTION_FAILED",
                        },
                    )
                except Exception:
                    pass
            send_json(self, 502, {"success": False, "error": "WORKER_CONNECTION_FAILED", "message": str(exc)})
        except Exception as exc:
            send_json(self, 500, {"success": False, "error": "DEVELOPER_GATEWAY_ERROR", "message": str(exc)})
