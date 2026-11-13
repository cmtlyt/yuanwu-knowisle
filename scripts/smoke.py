"""
运行时冒烟：python scripts/smoke.py [--base http://127.0.0.1:3100]

需要先启动服务：pnpm dev 或 PORT=3100 node .output/server/index.mjs
检查：全部路由 SSR 状态与关键内容、客户端渲染与演练挂载、真实手机/平板/桌面视口的布局。
手机视口用 CDP 构造；无头 Chrome 的 --window-size 最小约 500px，测不到 390px。
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

from cdp import CDP, MEASURE_JS, find_browser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ROUTES = [
    ("/", 200, ["源悟的知识岛", "Effect 深度课", "RxJS 深度课", "更多课程在路上"]),
    ("/courses/effect-ts", 200, ["从「程序即值」到「运行时指令解释」", "六个阶段", "L01"]),
    ("/courses/effect-ts/dashboard", 200, ["学情仪表盘", "能力雷达", "薄弱点归因"]),
    ("/courses/effect-ts/review", 200, ["复习中心", "最近错题"]),
    ("/courses/effect-ts/teacher", 200, ["长期教学准备", "版本基线", "课时数据"]),
    ("/courses/effect-ts/settings", 200, ["设置与数据", "导出 JSON 备份"]),
    ("/courses/effect-ts/design", 200, ["教学设计说明书", "版本基线", "平缓学习路径", "知识点依赖图"]),
    ("/courses/effect-ts/lessons/L19", 200, ["指令解释器", "关键术语", "随堂测验"]),
    ("/courses/effect-ts/lessons/L02", 200, ["三通道", "关键术语", "随堂测验"]),
    ("/courses/effect-ts/lessons/L10", 200, ["Cause", "关键术语", "随堂测验"]),
    ("/courses/rxjs", 200, ["从「一段时间里的数据序列」", "六个阶段", "L01"]),
    ("/courses/rxjs/dashboard", 200, ["学情仪表盘", "能力雷达", "薄弱点归因"]),
    ("/courses/rxjs/review", 200, ["复习中心", "最近错题"]),
    ("/courses/rxjs/design", 200, ["教学设计说明书", "版本基线", "知识点依赖图"]),
    ("/courses/rxjs/lessons/L09", 200, ["嵌套流的心智模型", "关键术语", "随堂测验"]),
    ("/courses/rxjs/lessons/L11", 200, ["switchMap", "关键术语", "随堂测验"]),
    ("/courses/nope", 404, []),
]

CLIENT_ROUTES = [
    ("/courses/effect-ts/lessons/L19", "runLoop：指令解释"),
    ("/courses/effect-ts/lessons/L02", "三通道类型拼装台"),
    ("/courses/effect-ts/dashboard", "能力雷达"),
    ("/courses/effect-ts/design", "版本基线"),
    ("/courses/rxjs/lessons/L11", "取最新 vs 排空"),
    ("/courses/rxjs/lessons/L09", "嵌套流"),
]

VIEWPORTS = [
    (320, 700, True, "极窄手机", ["/", "/courses/effect-ts", "/courses/effect-ts/lessons/L19", "/courses/effect-ts/dashboard"]),
    (390, 844, True, "主流手机", ["/", "/courses/effect-ts", "/courses/effect-ts/lessons/L19",
                                "/courses/effect-ts/dashboard", "/courses/effect-ts/teacher",
                                "/courses/effect-ts/design", "/courses/rxjs", "/courses/rxjs/lessons/L11"]),
    (768, 1024, True, "平板", ["/courses/effect-ts", "/courses/effect-ts/lessons/L19", "/courses/rxjs"]),
    (1440, 900, False, "桌面", ["/", "/courses/effect-ts", "/courses/effect-ts/design",
                                 "/courses/rxjs", "/courses/rxjs/design"]),
]


def http_check(base):
    print("=== SSR 路由 ===")
    failed = 0
    for route, want, markers in ROUTES:
        try:
            with urllib.request.urlopen(base + route, timeout=20) as r:
                code, body = r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            code, body = e.code, e.read().decode("utf-8", "replace")
        except Exception as e:
            print("  ✗ %s 请求失败：%s" % (route, e))
            failed += 1
            continue
        missing = [m for m in markers if m not in body]
        if code != want or missing:
            print("  ✗ %s → %d（期望 %d）%s" % (route, code, want, ("缺 " + ",".join(missing)) if missing else ""))
            failed += 1
        else:
            print("  ✓ %s → %d（%d 字节）" % (route, code, len(body)))
    return failed


def chrome_check(base, browser, profile):
    print("\n=== 客户端渲染 ===")
    failed = 0
    for route, marker in CLIENT_ROUTES:
        cmd = [browser, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
               "--disable-extensions", "--virtual-time-budget=4000", "--enable-logging=stderr", "--v=0",
               "--user-data-dir=" + profile, "--dump-dom", base + route]
        try:
            p = subprocess.run(cmd, capture_output=True, timeout=60)
        except subprocess.TimeoutExpired:
            print("  ✗ %s 超时" % route)
            failed += 1
            continue
        dom = (p.stdout or b"").decode("utf-8", "replace")
        err = (p.stderr or b"").decode("utf-8", "replace")
        fatal = [l for l in err.splitlines()
                 if re.search(r"uncaught|hydration mismatch|typeerror|referenceerror", l, re.I)]
        if marker not in dom or fatal:
            print("  ✗ %s 缺少 %s%s" % (route, marker, (" / 异常 " + fatal[0][:90]) if fatal else ""))
            failed += 1
        else:
            print("  ✓ %s 演练/图表已挂载，无运行时异常" % route)
    return failed


def viewport_check(base, browser):
    print("\n=== 真实视口布局（CDP） ===")
    failed = 0
    try:
        with CDP(browser) as cdp:
            cdp.start(390, 844)
            for width, height, mobile, label, routes in VIEWPORTS:
                cdp.call("Emulation.setDeviceMetricsOverride", {
                    "width": width, "height": height, "deviceScaleFactor": 1,
                    "mobile": mobile, "screenWidth": width, "screenHeight": height
                })
                for route in routes:
                    cdp.navigate(base + route)
                    data = cdp.evaluate(MEASURE_JS)
                    if not isinstance(data, dict):
                        print("  ✗ %s %s 探针无结果" % (label, route))
                        failed += 1
                        continue
                    problems = []
                    if data["width"] != width:
                        problems.append("视口 %d ≠ %d" % (data["width"], width))
                    if data["overflow"] > 2:
                        problems.append("横向溢出 %dpx" % data["overflow"])
                    if data["bad"]:
                        problems.append("越界 " + ";".join(data["bad"][:2]))
                    want_nav = "fixed" if width <= 780 else "static"
                    if data["nav"] != want_nav:
                        problems.append("导航 %s ≠ %s" % (data["nav"], want_nav))
                    if width <= 780 and data["menu"] in ("none", "missing"):
                        problems.append("菜单按钮缺失或不可见：" + str(data["menu"]))
                    if not data["main"]:
                        problems.append("主区域未渲染")
                    if problems:
                        print("  ✗ %s %dx%d %s：%s" % (label, width, height, route, "，".join(problems)))
                        failed += 1
                    else:
                        print("  ✓ %s %dx%d %s 无溢出，导航/菜单正常" % (label, width, height, route))
    except Exception as e:
        print("  ✗ CDP 检查失败：%s" % e)
        return 1
    return failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:3100")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    browser = find_browser()
    failed = http_check(base)
    if not browser:
        print("\n⚠ 未找到 Chrome/Edge，跳过客户端与视口检查")
    else:
        profile = tempfile.mkdtemp(prefix="knowisle-smoke-")
        try:
            failed += chrome_check(base, browser, profile)
        finally:
            shutil.rmtree(profile, ignore_errors=True)
        failed += viewport_check(base, browser)
    print("\n" + ("✅ 运行时冒烟全部通过" if failed == 0 else "❌ 运行时冒烟失败 %d 项" % failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
