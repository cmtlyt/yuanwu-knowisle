import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L03 = withKind(
  L(
    'L03',
    0,
    '版本锁定表与依赖安装',
    1,
    ['L02'],
    ['version-lock'],
    [
      '写出课程关键依赖的版本锁定表与精确版本声明',
      '实现安装前校验脚本，拦住浮动版本、lockfile 漂移与 peer 冲突',
      '跑通「升级单个依赖」的回归流程并留下变更记录',
    ],
    `
### 周末没人改代码，周一 CI 全挂了

周五下班前所有测试还是绿的，周一早上二十几个用例一起失败，报错都指向同一个地方：解析模型返回的工具调用时读不到 \`tool_calls\`。查下来是上游 SDK 在周末发了个小版本，把返回结构里的内容包进了一层数组——**按 semver 这算小版本，不算破坏性变更**，可我们的解析代码是按旧结构写的。更麻烦的是，各人本地装到的版本还不一样：有人用 \`^\` 装到了新版，有人因为 lockfile 被另一个包管理器重写过，装出来的依赖树完全不同，于是「在我这儿能跑」这句话第一次失去了意义。

这次事故里没有任何一行课程代码被改动。变的只有依赖，而依赖是**会自己更新的**。L02 固定了 Node 与编译目标，这一课要固定的是另一半：装了什么、装到哪个版本、以及凭什么相信它和昨天行为一样。

### 四类「没锁住」，症状都不像依赖问题

| 没锁住的东西 | 典型症状 | 为什么难查 | 防线 |
|---|---|---|---|
| 浮动版本 \`^\` / \`~\` / \`latest\` | 重装后行为变了 | 报错指向自己的解析逻辑 | 精确版本 + 安装前扫描 |
| lockfile 未提交或被重写 | 各人依赖树不同 | 都能装成功，结果不一样 | 固定包管理器 + lockfile 完整性校验 |
| peer 依赖冲突 | 运行时才炸，类型检查能过 | 警告被安装日志淹没 | 显式声明 peer 并校验一致 |
| 传递依赖漂移 | 深层包被上游升级 | 不在自己的 \`package.json\` 里 | 锁定表记录关键传递依赖 |

第三行值得展开：课程后面 L95 要搭一个 core 零依赖骨架，L94 要做对照实验，两者都默认「同一份代码、同一批依赖，行为稳定」。一旦依赖树浮动，量到的差异就不知道是框架差异还是装错了包——**可复现性不是某个环节的属性，是整条链的属性**。

:::deep
### 锁定的是行为，不只是数字

Semver 的 \`^\` 建立在「小版本不破坏行为」的约定上。这个约定对**接口签名**大致成立，但对 Agent 场景里最要命的东西并不成立：JSON 返回结构、默认超时、工具调用格式、拒绝策略、错误码文案。这些改了往往照样发小版本，因为从库的作者看，它们不是 API break；从我们看，解析代码当场就错。

所以「锁版本」的真实含义是**锁住一组已验证过的行为**。这也是 L122 能力契约要用行为指纹而不是只记模型名的原因——名字没变，行为可以变。课程里 L94 的五锁、L95 的四重版本锁、L121 第三方 MCP Server 精确到 commit 的 \`ref\`，本质都是同一条原则在不同层的落地：**凡是会自己变的东西，都要显式声明并定期复评**。

一张人工可读的「版本锁定表」因此有必要独立于 lockfile 存在：lockfile 记录机器装了什么，锁定表记录**我们为什么用这个版本、哪几课依赖它、谁负责升级**。前者给机器看，后者给人看。
:::

### 锁定表与精确版本声明

\`\`\`json title="deps.lock.json：人工可读的版本锁定表" note="要点：除了版本，还要记用途、引入课与升级责任人；这张表是评审对象。"
{
  "runtime": "node 24 LTS",
  "packageManager": "pnpm@10.0.0",
  "deps": [
    { "name": "openai", "version": "5.20.3", "why": "模型调用与工具调用示例", "usedBy": ["L10", "L38"], "owner": "platform" },
    { "name": "zod", "version": "3.24.2", "why": "工具参数与结构化输出校验", "usedBy": ["L40", "L106"], "owner": "platform" },
    { "name": "typescript", "version": "5.8.3", "why": "类型契约与编译目标", "usedBy": ["L02", "L95"], "owner": "toolchain" }
  ],
  "lockedAt": "2026-11-15",
  "reviewEveryDays": 90
}
\`\`\`

\`\`\`json title="package.json：精确版本，不用 ^" note="要点：所有直接依赖写死版本；packageManager 与 L02 的契约一致。"
{
  "dependencies": {
    "openai": "5.20.3",
    "zod": "3.24.2"
  },
  "devDependencies": {
    "typescript": "5.8.3"
  },
  "packageManager": "pnpm@10.0.0"
}
\`\`\`

\`usedBy\` 那一列不是文档装饰：升级某个依赖时，它直接告诉你该重跑哪几课的示例与断言。没有这一列，升级就变成「全量回归一遍」，而全量太贵的结果往往是干脆不回归。

### 安装前校验：让漂移在 install 之前就停住

\`\`\`ts title="scripts/check-deps.mjs" note="要点：扫浮动 specifier、比对锁定表、验 lockfile 完整性、查 peer 与复评期。"
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('deps.lock.json', 'utf8'))
const errors = []

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
for (const [name, spec] of Object.entries(allDeps)) {
  if (/[\\^~*]|latest|next/i.test(String(spec))) {
    errors.push('浮动版本: ' + name + '@' + spec + ' -> 请写成精确版本')
  }
}

for (const d of lock.deps) {
  const installed = allDeps[d.name]
  if (installed && installed !== d.version) {
    errors.push('与锁定表不一致: ' + d.name + ' 声明 ' + installed + '，锁定表 ' + d.version)
  }
  if (!installed) errors.push('锁定表里的依赖未声明: ' + d.name)
}

const lockfile = 'pnpm-lock.yaml'
if (!existsSync(lockfile)) {
  errors.push('缺少 ' + lockfile + '，请提交 lockfile 且不要加入 .gitignore')
} else {
  // 只比较 lockfile 头部记录的 importer 声明，避免每次安装都误报
  const text = readFileSync(lockfile, 'utf8')
  for (const [name, spec] of Object.entries(allDeps)) {
    if (!text.includes(name + ':') || !text.includes(String(spec))) {
      errors.push('lockfile 未反映 ' + name + '@' + spec + '，请重新安装并一起提交')
    }
  }
}

const days = (Date.now() - Date.parse(lock.lockedAt)) / 86_400_000
if (days > lock.reviewEveryDays) errors.push('锁定表超过复评期未复核，请逐项确认后再安装')

if (errors.length) {
  console.error('依赖校验失败：\\n- ' + errors.join('\\n- '))
  process.exit(1)
}
console.log('依赖校验通过：' + Object.keys(allDeps).length + ' 个直接依赖，' + lock.deps.length + ' 条锁定记录')
\`\`\`

\`execSync\` 那一行导入在示例里没用到，正式实现里可以接 \`pnpm install --frozen-lockfile\`：它的语义正是「lockfile 与声明不一致就直接失败，而不是偷偷改写」。这比事后比对更硬，但也要配合上面的校验脚本给出人能读懂的错误——\`--frozen-lockfile\` 的原生报错对新手相当不友好。

### 升级流程：一次只动一个依赖

\`\`\`ts title="scripts/upgrade-one.mjs" note="要点：一次一个依赖；先跑 smoke 与回归基线；把变更写回锁定表并留审计。"
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const [name, version] = process.argv.slice(2)
if (!name || !version) throw new Error('用法: node scripts/upgrade-one.mjs <包名> <精确版本>')

const lockPath = 'deps.lock.json'
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const entry = lock.deps.find((d) => d.name === name)
if (!entry) throw new Error('该依赖不在锁定表里，请先补登记再升级')

const before = entry.version
entry.version = version
lock.lockedAt = new Date().toISOString().slice(0, 10)

execSync('pnpm add ' + name + '@' + version + ' --save-exact', { stdio: 'inherit' })
execSync('pnpm check:env && pnpm smoke', { stdio: 'inherit' })       // L02 环境契约 + 能力冒烟
execSync('pnpm regression', { stdio: 'inherit' })                    // L80 回归基线

writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\\n')
console.log('升级完成: ' + name + ' ' + before + ' -> ' + version
  + '；请重跑 usedBy 中的课程: ' + entry.usedBy.join(', '))
\`\`\`

这个脚本的关键不是自动化，而是**把顺序固化**：先改声明、装精确版本、跑环境冒烟、跑回归基线、最后才写回锁定表。任何一步失败，锁定表都还没被更新，回滚只需丢弃改动。特别提醒最后那句输出：\`usedBy\` 里的课程示例要重跑一遍，因为它们才是这个依赖真正的「用户」；只跑单元测试很容易漏掉「JSON 结构变了」这类破坏。

:::warn
### 两个必踩的坑

- **图方便用 \`^\`**。它把「什么时候升级」的决定权交给了每一次 \`pnpm install\`，而升级本该是一次有人评审、有回归、有记录的变更。周末那起事故就是这么来的。
- **把 lockfile 加进 .gitignore**。理由是「每次都变、冲突麻烦」，结果是每个人的依赖树各不相同，「在我这儿能跑」变成无法证伪的说法。lockfile 必须提交，冲突要在评审里解决，而不是靠忽略来回避。
:::

### 传递依赖：不在 package.json 里，也会变

锁定表只列直接依赖，可事故常常来自更深的层：某个工具库依赖的解析包被上游升级，改了默认行为，而你的 \`package.json\` 里连它的名字都没有。处理这类漂移有三个动作，都不复杂但很少一起做。

第一，**关键传递依赖显式钉住**。用包管理器的 \`overrides\`（pnpm 里是 \`pnpm.overrides\`）把那些「行为一变就出事」的深层包固定到已验证版本，并同样登记进锁定表的 \`deps\`，注明它是传递依赖、为什么钉住。第二，**锁文件差异进评审**。\`pnpm-lock.yaml\` 的改动不该被当成「自动生成的文件」直接略过——一次 \`pnpm add\` 若顺带改了十几行无关包，就该问一句为什么。第三，**固定 registry 与审计**，避免同名包从不同源解析出不同内容：

\`\`\`json title="pnpm.overrides 与 registry 固定" note="要点：只钉「行为敏感」的传递依赖；overrides 的每一项都要在锁定表里有理由。"
{
  "pnpm": {
    "overrides": {
      "json-parse-even-better": "1.0.3"
    }
  },
  "publishConfig": { "registry": "https://registry.npmjs.org/" }
}
\`\`\`

\`\`\`ts title="升级流程末尾追加供应链检查" note="要点：审计与 diff 一起看，别只跑单元测试。"
execSync('pnpm audit --audit-level=high', { stdio: 'inherit' })
const diff = execSync('git diff -- pnpm-lock.yaml', { encoding: 'utf8' })
const touched = [...diff.matchAll(/^[+-]\\s{2}([a-z@][^:]+):/gm)].map((m) => m[1])
console.log('本次锁文件变动的包: ' + [...new Set(touched)].join(', '))
\`\`\`

\`touched\` 那行列出的包名，就是评审时要逐项确认的对象。它不阻止升级，只是让「顺带变了什么」从不可见变成可见——和 L02 的环境契约一样，**可复现的前提是变化可被看见**。

### 验收清单

| 检查项 | 怎么验 | 失败时该做什么 |
|---|---|---|
| 无浮动版本 | \`check-deps\` 扫描全部直接依赖 | 改成精确版本 |
| 声明与锁定表一致 | 逐项比对 | 走 \`upgrade-one\`，别手改 |
| lockfile 已提交且一致 | \`--frozen-lockfile\` 安装 | 重装并一起提交 |
| 包管理器一致 | L02 的 \`check:env\` | 用声明的版本 |
| 锁定表在复评期内 | \`lockedAt\` 与 \`reviewEveryDays\` | 逐项复核并更新 |

五行都过了，L04 的脚手架才有一个稳定的地基。注意第三行与 L02 的最后一行是同一条：**本地能装不等于 CI 能装**，两条路径必须跑同一份校验。

### 与相邻课的分工

- **L02**：固定运行时与编译目标；本课固定依赖与 lockfile，两者合起来才是完整的可复现环境。
- **L04**：本课给稳定地基，L04 在上面搭最小 Agent 工程。
- **L95 / L94**：四重版本锁与对照实验五锁，都把「依赖行为不变」当作隐含前提。
- **L121 / L122**：第三方 MCP Server 精确 \`ref\`、模型能力契约与行为指纹，是同一原则在外部依赖上的延伸。
- **L126**：契约责任矩阵，本课的 \`owner\` 与 \`reviewEveryDays\` 是它在依赖层的雏形。

**一句话收束**：\`^\` 锁的是版本号，锁定表锁的是**一组已经验证过的行为**；升级是一次变更，不是一次安装。
`,
    null,
    [
      {
        text: '周末没人改代码、周一解析全挂，最可能的原因是？',
        options: [
          '磁盘故障',
          '上游 SDK 小版本改了 JSON 返回结构，而本地用了浮动版本',
          'Node 被卸载',
          '缓存过期',
        ],
        answer: 1,
        explain: 'semver 小版本不保证「行为结构」不变，^ 把升级时机交给了每次 install。',
        concept: 'version-lock',
      },
      {
        text: '版本锁定表相比 lockfile 多出的关键信息是？',
        options: ['文件更大', '用途、引入课与升级责任人', '压缩算法', '安装速度'],
        answer: 1,
        explain: 'lockfile 给机器看，锁定表给人看并支撑升级评审。',
        concept: 'version-lock',
      },
      {
        text: '升级单个依赖的正确顺序是？',
        options: [
          '先改代码再装',
          '改声明 → 装精确版本 → 冒烟 → 回归基线 → 写回锁定表',
          '直接改 lockfile',
          '只跑单元测试',
        ],
        answer: 1,
        explain: '任何一步失败时锁定表都未更新，回滚只需丢弃改动。',
        concept: 'version-lock',
      },
    ],
    [
      ['版本锁定表', '记录关键依赖精确版本、用途、引入课与升级责任人的人工可读清单'],
      ['浮动版本', '^ / ~ / latest 等把升级时机交给每次安装的写法'],
      ['--frozen-lockfile', 'lockfile 与声明不一致即失败，不偷偷改写依赖树'],
    ],
    [
      '用 ^ 图方便，等于把「什么时候升级」交给每一次 install。',
      '把 lockfile 加进 .gitignore，各人依赖树不同且无法证伪「在我这儿能跑」。',
    ],
  ),
  'practice',
)
