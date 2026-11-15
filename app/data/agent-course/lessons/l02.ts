import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L02 = withKind(
  L(
    'L02',
    0,
    'TypeScript 工具链与固定运行环境',
    1,
    [],
    ['toolchain'],
    [
      '搭建一套固定的 Node / TypeScript 运行环境并写出环境契约',
      '实现可进 CI 的环境校验脚本，拦住版本与编译目标漂移',
      '跑通一段依赖运行时能力的冒烟测试，确认「照着做就能复现」',
    ],
    `
### 同一份代码，两台机器跑出两个结果

第一节课上就有人举手：「我照着敲了，报 \`TypeError: arr.toSorted is not a function\`。」讲师在自己机器上跑同一段代码，好好的。查了二十分钟，原因很朴素：讲师的 Node 是较新的 LTS，学员装的是更早的主版本，而 \`Array.prototype.toSorted\` 是 ES2023 才进标准的 API。同一天还有第二起：另一位学员的 \`tsconfig\` 沿用了旧模板，\`target\` 与 \`lib\` 指向更早的 ECMAScript 版本，编辑器和运行时对同一段代码的理解都不一致。

这两起都不是「代码写错了」，是**环境没被声明**。后面一百多课里到处是「跑通」「照着做一遍」「用 L94 的对照实验量一下」——如果运行环境本身是浮动的，所有这些可复现的承诺都会在某台机器上悄悄失效。所以这门课的第一件事不是装框架，是把环境写成一份**能被机器读取、能被 CI 校验的契约**。

### 四类环境差异，症状都不像环境问题

| 差异 | 典型症状 | 为什么难查 | 固定方式 |
|---|---|---|---|
| Node 主版本 | 某个数组 / Promise API 不存在，或行为不同 | 报错指向自己的代码，不像缺环境 | \`engines\` + \`.nvmrc\` + 启动校验 |
| TS 版本与编译目标 | 本地能过、CI 报类型错；或运行时语义与类型检查不一致 | 编辑器与 CI 用的可能不是同一份 tsconfig | 固定 \`target\` / \`lib\` / \`moduleResolution\` |
| 包管理器 | 依赖树不同、peer 解析不同、lockfile 格式不兼容 | 都能装成功，只是装出来的东西不一样 | 固定包管理器与主版本（L03） |
| locale / 时区 | 日期、排序、数字格式化结果不同 | 只在特定数据上出现，容易被当成模型随机性 | 显式设 \`TZ=UTC\` 与 \`LANG\` |

第四行尤其值得单独记住：Agent 课程里大量结论涉及「同一输入是否得到同一结果」，而时区与 locale 会悄悄改变格式化后的提示词文本。**把这类差异误判成模型不稳定，是排查里最费时间的一种弯路**。

:::deep
### 固定环境不是洁癖，是复现的前提

L94 讲对照实验要锁五个变量：需求、模型、工具集、评测集、超时重试。其实还隐含着第六个——**运行环境**。如果 A 版本在旧 LTS 上跑、B 版本在新 LTS 上跑，量到的通过率差异里就混进了运行时差异，归因表再漂亮也没有说服力。

同样的逻辑适用于 L95 的 core 零依赖骨架：core 层不依赖框架，但它仍然依赖「语言运行时提供哪些内建能力」。把 \`target\` / \`lib\` 固定下来，等于给这一层划定了能力边界；否则某天有人用了个新 API，代码在学员机器上直接崩，而且没有任何一行改动能解释它。

所以环境契约的定位是**实验装置的一部分**，不是项目规范里的装饰。它应该和评测集、回归基线放在同一类资产里管理：能读、能校验、失败时给出明确提示。
:::

### 环境契约：写进文件，而不是写进 README

\`\`\`json title="package.json / .nvmrc / tsconfig 的固定取值" note="要点：版本写进可被脚本读取的字段；README 里那句「需要 Node 24」不算契约。"
{
  "name": "agent-from-scratch",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "check:env": "node scripts/check-env.mjs",
    "smoke": "node scripts/smoke.mjs",
    "test": "pnpm check:env && pnpm smoke"
  }
}
\`\`\`

\`\`\`json title="tsconfig.json 关键字段" note="要点：target / lib / module / moduleResolution 四项固定；不要沿用脚手架模板里的默认值。"
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts"]
}
\`\`\`

\`\`\`text title=".nvmrc" note="要点：单行、无注释，供 nvm / fnm / CI 直接读取。"
24
\`\`\`

三份文件各自管一件事：\`engines\` 是声明，\`tsconfig\` 是编译边界，\`.nvmrc\` 是本地切换依据。**声明与校验必须成对出现**——只写 \`engines\` 而不校验，npm 默认只给一条警告，很多人会直接忽略过去。

### 校验脚本：让漂移在第一步就报错

\`\`\`ts title="scripts/check-env.mjs" note="要点：校版本、校编译目标、校包管理器、校时区 locale；失败信息要写清「该怎么做」。"
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'))
const errors = []

const major = Number(process.versions.node.split('.')[0])
const wanted = Number(pkg.engines.node.match(/>=(\\d+)/)?.[1])
if (major !== wanted) {
  errors.push('Node 主版本不符：当前 ' + process.versions.node + '，要求 ' + pkg.engines.node
    + '。请运行 nvm use（读取 .nvmrc）')
}

const opt = tsconfig.compilerOptions ?? {}
for (const [key, expected] of Object.entries({
  target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
})) {
  if (opt[key] !== expected) {
    errors.push('tsconfig.' + key + ' = ' + String(opt[key]) + '，要求 ' + String(expected))
  }
}
if (!Array.isArray(opt.lib) || !opt.lib.includes('ES2023')) {
  errors.push('tsconfig.lib 缺 ES2023，部分示例 API 将无法通过类型检查')
}

const pm = process.env.npm_config_user_agent ?? ''
if (pkg.packageManager && !pm.startsWith(pkg.packageManager.split('@')[0] + '/')) {
  errors.push('包管理器不符：声明 ' + pkg.packageManager + '，当前 ' + (pm || '未知'))
}

// 时区与 locale 会改变格式化后的提示词文本，别让它成为「模型不稳定」的假象
if (process.env.CI && process.env.TZ !== 'UTC') {
  errors.push('CI 未固定 TZ=UTC，日期相关用例会出现环境差异')
}

if (errors.length) {
  console.error('环境契约校验失败：\\n- ' + errors.join('\\n- '))
  process.exit(1)
}
console.log('环境契约通过：Node ' + process.versions.node + ' / ' + opt.target + ' / ' + pkg.packageManager)
\`\`\`

脚本里两处刻意的设计：失败信息带**修复动作**（\`nvm use\`），而不是只打印「版本不对」；\`strict\` 也纳入校验，因为它一旦被关掉，后面 L95 那些类型契约示例会集体失去意义。把 \`check:env\` 挂在 \`test\` 最前面，任何人拉下仓库跑测试都会先过这一关。

### 冒烟测试：确认运行时真的有这些能力

\`\`\`ts title="scripts/smoke.mjs" note="要点：不测业务逻辑，只测「环境是否具备课程依赖的运行时能力」。"
// 课程示例会用到的运行时能力，缺一个就该在这里失败，而不是在第三十课里失败
const checks = {
  toSorted: typeof Array.prototype.toSorted === 'function',
  structuredClone: typeof structuredClone === 'function',
  withResolvers: typeof Promise.withResolvers === 'function',
  fetch: typeof fetch === 'function',
  webcrypto: Boolean(globalThis.crypto?.subtle),
}

const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
if (missing.length) {
  console.error('运行时能力缺失：' + missing.join(', ') + '。请检查 Node 主版本与 lib 配置')
  process.exit(1)
}
console.log('冒烟通过：' + Object.keys(checks).length + ' 项运行时能力可用')
\`\`\`

冒烟测试的价值在于**把失败提前**。开班第一课发现 Node 版本不对，代价是三十秒；等到 L87 讲 WebCrypto 加密配置时才发现，学员已经写了几百行代码，而且会先怀疑自己写错了。

:::warn
### 两个必踩的坑

- **只在 README 写「需要 Node 24」**。人不会逐字读，读了也可能忘，CI 更不会照做。声明必须放进 \`engines\` / \`.nvmrc\`，并配一个退出码非 0 的校验脚本。
- **混用 Deno / Bun 跑课程示例**。它们对 Node 内建模块、Web API、包解析的实现各有差异，同一段代码的行为未必一致。本课程统一用 Node + TypeScript；想换运行时，先把整套环境契约和冒烟测试一起换掉，而不是只改启动命令。
:::

### 有了容器，还需要契约吗

常有人问：直接发一个 Dockerfile，把 Node、依赖、系统库全钉死，不就一劳永逸了吗？生产环境确实应该这么做，而且建议**容器与环境契约双保险**——镜像里的 Node 版本仍然要有 \`engines\` / \`tsconfig\` 与之对应，否则某天基础镜像被更新，你连「到底哪一档变了」都说不清。

但在学习阶段，只给容器反而有害：它把「环境差异会长成什么症状」整个藏起来了。学员后面遇到 \`toSorted\` 缺失、时区导致提示词文本不同、\`strict\` 被关掉后类型契约失效这类问题，若从没见过差异本身，就只会归因为「模型又不稳定了」。所以这门课选择把环境**显式摊开**：先声明、再校验、最后才是可选地装进容器。理解差异来源，比一键抹平差异更有长期价值。

### 升级环境是一次变更，不是改个数字

Node 的 LTS 会换、TypeScript 会升、包管理器会发新版。这些升级不能由某个人顺手改一下 \`.nvmrc\` 就合入，它们和 L122 讲的模型供应商变更是同一类事情：**名字没变，行为可能变了**。一次稳妥的升级至少走五步：改契约文件 → 跑 \`pnpm smoke\` 确认新运行时具备课程依赖的能力 → 跑 L80 的回归基线 → 在 L94 的对照实验里把新旧环境各跑一遍、锁住其余五个变量 → 才允许全量切换。

第五步经常被省掉，代价是**历史结论失去可比性**：如果 L94 那张对照表里的通过率是旧环境量出来的，而新版本换了运行时，两组数字就不再能直接相减。遇到这种情况，正确做法不是把旧数字删掉，而是在新基线里标注「环境版本已变更，历史数据仅作参考」——和 L126 的 \`RunManifest\` 记录四个版本号是同一个思路。**会变的东西要显式声明，不能靠记忆维持**，环境也一样。

### 验收清单

| 检查项 | 怎么验 | 失败时该做什么 |
|---|---|---|
| Node 主版本 | \`node -v\` 与 \`engines\` 一致 | \`nvm use\` |
| 编译目标 | \`check:env\` 四项字段全过 | 覆盖模板默认 tsconfig |
| 包管理器 | \`npm_config_user_agent\` 前缀匹配 | 用声明的 pnpm 版本重装 |
| 运行时能力 | \`pnpm smoke\` 五项全绿 | 换 Node 版本，别改课程代码 |
| CI 一致性 | CI 里同样跑 \`check:env\` | 把校验挂进流水线第一步 |

五行都能打勾，才可以说「这门课的所有示例在你机器上可复现」。注意最后一行：**本地过了不等于 CI 过了**，两条路径必须跑同一份契约。

### 与相邻课的分工

- **L03**：本课固定运行时与编译目标，L03 固定依赖与 lockfile；两者合起来才是完整的「可复现」。
- **L04**：本课给环境，L04 在这个环境里搭最小 Agent 工程。
- **L94 / L95**：对照实验的五锁与 core 零依赖骨架，都默认环境契约已经生效。
- **L127**：部署实战里的 \`/ready\` 探针，本质是把这套思想搬到生产环境。

**一句话收束**：固定运行环境不是开局的形式主义，是**后面每一句「你也能跑出这个结果」的兑现凭证**。
`,
    null,
    [
      {
        text: '同一份代码报 toSorted is not a function，最该先查什么？',
        options: ['模型返回错', 'Node 主版本与 tsconfig 的 target / lib', '网络', '缓存'],
        answer: 1,
        explain: 'ES2023 API 是否可用由运行时与编译目标共同决定。',
        concept: 'toolchain',
      },
      {
        text: '只在 README 写「需要 Node 24」为什么不够？',
        options: [
          '字数太少',
          '人不会逐字读、CI 不会照做，必须有可被脚本校验的声明',
          'README 会被删',
          '版本会变',
        ],
        answer: 1,
        explain: '声明与校验要成对出现，且校验退出码必须非 0。',
        concept: 'toolchain',
      },
      {
        text: '冒烟测试应该测什么？',
        options: ['业务通过率', '课程依赖的运行时能力是否可用', '模型质量', '磁盘空间'],
        answer: 1,
        explain: '把环境缺失提前暴露，避免后面误判成自己代码写错。',
        concept: 'toolchain',
      },
    ],
    [
      ['环境契约', '可被 CI 读取的 Node / TS / 包管理器 / 时区固定声明'],
      ['编译目标', 'tsconfig 里固定的 target 与 lib，划定运行时能力边界'],
      ['冒烟测试', '只测环境能力、不测业务，把失败提前到第一课'],
    ],
    [
      '把版本号只写进 README 不做校验，环境漂移会在几十课后才以奇怪的报错出现。',
      '混用 Deno / Bun 跑课程示例，内建模块与包解析差异会让同一段代码行为不一致。',
    ],
  ),
  'practice',
)
