import type { ContentPack } from "../types";

export const remoteSensingPack: ContentPack = {
  id: "remote-sensing",
  title: "卫星遥感数据分级",
  theme: "大气遥感 · 数据产品",
  root: {
    id: "rs.root",
    name: "卫星遥感数据分级流程",
    type: "model",
    summary:
      "遥感数据从卫星原始下行信号到用户可直接使用的产品,要经过一整套'分级处理'流水线(Level 0 → 4)。每一级都对应不同的物理量、算法与误差来源,是理解大气遥感反演的地基。",
    children: [
      {
        id: "rs.l0",
        name: "Level 0 · 原始数据",
        type: "data",
        summary:
          "卫星下行后未做任何辐射校正的原始计数(DN 值/比特流),附带遥测与定标辅助数据。用户一般不可直接使用。",
      },
      {
        id: "rs.l1",
        name: "Level 1 · 辐射定标产品",
        type: "data",
        summary:
          "把原始 DN 值转换成有物理意义的辐射量:辐射亮度/亮温。分 1A(辐射定标)、1B(定标+几何定位)。核心是定标系数与轨道姿态参数。",
        children: [
          {
            id: "rs.l1.cal",
            name: "L1A 辐射定标",
            type: "step",
            summary:
              "用星上定标器(黑体、漫反射板)把 DN 转成辐射亮度,校正探测器非线性与暗电流。",
          },
          {
            id: "rs.l1.geo",
            name: "L1B 几何定位",
            type: "step",
            summary:
              "结合姿态与轨道数据,为每个像元赋予经纬度与观测几何(太阳天顶角、观测天顶角、相对方位角)。",
          },
        ],
      },
      {
        id: "rs.l2",
        name: "Level 2 · 大气校正后产品",
        type: "data",
        summary:
          "去除大气影响,得到地表或大气参数:地表反射率、亮温、云参数、气溶胶光学厚度(AOD)等。大气遥感的核心反演都发生在这一级。",
        children: [
          {
            id: "rs.l2.atmcorr",
            name: "大气校正",
            type: "step",
            summary:
              "利用辐射传输模型(RTM,如 6S、MODTRAN)模拟大气吸收与散射,从大气顶辐射反推地表反射率。",
          },
          {
            id: "rs.l2.retrieval",
            name: "参数反演",
            type: "step",
            summary:
              "从辐射观测量反演大气参数(温度廓线、水汽、臭氧、AOD):或查表,或用最优估计(OEM)等贝叶斯方法求解。",
          },
        ],
      },
      {
        id: "rs.l3",
        name: "Level 3 · 时空网格产品",
        type: "data",
        summary:
          "把多次过境的 L2 产品投影到统一时空网格(如 0.1°×0.1°,日/月合成),便于气候统计与长时间序列分析。",
      },
      {
        id: "rs.l4",
        name: "Level 4 · 融合与再分析产品",
        type: "data",
        summary:
          "同化模型与观测(数据同化),或融合多源数据,产出模型一致的再分析产品,如 ECMWF 再分析、海表温度融合场。",
      },
    ],
  },
};
