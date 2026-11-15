import { L, withKind } from '../../course-builders.ts'

export const L85 = withKind(
  L(
    'L85',
    24,
    '切分环（二）：RecursiveCharacterTextSplitter 递归算法逐行拆解、mergeSplits 滑窗',
    3,
    ['L84'],
    ['lc-recursive-splitter'],
    [
      '逐段手写还原 _splitText 的分隔符递归降级算法，并解释 separators.slice(i+1) 的作用',
      '实现 mergeSplits 的滑动窗口合并，说清 chunkOverlap 的 shift 循环语义',
      '调通 loc.lines 行号回写与 fromLanguage 语言专属分隔符表两个溯源特性',
    ],
    `### 逐行拆解：RAG 效果的第一杠杆藏在递归里

上一课确认了切分器是 Runnable。本课进入 algorithm 层面：RecursiveCharacterTextSplitter 是所有 RAG 教程里的默认切分器，但「递归」两个字到底怎么运作、chunkOverlap 到底怎么重叠，绝大多数使用者从未读过实现。本课以 framework 课型做手写版/源码版对照走读，全部代码摘自 \`libs/langchain-textsplitters/src/text_splitter.ts\`（commit 7704471）。核心结论：**递归 = 分隔符梯度的逐层降级，滑窗 = 按块收缩的重叠合并**。

### 第一层：TextSplitter 基类的通用机械

先看基类三件套。构造闸门上一课已提：\`chunkOverlap >= chunkSize\` 直接抛错（text_splitter.ts:43-45）。切分入口：

\`\`\`ts
protected splitOnSeparator(text: string, separator: string): string[] {
  let splits;
  if (separator) {
    if (this.keepSeparator) {
      const regexEscapedSeparator = separator.replace(/[/\\-\\\\^$*+?.()|[\\]{}]/g, "\\\\$&");
      splits = text.split(new RegExp(\`(?=\${regexEscapedSeparator})\`));
    } else {
      splits = text.split(separator);
    }
  } else {
    splits = text.split("");
  }
  return splits.filter((s) => s !== "");
}
\`\`\`

*— langchain-textsplitters/src/text_splitter.ts:57-73（commit 7704471）*

三个分支各管一件事。keepSeparator 为 true 时用**零宽前瞻正则** \`(?=sep)\` 切——分隔符保留在每个切片的开头而不是被吃掉，这就是 Recursive 版「切完还能拼回原文」的机械基础；分隔符本身做了正则元字符转义，\`\\n\\n\` 这类符号不会被误解析。keepSeparator 为 false 时普通 split，分隔符被丢弃。separator 为空串时退化为**逐字符** \`split("")\`——这是梯度表最后一项（空字符串）的语义：粒度细到字符。最后 filter 掉空串，避免空块进入合并循环。

### 第二层：_splitText 的递归降级

\`\`\`ts
separators: string[] = ["\\n\\n", "\\n", " ", ""];
constructor(fields?) {
  super(fields);
  this.separators = fields?.separators ?? this.separators;
  this.keepSeparator = fields?.keepSeparator ?? true;   // 注意：Recursive 版默认 true
}

private async _splitText(text: string, separators: string[]) {
  const finalChunks: string[] = [];
  let separator: string = separators[separators.length - 1];
  let newSeparators;
  for (let i = 0; i < separators.length; i += 1) {
    const s = separators[i];
    if (s === "") { separator = s; break; }
    if (text.includes(s)) {
      separator = s;
      newSeparators = separators.slice(i + 1);
      break;
    }
  }
  const splits = this.splitOnSeparator(text, separator);
  let goodSplits: string[] = [];
  const _separator = this.keepSeparator ? "" : separator;
  for (const s of splits) {
    if ((await this.lengthFunction(s)) < this.chunkSize) {
      goodSplits.push(s);
    } else {
      if (goodSplits.length) {
        const mergedText = await this.mergeSplits(goodSplits, _separator);
        finalChunks.push(...mergedText);
        goodSplits = [];
      }
      if (!newSeparators) { finalChunks.push(s); }
      else { const otherInfo = await this._splitText(s, newSeparators); finalChunks.push(...otherInfo); }
    }
  }
  if (goodSplits.length) {
    const mergedText = await this.mergeSplits(goodSplits, _separator);
    finalChunks.push(...mergedText);
  }
  return finalChunks;
}
\`\`\`

*— langchain-textsplitters/src/text_splitter.ts:289-344（commit 7704471）*

逐段解读。**选分隔符**：从默认梯度表 \`["\\n\\n", "\\n", " ", ""]\` 自上而下找第一个 \`text.includes(s)\` 的项；没找到任何项时兜底用最后一项（空串→逐字符）。命中即记下 \`newSeparators = separators.slice(i + 1)\`——**递归降级的全部秘密就在这个 slice**：当前粒度失败后，下一层只能用更细的粒度，不会回头重试更粗的。

**分诊循环**：切出的每个块走两条路。长度 < chunkSize 的进 goodSplits 缓冲区（好块先攒着，等下一轮 mergeSplits 按 overlap 合并）；超长的先把攒着的 goodSplits 冲进结果，然后分两种情况——若已经是最后一档（newSeparators 为 undefined），超长块原样入 finalChunks（**无路可退**）；否则 \`await this._splitText(s, newSeparators)\` 递归降级。末尾再把残留 goodSplits 合并冲刷。

两个容易忽视的细节。其一，\`lengthFunction\` 是 **await 的**——类型签名是同步或异步二选一（text_splitter.ts:9-11），默认 \`text.length\`，但你可以传异步 token 计数器（如基于 js-tiktoken 的封装），整个算法的每一步长度判定都为之让路。其二，keepSeparator 为 true 时 mergeSplits 用的拼接分隔符是空串 \`""\`（\`_separator = this.keepSeparator ? "" : separator\`），因为分隔符已经被 lookahead 前置进每个切片了，再拼一次会重复。

### 第三层：mergeSplits 的滑动窗口

\`\`\`ts
async mergeSplits(splits: string[], separator: string): Promise<string[]> {
  const docs: string[] = [];
  const currentDoc: string[] = [];
  let total = 0;
  for (const d of splits) {
    const _len = await this.lengthFunction(d);
    if (total + _len + currentDoc.length * separator.length > this.chunkSize) {
      if (total > this.chunkSize) {
        console.warn(\`Created a chunk of size \${total}, which is longer than the specified \${this.chunkSize}\`);
      }
      if (currentDoc.length > 0) {
        const doc = this.joinDocs(currentDoc, separator);
        if (doc !== null) docs.push(doc);
        while (
          total > this.chunkOverlap ||
          (total + _len + currentDoc.length * separator.length > this.chunkSize && total > 0)
        ) {
          total -= await this.lengthFunction(currentDoc[0]);
          currentDoc.shift();
        }
      }
    }
    currentDoc.push(d);
    total += _len;
  }
  const doc = this.joinDocs(currentDoc, separator);
  if (doc !== null) docs.push(doc);
  return docs;
}
\`\`\`

*— langchain-textsplitters/src/text_splitter.ts:183-226（commit 7704471）*

这是理解 overlap 的关键代码。\`currentDoc\` 是一个**待拼接队列**，\`total\` 是队列当前总长。每个新块 d 进来前先做预算检查：\`total + _len + currentDoc.length * separator.length > chunkSize\`——**分隔符本身占长度**，N 个块用分隔符拼接会多出约 N 段分隔符的开销，边界预算必须算上它，否则密集小块拼接会系统性超长。

放不下时：先把 currentDoc 拼成一块产出（joinDocs 对 trim 后空串返回 null 跳过），然后进入 **shift 循环**——从队首不断弹出块并扣减 total，直到 \`total <= chunkOverlap\`（保留的重叠预算足够）或「新块塞得进来且队列非空」。然后 d 入队。所以 chunkOverlap 的语义是：**相邻 chunk 之间共享的，是「上一块队尾残留的整块序列」**——滑窗按块为单位收缩，重叠边界是块对齐的，不是字符级的硬截断。想精确控制重叠内容，就应该控制 goodSplits 的块结构（即分隔符梯度），而不是幻想 overlap 是逐字符滑窗。

超长兜底：\`total > chunkSize\` 时 console.warn 而不抛错——单块本身超长且不可再切时（如一行百万字符），切分器选择「产出 + 警告」的尽力而为策略，ingestion 管线不会被单个坏样本炸掉。

### 第四层：loc.lines 行号回写与 fromLanguage

切分不止产文本，还产溯源坐标。\`createDocuments\`（text_splitter.ts:75-159）在遍历 chunk 时用 \`text.indexOf(chunk, indexPrevChunk + 1)\` 定位每块在原文的字符偏移，累计中间换行数得到行号计数器，然后回写：

\`\`\`ts
loc.lines = { from: lineCounterIndex, to: lineCounterIndex + newLinesCount };
documents.push(new Document({ pageContent, metadata: metadataWithLinesNumber }));
\`\`\`

*— langchain-textsplitters/src/text_splitter.ts:137-152（commit 7704471）*

每个产出 Document 的 metadata 都带上 \`loc.lines = {from, to}\`——这就是 RAG 引用溯源（citation）「答案来自第 X–Y 行」的数据基础。还有个可选细节：\`chunkOverlapHeader\` 默认 \`\\"(cont'd) \\"\`，\`appendChunkOverlapHeader\` 开启时会把上一个 chunk 的存在提示拼进下一块开头（text_splitter.ts:89,127-129）。

语言专属梯度表是另一个实用件：\`RecursiveCharacterTextSplitter.fromLanguage("python", ...)\` 会把 separators 换成「class 定义优先、函数定义次之」的顺序表（text_splitter.ts:350-359），\`SupportedTextSplitterLanguages\` 收录 cpp/go/java/js/php/proto/python/rst/ruby/rust/scala/swift/markdown/latex/html/sol 共 16 种。代码语料务必用 fromLanguage——让类与函数边界优先于空格边界，chunk 的语义完整性天差地别。

### 易混淆点：Recursive vs Character 的真实差距与 joinDocs 的 trim 行为

「Recursive」类名容易让人以为它是「Character 版 + 递归」的大改，源码里 CharacterTextSplitter 的 splitText 只有两行：\`splitOnSeparator(text, this.separator)\` 之后直接 \`mergeSplits(splits, this.keepSeparator ? "" : this.separator)\`（text_splitter.ts:233-250）——**没有梯度、没有降级，全部增量就是 _splitText 那 60 行**。两者共享同一套基类机械（构造闸门、createDocuments、mergeSplits），换类名的实际含义只是「有没有分隔符梯度表」。另外 Character 默认 separator 是 \`"\\n\\n"\`（text_splitter.ts:240），所以它常被当作「只按段落切」的粗切器使用。

还有一个藏在合并阶段的细节：\`joinDocs\` 对拼接结果做 \`.trim()\`，trim 后为空串就返回 null、不产出 Document（text_splitter.ts:178-182）。但注意长度预算是按 **trim 前的原始切片**计入的（mergeSplits 里 \`_len = lengthFunction(d)\` 在入队时计算）——纯空白切片会先消耗 chunkSize 预算、然后在 joinDocs 里静默消失。极端空白密集的文本下，实际产出会系统性比预算「更松」，且这类空块不会触发任何警告。

*— langchain-textsplitters/src/text_splitter.ts:178-182, 233-250（commit 7704471）*

### 本课小结

- 递归 = 梯度降级：命中分隔符后 \`separators.slice(i+1)\` 下传，粒度只降不升；最后一档兜底逐字符。
- keepSeparator 用零宽前瞻正则保留分隔符；Recursive 默认 true、Character 默认 false，拼接语义随之不同。
- mergeSplits 是**按块滑窗**：shift 到队首直到重叠预算达标，分隔符长度计入预算，超长块 warn 不抛错。
- loc.lines 行号回写 + fromLanguage 语言梯度表是两个直接可用的生产特性。
- 下一课进入向量化与存储环：EmbeddingsInterface 双方法契约与 VectorStore 的三个抽象方法——检索环的地基。
`,
    null,
    [
      {
        text: '_splitText 递归时传给下一层的分隔符表是什么？',
        options: [
          '原分隔符表原样传递',
          'separators.slice(i + 1)——当前分隔符之后的剩余表',
          '只有最后一个空字符串',
          '反转后的分隔符表',
        ],
        answer: 1,
        explain:
          'text_splitter.ts:303-314：找到第一个在文本中出现的分隔符 s 后，newSeparators = separators.slice(i + 1)。递归降级的本质是「当前粒度切不动了，就用更细的粒度切超大块」——段落切完还有超大块，就降级到行、词、字符。原样传表会死循环，反传会丢失粒度梯度。',
        concept: 'lc-recursive-splitter',
      },
      {
        text: 'RecursiveCharacterTextSplitter 的 keepSeparator 默认值与 CharacterTextSplitter 有何不同？',
        options: [
          '都是 true',
          'Recursive 默认 true，Character 继承基类默认 false',
          'Recursive 默认 false，Character 默认 true',
          '都是 false',
        ],
        answer: 1,
        explain:
          'text_splitter.ts:294：Recursive 构造器里 this.keepSeparator = fields?.keepSeparator ?? true；而基类 TextSplitter 默认 keepSeparator = false（text_splitter.ts:30），CharacterTextSplitter 未覆盖。Recursive 切完把分隔符拼回去保住段落语义；Character 用纯分隔符 join。',
        concept: 'lc-recursive-splitter',
      },
      {
        text: 'mergeSplits 里 chunkOverlap 的实现机制是？',
        options: [
          '对原文做固定偏移的硬截断',
          '从 currentDoc 队首不断 shift，直到剩余总长 ≤ chunkOverlap（且新块能塞进来）',
          '复制前一块的结尾 chunkOverlap 个字符',
          '每个 chunk 自动重读上一块全文',
        ],
        answer: 1,
        explain:
          'text_splitter.ts:207-215：while (total > this.chunkOverlap || (total + _len + currentDoc.length * separator.length > this.chunkSize && total > 0)) { total -= await this.lengthFunction(currentDoc[0]); currentDoc.shift(); }——滑动窗口按「块」为单位收缩，不是字符级硬截断，被挤出的块整个离开窗口。',
        concept: 'lc-recursive-splitter',
      },
      {
        text: 'mergeSplits 计算「是否会超块」时把什么也计入了长度预算？',
        options: [
          '只有 chunk 本身长度',
          'currentDoc.length * separator.length——每个待拼接块之间的分隔符也占长度',
          'metadata 的长度',
          '上一块的重叠长度',
        ],
        answer: 1,
        explain:
          'text_splitter.ts:190：total + _len + currentDoc.length * separator.length > this.chunkSize。joinDocs 用 separator 拼接 N 块会产生 N-1 个（按 lookahead 保 sep 实现为每块前缀）分隔符，边界预算把这部分算进去，否则大量小块拼接会系统性超长。',
        concept: 'lc-recursive-splitter',
      },
      {
        text: '超长单块（长度超过 chunkSize 且无法再切）时 mergeSplits 如何处理？',
        options: [
          '抛出异常终止',
          'console.warn 警告后照常产出（尽力而为）',
          '静默丢弃该块',
          '自动翻倍 chunkSize 重试',
        ],
        answer: 1,
        explain:
          'text_splitter.ts:193-198：if (total > this.chunkSize) { console.warn(`Created a chunk of size ${total}...`) }。只警告不抛错——切分器选择不阻塞整条 ingestion 管线；代价是超长 chunk 会静默流入下游，监控 ingestion 时要捕获这个 warn。',
        concept: 'lc-recursive-splitter',
      },
    ],
    [
      ['separators 梯度', '默认 ["\\n\\n", "\\n", " ", ""]，对应段落→行→词→字符的语义粒度递降'],
      ['chunkOverlap', '相邻块重叠的目标长度；实现是按块滑窗收缩而非字符截断'],
      ['loc.lines', '切分时回写进 metadata 的 {from,to} 行号，用于引用溯源'],
      ['lengthFunction', '块长计量函数，默认 text.length，可换异步 token 计数器'],
    ],
    [
      '把 chunkOverlap 设到 ≥ chunkSize——构造器直接抛 Cannot have chunkOverlap >= chunkSize',
      '以为块长恒 ≤ chunkSize——超长不可再分块只 console.warn 不抛错，ingestion 监控要盯这个警告',
      '忽略 keepSeparator 语义差：Recursive 默认 true（保分隔符、lookahead 切分），Character 默认 false；行为差异直接影响拼接与行号计算',
    ],
  ),
  'framework',
)
