# 00062 · `:::tone` 容器内的块级内容被压平

## 症状

在 `:::deep` 容器里写 Markdown 表格，页面显示成一长串竖线：

```text
四种「多路径」手段摆在一起，成本结构完全不同： | 方法 | 路径间关系 | 需要评估器 | … |---|---|---|---|
| n-best 重采样 | 独立 | 需要（选一条） | …
```

`<table>` 完全没有生成。同理，容器内的无序列表 / 有序列表会被挤成一段连续文字，多段落合并成单段。

## 根因

`app/lib/markdown.ts` 的 `callout_open` 渲染规则里，正文是这样输出的：

```ts
const bodyHtml = body ? `<p>${mdInstance.renderInline(body)}</p>` : ''
```

`renderInline` 只做**行内**解析（强调、行内代码、链接），不解析块级语法（表格、列表、段落、围栏
代码）。容器把多行正文当成一段文本喂给它，所以表格分隔行与管道符原样保留成了可见文字。

容器规则本身没问题——它把容器体按行收集进 `meta.inner`，是**渲染出口**丢掉了块级结构。

## 修复

两处，缺一不可：

1. **渲染出口改块级**（`app/lib/markdown.ts`）：正文改用 `render` 并对容器内正文同样跑
   `normalizeFenceInfo`（容器里的围栏不经过顶层 `renderMarkdown` 的那次归一化，需要单独兜一层）。

   ```ts
   const bodyHtml = body ? mdInstance.render(normalizeFenceInfo(body)) : ''
   ```

2. **保留段间空行**：原来拆行时用了 `.filter(l => l.trim() !== '')`，把所有空行都吃掉了。即使改成
   块级渲染，`第一段\n第二段` 仍是一段。改为只去首尾空行、保留中间空行：

   ```ts
   const raw = (meta.inner || '').split('\n')
   while (raw.length && raw[0].trim() === '') raw.shift()
   while (raw.length && raw[raw.length - 1].trim() === '') raw.pop()
   ```

   这一处是自检断言逼出来的——第一版只改了第 1 点，`容器内多段落` 用例直接失败（自检脚本见下）。

3. **样式补齐**（`app/assets/css/main.css`）：原来只有 `.callout p { margin: 0 }`，多段落会挤在一起、
   列表与表格没有间距。

   ```css
   .callout p + p { margin-top: 8px; }
   .callout ul, .callout ol { margin: 6px 0 0; padding-left: 20px; }
   .callout li + li { margin-top: 4px; }
   .callout table { margin-top: 8px; font-size: 12.5px; }
   .callout .code-block { margin-top: 8px; font-size: 12px; }
   ```

## 兼容性

- **单段正文 HTML 不变**：`render(body)` 对单个段落同样产出 `<p>…</p>`；变化只发生在「容器内有多个
  块」的少数节，以及多段落被正确拆开（原来 3 段挤成 1 段，现在 3 个 `<p>`）。
- 容器标题仍取第一行并剥掉 `###`，用 `renderInline` 渲染，不受影响。
- 嵌套容器仍不支持（块规则在遇到第一个 `:::` 行时就截断），本次未改这一点。

## 影响面（修复前统计）

| 情况 | 处数 | 涉及课 |
|---|---|---|
| 容器内含表格 | 1 | L25（00061 新增内容时撞到） |
| 容器内含列表 | 2 | L23 / L24（00061 新增内容） |
| 容器内含多段落 | 多处 | 全部课时的 `:::warn` 三段式 |

前两类是新增内容撞出来的，第三类是历史内容一直存在但不易察觉（多段被合并成一段，读起来「密」但
不破损）。修复后三类都正常。

## 验证

<section id="result">

**闸门化**：`scripts/verify-content-stats.mjs` 新增第三段「容器内块级内容渲染」，4 条构造用例
（表格 / 无序列表 / 有序列表 / 多段落）+ 1 条真实课程扫描（容器里有表格行就必须渲染出 `<table>`）。
第一版修复正是被「多段落」这条用例拦下的（`✗ 未生成 <p>第二段</p>`），这就是它存在的意义。

- `verify-content-stats`：10 条口径断言 + 4 条渲染断言 + 194 课抽样，全绿。
- `renderMarkdown(L25.md)`：`<table>` 2 个（修复前 1 个）、`<ul>` 1 个；`renderMarkdown(L23.md)`：
  `<ol>` 1 个；`renderMarkdown(L19.md)`：单个 callout 内 3 个 `<p>`（修复前 1 个）。
- 端到端（wrangler 3199，SSR HTML）：L23 / L24 / L25 表格 1–2、callout 3、列表项 3–6；历史课
  L46 / L56 结构不变（callout 3、列表项 4）。
- 门禁：`content-gate` 21/142 + 121 豁免、`pnpm verify` 四段、`check-course`、`fmt:check` 307 文件、
  `lint` 0e/4w、`typecheck` 0e/9w、`build` 13.9s。

</section>

## 与 00058 那次「围栏泄漏」的关系

两次是同一类问题：**内容层用了 Markdown 语法，渲染层没有对应的解析路径**。00058 是围栏 info-string
里带反引号导致整块不被识别为代码块（数据侧 + 兜底 + 闸门三层修），这次是容器内块级语法没有进入块级
解析器（渲染侧 + 样式两层修）。

共同教训已写进 `AGENTS.md` §7 的相邻新行：**新增 Markdown 语法支持时，必须在容器内也验证一遍**，
因为容器走的是独立渲染出口。
