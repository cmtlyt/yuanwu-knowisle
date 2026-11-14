"""助学 Agent 动态回归用的 OpenAI Chat Completions 兼容 mock 端点。

仅标准库，人工按需启动（不进 CI）：

    python scripts/tutor-mock.py --port 3210

能力：
- POST /v1/chat/completions：stream=true 返回逐帧 SSE，stream=false 返回普通 JSON。
- GET  /__log    ：返回本次运行记录到的全部请求（含 messages / auth / stream）。
- POST /__reset  ：清空请求记录。
- GET  /__health ：健康检查（就绪探针用）。
- OPTIONS       ：返回 CORS 预检 204（浏览器跨域直连端点）。

按 API Key 触发异常场景（探针通过设置页换 key）：
    sk-401    → HTTP 401        sk-429  → HTTP 429
    sk-500    → HTTP 500        sk-empty→ 只有 [DONE] 的空 SSE 流
    sk-cr     → 用单独 \\r 作行分隔的 SSE 流
    其它      → 正常回复（含加粗 / 代码块 / 链接 / <script> 注入探针）
"""
import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = []
LOCK = threading.Lock()

CHUNKS = [
    "**核心原理**：flatMap 等价于先 `map` 再 `mergeAll`。\n\n",
    "```ts\nconst s = of(1, 2).pipe(mergeMap((n) => of(n * 2)))\n```\n\n",
    "参考 [RxJS 文档](https://example.com/rxjs)。\n\n",
    "<script>window.__xss = 1</script>\n",
]


def frame(content, sep="\n\n"):
    payload = json.dumps({"choices": [{"delta": {"content": content}}]}, ensure_ascii=False)
    return ("data: " + payload + sep).encode("utf-8")


def done_frame(sep="\n\n"):
    return ("data: [DONE]" + sep).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _text(self, text, status=200, ctype="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/__health"):
            self._json({"ok": True})
        elif self.path.startswith("/__log"):
            with LOCK:
                self._json(list(LOG))
        elif self.path.startswith("/__reset"):
            with LOCK:
                LOG.clear()
            self._json({"ok": True})
        else:
            self._text("not found", 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            body = {}

        if self.path.startswith("/__reset"):
            with LOCK:
                LOG.clear()
            self._json({"ok": True})
            return

        if not self.path.startswith("/v1/chat/completions"):
            self._text("not found", 404)
            return

        auth = self.headers.get("Authorization", "")
        key = auth[7:] if auth.startswith("Bearer ") else ""
        entry = {
            "path": self.path,
            "auth": auth,
            "key": key,
            "model": body.get("model"),
            "stream": bool(body.get("stream")),
            "messages": body.get("messages", []),
        }
        with LOCK:
            LOG.append(entry)

        if key == "sk-401":
            self._text("mock unauthorized: invalid api key", 401)
            return
        if key == "sk-429":
            self._text("mock rate limited", 429)
            return
        if key == "sk-500":
            self._text("mock upstream error", 500)
            return

        if not entry["stream"]:
            self._json({"choices": [{"message": {"content": "好"}}]})
            return

        sep = "\r\r" if key == "sk-cr" else "\n\n"
        chunks = [] if key == "sk-empty" else CHUNKS
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self._cors()
        self.end_headers()
        try:
            for chunk in chunks:
                self.wfile.write(frame(chunk, sep))
                self.wfile.flush()
                time.sleep(0.06)
            self.wfile.write(done_frame(sep))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=3210)
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    print("tutor-mock listening on http://127.0.0.1:%d" % args.port, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
