---
标题: Go 语言学习与面试八股
类型: 学习笔记
技能: Go, Goroutine, Channel, Interface, GC, HTTP, SQL
岗位: 后端开发工程师, 前端开发工程师
主题: Go 入门, Go 并发, Go 面试
---

# 学习目标

这份笔记面向有 TypeScript/Node 和 Agent 经验、准备补充 Go 后端能力的学习者。建议顺序是：语法与类型 → 接口和错误 → goroutine/channel → 内存模型与锁 → HTTP 服务 → 数据库与工程工具。面试回答要区分“语言机制”“标准库行为”和“项目约定”。

# 一、语言基础

## 1. 核心特点

Go 是静态类型、编译型语言，强调简单语法、显式错误处理、组合和并发。包是组织和编译边界；导出标识符首字母大写；`go.mod` 管理模块和依赖版本。

常见命令：`go run` 运行、`go build` 编译、`go test` 测试、`go vet` 静态检查、`gofmt` 格式化、`go mod tidy` 整理依赖。

## 2. 数组、切片和 map

- 数组 `[N]T` 的长度是类型的一部分，赋值会复制整个数组。
- 切片 `[]T` 是指向底层数组的描述符，包含指针、长度和容量；`append` 可能复用原数组，也可能扩容分配新数组。
- `len` 是元素数，`cap` 是从切片起点到底层数组末尾的容量。
- 多个切片可能共享底层数组，修改一个切片可能影响另一个；需要独立副本时使用 `copy` 或 `slices.Clone`。
- map 是引用语义的哈希表；读不存在的 key 返回零值，写 nil map 会 panic；并发读写需同步。

面试常问：`append` 后原切片为什么没变化？因为扩容后可能返回了新底层数组，调用者必须接住返回值：`s = append(s, x)`。

## 3. 指针、值接收者和引用语义

Go 有指针但没有指针运算。值接收者会复制接收者，指针接收者可修改对象且避免大对象复制。slice、map、channel 本身是描述符/引用型结构，但把它们作为参数传递仍然是值传递，只是值中包含指向共享数据的引用。

## 4. defer、panic、recover

- `defer` 在当前函数返回前按后进先出执行，常用于 `Close`、解锁和清理资源。
- 参数在注册 defer 时求值；闭包捕获变量时要注意循环变量和生命周期。
- 可预期错误应返回 `error`，不要用 panic 代替业务错误。
- `recover` 只能在 deferred 函数中直接调用，用于隔离服务器 goroutine 的意外 panic；恢复后应记录并返回安全错误。

# 二、接口与类型系统

## 1. 接口是隐式实现

接口只声明方法集合，类型不需要显式 `implements`。当一个类型拥有接口要求的全部方法时，它自动满足接口。小接口更易组合，例如：

```go
type ProductReader interface {
    Get(ctx context.Context, id string) (Product, error)
}
```

接口应由使用方定义，避免为所有具体实现提前设计巨型接口。可以用编译期断言确认实现关系：`var _ ProductReader = (*MyReader)(nil)`。

## 2. nil interface 陷阱

接口值包含动态类型和动态值。只有两者都为空时接口才等于 nil：

```go
var p *MyError = nil
var err error = p
// err != nil，因为动态类型仍是 *MyError
```

返回 error 时要避免把 nil 指针装进非 nil 接口；也要注意 type assertion 的 `value, ok` 形式。

## 3. 泛型、组合和嵌入

泛型适合通用容器和算法，不要为了“看起来高级”把业务逻辑泛化。结构体嵌入提供字段和方法提升，不等于经典面向对象继承；组合更容易替换实现。

# 三、错误处理

Go 通常用多返回值 `value, err`。错误应在边界处理或向上包装：

```go
value, err := repo.Get(ctx, id)
if err != nil {
    return fmt.Errorf("load product %s: %w", id, err)
}
```

上层可用 `errors.Is` 判断哨兵错误、`errors.As` 提取具体类型。不要无理由丢弃 error；区分可重试错误、用户输入错误、权限错误和系统故障。HTTP 层再把领域错误映射为合适状态码。

# 四、并发核心

## 1. goroutine

`go f()` 启动 goroutine；它共享同一进程地址空间，运行时把大量 goroutine 调度到少量 OS 线程。轻量不代表无限创建：必须有退出条件、取消信号和资源上限。

常见泄漏原因：发送方永远等不到接收方、接收方没有关闭 channel、阻塞 I/O 没有 context、后台循环没有 stop。每个 goroutine 都要能回答“谁启动、何时结束、失败如何回收”。

## 2. channel

- 无缓冲 channel 的发送和接收需要同步，适合交接和背压。
- 有缓冲 channel 允许暂存 N 个值，适合平滑突发但不能替代无限队列。
- 关闭 channel 表示“不会再发送”，不是“销毁 channel”；接收方可用 `v, ok := <-ch` 判断关闭。
- 发送已关闭 channel 会 panic；从已关闭 channel 接收会立即拿到零值，直到 `ok=false`。
- 关闭方向通常由发送方负责；不确定所有权时不要随意 close。

## 3. select 和 context

`select` 同时等待多个 channel；`case <-ctx.Done()` 是取消和超时的标准写法。context 应作为函数第一个参数向下传递，不要存进结构体，不要用它传业务必需参数。

```go
select {
case result := <-resultCh:
    return result, nil
case <-ctx.Done():
    return Result{}, ctx.Err()
}
```

## 4. mutex、RWMutex 和 atomic

- `sync.Mutex` 保护临界区，临界区应短且不调用不受控的外部服务。
- `sync.RWMutex` 适合读多写少且读临界区确实较长的场景，不能默认比 Mutex 快。
- `sync/atomic` 适合计数器、状态标志等简单原子变量；复杂不变量仍需 mutex 或更高层设计。
- `go test -race ./...` 检测数据竞争，但不能证明没有逻辑竞态。

Go 的并发口诀是“不要通过共享内存通信，而要通过通信共享内存”，但简单计数器用 mutex/atomic 可能更清晰。关键是建立 happens-before 关系，不能只看代码“似乎不会同时执行”。

## 5. worker pool 和 errgroup

worker pool 用固定数量 worker 从 jobs channel 取任务，避免每个请求无限启动 goroutine。需要“一项失败取消全部”的并发任务时，可使用 `errgroup.WithContext`，并设置任务数和下游并发上限。

# 五、内存、GC 与性能

- Go 有自动垃圾回收；短命对象多、堆分配多会增加 GC 压力。
- 逃逸分析决定变量是否从栈移到堆；用 `go build -gcflags=-m` 观察，不要手工追求“所有变量在栈上”。
- 大 slice 长期持有会让底层数组不能回收；可复制需要保留的部分再释放大数组引用。
- `sync.Pool` 适合临时对象复用，不保证对象一定保留，不能当缓存或资源池。
- 用 benchmark、pprof、trace 和真实负载定位问题；先测量再优化。

# 六、Go HTTP 服务

标准库 `net/http` 同时提供客户端和服务端。服务端用 `http.Handler`/`ServeHTTP` 接收请求；生产配置应显式设置 `ReadTimeout`、`WriteTimeout`、`IdleTimeout` 和 `MaxHeaderBytes`，客户端必须关闭 `resp.Body`。

推荐分层：

```text
HTTP Handler → 参数/鉴权/协议映射
Service      → 业务规则和事务编排
Repository   → SQL、缓存和外部存储
```

Handler 应从 `r.Context()` 继承取消和超时；下游请求用 `http.NewRequestWithContext`。不要在 handler 中吞掉下游错误或无限等待。流式响应要处理客户端断开、flush 和资源释放。

# 七、数据库与工程实践

- 使用 `database/sql` 时设置连接池上限、空闲连接数和连接最大生命周期；连接池不是连接数越大越好。
- 查询必须带 context、参数化 SQL 和合理超时；禁止字符串拼接用户输入。
- 事务由调用方明确 `BeginTx`、`Commit`、`Rollback`；失败路径要保证回滚。
- 迁移脚本要可审查、可回滚或提供前向兼容步骤；结构变更与代码发布要考虑双写/兼容窗口。
- 配置从环境或安全配置中心读取；不要把密钥写入仓库、日志或错误响应。

# 八、面试高频问题

**问：goroutine 和线程有什么区别？**

goroutine 是 Go 运行时调度的轻量执行单元，共享进程地址空间，由多个 goroutine 复用 OS 线程；线程由操作系统调度、栈和切换成本更高。不要只说“goroutine 更快”，还要说泄漏、阻塞和并发上限。

**问：channel 什么时候会死锁？**

无缓冲发送没有接收者、有缓冲 channel 已满、接收已空且没有发送者，或所有 goroutine 都阻塞时会死锁。解决时检查所有权、关闭时机、select 的取消分支和是否需要 worker pool。

**问：接口和 TypeScript interface 有什么差异？**

Go 接口主要是运行时/编译期的方法集合，类型隐式满足；TypeScript interface 主要在编译期做结构类型检查，运行时会被擦除。Go 的 nil interface、方法集和指针接收者是常见追问。

**问：Go 服务怎样优雅关闭？**

监听 SIGTERM，调用 `server.Shutdown(ctx)` 停止接收新连接并等待已有请求；取消后台 context，关闭消息消费者和数据库连接，超过截止时间再强制退出。关闭过程需要幂等且有日志。

**问：如何把你的前端经验迁移到 Go？**

把 Node BFF 的分层思想映射为 Handler/Service/Repository；把 SSE、HTTP 下游调用映射到 `net/http` 和 context；把 Agent 的状态机和门禁映射为显式领域状态与错误类型；把 Milvus/Neo4j 查询封装为接口，便于测试和替换。

# 学习路线

1. 完成 Go Tour，掌握 slice、map、struct、interface、error、goroutine、channel。
2. 写一个带超时、优雅关闭和统一错误响应的 `net/http` BFF。
3. 加入 PostgreSQL/Redis，练习事务、连接池、缓存和幂等。
4. 使用 `go test`、`go test -race`、benchmark、pprof，补齐工程能力。
5. 设计一个 Go 订单状态机，为每个状态转换编写单元测试。

# 参考资料

- [Go 官方文档](https://go.dev/doc/)
- [Effective Go](https://go.dev/doc/effective_go)
- [Go 语言规范](https://go.dev/ref/spec)
- [Go Memory Model](https://go.dev/ref/mem)
- [net/http 包文档](https://pkg.go.dev/net/http)
- [Go 错误处理教程](https://go.dev/doc/tutorial/handle-errors)
