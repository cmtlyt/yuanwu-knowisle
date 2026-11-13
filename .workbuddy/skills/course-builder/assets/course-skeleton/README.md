# course-skeleton 落地说明

一门课的目录骨架 + **两份仓库级共享种子**。复制后按下面两步落地，不要把整包原样塞进某门课的目录。

## 目录里的两类文件

| 文件 | 定位 | 落地位置 |
|---|---|---|
| `index.ts` / `stages.ts` / `concepts.ts` / `meta.ts` / `design.ts` / `lessons/index.ts` / `lessons/lNN.ts` | **课程级**（每门课各一份） | 复制进 `<topic>-course/` 并填内容 |
| `types.ts` / `builders.ts` | **仓库级共享（种子，每仓只落一次）** | 落成该仓库的共享层，**不放进课程目录** |

## 落地步骤

### 第一步：落共享层（每个仓库只做一次）

- `types.ts` → 该仓库的共享类型模块（如 `~/types/course`）。**若仓库已有 `~/types/course` 或等价模块，直接复用，删掉这份 `types.ts`。**
- `builders.ts` → 该仓库课程数据层的共享构造器（如 `app/data/course-builders.ts`）。**若已有，复用，不重复落。**

落地后，把本课程里各文件的 `import … from './types.ts'` / `'./builders.ts'` 改成指向共享层：

```ts
// 章节文件（stages/concepts/meta/design/lessons/*）
import type { Stage } from '~/types/course'

// 课时文件（lessons/lNN.ts）
import { L, prose, code, call, list, q } from '../../course-builders.ts'
```

### 第二步：建课程级文件（每门课都做）

- 只复制/保留**课程级**文件进 `<topic>-course/`，把课程名（如 `TOPIC_COURSE`）、`META`、各章节与课时填成真实内容。
- **不要**往课程目录里再拷一份 `types.ts` / `builders.ts`——各课各带一份会分叉，改构造器签名要改 N 处。

## 两种场景

- **本仓库（已有 `~/types/course` + `app/data/course-builders.ts`）新建第三门课**：跳过第一步（共享层已存在），只做第二步，课程文件直接 `import type … from '~/types/course'`、`import { L, … } from '../../course-builders.ts'`。
- **全新项目（还没有共享层）**：先做第一步把种子落成共享层，再做第二步；之后该项目再建第二、三门课就回到「只第二步」。

## 导入规范（与 `references/data-model.md` 一致）

- 目录内兄弟**值**导入一律**显式 `.ts`**（`./stages.ts`、`../../course-builders.ts`）——Node `--experimental-strip-types` 与 Nuxt `allowImportingTsExtensions` 两侧放行。
- 类型走 `~/types/course` 的 **type-only** 导入（运行时擦除）。
- 外部 `courses.ts` 用**省略扩展名** `./<topic>-course`（Nuxt 自动解析到 `index.ts`，语句不用改）；Node 校验脚本按 `…/index.ts` 显式路径 import。
