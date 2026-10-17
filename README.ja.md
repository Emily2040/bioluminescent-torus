**[English](./README.md)** · **[简体中文](./README.zh-CN.md)** · **[日本語](./README.ja.md)** · **[한국어](./README.ko.md)**

# 生物発光ファイバー・トーラス (Bioluminescent Fiber-Optic Torus)

<p align="center">
  <a href="https://github.com/Emily2040/bioluminescent-torus/releases/download/v1.0.0/bioluminescent-torus-1080p60.mp4">
    <img src="./assets/preview.webp" width="100%" alt="生物発光ファイバー・トーラス 1080p60 プレビュー" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/Emily2040/bioluminescent-torus/releases/download/v1.0.0/bioluminescent-torus-1080p60.mp4">
    <strong>▶ Play / Download Full 1080p60 Video With Sound（音声付き 45秒 1080p60 フル動画を再生・ダウンロード）</strong>
  </a>
</p>

ネイティブ WebGL2 および GLSL ES 3.0（`#version 300 es`）を用いて構築したリアルタイム3D光学シミュレーションです。漆黒の虚空を渦巻く `100万`（`1,000,000`）個の黄金微粒子と `2,048` 本の生物発光光ファイバー束（`262,144` 個のカメラ正対リボンセグメント）が、エレクトリックブルー（`#00E5FF`）とマゼンタ（`#FF1493`）の対向進行波で脈動しながら精緻な3次元幾何学トーラス（円環体）へと凝集する過程を、物理マクロボケ被写界深度（Macro Bokeh DoF）とシネマティックスローモーションで描画します。

外部のランタイムライブラリを一切使用せず、バニラ JavaScript（ES Modules）とカスタム GLSL シェーダーのみで動作します。

## マルチフェーズ・ビジュアルギャラリー

| フェーズ 01：Void Swirl 虚空の渦（`p = 0.06`） | フェーズ 02：Magnetic Capture 磁気捕捉（`p = 0.24`） |
| :---: | :---: |
| ![Phase 01 Void Swirl](./captures/01-void-swirl.png) | ![Phase 02 Magnetic Capture](./captures/02-magnetic-capture.png) |
| **フェーズ 04：Harmonic Resonance マクロリム共鳴（`p = 0.64`）** | **Torus Eye Interior トーラス中央孔の内部視界（`f/1.2` マクロ開放絞り）** |
| ![Phase 04 Harmonic Resonance Macro](./captures/03-harmonic-resonance-macro.png) | ![Torus Eye Interior](./captures/04-torus-eye-interior.png) |

<p align="center">
  <img src="./captures/05-clean-fullscreen-no-hud.png" width="100%" alt="HUD 非表示のフルスクリーン高調波共鳴ビュー" />
</p>

## 数理モデルおよび光学レンダリングアーキテクチャ

### 1. ヴィラルソー円、トーラス結び目、4次元 Kronecker 低食い違い格子（`src/math/torusTopology.js`）

一般的な擬似乱数による粒子配置では、曲面上で不自然な粒子の偏り（クランピング）が発生します。本作では4次元黄金比 Kronecker 低食い違い列（`PHI_1 = 0.6180339887`、`PHI_2 = 0.3247179572`、`PHI_3 = 0.2207440846`、`PHI_4 = 0.1673039783`）を用いて `100万`（`1,000,000`）個の黄金ダストおよびマイクロスパー粒子を生成し、単一の 16 MB `Float32Array` バッファとして GPU に一括転送しています。

光ファイバー束については、ハードウェア・インスタンシング（`gl.drawArraysInstanced`）により `2,048` 本のストランドを各 `128` セグメント（合計 `262,144` セグメント、1フレームあたり `528,384` ポリゴン）に分割し、主半径 $R = 2.45$、副半径 $r = 0.92$ の周囲に3層の幾何ファミリーを配置しています。

| ファミリー | ストランド比率 | 巻数パラメータ $(p,q)$ | 幾何学的・光学的役割 |
| :--- | :--- | :--- | :--- |
| 内部コアブレイド (Inner Core Braids) | `35%` | $(3,5)$、$(5,8)$ | トーラス内部（$0.32r$ 〜 $0.68r$）で高密度の発光コア骨格を形成します。 |
| 主ヴィラルソー円群 (Primary Villarceau Circles) | `45%` | $(1,1)$、$(1,-1)$ | 斜接平面でトーラスを切る双方向の斜航円（$0.72r$ 〜 $1.00r$）として交差格子を織り上げます。 |
| 外部ゴッサマー・ケージ (Outer Gossamer Cage) | `20%` | $(2,3)$、$(3,4)$ | 外殻（$1.02r$ 〜 $1.22r$）を巡る繊細な高次倍音フィラメントで、拡散時に最初へ虚空へ解かれます。 |

### 2. フィラメント形態形成と対向進行波（`src/shaders/fiberStrands.glsl.js`）

各光ファイバーは、コレオグラフィの凝集曲線に従い、漆黒の虚空における3次元非発散 Beltrami 渦流状態とトーラス結び目座標の間を滑らかに補間します。頂点シェーダーでは、カメラ視線ベクトルと接線ベクトルの外積からビュースペースでリボン幅を展開し、符号付き錯乱円（CoC）半径に応じて非合焦ストランドを自然に拡げることでサブピクセルのジャギーを防止します。

フラグメントシェーダーでは、各ストランドの長さ方向パラメータ $t \in [0, 1]$ に沿って2系統の対向進行波を計算します。

1. 順方向の基本波（`sin((t * 6.0 - uPulsePhase * 2.0 + seed) * 2π)`）がエレクトリックブルー（`#00E5FF`）のコア発光を駆動します。
2. 逆方向の高調波（`cos((t * 10.0 + uPulsePhase * 1.5 - seed) * 2π)`）が生物発光マゼンタ（`#FF1493`）のパルスを伝播します。
3. 両波が干渉して強め合う波頭ではシアンホワイト（`#E8FFFF`）の輝きが生じ、周囲の黄金粒子（`#FFD166`）を励起します。

### 3. 物理マクロボケと4パス HDR ポストプロセス（`src/shaders/goldenDust.glsl.js`、`src/shaders/postProcess.glsl.js`）

レンダラーは毎フレーム、`RGBA16F` 半精度浮動小数点フレームバッファに対して4つの GPU パスを実行します。

| パス | レンダーターゲット | 処理内容 |
| :--- | :--- | :--- |
| Pass 1 | `scene`（`RGBA16F` + `DEPTH_COMPONENT24`） | `262,144` 個のファイバーセグメントと `100万` 個の黄金ダストを描画します。解析的口径ケラレ（口径食・レモン型ボケ）、明るいボケ輪郭リング、色収差を計算し、Alpha チャンネルに符号付き CoC を出力します。 |
| Pass 2 | `dof`（`RGBA16F`） | 黄金角（$\theta = 2.399963\text{ rad}$）に基づく16タップ Vogel ディスク被写界深度ギャザーを実行します。 |
| Pass 3 | `bloomTight` & `bloomWide`（`RGBA16F`） | 1/2 および 1/4 解像度で2段階の分離型9タップガウシアン HDR ブルームピラミッドを生成します。 |
| Pass 4 | デフォルトフレームバッファ | 合焦面、マクロボケ、2段階ブルーム、放射状光学色収差を統合し、彩度保持型 ACES Filmic トーンマッピングで画面に出力します。 |

## インタラクティブ Director HUD とカメラ操作

| コントロール / 入力 | 機能 |
| :--- | :--- |
| `01 Void Swirl` 〜 `05 Slow-Mo Dispersal` | 5つの形態形成フェーズへ直接ジャンプします。 |
| `Timeline Phase`（`0.000` 〜 `1.000`） | 拡散した虚空から3Dトーラスへの凝集プロセスを連続的にスクラブ操作します。 |
| `Slow-Mo Speed`（`0.05x` 〜 `1.50x`） | シミュレーションの時間スケールを調整します（初期値は `0.25x` シネマティックスローモーション）。 |
| `Macro Aperture`（`f/1.0` 〜 `f/16.0`） | 物理錯乱円（CoC）半径と黄金ボケディスクの口径を制御します。 |
| `Focal Distance`（`1.50m` 〜 `9.00m`） | 前景の浮遊ダストからトーラスリム、奥の壁面までピント位置を移動します。 |
| キャンバス左クリック（Click-to-Focus） | 3Dトーラスの符号付き距離関数（SDF）をレイマーチングし、クリックした奥行きへラックフォーカスします。 |
| 左ドラッグ / マウスホイール | 3D球面座標でのカメラオービット回転および `2.6m` 〜 `13.5m` のドリーズームを行います。 |
| カメラリグ・プリセットボタン | `Macro Grazing Rim`、`Torus Eye Interior`、`Villarceau Oblique`、`Wide Void Orbit` の4視点間を滑らかに遷移します。 |
| `Space` / `L` / `H` / `M` / `1`-`5` | 再生/一時停止、フェーズ固定、HUD 表示切替、Web Audio 高調波シンセサイザー切替、フェーズ切替のショートカットキーです。 |

## ローカル実行と自動検証スイート

外部依存ゼロのローカル HTTP サーバーを起動します。

```bash
node serve.mjs
# ブラウザで http://127.0.0.1:4173 を開く
```

反証可能性セルフテストを含む全7ゲートの Playwright WebGL2 自動検証スイート（`G1` 〜 `G7`）を実行します。

```bash
node verify_gates.mjs
```

ステレオ高調波サウンドトラック付きの45秒 `1080p60`（`1920x1080` @ 60fps = `2,700` フレーム）MP4 ショーケース動画および `< 10 MB` のインラインアニメーション WebP プレビューを生成します。

```bash
node render_showcase_video.mjs
```

## ビルドプロンプトと多言語仕様書

シードプロンプトおよび数理・光学仕様書は [`prompts/`](./prompts/README.md) に収録しています。

1. [English Prompt and Specification](./prompts/en.md)
2. [简体中文提示词与光学技术规范](./prompts/zh-CN.md)
3. [日本語ビルドプロンプトおよび光学仕様](./prompts/ja.md)
4. [한국어 빌드 프롬프트 및 광학 명세서](./prompts/ko.md)

## ライセンス

[MIT License](./LICENSE) の下で公開されています。
