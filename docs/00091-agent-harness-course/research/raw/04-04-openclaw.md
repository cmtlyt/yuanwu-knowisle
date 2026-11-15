# 批次 04 · WebSearch · OpenClaw agent GitHub 官方 文档 架构 许可证 消息平台 gateway

- 核实日期：2026-11-15
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写
- 调用参数：{"query": "OpenClaw agent GitHub 官方 文档 架构 许可证 消息平台 gateway"}
- callId：chatcmpl-tool-9bc4c443e957eba0

---

**返回原文**

`````text
# Search Results for "OpenClaw agent GitHub 官方 文档 架构 许可证 消息平台 gateway"

## 1. [OpenClaw](https://baike.baidu.com/en/item/OpenClaw/1461289)

OpenClaw 百度百科。Key Information OpenClaw Open Source AI Agent developed by Peter Steinberger OpenClaw is an Open Source Agent Framework launched in November 2025 by Austrian developer Peter Steinberger , and can be deployed locally or in the cloud. 141 Software name OpenClaw Developer Peter Steinberger 24 Software platform macOS, Windows, Linux, iOS, Android 24 Software license MIT License 34 Release date November 2025 82 Software version 2026.3.31 34 Latest update March 8, 2026 34 Software size 133 MB 34 Programming language TypeScript 24 Alias Lobster 72 Development History In January 2026, its predecessor Clawdbot was released. After its release, the number of stars for its project on GitHub grew rapidly; by January 26, 2026, it had soared to 20.7k. It was designed to be friendly to local hardware environments, and some users chose to deploy it on devices such as Mac mini. In the same month, videos and long-form articles such as "Clawdbot Autonomously Buys a Car," "30-Minute Code Migration," and "40-Hour In-Depth Research" brought this Agent widespread attention. 2 On January 27, 2026, Clawdbot was renamed "Moltbot" due to a trademark issue involving Anthropic. 1 On January 30, 2026, Clawd was renamed OpenClaw. 12 On February 7, 2026, the ClawHub Skills in OpenClaw had been integrated with VirusTotal's Threat Intelligence Platform for scanning. On February 13, the official E-commerce Skill of Baidu Youxuan was officially launched on ClawHub. This was also the first official-grade e-commerce capability plugin in the OpenClaw ecosystem, packaging the Baidu Product Knowledge Graph and CPS Supply Chain Capabilities into standardized tools. 19 On local time February 15, 2026, OpenAI CEO Sam Altman announced that Peter Steinberger, founder of the recently worldwide popular Personal Agent OpenClaw, would join OpenAI, while OpenClaw would continue to exist as an open-source project in the form of a foundation. "Peter Steinberger will join OpenAI to drive the development of the next generation of Personal Agents," Altman said in a post on a social platform. "OpenClaw will exist as an open-source project within a foundation, and OpenAI will continue to support it." Sam Altman said, "The future will be a highly Multi-Agent era, and supporting open source is an important part of achieving this goal." 22 In March 2026, an account named "OpenClaw Official Weibo" posted its first post on Sina Weibo, with verification information indicating "OpenClaw Open Source Community," sparking widespread attention and heated discussion in China's technology industry. Subsequently, the founder of OpenClaw denied having registered on Weibo or other Chinese-language social platforms, warning against fraud. On March 4, at the academic summit "AI for Discovery: From Paradigm Revolution to Industrial Restructuring" held at the HKUST Shanghai Center, Qi Yuan, Haoqing Distinguished Professor at Fudan University and Dean of the Shanghai Academy of AI for Science, said in his speech that with the emergence of the OpenClaw Agent, AI Agents with high agency and autonomous learning capabilities are driving scientific research to a new critical point. On March 6, Tencent Cloud set up a booth downstairs at its Shenzhen headquarters to provide free OpenClaw deployment, and more than 800 people took queue numbers; the Tencent Cloud Agent Development Platform launched an OpenClaw rapid deployment service, which, based on the Tencent Cloud Lightweight Application Server foundation, integrates enterprise-level permission management, security review, channel integration, and other capabilities to create out-of-the-box Claw services. On a second-hand trading platform, multiple individual sellers posted listings claiming they could help with on-site or remote installation of OpenClaw. Among them, on-site installation fees were relatively high, mostly ranging from 300 to 666 yuan; remote installation fees were mostly below 200 yuan. Long queues formed for Tencent's free installation. On March 6, Tencent opened a new feature to individual users, allowing them to quickly create a QQ Bot through official channels that can interact with the AI Agent tool OpenClaw. On March 7, it was reported that Meituan had partnered with Baiying, Lenovo's IT service brand, to launch OpenClaw remote deployment services. On March 9, Tencent's version of "Little Lobster," WorkBuddy, was officially launched;

**URL:** https://baike.baidu.com/en/item/OpenClaw/1461289

---

## 2. [OpenClaw深度分析:Gateway即控制面的本地AI助手,IM通道覆盖为什么这么广?](http://mp.weixin.qq.com/s?__biz=MzAwMTQyMDI3Ng==&mid=2451494748&idx=1&sn=1934add2d0b1f452a9c22cfbe61b0fe8&chksm=8c5ab64f563b1c56af219e4457dd06d9e722cdd0b355ae3fc0ff9e5f870b676549cbf1e41d7c#rd)

系列第1篇 | 企业搭建智能体平台,到底需要什么?——需求拆解与评估维度深度指南系列第2篇|DeerFlow深度分析:字节的LangGraph超级智能体编排器,凭什么登顶GitHub Trending?系列第3篇|QwenPaw深度分析:三层记忆架构,如何让AI助手拥有真正的"记忆"?系列第4篇|AgentTeams深度分析:K8s原生的多Agent协作运行时,企业级管控为什么这么难?系列第5篇|Octop腾讯的单进程AI助手,为什么说"简单就是力量"?系列第6篇|JiuwenSwarm深度分析:华为的Coordination Engineering范式,技能自进化如何落地?系列第7篇 |QM深度分析:面向创业团队的多人协作Agent平台,Slack原生的协作哲学系列第8篇 |OpenClaw深度分析:Gateway即控制面的本地AI助手,IM通道覆盖为什么这么广?一、平台概览维度信息来源OpenClaw Foundation许可证MIT语言TypeScript (Node.js 22+)架构Gateway控制面 + pnpm Monorepo + 150+扩展版本v2026.8.1定位以Gateway为核心的本地AI助手,IM通道覆盖最广OpenClaw的设计理念是一个Gateway连接一切——会话、工具、事件、通道连接全部通过Gateway统一管理。它支持的IM通道数量在8个平台中是最多的:20+个。二、架构核心:Gateway即控制面2.1 Gateway的职责文件:src/gateway/ (1092个条目)Gateway是OpenClaw的中枢神经系统,负责:关注点参考会话管理server-chat.ts, session-*.ts工具解析tool-resolution.ts事件系统events.ts通道连接server-channels.ts插件引导server-plugin-bootstrap.tsCron调度server-cron.ts节点/伴侣管理node-registry.ts, node-catalog.tsMCP协议mcp-http.ts认证auth.ts, auth-mode-policy.ts审批系统operator-approval-store.ts2.2 Gateway协议文件:packages/gateway-protocol/Gateway使用WebSocket协议与客户端通信,协议版本4。协议由16个Schema片段组合而成:Board、ProgressCard、Transport、AgentControl、Node、Integration、SessionCore、SessionCollaboration、SessionLifecycle、Operations、Channel、AgentSkill、Scheduler、Approval、PluginLifecycle、Portal。设计原则:Additive first——不兼容的变更需要版本号+文档+客户端跟进。版本号变更需要显式确认,不能自动生成。三、核心亮点亮点一:150+扩展——IM通道覆盖最广OpenClaw的extensions/目录包含150+个扩展,其中IM通道覆盖:通道扩展路径WhatsAppextensions/whatsapp/Telegramextensions/telegram/Slackextensions/slack/Discordextensions/discord/Signalextensions/signal/iMessageextensions/imessage/Google Chatextensions/googlechat/Matrixextensions/matrix/IRCextensions/irc/Lineextensions/line/Mattermostextensions/mattermost/MS Teamsextensions/msteams/Nostrextensions/nostr/飞书/Larkextensions/feishu/Zoom Meetingsextensions/zoom-meetings/Google Meetextensions/google-meet/Teams Meetingsextensions/teams-meetings/SMSextensions/sms/Zaloextensions/zalo/Synology Chatextensions/synology-chat/Nextcloud Talkextensions/nextcloud-talk/Tlonextensions/tlon/Twitchextensions/twitch/20+个IM通道,这在8个平台中是绝对的第一。如果你需要"一个Agent同时在WhatsApp、Telegram、Slack、Discord上响应",OpenClaw是最自然的选择。亮点二:22个内部包——模块化极致packages/目录包含22个内部包:包用途agent-coreAgent运行时核心gateway-protocolWebSocket协议Schemaplugin-sdk插件SDK公共面llm-coreLLM抽象层memory-host-sdk记忆宿主SDKmodel-catalog-core模型目录核心acp-coreAgent Client Protocol核心net-policy网络策略tool-call-repair工具调用修复每个包都有明确的职责边界,通过openclaw/plugin-sdk/*的250+子路径导出。亮点三:伴侣应用和节点OpenClaw支持伴侣应用(Companion Apps)和节点(Nodes),扩展Agent的能力到设备端:能力扩展语音通话extensions/voice-call/Talk语音extensions/talk-voice/Canvasextensions/canvas/CUA Computerextensions/cua-computer/OpenShellextensions/openshell/设备配对extensions/device-pair/文件传输extensions/file-transfer/地理位置extensions/geolocation/这意味着Agent可以控制你的手机、电脑、摄像头、麦克风——实现真正的"全渠道、全设备"AI助手。四、SQLite-First存储哲学文件:AGENTS.md:113-118OpenClaw的存储哲学非常明确:"Storage default: SQLite only. Do not add JSON/JSONL/TXT/sidecar files for OpenClaw-owned runtime state."数据库路径用途共享状态DBstate/openclaw.sqlite全局运行时状态、插件KV数据每Agent DBagents//agent/openclaw-agent.sqliteAgent作用域状态/缓存技术规则:Schema版本需要显式讨论新表或可空列必须保持向下兼容运行时使用Kysely helper,不使用原始SQL写事务使用同步提交五、6维度评分维度评分说明架构范式3/5Gateway控制面+单Agent,非多Agent编排企业级能力2.5/5认证+审批系统,但无多租户/SSO/RBAC生态完整度5/5150+扩展+22个内部包,生态最丰富部署与运维4/5Node.js运行,SQLite存储,无特殊依赖社区与商业4/5Foundation支持,MIT许可,扩展生态活跃技术演进力3.5/5Gateway协议+伴侣应用是亮点,但记忆演进偏弱加权总分:3.7/5六、优缺点优点IM通道覆盖最广:20+个IM通道,8个平台中第一扩展生态最丰富:150+扩展,覆盖通道/Provider/工具/媒体模块化极致:22个内部包,250+子路径导出伴侣应用:支持语音/相机/屏幕/设备控制SQLite-First:零外部存储依赖缺点无多租户:单Operator设计,不支持多用户隔离无技能市场:扩展是插件,不是市场化技能无知识库/RAG:需要自建单Agent架构:多Agent协作需要自行扩展无可观测性:缺乏链路追踪和性能监控七、适用场景适合不适合需要跨多个IM通道触达用户需要多租户的企业SaaS本地优先的个人AI助手需要多Agent协作编排需要伴侣应用/设备控制需要知识库和技能市场需要丰富的Provider选择需要信创/国产化适配八、一句话总结OpenClaw是"IM通道的百科全书"——20+个IM通道、150+扩展、伴侣应用,覆盖范围在8个平台中最广。Gateway即控制面的架构设计优雅,SQLite-First存储哲学务实。但它的定位是个人助手而非企业底座,多租户和企业级能力是明显短板。如果你需要"一个Agent同时在所有IM平台上响应",OpenClaw是最佳选择。至此,8个平台的深度分析全部完成。下一篇:技术趋势深度思考——记忆机制、AgentLoop、多智能体协同、技能自进化,智能体平台的未来在哪里?我是AI易用君,我在此公众号分享探索、学习、使用AI的经验,如离线大模型部署、使用经验,通用智能体研究开发、企业智能体技术架构、业务使用经验等,让我们一起来学AI,用AI,AI(爱)让生活更美好。如果你觉得我写的有用,欢迎点赞收藏分享,并多给我留言提意见,共同进步,如果你有部署大模型、智能体及FDE定制开发的需求,也欢迎联系我提供服务。
OpenClaw
OpenClaw Foundation·MIT·TypeScript·Gateway控制面
加权总分
3.7
架构范式
3.0
企业级能力
2.5
生态完整度
5.0
部署与运维
4.0
社区与商业
4.0
技术演进力
3.5
优点
X缺点
IM通道覆盖最广
X无多租户
150+扩展
X 无技能市场
伴侣应用/设备控制
X无知识库/RAG
22个内部包
X 单Agent架构
SQLite-First
X无可观测性

**URL:** http://mp.weixin.qq.com/s?__biz=MzAwMTQyMDI3Ng==&mid=2451494748&idx=1&sn=1934add2d0b1f452a9c22cfbe61b0fe8&chksm=8c5ab64f563b1c56af219e4457dd06d9e722cdd0b355ae3fc0ff9e5f870b676549cbf1e41d7c#rd

---

## 3. [OpenClaw(个人AI助手)](https://baike.sogou.com/v225535562.htm)

OpenClaw(个人AI助手) 搜狗百科。当地时间2026年2月15日,OpenAI首席执行官山姆·奥特曼(Sam Altman)对外宣布,个人智能体OpenClaw创始人彼得·斯坦伯格(Peter Steinberger)将加入OpenAI,而OpenClaw以基金会形式作为开源项目存续。2026年3月3日,OpenClaw开通微博账号,智谱、百度、千问、Kimi等AI公司在留言区列队欢迎。OpenClaw的核心架构由四个部分构成:Gateway(网关)是整个系统的神经中枢,它不仅连接着各类聊天平台,更打通了智能体与外部世界交互的通道,确保指令与反馈能被实时传递;Agent(智能体)驱动系统的思考过程,这里接入了模型负责处理复杂的上下文记忆与逻辑推理;Skills(技能)赋予了它“手脚”,使其具备了网页调研、浏览器自动化乃至访问邮箱的实际执行力;Memory(记忆)负责将所有对话与偏好以真实文件的形式持久化保存。OpenClaw的技术架构上主要包含三个维度:在交互与控制层面,它被设计为一个本地网关,可以接受、分发指令并返回结果,实现无新应用的自然交互。在核心处理层,它拥有“大脑”与“记忆”。通过调用主流大模型进行推理,并配合本地服务和向量数据库(sqlite-vec)的使用,长期记忆几乎可以永久留存,能够提供连贯的个性化服务。在执行与扩展层,通过技能插件系统,它能像真人一样操作浏览器、日历或执行系统级API脚本,完成点击、输入和文件管理等操作。OpenClaw的爆红并非单纯的运气,而是技术进步、用户需求与市场时机多重因素叠加的结果。首先,它解决了“跨端操控”的痛点。以往的Agent多局限于“在电脑端控制电脑”,而OpenClaw将AI从一个桌面软件变成了拓展为聊天应用等随身入口,让用户可以随时下达指令。这不仅是工具的升级,更是对用户空间与时间的一次解放。其次,它踩中了应用落地的节点。当各家的大模型底座能力已经相对稳定,行业关注点正从“模型多强”转向“应用怎么落地”。OpenClaw的出现,适时地提供了一个可感知的实用标杆。它不仅能理解指令,还能执行复杂任务,这样的产品属性恰好贴合了新的趋势。第三,其开源属性激发了社区狂欢。OpenClaw最初在GitHub发酵,短短几天星标数突破10万。它的开源性质极大地降低了二次开发的门槛,吸引了大量开发者参与。OpenClaw的安全风险主要集中于三个方面:一、权限与架构的风险。

**URL:** https://baike.sogou.com/v225535562.htm

---

## 4. [OpenClaw风险全链路分析及安全提示](https://m.thepaper.cn/newsDetail_forward_32763105)

OpenClaw风险全链路分析及安全提示 澎湃新闻。其项目核心设计理念是:“让 AI 通过你已经在用的聊天 App 跟随你”。OpenClaw与传统 AI 工具不同,它不在浏览器沙盒中运行,而是直接在宿主机操作系统层运行,拥有执行 Shell 命令、读写文件、控制浏览器的权限。 OpenClaw发展历程时间线 时间 事件 2025年11月 项目以Clawdbot名称首次发布,初期反响平淡 2026年1月下旬 在 X(原Twitter)爆红,24小时内获得2万GitHub stars;便于部署的Mac mini设备在美国多地发生脱销 2026年1月27日 Anthropic发出商标侵权警告(Clawdbot与Claude过于相似),项目被迫改名为Moltbot 2026年1月29日 项目再次更名为OpenClaw,同日发布安全补丁版本v2026.1.29 2026年2月15日 OpenAI CEO Sam Altman宣布Steinberger加入OpenAI,OpenClaw将转由独立基金会运营 2026年3月初 多家国内社交媒体平台宣布支持与OpenClaw通信 OpenClaw架构 Gateway网关 核心控制面,默认监听 0.0.0.0:18789(旧版)或 localhost:18789(新版),接收来自微信等社交媒体或 Control UI 的指令; Control UI控制面板 基于 Web 的管理界面,负责配置 Agent、工具权限、集成服务; Nodes节点 远程执行主机,Agent 可在其上执行命令、控制浏览器; Skills技能/插件 第三方扩展插件,通过 ClawHub分发; Memory记忆 长期上下文存储,以明文 Markdown/JSON 形式保存于宿主机。 OpenClaw安全风险 截至目前,已公开的OpenClaw相关安全事件的时间线如下: 时间 重要事件 2026年1月末 1. @fmdz387通过Shodan扫描发现近千个无认证OpenClaw实例 2. 卡巴斯基(Kaspersky)安全审计发现512个漏洞,其中8个为严重级别 3. 研究员Jamieson O'Reilly成功获取各类第三方服务API密钥、Telegram Token及聊天记录 2026/1/29 1. CNVD-2026-13289(CVE-2026-25253)的修复版本v2026.

**URL:** https://m.thepaper.cn/newsDetail_forward_32763105

---

## 5. [300页!OpenClaw完全指南(2026年)](http://mp.weixin.qq.com/s?__biz=Mzg2MjUxMTg0Nw==&mid=2247611288&idx=2&sn=b16f690eb58458043e0abad1d151418b&chksm=cf66348ab3c52481f5bba5ffd63539aa003a7187622c90313d5e1b19048e3d0e43ff75e69d54#rd)

篇幅原因  资料已上传会员可在知识星球查看为方便大家及时拿到行业资料,工业互联说现在推出[升级版]服务,扫码加入[XG云数智·知识岛]获取最工业互联说、5G、元宇宙、数字化资料!资料已上传每日持续更新随时随地查看↓↓↓
U盾
CA证书
加密狗
KeyMatrix
优盾通数字认证管理系统
一个软硬件结合、功能强大的USB网络共享、安全管控、集中管理的产品
更多信息,请长按图片添加联系人>D
OpenClaw 完全指南
从原理到实现的专家级解析
减肥的拉格朗日
cyber_newair@163.com
版本1.0.1|2026年2月
目录
第1章 OpenClaw概述
1.1什么是OpenClaw
1.2AI Agent 技术演进
1.3 OpenClaw核心能力
1.4适用场景与人群
1.5与自动驾驶的技术同源性
第2章核心架构
2.1架构总览
2.2 Gateway 详解
2.3 Agent Runtime工作机制
2.4通信协议
2.5为什么OpenClaw会火
第3章OpenClaw工作原理
3.1Agent Loop 详解
3.2工具系统
3.3记忆系统
3.4规划与推理
第4章 核心功能深度解析
4.1内存系统深度解析
4.2多代理系统
4.3技能系统
4.4安全与权限
4.5 本章小结
第5章进阶主题
ii
5.1多代理高级配置
5.2性能优化
5.3调试与监控
5.4沙箱与安全配置
5.5 生产环境部署
第6章实践指南
6.1安装指南
6.2配置详解
6.3实战案例
6.4故障排除
第7章生态与创业
7.1 Skill开发指南
7.2社区参与
7.3创业方向
7.4未来展望
iii
第1章 OpenClaw 概述
1.1什么是 OpenClaw
1.1.1定义与定位
OpenClaw (发音:/oupenklo:/)是一个开源的自托管个人AI助手网关(Self-Hosted Personal
AI Agent Gateway),其核心功能是将主流即时通讯应用(如Telegram、Discord、WhatsApp、
Slack、iMessage、Feishu等)与大型语言模型(LLM)驱动的AI代理进行桥接1。
OpenClaw的核心定位可归纳为以下四个维度:
自托管(Self-Hosted):OpenClaw运行于用户自主控制的基础设施之上(个人服务器、NAS、
云主机或本地机器),所有对话数据、记忆存储、配置文件均保留在本地环境中,无需依赖第三方SaaS
服务的数据托管2。
多通道(Multi-Channel):单一OpenClaw网关实例可同时接入多个异构通讯平台,实现跨平
台消息的统一路由与响应,支持平台原生特性的适配(如Discord的线程、Telegram的回调按钮、
Slack的块级消息格式)。
代理原生(agent-native):系统架构专为AIAgent工作模式设计,原生支持工具调用(Tool
Use)、会话状态管理、长期记忆(Long-term Memory)、多代理协作(Multi-Agent)等高级功
能,而非简单的LLM API封装。
开源开放(OpenSource):项目采用MIT许可证开源,代码托管于GitHub,允许自由修改、
分发及商业使用,已形成活跃的开发者社区与技能生态市场(ClawHub) 3。
1.1.2 吉祥物含义
OpenClaw 的吉祥物为龙虾(Lobster,),其命名与象征意义蕴含多层技术隐喻:
4
象征维
度
龙虾特性
技术映射
持续成
龙虾通过蜕壳实现体型增长,一生
AI助手的持续学习能力,通过新技能(Skills)加载与桢
长
可蜕壳数十次
型更新实现功能迭代
多任务
龙虾拥有多对螯足,可同时进行探
多工具并行调用(Multi-ToolUse),同时执行文件操
处理
索、捕食、防御
作、网络搜索、代码执行等任务
环境适
龙虾分布于淡水至深海多种生态环
跨平台适配能力,可在macOS、Linux、Windows、
应
Docker及嵌入式设备运行
开放掌
用户对数据与逻辑的完全控制权,区别于封闭的黑盒商业
"Open"+"Claw" =开放的掌控
控
服务
该命名策略体现了开源社区常见的具象化隐喻设计范式一通过生物特征映射技术特性,降低概念
理解门槛的同时增强品牌辨识度。
1.1.3技术栈构成
OpenClaw采用多语言混合架构,各组件依据平台特性选择最优实现:
技术栈构成(基于 GitHub 仓库分析):
TypeScript --核心网关、Agent运行时、工具系统的主要实现语言
一 Swift -- macOS/iOS 原生应用与系统级集成
一Kotlin -- Android 客户端应用
-
Shell -- 安装脚本与运维工具
一
Python -- 部分机器学习工具与数据科学技能
Rust -- 性能关键模块(可选编译扩展)
TypeScript作为主导语言的选择基于以下技术考量:
1.运行时效率:Node.js的事件驱动非阻塞I/O模型与网关的高并发消息处理需求高度契合
2.类型安全:静态类型系统确保复杂配置结构与协议接口的正确性
3.生态丰富:npm生态提供大量通讯协议库(discord.js、telegraf、@slack/bolt 等)
4.开发体验:现代语言特性(Async/Await、Decorator、泛型)提升代码可维护性
5
1.2 AI Agent 技术演进
1.2.1三代Agent 技术对比
AI Agent技术的发展经历了三个明显阶段,每一代在技术范式、能力边界与应用场景上均存在本质
差异4:
第一代:符号Agent(Symbolic Agent,1990s-2000s)
符号Agent基于物理符号系统假说(Physical Symbol System Hypothesis),将智能体建模为
通过符号操作进行推理的符号处理器。其核心特征包括:
●知识表示:采用谓词逻辑(Predicate Logic)、语义网络(SemanticNetwork)、框架
(Frame)等形式化结构存储领域知识
●推理机制:基于规则引擎(RuleEngine)或专家系统(ExpertSystem)进行确定性或概率性推
理
●规划方法:依赖符号规划算法(如STRIPS、HTN),通过状态空间搜索生成行动计划
代表性系统包括Shakey(SRI,1966)、SOAR(Laird etal.,1987)、ACT-R(Anderson,
1993)。该范式的局限在于知识获取瓶颈(Knowledge Acquisition Bottleneck)与符号接地问题
(Symbol Grounding Problem)一难以处理开放域的自然语言与感知数据。
第二代:统计Agent(Statistical Agent,2000s-2020s)
随着机器学习兴起,Agent技术转向数据驱动的统计学习方法:
.感知能力:基于计算机视觉(CNN)、语音识别(HMM/深度学习)实现环境感知
●决策模型:采用强化学习(Reinforcement Learning,RL)训练策略网络,代表作包括Deep O-
Network (DQN, 2015), AlphaGo (Silver et al., 2016)
·自然语言处理:从统计机器翻译(SMT)演进至神经机器翻译(NMT),引入注意力机制
(Attention)
该阶段的Agent在特定任务(游戏、机器人控制)上取得突破,但存在任务特化(Task-Specific)
与样本低效(SampleInefficiency)问题,难以迁移至开放域的通用任务。
第三代:LLM-based Agent(2020s-至今)
以GPT系列、Claude系列为代表的大型语言模型(LLM)催生了新一代Agent范式,其核心创
新在于将LLM作为认知中枢(CognitiveCore),通过涌现能力(Emergent Capabilities)实现通
用任务处理:
6
LLM-based Agent 架构
工具系统
LLM 认知中枢
记忆系统
(Tools)
(Core)
(Memory)
/
规划与推理
(PLanning)
三代技术对比如下表所示:
维度
符号Agent
统计 Agent
LLM-based Agent
核心引擎
规则引擎/专家系统
神经网络/强化学习
大语言模型(Transformer)
知识获取
人工编码/知识工程
监督/强化学习训练
预训练+上下文学习
泛化能力
封闭域、脆弱
任务特化、难迁移
开放域、强泛化
可解释性
高(符号推理链)
低(黑盒网络)
中(思维链可追溯)
人机交互
命令行/结构化接口
有限的自然语言
原生自然语言对话
工具使用
预定义API调用
需专门训练
零样本/少样本工具调用
记忆机制
静态知识库
无显式记忆
动态上下文+向量记忆
代表系统
SOAR、ACT-R
AlphaGo, DQN
AutoGPT, OpenClaw
1.2.2传统Agent与现代LLM-based Agent的本质差异
从系统架构视角审视,两类Agent存在根本性设计哲学差异:
控制流架构差异
传统Agent采用预定义控制流(Predefined Control Flow):开发者显式编程状态机、规则优先
级与决策分支,Agent的行为空间被严格约束在设计者预见的范围内。例如,经典的三层架构(感知-决
策-执行)中,每一层的接口与数据格式均需人工规约。
7
LLM-based Agent采用涌现控制流(Emergent Control Flow):控制逻辑不再硬编码,而是由
LLM根据任务上下文动态生成。ReAct(Reasoning +Acting)范式5是典型代表,LLM在思考
(Thought)与行动(Action)之间交替迭代,形成自适应的问题解决路径。
知识管理差异
传统Agent依赖显式知识库(Explicit Knowledge Base),知识以结构化形式(数据库、本体、
规则集)存储,更新需人工干预或专门的机器学习流程。
LLM-based Agent通过参数化知识+上下文检索(Parametric Knowledge+In-Context
Retrieval)管理知识:世界知识编码于模型参数中,任务特定知识通过提示工程(Prompt
Engineering)或检索增强生成(RAG,Retrieval-Augmented Generation)动态注入。
错误处理差异
传统Agent的错误处理依赖异常捕获与回退策略(Exception Handling & Fallback),需预先定
义所有可能的失败模式与恢复逻辑。
LLM-based Agent具备自纠错能力(Self-Correction):通过观察工具执行结果
(Observation),LLM可白主识别错误、分析原因并调整策略。例如,当代码执行报错时,Agent可
将错误信息反馈给LLM,生成修正后的代码重试。
1.2.3 涌现能力:LLM 作为Agent认知中枢的基础
LLM 之所以能成为现代Agent的认知中枢,源于其在大规模预训练过程中涌现的四项关键能力6:
上下文学习(In-Context Learning,ICL)
ICL 指 LLM 无需参数更新,仅通过提示中的少量示例(Few-Shot Examples)即可学习任务模式
并泛化至新输入的能力。形式化定义为:给定任务分布$T、提示 $P = (x_1, y_1, ..., x_k, y_k,
x_{query}),LLM 生成$y_{query}$ 的概率可表示为:
$P(y_{query}|x_{query}, P) =\prod_{t=1}^{|y_{query}|} P_\theta(y_t|y_{<t}, x_{query}, P)$
其中0为冻结的模型参数。ICL使Agent能够快速适应新工具、新格式与新任务,无需微调成本。
思维链(Chain-of-Thought,CoT)
CoT指LLM通过生成显式推理步骤("Let's think step by step")解决复杂问题的能力。研究表
明,在提示中加入"逐步思考"的指令,可显著提升LLM在多步数学推理、逻辑谜题与决策规划任务上的
表现。
8
在Agent场景中,CoT实现了可解释的决策过程:LLM不仅输出最终行动,还展示推理路径,便
于调试与审计。OpenClaw的Agent Loop中,每个迭代周期均包含推理(Reasoning)步骤,即CoT
的工程化应用。
指令遵循(Instruction Following)
现代LLM经过指令微调(Instruction Tuning)与基于人类反馈的强化学习(RLHF),能够理
解并执行自然语言指令,即使任务在训练时未曾见过。这一能力使Agent可通过高层语义描述(如"帮
我整理本周邮件并按优先级分类")触发复杂行为链,无需低层API调用序列。
工具使用(Tool Use)
工具使用是Agent范式的核心能力,指LLM识别何时需要外部工具、选择合适工具、构造调用参
数并解析结果的能力8。典型的工具使用流程如下:
工具使用循环 (Tool Use Loop)
用户输入 LLM推理→「需要工具?]→生成工具调用
/
(JSON/Function Call)
▼
[无需工具]
->
最终结果←LLM再推理←工具执行结果←执行工具
OpenClaw的工具系统(ToolSystem)即基于此能力构建,支持函数调用(Function
Calling)、代码解释器(CodeInterpreter)、浏览器控制(BrowserControl)等多种工具类型。
1.3 OpenClaw 核心能力
基于前述技术背景,OpenClaw构建了面向生产环境的完整Agent 能力栈:
1.3.1多通道通信网关
OpenClaw的网关层(Gateway Layer)实现了通讯协议的抽象与统一:
9
平台
类型
支持特性
Telegram
内置
消息编辑、回调按钮、内联查询、文件传输
Discord
内置
线程、嵌入消息、斜杠命令、角色权限
Slack
内置
块级消息、Home Tab、Shortcut、Workflow
WhatsApp
内置
模板消息、媒体消息、状态跟踪
IRC
内置
频道消息、私聊、文件传输
Google Chat
内置

**URL:** http://mp.weixin.qq.com/s?__biz=Mzg2MjUxMTg0Nw==&mid=2247611288&idx=2&sn=b16f690eb58458043e0abad1d151418b&chksm=cf66348ab3c52481f5bba5ffd63539aa003a7187622c90313d5e1b19048e3d0e43ff75e69d54#rd

---

*Found 5 results • Provider: 1 • Search performed on 2026-11-15*
`````
