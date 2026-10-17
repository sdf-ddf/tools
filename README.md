# Layerview · 分层透视镜

把复杂系统(大模型、算法、论文、遥感反演流程)拆成可点击的分层结构,由大模型逐层讲解,并用动画与数值图直观呈现。

当前进度:**M0** —— 脚手架 + D3 分层树(展开/折叠、点选高亮、面包屑、内容包切换)。

## 运行

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # 类型检查 + 产物构建
```

## 目录

- `src/types.ts` —— 通用分层数据模型(ContentPack / LayerNode / Edge)
- `src/data/` —— 内容包(Transformer 架构、卫星遥感数据分级)
- `src/components/` —— D3 分层树、左侧导航、节点讲解面板

## 路线图(见 PRD.md)

M1 静态教学 → M2 LLM 讲解 → M3 数值可视化 → M4 内容解析 → M5 遥感旗舰包
