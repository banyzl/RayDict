import { DictionaryProvider } from "../core/schema";

/** Original concise notes, not copied from commercial dictionaries. */
const terms: Record<string, [string, string, string]> = {
  abstraction: [
    "抽象",
    "隐藏具体实现细节，用共同的概念或接口描述一类事物。",
    "An interface provides an abstraction over different implementations.",
  ],
  implicitly: [
    "隐式地",
    "由语言规则或运行环境自动完成，无需在代码中直接写出操作。",
    "The compiler implicitly converts the integer to a floating-point value.",
  ],
  polymorphism: [
    "多态",
    "通过同一接口调用不同实现，使行为随具体类型而变化。",
    "Polymorphism allows each shape to implement its own draw method.",
  ],
  encapsulation: [
    "封装",
    "把状态及其操作组织在一起，并限制外部对内部状态的直接访问。",
    "Encapsulation protects the object's internal state.",
  ],
  interface: [
    "接口",
    "约定组件之间如何交互的边界或契约，不必规定内部实现。",
    "The interface defines which operations a client can call.",
  ],
  implementation: [
    "实现",
    "使某项规范或接口真正工作的具体代码与算法。",
    "This implementation uses a hash table.",
  ],
  concurrency: [
    "并发",
    "多个任务在重叠的时间段内推进；不要求它们同时占用处理器。",
    "Concurrency lets the server handle several requests in progress.",
  ],
  parallelism: [
    "并行",
    "多个计算任务在同一时刻由不同执行单元处理。",
    "Parallelism can speed up independent computations.",
  ],
  invariant: [
    "不变式",
    "在某些程序位置或操作前后必须保持成立的条件。",
    "The loop invariant holds before every iteration.",
  ],
  idempotent: [
    "幂等的",
    "重复执行同一操作，与执行一次产生相同的预期状态效果。",
    "Setting a value to zero is an idempotent operation.",
  ],
  immutable: [
    "不可变的",
    "创建后不能修改其内容或状态。",
    "An immutable value can be shared without defensive copying.",
  ],
  closure: [
    "闭包",
    "函数及其所捕获的词法环境的组合。",
    "The closure retains access to the outer variable.",
  ],
  callback: [
    "回调",
    "作为参数传入，供另一段代码在适当时机调用的函数。",
    "The callback runs after the request completes.",
  ],
  dependency: [
    "依赖",
    "一个组件正常工作所需要的另一个组件、值或条件。",
    "The database client is a dependency of the repository.",
  ],
  latency: [
    "延迟",
    "从发起操作到观察到响应所经历的时间。",
    "Caching reduces the latency of repeated lookups.",
  ],
  throughput: [
    "吞吐量",
    "系统在单位时间内完成的工作量。",
    "Batching can improve throughput.",
  ],
  recursion: [
    "递归",
    "通过直接或间接调用自身，将问题分解为同类的较小问题。",
    "Recursion requires a terminating base case.",
  ],
  generic: [
    "泛型的",
    "用类型参数描述可适用于多种具体类型的代码结构。",
    "A generic function can work with many element types.",
  ],
  explicit: [
    "显式的",
    "由程序员直接声明或写出的，而非由规则自动推断。",
    "An explicit conversion makes the intent visible.",
  ],
  asynchronous: [
    "异步的",
    "发起操作后不必在原地等待完成，而在结果就绪时继续处理。",
    "Asynchronous I/O keeps the event loop responsive.",
  ],
};
export const glossaryProvider: DictionaryProvider = {
  async lookup({ input }) {
    const term = terms[input.text.toLowerCase()];
    return term
      ? {
          summary: term[0],
          entries: [
            {
              headword: input.text,
              senses: [
                { definition: `${term[0]}：${term[1]}`, examples: [term[2]] },
              ],
            },
          ],
          attributions: [
            { label: "RayDict 原创计算机术语笔记 · MIT · 20 个词条" },
          ],
        }
      : null;
  },
};
