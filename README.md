# poplaryy · 技术知识库

公开的后端、数据库与 Go 学习笔记，支持全文关键词搜索、分类标签筛选和面试答案展开。

本仓库是本地知识工作台的公开技术笔记版，不包含个人简历、照片、联系方式、PDF 或内部项目资料。

## 本地运行

```sh
python scripts/build.py
python -m http.server 8000 --directory dist
```

打开 http://localhost:8000 。无需安装依赖。

## 更新与部署

编辑 `knowledge/notes/*.md` 并推送到 `main`，GitHub Actions 会构建静态 JSON 并自动部署到 GitHub Pages。新增笔记前检查个人信息、凭据和内部资料。Pages 页面仅供阅读，不运行本地 Python API。
