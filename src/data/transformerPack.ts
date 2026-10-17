import type { ContentPack } from "../types";

export const transformerPack: ContentPack = {
  id: "transformer",
  title: "Transformer 架构",
  theme: "深度学习 · 序列建模",
  root: {
    id: "t.root",
    name: "Transformer 架构",
    type: "model",
    summary:
      "2017 年 Vaswani 等人在《Attention Is All You Need》中提出的序列建模架构,完全基于注意力机制。它把输入序列逐层变换为上下文相关的表示,是当今大语言模型的基石。",
    children: [
      {
        id: "t.input",
        name: "输入编码",
        type: "layer",
        summary:
          "把离散的 token 转成模型能计算的向量:先查表得到词向量,再叠加位置编码,让模型知道词序。",
        children: [
          {
            id: "t.input.emb",
            name: "Token Embedding",
            type: "step",
            summary:
              "每个词元(token)通过嵌入矩阵查表映射为一个 d_model 维向量(如 512 维)。语义相近的词在向量空间中彼此接近,这就是'语义空间'的来源。",
          },
          {
            id: "t.input.pos",
            name: "位置编码 Positional Encoding",
            type: "step",
            summary:
              "Transformer 没有循环结构,天生不知道顺序。位置编码给每个位置加一个确定性的向量(正弦/余弦或可学习),把'第几个词'的信息注入表示。",
          },
        ],
      },
      {
        id: "t.encoder",
        name: "Encoder 块 ×N",
        type: "layer",
        summary:
          "N 个相同结构的块堆叠(原文 N=6)。每块把输入表示加工得更'懂上下文':注意力让每个词看到其他词,前馈网络负责逐位置的深度变换。",
        children: [
          {
            id: "t.enc.mha",
            name: "多头自注意力 Multi-Head Attention",
            type: "layer",
            summary:
              "让序列中每个位置都能直接'关注'其他位置,并按相关性加权聚合信息。'多头'指用多组 Q/K/V 参数并行捕捉不同种类的依赖(如句法、指代)。",
            children: [
              {
                id: "t.enc.mha.qkv",
                name: "Q/K/V 线性投影",
                type: "step",
                summary:
                  "每个位置 x 分别乘三个矩阵得到 Query、Key、Value。Q 表示'我想找什么',K 表示'我能提供什么',V 表示'我实际携带的内容'。",
              },
              {
                id: "t.enc.mha.score",
                name: "注意力分数与 Softmax",
                type: "formula",
                summary:
                  "注意力分数 = Q·K^T / √d_k,再经 Softmax 归一化为概率。除以 √d_k 防止点积过大导致梯度消失。",
              },
              {
                id: "t.enc.mha.out",
                name: "加权求和",
                type: "step",
                summary:
                  "每个位置的输出 = Σ 注意力权重 × V,即按'该关注谁'的比例混合所有位置的 Value。",
              },
              {
                id: "t.enc.mha.proj",
                name: "拼接与输出投影",
                type: "step",
                summary:
                  "各头的输出拼接后乘输出矩阵 W_O,融合多头信息,恢复 d_model 维度。",
              },
            ],
          },
          {
            id: "t.enc.ffn",
            name: "前馈网络 FFN",
            type: "layer",
            summary:
              "两层全连接:先升维到 4×d_model 并做非线性激活,再降维回来。它给每个位置的表示独立地做'思考',是模型记忆知识的主要场所。",
            children: [
              {
                id: "t.enc.ffn.up",
                name: "线性扩展 + 非线性激活",
                type: "step",
                summary:
                  "升维映射 W1,b1 后接非线性激活(ReLU/GELU),把表示投射到高维空间以获得表达能力。",
              },
              {
                id: "t.enc.ffn.down",
                name: "线性收缩",
                type: "step",
                summary: "W2,b2 把高维表示压回 d_model,再与残差连接相加。",
              },
            ],
          },
          {
            id: "t.enc.res",
            name: "残差连接与 LayerNorm",
            type: "step",
            summary:
              "每个子层输出先加回输入(残差,缓解深层梯度消失),再做层归一化(稳定训练、加速收敛)。图中常写作 Add & Norm。",
          },
        ],
      },
      {
        id: "t.decoder",
        name: "Decoder 块 ×N",
        type: "layer",
        summary:
          "与 Encoder 结构类似,但有三处不同:带掩码的自注意力(不能偷看未来词)、交叉注意力(查询来自解码器,键值来自编码器)、整体自回归地逐词生成。",
        children: [
          {
            id: "t.dec.mask",
            name: "掩码自注意力",
            type: "layer",
            summary:
              "生成第 t 个词时只能看 1..t-1 的词。做法是在注意力分数矩阵上把未来位置设成 −∞,Softmax 后权重归零。",
          },
          {
            id: "t.dec.cross",
            name: "交叉注意力",
            type: "layer",
            summary:
              "Q 来自解码器当前位置,K/V 来自编码器全部输出。这让解码器'查阅'整个源序列,是连接编码与解码的桥。",
          },
          {
            id: "t.dec.ffn",
            name: "FFN 与 Add & Norm",
            type: "step",
            summary: "与编码器一致的前馈网络与残差归一化结构。",
          },
        ],
      },
      {
        id: "t.output",
        name: "输出层",
        type: "layer",
        summary: "把最后一层解码器表示映射回词表空间,给出下一个词的概率分布。",
        children: [
          {
            id: "t.out.linear",
            name: "线性层",
            type: "step",
            summary: "d_model → 词表大小 V 的线性映射,得到每个词的得分(logits)。",
          },
          {
            id: "t.out.softmax",
            name: "Softmax",
            type: "formula",
            summary:
              "把 logits 转成概率分布;训练时用交叉熵最大化正确词的概率,推理时按策略(贪心/采样/束搜索)挑词。",
          },
        ],
      },
    ],
  },
};
