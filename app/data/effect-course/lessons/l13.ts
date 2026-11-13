import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 3 ========== */

export const L13 = L(
  'L13',
  3,
  'Context.Service：类型化的服务键',
  25,
  2,
  ['L06'],
  ['context'],
  ['会定义并消费一个服务', '理解 R 通道与 Context 的关系'],
  [
    prose(
      '服务 = 键 + 形状',
      'Context.Service 把服务标识和实现形状定义成一个类。Context 则是以这些键为索引的不可变服务集合。程序通过 yield* SomeService 或 SomeService.use(...) 声明「我需要它」，编译器把该服务记进 R。',
    ),
    code(
      '定义、使用、提供',
      'import { Context, Effect, Layer } from "effect"\n\nclass Notifications extends Context.Service<\n  Notifications,\n  { readonly notify: (msg: string) => Effect.Effect<void> }\n>()("Notifications") {}\n\nNotifications.key // "Notifications"\n\nconst action = Notifications.use((n) => n.notify("hello"))\n// Effect<void, never, Notifications>\n\nconst runnable = action.pipe(\n  Effect.provide(Layer.succeed(Notifications, {\n    notify: (msg) => Effect.log(msg)\n  }))\n)\n// Effect<void, never, never>',
      '服务形状里的方法返回的仍是 Effect，于是错误与依赖可以继续向外累积。',
    ),
    call(
      'tip',
      '端口与适配器',
      '把 Context.Service 当作端口（接口），把 Layer 当作适配器（实现）。用例代码只依赖端口，测试里换一个 Layer.succeed 就能替换整个外部系统，无需 mock 框架。',
    ),
  ],
  'layer',
  [
    q(
      'yield* SomeService 之后，程序类型发生什么变化？',
      ['E 增加错误', 'R 增加 SomeService', 'Success 变成 void', '立即执行'],
      1,
      '服务需求被记进 Requirements 通道，直到 provide 才被消解。',
      'context',
    ),
    q(
      '替换服务的实现应该改哪里？',
      ['用例函数签名', '提供的 Layer', 'Context.Service 的 key', 'run* 函数'],
      1,
      '端口不变、换适配器，这是 Effect 做 DI 的核心。',
      'context',
    ),
  ],
  [
    ['Context.Service', 'v4 中定义服务键与形状的类'],
    ['Context.make', '手动构造一个 Context<R>'],
  ],
  ['把服务实例塞进模块级单例，绕开 R 通道，测试时无法替换。'],
)
