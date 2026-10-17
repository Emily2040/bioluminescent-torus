**[English](./README.md)** · **[简体中文](./README.zh-CN.md)** · **[日本語](./README.ja.md)** · **[한국어](./README.ko.md)**

# 生物发光光纤三维环面 (Bioluminescent Fiber-Optic Torus)

<p align="center">
  <a href="https://github.com/Emily2040/bioluminescent-torus/releases/download/v1.0.0/bioluminescent-torus-1080p60.mp4">
    <img src="./assets/preview.webp" width="100%" alt="生物发光光纤三维环面 1080p60 动态预览" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/Emily2040/bioluminescent-torus/releases/download/v1.0.0/bioluminescent-torus-1080p60.mp4">
    <strong>▶ Play / Download Full 1080p60 Video With Sound（播放 / 下载 45 秒 1080p60 有声完整版视频）</strong>
  </a>
</p>

这是一个基于原生 WebGL2 与 GLSL ES 3.0（`#version 300 es`）构建的实时三维光学可视化项目。系统在 GPU 上同时驱动 `100万`（`1,000,000`）颗黄金分割低差异序列生成的金色微尘粒子与 `2,048` 根硬件实例化生物发光光纤束（共 `262,144` 段朝向相机的丝带节段），呈现光纤与微尘在幽暗虚空中旋涌、随电光蓝（`#00E5FF`）与生物洋红（`#FF1493`）对向光波节律脉动、最终编织凝聚为精密三维几何环面（3D Torus）的完整过程，并配备物理级微距散景景深（Macro Bokeh DoF）与电影级慢动作控制。

整个项目采用纯原生 JavaScript（ES Modules）与手写 GLSL 着色器实现，零外部运行时依赖。

## 五阶段演化高清画面

| 阶段 01：Void Swirl 虚空旋涌（`p = 0.06`） | 阶段 02：Magnetic Capture 磁力捕获（`p = 0.24`） |
| :---: | :---: |
| ![Phase 01 Void Swirl](./captures/01-void-swirl.png) | ![Phase 02 Magnetic Capture](./captures/02-magnetic-capture.png) |
| **阶段 04：Harmonic Resonance 微距边缘谐波共振（`p = 0.64`）** | **Torus Eye Interior 环心孔道内部视角（`f/1.2` 微距大光圈）** |
| ![Phase 04 Harmonic Resonance Macro](./captures/03-harmonic-resonance-macro.png) | ![Torus Eye Interior](./captures/04-torus-eye-interior.png) |

<p align="center">
  <img src="./captures/05-clean-fullscreen-no-hud.png" width="100%" alt="隐藏 HUD 后的纯净全屏谐波共振视图" />
</p>

## 数学建模与光学渲染架构

### 1. 维拉索圆、环面纽结与四维 Kronecker 低差异序列（`src/math/torusTopology.js`）

传统的伪随机粒子采样在曲面上容易产生明显的局部团聚。本项目采用四维黄金分割 Kronecker 低差异序列（`PHI_1 = 0.6180339887`、`PHI_2 = 0.3247179572`、`PHI_3 = 0.2207440846`、`PHI_4 = 0.1673039783`）生成全部 `100万`（`1,000,000`）颗金色微尘与微火花粒子，封装为单个 16 MB 的 `Float32Array` 缓冲区一次性上传至 GPU。

对于生物发光光纤束，引擎通过 `gl.drawArraysInstanced` 实例化绘制 `2,048` 根光纤，每根细分为 `128` 段纵向节段（共 `262,144` 段丝带节段，每帧 `528,384` 个三角形），围绕主半径 $R = 2.45$ 与副半径 $r = 0.92$ 构建三层嵌套拓扑结构：

| 拓扑族名称 | 光纤占比 | 缠绕参数 $(p,q)$ | 几何与光学作用 |
| :--- | :--- | :--- | :--- |
| 内核编织层 (Inner Core Braids) | `35%` | $(3,5)$、$(5,8)$ | 构成环面内部（$0.32r$ 至 $0.68r$）高密度自发光核心骨架。 |
| 主维拉索圆族 (Primary Villarceau Circles) | `45%` | $(1,1)$、$(1,-1)$ | 沿斜切平面切割环面的正反向斜航圆环（$0.72r$ 至 $1.00r$），展现环面标志性的互锁编织网格。 |
| 外层流光笼 (Outer Gossamer Cage) | `20%` | $(2,3)$、$(3,4)$ | 分布在 $1.02r$ 至 $1.22r$ 外壳的纤细高阶谐波灯丝，在慢动作弥散阶段最先向虚空舒展。 |

### 2. 灯丝形态发生与双向行波谐振（`src/shaders/fiberStrands.glsl.js`）

每根光纤在幽暗虚空中的三维无散 Beltrami 涡流轨迹与锁定的三维环面纽结坐标之间按凝聚度曲线平滑插值。顶点着色器在观察空间内计算切线与视线叉积，并根据当前顶点的有符号弥散圆（CoC）半径动态展宽失焦灯丝，使前景色散与背景虚化过渡自然且无亚像素闪烁。

片元着色器沿每根光纤的纵向参数 $t \in [0, 1]$ 驱动双向行波：

1. 正向主波（`sin((t * 6.0 - uPulsePhase * 2.0 + seed) * 2π)`）激发高纯度电光蓝（`#00E5FF`）纤芯能量。
2. 反向高阶谐波（`cos((t * 10.0 + uPulsePhase * 1.5 - seed) * 2π)`）激发深海生物洋红（`#FF1493`）脉冲。
3. 两列光波发生相长干涉时，波峰处绽放青白高光（`#E8FFFF`）并同步点亮周围的金色微尘（`#FFD166`）。

### 3. 物理微距散景与四通道 HDR 后处理管线（`src/shaders/goldenDust.glsl.js`、`src/shaders/postProcess.glsl.js`）

渲染管线每帧在 `RGBA16F` 半精度浮点帧缓冲中依次执行四个阶段：

| 渲染阶段 | 目标缓冲 | 处理内容 |
| :--- | :--- | :--- |
| 第一阶段 | `scene`（`RGBA16F` + `DEPTH_COMPONENT24`） | 渲染 `262,144` 段光纤丝带与 `100万` 颗金色微尘点精灵，通过解析式物理光圈盘计算猫眼渐晕（Cat's-eye Vignetting）、明亮散景环边缘与径向色散，并在 Alpha 通道写入有符号弥散圆半径。 |
| 第二阶段 | `dof`（`RGBA16F`） | 执行 16 采样黄金角（$\theta = 2.399963\text{ rad}$）Vogel 圆盘微距景深合成。 |
| 第三阶段 | `bloomTight` 与 `bloomWide`（`RGBA16F`） | 在 1/2 与 1/4 分辨率下构建双尺度 9 抽头可分离高斯 HDR 辉光金字塔。 |
| 第四阶段 | 屏幕默认帧缓冲 | 融合清晰合焦面、微距散景、双层 HDR 辉光、边缘径向光学色散，并通过保色度 ACES Filmic 色调映射输出至屏幕。 |

## 交互式光学导演控台 (Director HUD) 与快捷键

| 控件 / 操作 | 功能说明 |
| :--- | :--- |
| `01 Void Swirl` 至 `05 Slow-Mo Dispersal` | 一键切换五个形态发生演化阶段。 |
| `Timeline Phase`（`0.000` 至 `1.000`） | 手动拖拽周期时间轴，连续观察从虚空涡流到三维环面锁定的全过程。 |
| `Slow-Mo Speed`（`0.05x` 至 `1.50x`） | 调节物理演化时间流速（默认 `0.25x` 电影级慢动作）。 |
| `Macro Aperture`（`f/1.0` 至 `f/16.0`） | 调节微距镜头光圈值，实时改变弥散圆半径与金色散景光斑直径。 |
| `Focal Distance`（`1.50m` 至 `9.00m`） | 连续推进或拉远合焦平面，从前景悬浮金尘平滑移焦至环面内壁。 |
| 画布左键点击（Click-to-Focus） | 对三维环面有符号距离场（SDF）执行光线步进求交，自动将焦点锁定至点击深度。 |
| 画布左键拖拽 / 鼠标滚轮 | 三维球坐标环绕运镜与 `2.6m` 至 `13.5m` 纵深推拉变焦。 |
| 四组预设机位按钮 | 在 `Macro Grazing Rim`、`Torus Eye Interior`、`Villarceau Oblique` 与 `Wide Void Orbit` 之间平滑运镜并自动移焦。 |
| `Space` / `L` / `H` / `M` / `1`-`5` | 播放/暂停、锁定当前相位、隐藏/显示 HUD、开启/关闭 Web Audio 谐波合成器、快速跳转阶段。 |

## 本地运行与自动化验证

启动零依赖本地静态服务器：

```bash
node serve.mjs
# 浏览器访问 http://127.0.0.1:4173
```

运行包含可证伪自检在内的 7 项 Playwright WebGL2 自动化验证门禁（`G1` 至 `G7`）：

```bash
node verify_gates.mjs
```

渲染确定性的 45 秒 `1080p60`（`1920x1080` @ 60fps = `2,700` 帧）有声展示视频与 `< 10 MB` 首页内联动态 WebP 预览图：

```bash
node render_showcase_video.mjs
```

## 构建提示词与多语言技术规范

完整提示词与数学光学规范详见 [`prompts/`](./prompts/README.md) 目录：

1. [English Prompt and Specification](./prompts/en.md)
2. [简体中文提示词与光学技术规范](./prompts/zh-CN.md)
3. [日本語ビルドプロンプトおよび光学仕様](./prompts/ja.md)
4. [한국어 빌드 프롬프트 및 광학 명세서](./prompts/ko.md)

## 开源许可

本项目基于 [MIT License](./LICENSE) 许可发布。
