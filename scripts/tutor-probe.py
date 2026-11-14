"""助学 Agent 动态回归探针（真实 Chrome + Workers 预览 + 本地 mock 端点）。

人工按需执行，不进 CI（依赖本机 Chrome / wrangler）：

    # 终端 1：构建 + 起预览
    pnpm build
    pnpm exec wrangler --cwd .output dev --port 3199
    # 终端 2：mock 端点
    python scripts/tutor-mock.py --port 3210
    # 终端 3：探针
    python scripts/tutor-probe.py --site http://127.0.0.1:3199 --mock http://127.0.0.1:3210

覆盖：配置 AES-GCM 落盘 / 指纹漂移 / 连接测试 / 请求契约 / SSE 逐帧 /
Markdown + XSS / 错误码降级 / 意图路由（含弱导航与 askAi 兜底） / 学情注入范围 /
清除全部对话 / OPFS 异常降级 / body 滚动锁 / 会话动作 / system 消歧规则。

上游缺陷（00029 审计）：P0 清除漏删、P0 OPFS 降级链断裂、
P1 学情注入范围、P1 意图正则误判——本探针均断言修复后的行为。
"""
import argparse
import json
import sys
import time
import urllib.request

from cdp import CDP

SITE = "http://127.0.0.1:3199"
MOCK = "http://127.0.0.1:3210"
BASE_URL = "http://127.0.0.1:3210/v1"

PASS = 0
FAIL = 0


def check(label, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ✓ " + label + ((" — " + str(extra)) if extra else ""))
    else:
        FAIL += 1
        print("  ✗ " + label + ((" — " + str(extra)) if extra else ""))


def info(label, value):
    print("  · " + label + ": " + str(value))


def jstr(s):
    return json.dumps(s, ensure_ascii=False)


def ev(c, expr):
    return c.evaluate(expr)


def ev_async(c, expr):
    r = c.call("Runtime.evaluate", {
        "expression": expr, "awaitPromise": True, "returnByValue": True,
    })
    return r.get("result", {}).get("value")


def wait_until(c, predicate, timeout=12, interval=0.15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            value = predicate(c) if callable(predicate) else ev(c, predicate)
            if value:
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def mock_log():
    with urllib.request.urlopen(MOCK + "/__log", timeout=5) as r:
        return json.loads(r.read().decode("utf-8"))


def mock_reset():
    req = urllib.request.Request(MOCK + "/__reset", data=b"{}", method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        r.read()


def go(c, path, settle=0.9):
    c.navigate(SITE + path, settle=settle)
    # 让 confirm/alert 不阻塞探针（设置页的清除入口会用）
    ev(c, "window.confirm = () => true; window.alert = () => {}; true")
    return wait_until(c, "!!document.querySelector('.tutor-fab')", 10)


def set_input(c, selector, value):
    expr = (
        "(() => { const el = document.querySelector(%s); if (!el) return false; "
        "const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; "
        "Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, %s); "
        "el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()"
        % (jstr(selector), jstr(value))
    )
    return ev(c, expr)


def click_text(c, text):
    expr = (
        "(() => { const b = [...document.querySelectorAll('button')]"
        ".find(x => x.textContent.trim().includes(%s)); if (!b) return false; b.click(); return true; })()"
        % jstr(text)
    )
    return ev(c, expr)


def open_drawer(c):
    for _ in range(4):
        ev(c, "document.querySelector('.tutor-fab')?.click(); true")
        if wait_until(c, "!!document.querySelector('.tutor-drawer')", 3):
            # open() 里 loadConversation() 是异步的：必须等会话就绪，否则 send() 会因
            # conversation=null 直接 return，制造「没发请求却以为跑过」的假阴性。
            wait_until(
                c,
                "document.querySelectorAll('#tutor-conv option').length > 0 "
                "|| document.querySelectorAll('.tutor-row').length > 0",
                12,
            )
            wait_until(c, "!document.querySelector('.td-busy')", 12)
            time.sleep(0.25)
            return True
        time.sleep(0.5)
    return False


def close_drawer(c):
    ev(c, "document.querySelector('.td-actions .icon-btn:last-child')?.click(); true")
    return wait_until(c, "!document.querySelector('.tutor-drawer')", 5)


def send(c, text):
    before = ev(c, "document.querySelectorAll('.tutor-row.role-user').length") or 0
    ok_input = set_input(c, ".td-inputrow textarea", text)
    wait_until(c, "!document.querySelector('.td-send')?.disabled", 3)
    ev(c, "document.querySelector('.td-send')?.click(); true")
    # 用户气泡同步入 feed：用来确认 send() 没被 early-return（会话未就绪 / streaming 未复位）
    landed = wait_until(
        c, "document.querySelectorAll('.tutor-row.role-user').length > %d" % before, 8
    )
    return bool(ok_input and landed)


def wait_request(c, before, timeout=20):
    """等 mock 端点真的收到本次 LLM 请求（网络不可达场景不适用）。"""
    return wait_until(c, lambda _c: len(mock_log()) > before, timeout)


def last_md(c, prop="innerHTML"):
    """只看最后一个 assistant 气泡，避免历史会话里的旧回复造成假阳性。"""
    return ev(c, "(function(){const a=[...document.querySelectorAll('.tutor-row.role-assistant .tutor-md')]; "
                 "return a.length ? a[a.length-1].%s : ''})()" % prop) or ""


def wait_stream_done(c, timeout=25):
    """发送按钮文案 '➤' 表示 streaming=false；先等一拍避免抢在流式开始前。"""
    time.sleep(0.35)
    return wait_until(c, "document.querySelector('.td-send')?.textContent.trim() === '➤'", timeout)


def save_config(c, key, base=BASE_URL):
    go(c, "/settings/llm")
    set_input(c, "#llm-base", base)
    set_input(c, "#llm-key", key)
    set_input(c, "#llm-model", "mock-model")
    click_text(c, "保存配置")
    return wait_until(c, "document.body.innerText.includes('配置已加密保存')", 10)


OPFS_NAMES_JS = """(async () => {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('tutor');
    const names = [];
    for await (const [k] of dir.entries()) names.push(k);
    return JSON.stringify(names);
  } catch (e) { return JSON.stringify({ error: String(e) }); }
})()"""


def opfs_names(c):
    raw = ev_async(c, OPFS_NAMES_JS)
    try:
        parsed = json.loads(raw or "[]")
    except Exception:
        return []
    return parsed if isinstance(parsed, list) else []


def main():
    global SITE, MOCK, BASE_URL
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=SITE)
    ap.add_argument("--mock", default=MOCK)
    ap.add_argument("--width", type=int, default=390)
    ap.add_argument("--height", type=int, default=844)
    args = ap.parse_args()

    SITE = args.site.rstrip("/")
    MOCK = args.mock.rstrip("/")
    BASE_URL = MOCK + "/v1"

    print("=== 助学 Agent 动态回归（%s / mock %s / 视口 %dx%d）===" % (
        SITE, MOCK, args.width, args.height))

    try:
        mock_reset()
    except Exception as e:
        print("✗ mock 端点不可用：%s" % e)
        sys.exit(2)
    check("mock 端点就绪", True)

    with CDP() as c:
        c.start(width=args.width, height=args.height)

        # ---------- G1 未配置降级 ----------
        print("\n--- G1 未配置时的本地模式 ---")
        check("首页加载（FAB 存在）", go(c, "/"))
        check("未配置时 FAB 角标存在", ev(c, "!!document.querySelector('.fab-badge')"))
        check("FAB 可唤起抽屉", open_drawer(c))
        check("抽屉显示「本地模式」", (ev(c, "document.querySelector('.td-title .pill')?.innerText || ''") or "").find("本地模式") >= 0)
        check("抽屉 feed 非空（引导气泡）", wait_until(c, "document.querySelectorAll('.tutor-row').length > 0", 10))
        check("B1：首页不自动插学情导航卡", (ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0) == 0)
        check("C2：打开时 body 滚动被锁", ev(c, "getComputedStyle(document.body).overflow") == "hidden")
        check("抽屉可关闭", close_drawer(c))
        check("C2：关闭后滚动恢复", ev(c, "getComputedStyle(document.body).overflow") != "hidden")

        # ---------- G2 配置加密 / 指纹漂移 ----------
        print("\n--- G2 配置加密与漂移 ---")
        check("保存配置成功", save_config(c, "sk-test"))
        blob_raw = ev(c, "localStorage.getItem('knowisle:tutor:llm:v1') || ''")
        blob = {}
        try:
            blob = json.loads(blob_raw)
        except Exception:
            pass
        check("密文 blob 含 v/fp/iv/ct", all(k in blob for k in ("v", "fp", "iv", "ct")))
        check("localStorage 不含 key 明文", "sk-test" not in (blob_raw or ""))
        go(c, "/settings/llm")
        click_text(c, "测试连接")
        check("连接测试成功", wait_until(c, "(document.body.innerText || '').includes('连接成功')", 20))

        # 篡改 fp 模拟设备指纹漂移
        ev(c, "(() => { const k='knowisle:tutor:llm:v1'; const b=JSON.parse(localStorage.getItem(k)); "
              "b.fp='tampered-fingerprint'; localStorage.setItem(k, JSON.stringify(b)); return 'ok'; })()")
        go(c, "/settings/llm")
        check("指纹漂移 → 提示配置已重置", wait_until(c, "!!document.querySelector('.tutor-stale')", 10))
        check("恢复配置成功", save_config(c, "sk-test"))
        check("C1：已配置时刷新首页、未开抽屉即无角标", go(c, "/") and wait_until(
            c, "!document.querySelector('.fab-badge')", 10))

        # ---------- G3 LLM 主链路（首页）----------
        print("\n--- G3 LLM 请求契约 / SSE / Markdown ---")
        mock_reset()
        check("打开抽屉", open_drawer(c))
        check("抽屉显示「已连接」", (ev(c, "document.querySelector('.td-title .pill')?.innerText || ''") or "").find("已连接") >= 0)
        check("发送答疑问题", send(c, "讲讲 flatMap 的原理"))
        check("LLM 请求确实到达 mock", wait_request(c, 0))
        check("流式状态归位", wait_stream_done(c))
        md = last_md(c)
        check("SSE 输出含加粗", "<strong>" in md, md[:70])
        check("SSE 输出含代码块 tok-* 高亮", "code-block" in md and "tok-" in md)
        check("SSE 输出含链接", "<a " in md)
        check("XSS：LLM 文本中的 script 未注入 DOM", (ev(c, "document.querySelectorAll('.tutor-md script').length") or 0) == 0)
        check("XSS：注入脚本未执行", ev(c, "window.__xss === undefined"))

        logs = mock_log()
        check("mock 收到 chat/completions 请求", len(logs) >= 1, len(logs))
        if logs:
            e = logs[-1]
            msgs = e.get("messages") or []
            check("请求路径正确", e.get("path") == "/v1/chat/completions", e.get("path"))
            check("Bearer key 正确", e.get("auth") == "Bearer sk-test", e.get("auth"))
            check("stream=true", e.get("stream") is True)
            check("首帧为 system 且含冻结上下文", bool(msgs) and msgs[0].get("role") == "system" and "当前会话冻结上下文" in (msgs[0].get("content") or ""))
            check("末帧为用户问题", bool(msgs) and msgs[-1].get("role") == "user" and "flatMap" in (msgs[-1].get("content") or ""))
            check("B1：首页 system 不含「学情摘要」", "学情摘要" not in (msgs[0].get("content") or ""))
            sys0 = (msgs[0].get("content") or "") if msgs else ""
            check("B3：system 首帧含消歧规则与冻结上下文",
                  "语境优先" in sys0 and "当前会话冻结上下文" in sys0, sys0[:60])

        # ---------- B2 意图路由 ----------
        print("\n--- B2 答疑不再被误判为导航 ---")
        before = len(mock_log())
        nav_before = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        send(c, "这两个操作符哪个先执行？")
        wait_request(c, before)
        wait_stream_done(c)
        after = len(mock_log())
        nav_after = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        check("P1：含「哪个」的答疑走 LLM", after > before, "log %d→%d" % (before, after))
        check("P1：未额外插入本地导航卡", nav_after == nav_before, "nav %d→%d" % (nav_before, nav_after))

        # ---------- G3b 00031 A4：弱导航交 LLM / 导航卡 askAi 兜底 ----------
        print("\n--- G3b 弱导航信号与 askAi 兜底 ---")
        a_req = len(mock_log())
        a_nav = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        # 旧 NAV_RE 的裸词「导航」会把这句误判为 nav；D1① 后应真发 LLM
        send(c, "帮我导航一下")
        wait_request(c, a_req)
        wait_stream_done(c)
        a_req_after = len(mock_log())
        a_nav_after = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        check("A4①：弱导航真发 LLM 且不出本地卡",
              a_req_after > a_req and a_nav_after == a_nav,
              "log %d→%d / nav %d→%d" % (a_req, a_req_after, a_nav, a_nav_after))

        b_req = len(mock_log())
        b_nav = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        send(c, "下一步学什么")
        wait_until(c, "document.querySelectorAll('.tutor-navcard').length > %d" % b_nav, 8)
        # 计数基线必须取在「send() 之后、点击之前」：send() 本身会追加一条用户气泡，
        # 导航卡也会 +1；取在 send() 之前会让断言 off-by-one，制造假阴性。
        b_nav_with_card = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        b_users_before_click = ev(c, "document.querySelectorAll('.tutor-row.role-user').length") or 0
        # 只点最后一张卡的按钮；必须直接 runLlm()，点击不得重复追加用户气泡
        b_clicked = bool(click_text(c, "改用 AI 回答"))
        wait_until(c, lambda _c: len(mock_log()) > b_req, 20)
        wait_stream_done(c)
        b_req_after = len(mock_log())
        b_nav_after = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        b_users_after = ev(c, "document.querySelectorAll('.tutor-row.role-user').length") or 0
        b_answer = last_md(c, "innerText")
        check("A4②：强导航出卡后 askAi 触发 LLM、移除卡片、用户气泡不增、回答非空",
              b_nav_with_card > b_nav and b_clicked and b_req_after > b_req
              and b_nav_after < b_nav_with_card
              and b_users_after == b_users_before_click and bool(b_answer.strip()),
              "card %d→%d→%d click=%s log %d→%d user %d→%d ans=%d" % (
                  b_nav, b_nav_with_card, b_nav_after, b_clicked, b_req, b_req_after,
                  b_users_before_click, b_users_after, len(b_answer.strip())))

        # ---------- G4 错误码与降级 ----------
        print("\n--- G4 错误码 / 空流 / \\r 分隔 ---")
        save_config(c, "sk-401")
        go(c, "/")
        open_drawer(c)
        req = len(mock_log())
        send(c, "解释一下 401")
        check("401：请求到达 mock", wait_request(c, req))
        wait_stream_done(c)
        check("401 → 结构化系统气泡", wait_until(c, "!!document.querySelector('.tutor-note.error')", 10))
        t401 = ev(c, "document.querySelector('.tutor-note.error')?.innerText || ''") or ""
        check("401 文案指向 key", "API Key 无效" in t401, t401[:80])
        users_before = ev(c, "document.querySelectorAll('.tutor-row.role-user').length") or 0
        req = len(mock_log())
        ev(c, "document.querySelector('.tutor-note.error .btn.primary')?.click(); true")
        wait_request(c, req)
        wait_stream_done(c)
        users_after = ev(c, "document.querySelectorAll('.tutor-row.role-user').length") or 0
        check("「重试」不重复追加用户气泡", users_after == users_before, "%d→%d" % (users_before, users_after))

        save_config(c, "sk-500")
        go(c, "/")
        open_drawer(c)
        req = len(mock_log())
        send(c, "解释一下 500")
        wait_request(c, req)
        wait_stream_done(c)
        check("E1：500 显示真实状态码", wait_until(
            c, "(document.querySelector('.tutor-note.error')?.innerText || '').includes('HTTP 500')", 10))

        save_config(c, "sk-empty")
        go(c, "/")
        open_drawer(c)
        req = len(mock_log())
        send(c, "给个空回复")
        wait_request(c, req)
        wait_stream_done(c)
        check("E3：空 SSE 流给出 parse 提示", wait_until(c, "!!document.querySelector('.tutor-note.error')", 10))
        check("E3：不插入空气泡", (ev(c, "[...document.querySelectorAll('.tutor-row.role-assistant .tutor-md')].filter(e => !e.textContent.trim()).length") or 0) == 0)

        save_config(c, "sk-cr")
        go(c, "/")
        open_drawer(c)
        req = len(mock_log())
        send(c, "用 CR 行分隔的流")
        check("E8：CR 流请求到达 mock", wait_request(c, req))
        wait_stream_done(c)
        check("E8：单独 CR 分隔的 SSE 仍可渲染", "核心原理" in last_md(c, "innerText"))

        save_config(c, "sk-test", base="http://127.0.0.1:3211/v1")
        go(c, "/")
        open_drawer(c)
        send(c, "网络不可达")
        check("网络不可达 → network 文案", wait_until(
            c, "(document.querySelector('.tutor-note.error')?.innerText || '').includes('无法连接 LLM 端点')", 20))
        save_config(c, "sk-test")

        # ---------- G5 学情页注入范围 ----------
        print("\n--- G5 仅学情页自动注入学情上下文 ---")
        go(c, "/courses/effect-ts/dashboard")
        check("学情页打开抽屉", open_drawer(c))
        # 强制用当前页面重新冻结快照（会话组可能被先前课程页复用）
        opts0 = ev(c, "document.querySelectorAll('#tutor-conv option').length") or 0
        ev(c, "document.querySelectorAll('.td-actions .icon-btn')[0]?.click(); true")
        wait_until(c, "document.querySelectorAll('#tutor-conv option').length > %d" % opts0, 10)
        check("B1：学情页有开场导航卡", (ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0) > 0)
        mock_reset()
        # 用纯答疑句（含「怎么」）确保走 LLM，而不是被本地导航截走
        send(c, "讲讲 flatMap 的原理")
        wait_request(c, 0)
        wait_stream_done(c)
        logs = mock_log()
        sys_msg = ((logs[-1].get("messages") or [{}])[0].get("content") or "") if logs else ""
        check("B1：学情页 system 含「学情摘要」", "学情摘要" in sys_msg, sys_msg[-60:])

        # ---------- G6 清除全部对话（P0-1）----------
        print("\n--- G6 清除全部对话不留课程文件 ---")
        go(c, "/courses/effect-ts/lessons/L01")
        check("课时页打开抽屉", open_drawer(c))
        send(c, "下一步学什么")
        time.sleep(0.5)
        names_before = opfs_names(c)
        info("清除前 OPFS tutor/ 文件", names_before)
        check("清除前存在 home.json + effect-ts.json", "home.json" in names_before and "effect-ts.json" in names_before)
        go(c, "/settings/llm")
        check("点击「清除全部对话记录」", bool(click_text(c, "清除全部对话记录")))
        time.sleep(0.7)
        names_after = opfs_names(c)
        info("清除后 OPFS tutor/ 文件", names_after)
        check("P0：清除后不再残留 effect-ts.json", "effect-ts.json" not in names_after, names_after)

        # ---------- G7 OPFS 异常降级（P0-2）----------
        print("\n--- G7 OPFS 抛错时降级为内存态 ---")
        go(c, "/")
        ev(c, "window.__rej = []; window.addEventListener('unhandledrejection', "
              "e => window.__rej.push(String(e.reason))); 'ok'")
        patched = ev(c, "(() => { try { Object.defineProperty(navigator.storage, 'getDirectory', "
                      "{ value: () => Promise.reject(new Error('OPFS blocked by probe')), configurable: true }); "
                      "return 'patched'; } catch (e) { return String(e); } })()")
        info("getDirectory 覆写结果", patched)
        check("OPFS 异常下抽屉仍可打开", open_drawer(c))
        time.sleep(0.6)
        rej = ev(c, "JSON.stringify(window.__rej || [])") or "[]"
        feed_len = ev(c, "document.querySelectorAll('.tutor-row').length") or 0
        info("未处理异常", rej[:160])
        check("P0：无 unhandledrejection", "OPFS blocked by probe" not in rej, rej[:120])
        check("P0：抽屉 feed 非空（不空白）", feed_len > 0, feed_len)
        check("存储降级有内联提示", "本机存储不可用" in (ev(c, "document.body.innerText") or ""))
        nav0 = ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0
        send(c, "下一步学什么")
        wait_until(c, "document.querySelectorAll('.tutor-navcard').length > %d" % nav0, 8)
        check("P0：降级后本地导航仍可用", (ev(c, "document.querySelectorAll('.tutor-navcard').length") or 0) > nav0)

        # ---------- G8 交互补充 ----------
        print("\n--- G8 基础交互 ---")
        check("快捷 chips 有 3 个", (ev(c, "document.querySelectorAll('.td-chip').length") or 0) == 3)
        opts0 = ev(c, "document.querySelectorAll('#tutor-conv option').length") or 0
        ev(c, "document.querySelectorAll('.td-actions .icon-btn')[0]?.click(); true")
        time.sleep(0.6)
        opts1 = ev(c, "document.querySelectorAll('#tutor-conv option').length") or 0
        check("新建对话后切换器增加一项", opts1 > opts0, "%d→%d" % (opts0, opts1))

    print("\n=== 汇总：PASS %d / FAIL %d ===" % (PASS, FAIL))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
