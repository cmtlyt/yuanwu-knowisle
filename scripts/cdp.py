"""极简 CDP 客户端（仅标准库）：用于构造真实手机视口并测量页面布局。

无头 Chrome 的 --window-size 最小约 500 CSS px，测不到 390px；
CDP 的 Emulation.setDeviceMetricsOverride 才能给出精确视口。
"""
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]


def find_browser():
    return next((p for p in CANDIDATES if os.path.exists(p)), None)


class CDP:
    def __init__(self, browser=None):
        self.browser = browser or find_browser()
        if not self.browser:
            raise RuntimeError("未找到 Chrome/Edge")
        self.profile = tempfile.mkdtemp(prefix="knowisle-cdp-")
        self.proc = None
        self.sock = None
        self.buf = b""
        self.next_id = 0

    def start(self, width=390, height=844):
        self.proc = subprocess.Popen(
            [self.browser, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--no-first-run", "--disable-extensions", "--hide-scrollbars",
             "--remote-debugging-port=0", "--user-data-dir=" + self.profile,
             "--window-size=900,1000", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        port_file = os.path.join(self.profile, "DevToolsActivePort")
        for _ in range(100):
            if os.path.exists(port_file):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("DevToolsActivePort 未生成")
        with open(port_file, "r", encoding="utf-8") as f:
            lines = f.read().strip().splitlines()
        port = int(lines[0])

        ws_url = None
        for _ in range(50):
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=2) as r:
                    targets = json.load(r)
                page = next(t for t in targets if t.get("type") == "page")
                ws_url = page["webSocketDebuggerUrl"]
                break
            except Exception:
                time.sleep(0.1)
        if not ws_url:
            raise RuntimeError("无法获取页面调试地址")

        u = urllib.parse.urlparse(ws_url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            "GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n"
            "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n" % (u.path, u.hostname, u.port, key)
        )
        self.sock.sendall(req.encode())
        while b"\r\n\r\n" not in self.buf:
            self.buf += self.sock.recv(4096)
        head, self.buf = self.buf.split(b"\r\n\r\n", 1)
        if b"101" not in head.split(b"\r\n", 1)[0]:
            raise RuntimeError("WebSocket 握手失败：" + head[:120].decode("utf-8", "replace"))

        self.call("Page.enable")
        self.call("Runtime.enable")
        self.call("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": height, "deviceScaleFactor": 1,
            "mobile": True, "screenWidth": width, "screenHeight": height
        })

    def _send_text(self, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        header = bytearray([0x81])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        self.sock.sendall(bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))

    def _exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("CDP 连接已关闭")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _frame(self):
        b1, b2 = self._exact(2)
        fin, opcode = bool(b1 & 0x80), b1 & 0x0F
        masked, n = bool(b2 & 0x80), b2 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._exact(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._exact(8))[0]
        mask = self._exact(4) if masked else None
        data = self._exact(n)
        if mask:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        return fin, opcode, data

    def call(self, method, params=None):
        self.next_id += 1
        mid = self.next_id
        self._send_text({"id": mid, "method": method, "params": params or {}})
        acc = b""
        while True:
            fin, opcode, data = self._frame()
            if opcode in (0, 1, 2):
                acc += data
                if fin:
                    try:
                        msg = json.loads(acc.decode("utf-8"))
                    except ValueError:
                        acc = b""
                        continue
                    acc = b""
                    if msg.get("id") == mid:
                        if "error" in msg:
                            raise RuntimeError("%s: %s" % (method, msg["error"]))
                        return msg.get("result", {})
            # 事件帧（无 id）忽略

    def navigate(self, url, settle=0.6):
        self.call("Page.navigate", {"url": url})
        for _ in range(60):
            try:
                r = self.call("Runtime.evaluate", {
                    "expression": "document.readyState === 'complete' && !!document.getElementById('main')",
                    "returnByValue": True
                })
                if r.get("result", {}).get("value") is True:
                    break
            except RuntimeError:
                pass
            time.sleep(0.1)
        time.sleep(settle)

    def evaluate(self, expression):
        r = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        return r.get("result", {}).get("value")

    def screenshot(self):
        r = self.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        return base64.b64decode(r["data"])

    def close(self):
        try:
            if self.sock:
                self.sock.close()
        except Exception:
            pass
        try:
            if self.proc:
                self.proc.terminate()
                self.proc.wait(timeout=5)
        except Exception:
            pass
        shutil.rmtree(self.profile, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


MEASURE_JS = r"""
(() => {
  const w = window, d = document, bad = [];
  const nodes = d.querySelectorAll('body *');
  for (let i = 0; i < nodes.length && bad.length < 5; i++) {
    const n = nodes[i];
    if (!n.getClientRects().length) continue;
    const r = n.getBoundingClientRect(), cs = w.getComputedStyle(n);
    if (!r.width || r.right <= w.innerWidth + 2) continue;
    if (cs.position === 'fixed' || cs.position === 'absolute') continue;
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    let p = n.parentElement, inScroll = false;
    while (p && p !== d.body) {
      const pcs = w.getComputedStyle(p);
      if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') { inScroll = true; break; }
      p = p.parentElement;
    }
    if (inScroll) continue;
    bad.push((n.tagName + '.' + String(n.className || '')).slice(0, 60) + '@' + Math.round(r.right));
  }
  const nav = d.getElementById('nav'), menu = d.getElementById('menuBtn');
  return {
    width: w.innerWidth,
    overflow: Math.max(0, d.documentElement.scrollWidth - w.innerWidth),
    bad: bad,
    nav: nav ? w.getComputedStyle(nav).position : 'missing',
    menu: menu ? w.getComputedStyle(menu).display : 'missing',
    main: !!d.getElementById('main')
  };
})()
"""
