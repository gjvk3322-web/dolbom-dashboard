#!/usr/bin/env python3
"""
Claude AI API 프록시 서버
- API 키를 서버에만 보관 (브라우저 노출 없음)
- marketing.html 마인드맵에서 호출
- 포트: 5050
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, urllib.request, urllib.error, ssl

# ★ 여기에 Claude API 키 입력
CLAUDE_API_KEY = ""  # sk-ant-api03-... 형태

ALLOWED_ORIGINS = [
    "https://my.dolbommat.com",
    "http://my.dolbommat.com",
    "http://localhost",
]

class ProxyHandler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get("Origin", "")
        if any(origin.startswith(o) for o in ALLOWED_ORIGINS):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/ai":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error":"not found"}')
            return

        if not CLAUDE_API_KEY:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "API 키가 설정되지 않았습니다. claude_proxy.py의 CLAUDE_API_KEY를 입력하세요."}).encode())
            return

        # Origin 체크
        origin = self.headers.get("Origin", "")
        if not any(origin.startswith(o) for o in ALLOWED_ORIGINS):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "허용되지 않은 출처"}).encode())
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except:
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"잘못된 요청"}')
            return

        # Claude API 호출
        payload = json.dumps({
            "model": body.get("model", "claude-sonnet-4-20250514"),
            "max_tokens": min(body.get("max_tokens", 2048), 4096),
            "system": body.get("system", ""),
            "messages": body.get("messages", [])
        }).encode()

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01"
            },
            method="POST"
        )

        try:
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
                data = resp.read()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(data)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            self.send_response(e.code)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body.encode())
        except Exception as e:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, format, *args):
        print(f"[claude_proxy] {args[0]}")

if __name__ == "__main__":
    port = 5050
    server = HTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"Claude proxy running on port {port}")
    print(f"Allowed origins: {ALLOWED_ORIGINS}")
    print(f"API key: {'설정됨' if CLAUDE_API_KEY else '미설정 ⚠️'}")
    server.serve_forever()
