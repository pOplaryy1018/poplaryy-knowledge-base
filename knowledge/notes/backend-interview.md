---
标题: 后端面试知识体系：HTTP、Node BFF 与请求生命周期
类型: 学习笔记
技能: HTTP, Node.js, BFF, REST, Middleware, WebSocket, SSE, 鉴权
岗位: 前端开发工程师
主题: 后端面试, 请求生命周期, API 设计
---

# 使用方式

这份笔记用于前端和 Agent 岗位的后端追问。回答时先给结论，再讲机制，最后落到项目中的真实例子。不要把“了解”说成“独立设计并上线”；涉及自己的项目时优先引用代码、日志和测量数据。

# 一、HTTP 深度理解

## 1. 一次 HTTP 请求是什么

HTTP 是应用层的请求—响应协议。请求包含方法、目标路径、协议版本、请求头和可选请求体；响应包含状态码、响应头和可选响应体。HTTP/2、HTTP/3 改变了传输和帧结构，但方法、状态码、头部语义仍然延续 HTTP 语义。

典型链路：DNS 解析 → TCP 连接（HTTPS 还包括 TLS 握手）→ 发送请求 → 代理/网关 → Web Server → 路由匹配 → 中间件 → Controller/Service → 数据访问或下游 RPC → 组装响应 → 连接复用或关闭。

## 2. 方法语义、幂等与安全

| 方法 | 常见用途 | 安全 | 幂等 | 设计注意 |
| --- | --- | --- | --- | --- |
| GET | 查询资源 | 是 | 是 | 参数放 query/path，避免副作用 |
| POST | 创建或触发动作 | 否 | 否 | 重试需幂等键或业务去重 |
| PUT | 整体替换资源 | 否 | 是 | 同一请求重复执行结果一致 |
| PATCH | 部分更新 | 否 | 通常否 | 明确字段语义和并发策略 |
| DELETE | 删除资源 | 否 | 是 | 重复删除可返回 204 或 404，团队要统一 |
| HEAD | 只取响应头 | 是 | 是 | 可用于探测资源和缓存校验 |

幂等不等于“没有副作用”。例如 DELETE 第一次删除改变状态，第二次不再改变最终状态，因此仍可设计成幂等。POST 重试可能重复扣款、重复创建订单，通常用 `Idempotency-Key`、业务唯一键或状态机去重。

## 3. 状态码和错误模型

- 2xx 表示成功：`200` 查询或更新成功，`201` 创建成功，`202` 已接收但异步处理，`204` 成功且无响应体。
- 3xx 表示重定向或缓存协商：`304 Not Modified` 让客户端复用缓存。
- 4xx 表示请求方需要修正：`400` 格式错误，`401` 未认证，`403` 已认证但无权限，`404` 资源不存在，`409` 状态冲突，`422` 语义校验失败，`429` 限流。
- 5xx 表示服务端或上游异常：`500` 未分类服务端错误，`502` 网关收到无效上游响应，`503` 暂不可用，`504` 上游超时。

推荐统一错误结构：

```json
{
  "code": "PHONE_NOT_RESOLVED",
  "message": "无法唯一确定用户标识",
  "requestId": "req_123",
  "details": { "candidates": 2 }
}
```

不要用 HTTP 200 包装所有失败；HTTP 状态表达传输层结果，业务 `code` 表达领域原因，两者各自负责一层语义。

## 4. Header、缓存和条件请求

- `Content-Type` 描述请求或响应体格式；`Accept` 表示客户端可接受的格式。
- `Authorization` 承载认证凭证；不要把 Token 放 URL，因为 URL 更容易出现在日志、历史记录和 Referer。
- `Cache-Control: max-age=...` 控制新鲜时间；`ETag` 配合 `If-None-Match` 实现条件请求；内容未变化时返回 `304`。
- `Cookie` 会自动随域名发送，需结合 `HttpOnly`、`Secure`、`SameSite`；跨域请求还要正确设置 CORS，而不是简单地反射任意 Origin。
- 大文件上传要设置大小上限、超时和流式处理，避免一次性读入内存。

## 5. HTTP/1.1、HTTP/2、HTTP/3 面试抓手

- HTTP/1.1 通过 keep-alive 复用 TCP 连接，但同一连接的请求响应存在队头阻塞问题。
- HTTP/2 用二进制分帧、多路复用、头部压缩；多个 stream 可以共享一个 TCP 连接，但 TCP 丢包仍可能影响连接上的流。
- HTTP/3 基于 QUIC/UDP，减少连接建立和跨流阻塞；应用层 HTTP 语义不因此改变。

面试不要只背“HTTP/2 更快”，要说明瓶颈从连接数、头部和队头阻塞转移到了服务端并发、带宽、CPU 和业务下游。

# 二、Node 端请求生命周期

## 1. 原生 Node 到框架

原生 `http.createServer((req, res) => {})` 收到请求后，Node 解析请求行和头部，把请求体通过流分片交给应用。框架在此之上增加路由表、中间件链、参数解析、统一响应和错误处理。

Node 的 JavaScript 逻辑运行在事件循环上。I/O（网络、文件、数据库驱动）通常异步等待；CPU 密集计算会阻塞事件循环，应拆分任务、使用 Worker Threads 或下沉到专用服务。`Promise` 不会自动让 CPU 计算变成并行。

## 2. 可讲清的生命周期

1. **连接层**：TLS、keep-alive、代理头和超时策略。
2. **解析层**：方法、路径、query、headers、body；校验 Content-Length 和 JSON 大小。
3. **上下文层**：生成 `requestId`，解析用户身份、租户、设备和 trace 信息。
4. **通用中间件**：日志、CORS、安全头、限流、鉴权、参数校验。
5. **路由层**：按 HTTP 方法和路径匹配 Router；路径参数进入 `req.params`。
6. **业务层**：Controller 只负责协议适配，Service 编排业务，Repository 访问数据库或缓存。
7. **下游层**：调用数据库、Redis、HTTP/RPC 服务；每个调用都应有超时、重试边界和错误分类。
8. **响应层**：统一序列化、脱敏、状态码和响应头；记录耗时、结果和 trace。
9. **结束层**：`res.end` 或框架发送响应；清理 timer、连接和临时资源。

## 3. 中间件机制

Express 的中间件本质是按注册顺序执行的函数 `(req, res, next)`：可以修改请求/响应、结束请求，或调用 `next()` 交给下一个函数；不结束也不调用 `next` 会让请求挂起。错误中间件必须是 `(err, req, res, next)` 四参数，并且通常注册在路由之后。

推荐顺序：

```text
requestId / access log
→ body parser 与大小限制
→ CORS / 安全头
→ tracing / metrics
→ authentication
→ authorization
→ router-level validation
→ controller
→ not-found
→ error handler
```

中间件设计原则：单一职责、明确是否结束请求、错误向上传递、避免把业务决策藏在全局中间件、不要在日志里输出密码或 Token。需要配置的中间件可以用“配置函数返回真正 middleware”的工厂模式。

# 三、路由设计

## 1. 资源建模

优先用资源名而不是动词：`GET /users/:id/orders`、`POST /orders`、`PATCH /orders/:id`。动作型接口可用于不可自然建模的领域动作，例如 `POST /orders/:id/cancel`，但要说明状态转换和幂等策略。

路由层只做：路径匹配、参数校验、鉴权上下文读取、调用 Service、映射错误。不要在路由处理函数里堆 SQL、复杂重试和多个领域事务。

## 2. 版本、分页和过滤

- 版本可用 `/api/v1` 或媒体类型；版本要有废弃策略。
- 列表接口返回 `items`、`nextCursor`、`hasMore` 等稳定结构。
- 高频或数据增长快的列表优先游标分页：用 `(created_at, id)` 等稳定排序键，避免 offset 越翻越慢和并发插入导致重复/漏项。
- 过滤、排序字段建立白名单，不能把用户输入直接拼进 SQL 或 `ORDER BY`。

# 四、Node BFF 设计

BFF（Backend For Frontend）面向某一类前端体验，负责聚合多个后端、适配字段、处理会话和前端所需的缓存。它不是把所有业务逻辑搬到 Node；领域规则和数据最终一致性仍应由领域服务或数据库事务负责。

典型链路：浏览器/小程序 → BFF 鉴权与参数校验 → 并行调用用户、订单、商品服务 → 聚合/裁剪字段 → 返回页面模型。BFF 要设置下游超时、并发上限、部分失败策略和 trace 传播。

适合放 BFF：接口聚合、字段适配、端特定排序、SSR/首屏数据拼装、前端鉴权会话。 不适合放 BFF：核心扣款规则、跨服务事务、长期任务、不可观测的隐式重试。


# 五、鉴权、可靠性与安全

- **认证**回答“你是谁”：Session、JWT、OAuth2/OIDC 都是方案，关键是凭证生命周期、撤销和存储位置。
- **授权**回答“你能做什么”：RBAC 适合角色，ABAC/资源权限适合租户和对象级权限；鉴权不能只在前端路由守卫完成。
- **超时**要覆盖连接、读、写和总请求时间；没有超时的下游调用会拖垮连接池。
- **重试**只对可恢复错误，并使用指数退避、抖动和最大次数；写操作需先保证幂等。
- **限流**可按用户、IP、租户或接口维度；返回 `429` 并在必要时带 `Retry-After`。
- **熔断/降级**要定义打开条件、半开探测和降级数据，不能静默吞错。
- **可观测性**至少有结构化日志、指标（QPS、P95/P99、错误率、缓存命中率）和 traceId。

# 六、面试高频问法

**问：一次请求从浏览器到数据库经历什么？**

答题顺序：DNS/TCP/TLS → 网关 → Node 解析 → requestId/鉴权/校验中间件 → 路由 → Service → 缓存/数据库 → 组装响应 → 日志和连接复用；补充每个下游都有超时和错误边界。

**问：为什么要 BFF？**

回答页面需要的不是某个后端服务的原始模型，而是端特定的组合模型；BFF 减少浏览器多次往返、隔离内部服务、统一鉴权和适配，但不能承载核心领域事务。

**问：中间件顺序错了会怎样？**

例如 body parser 放在鉴权后会导致鉴权无法读取请求体；错误处理器放在路由前可能接不到后续错误；CORS 和预检处理缺失会让浏览器在业务代码执行前失败。

# 参考资料

- [MDN HTTP Overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)
- [MDN HTTP Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods)
- [MDN HTTP Messages](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Messages)
- [Node.js HTTP API](https://nodejs.org/api/http.html)
- [Express Middleware](https://expressjs.com/en/guide/using-middleware.html)
- [Express Routing](https://expressjs.com/en/guide/routing.html)
- [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)
