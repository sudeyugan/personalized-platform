# Codex 任务说明：实现差分立绘 + 固定动作序列帧桌面角色系统

目标：在现有桌面角色项目中实现一套“差分立绘 + 固定动作序列帧”的基础动画系统。当前阶段不接入自动生图、LLM、复杂 Live2D Rig，只完成一个结构清晰、后续可扩展的角色 Runtime。

> 2026-09-15 演进说明：本文前二十四节记录第一版全画布差分设计并继续作为 legacy 格式支持。当前推荐的新角色包改用“局部透明 PNG + Slot 元数据”，详见第二十五节；控制器、状态机和完整动作序列帧规则保持不变。

## 一、总体目标

角色由两种动画方式组合：

1. **差分立绘**
   - 身体主体保持静态或轻微移动
   - 眼睛、嘴巴、眉毛、表情覆盖层等作为独立 Sprite
   - 通过切换局部贴图实现眨眼、说话和表情变化

2. **固定动作序列帧**
   - 对于挥手、点头、惊讶、睡觉等较大的动作，不做骨骼 Rig
   - 直接加载一组完整 PNG 序列帧并按 FPS 播放
   - 动作播放完成后恢复普通差分立绘状态

整个系统需要把“角色资产”和“运行逻辑”解耦，后续无论图片是人工制作还是 AI 自动生成，都不需要修改 Runtime。

---

## 二、推荐角色资源结构

统一定义角色目录，例如：

```text
characters/
└── character_001/
    ├── character.json
    │
    ├── base/
    │   └── body.png
    │
    ├── eyes/
    │   ├── neutral_open.png
    │   ├── neutral_half.png
    │   ├── neutral_closed.png
    │   ├── happy.png
    │   └── angry.png
    │
    ├── brows/
    │   ├── neutral.png
    │   ├── happy.png
    │   ├── angry.png
    │   └── sad.png
    │
    ├── mouth/
    │   ├── closed.png
    │   ├── half.png
    │   ├── open.png
    │   ├── smile.png
    │   └── sad.png
    │
    ├── overlays/
    │   ├── blush.png
    │   ├── sweat.png
    │   └── surprise.png
    │
    └── motions/
        ├── wave/
        │   ├── 001.png
        │   ├── 002.png
        │   ├── 003.png
        │   ├── 004.png
        │   └── 005.png
        │
        ├── nod/
        │   └── ...
        │
        ├── surprise/
        │   └── ...
        │
        └── sleep/
            └── ...
```

注意：

- 所有差分图片尺寸必须一致
- 原点和人物位置必须完全一致
- PNG 使用透明背景
- 序列帧同一动作内的 canvas 尺寸必须一致
- Runtime 不应根据文件名硬编码资源逻辑，资源映射由 `character.json` 描述

---

## 三、设计 character.json

建立统一角色配置，例如：

```json
{
  "id": "character_001",
  "name": "Example Character",
  "canvas": {
    "width": 1024,
    "height": 1536
  },
  "base": {
    "body": "base/body.png"
  },
  "eyes": {
    "neutral": {
      "open": "eyes/neutral_open.png",
      "half": "eyes/neutral_half.png",
      "closed": "eyes/neutral_closed.png"
    },
    "happy": {
      "open": "eyes/happy.png"
    },
    "angry": {
      "open": "eyes/angry.png"
    }
  },
  "brows": {
    "neutral": "brows/neutral.png",
    "happy": "brows/happy.png",
    "angry": "brows/angry.png",
    "sad": "brows/sad.png"
  },
  "mouth": {
    "closed": "mouth/closed.png",
    "half": "mouth/half.png",
    "open": "mouth/open.png",
    "smile": "mouth/smile.png",
    "sad": "mouth/sad.png"
  },
  "overlays": {
    "blush": "overlays/blush.png",
    "sweat": "overlays/sweat.png",
    "surprise": "overlays/surprise.png"
  },
  "expressions": {
    "neutral": {
      "eye": "neutral",
      "brow": "neutral",
      "mouth": "closed",
      "overlay": null
    },
    "happy": {
      "eye": "happy",
      "brow": "happy",
      "mouth": "smile",
      "overlay": null
    },
    "angry": {
      "eye": "angry",
      "brow": "angry",
      "mouth": "closed",
      "overlay": null
    },
    "sad": {
      "eye": "neutral",
      "brow": "sad",
      "mouth": "sad",
      "overlay": null
    },
    "shy": {
      "eye": "neutral",
      "brow": "neutral",
      "mouth": "closed",
      "overlay": "blush"
    }
  },
  "motions": {
    "wave": {
      "directory": "motions/wave",
      "fps": 10,
      "loop": false
    },
    "nod": {
      "directory": "motions/nod",
      "fps": 12,
      "loop": false
    },
    "surprise": {
      "directory": "motions/surprise",
      "fps": 12,
      "loop": false
    },
    "sleep": {
      "directory": "motions/sleep",
      "fps": 6,
      "loop": true
    }
  }
}
```

配置格式后续可以扩展，但 Runtime 第一版至少支持这些字段。

---

## 四、Runtime 层次设计

角色渲染至少拆成以下层级：

```text
CharacterContainer

├── BaseLayer
├── EyeLayer
├── BrowLayer
├── MouthLayer
├── OverlayLayer
└── MotionLayer
```

普通状态下：

```text
BaseLayer      visible
EyeLayer       visible
BrowLayer      visible
MouthLayer     visible
OverlayLayer   optional
MotionLayer    hidden
```

播放完整序列帧动作时：

```text
BaseLayer      hidden
EyeLayer       hidden
BrowLayer      hidden
MouthLayer     hidden
OverlayLayer   hidden

MotionLayer    visible
```

动作结束后恢复差分立绘。

这样能够避免完整动作序列帧和差分部件同时显示。

---

## 五、需要实现的核心类

建议按下面方式拆模块。

```text
src/
├── character/
│   ├── Character.ts
│   ├── CharacterConfig.ts
│   ├── CharacterLoader.ts
│   ├── CharacterController.ts
│   └── CharacterState.ts
│
├── animation/
│   ├── BlinkController.ts
│   ├── IdleController.ts
│   ├── MouthController.ts
│   ├── ExpressionController.ts
│   └── MotionPlayer.ts
│
└── rendering/
    └── CharacterRenderer.ts
```

如果当前项目结构不同，可以根据已有架构调整，但保持职责分离。

---

## 六、CharacterLoader

实现统一资源加载。

职责：

```text
character.json
      ↓
解析配置
      ↓
加载 PNG Texture
      ↓
构建 CharacterAssets
```

建议定义：

```ts
interface CharacterAssets {
  base: Texture;
  eyes: Record<string, Record<string, Texture>>;
  brows: Record<string, Texture>;
  mouth: Record<string, Texture>;
  overlays: Record<string, Texture>;
  motions: Record<string, MotionAsset>;
}
```

MotionAsset：

```ts
interface MotionAsset {
  frames: Texture[];
  fps: number;
  loop: boolean;
}
```

帧文件按照文件名排序：

```text
001.png
002.png
003.png
...
```

需要保证数字顺序正确，不能产生：

```text
1.png
10.png
2.png
```

这种错误排序。

---

## 七、CharacterRenderer

负责真正的 Sprite 管理。

需要持有：

```ts
baseSprite
eyeSprite
browSprite
mouthSprite
overlaySprite
motionSprite
```

实现以下基础 API：

```ts
setEyeTexture(texture: Texture): void

setBrowTexture(texture: Texture): void

setMouthTexture(texture: Texture): void

setOverlayTexture(texture?: Texture): void

showCompositeMode(): void

showMotionMode(): void

setMotionFrame(texture: Texture): void
```

Renderer 不关心“开心”“生气”等语义。

它只负责显示指定 Texture。

---

## 八、ExpressionController

ExpressionController 负责把高层表情转换成具体差分资源。

外部调用：

```ts
character.setExpression("happy");
```

内部读取：

```json
"happy": {
  "eye": "happy",
  "brow": "happy",
  "mouth": "smile",
  "overlay": null
}
```

然后更新 Renderer。

需要至少支持：

```text
neutral
happy
angry
sad
shy
surprised
sleepy
```

如果配置中不存在某个资源，需要有合理 fallback，例如：

```text
happy eye 不存在
→ fallback neutral eye
```

而不是直接崩溃。

---

## 九、BlinkController

眨眼使用差分切换完成。

基本序列：

```text
OPEN
 ↓
HALF
 ↓
CLOSED
 ↓
HALF
 ↓
OPEN
```

建议时间：

```text
open → half      50 ms
half → closed    50 ms
closed hold      60 ms
closed → half    50 ms
half → open      50 ms
```

两次眨眼间隔随机：

```text
2000 ~ 6000 ms
```

偶尔可以实现连续双眨眼。

重要要求：

如果当前眼睛状态不适合普通 blink，例如：

```text
sleep
closed-eye expression
motion playing
```

则禁止 BlinkController 覆盖眼睛状态。

因此 BlinkController 需要检查当前 CharacterState。

---

## 十、IdleController

即使主体只有一张图片，也通过整体 Container 做微小运动。

例如周期性：

```text
y = baseY + sin(t) * 2
rotation = sin(t * 0.7) * 0.002
scaleY = 1 + sin(t * 0.8) * 0.0015
```

只需要非常轻微。

目标不是让角色明显摇晃，而是避免完全静止。

同时可以加入少量随机：

```text
轻微歪头
轻微左右移动
短暂改变视线
```

第一版只做呼吸式上下移动即可。

---

## 十一、MotionPlayer

这是固定动作序列帧的核心。

外部 API：

```ts
playMotion("wave");
```

流程：

```text
检查 motion 是否存在
        ↓
进入 motion 状态
        ↓
切换 Renderer 到 Motion Mode
        ↓
按照 fps 播放 frame
        ↓
如果 loop=false
播放最后一帧
        ↓
结束
        ↓
切回 Composite Mode
        ↓
恢复当前 expression
        ↓
恢复 idle
```

需要支持：

```ts
playMotion(name: string): Promise<void>
stopMotion(): void
isPlaying(): boolean
```

Promise 很重要。

以后可以写：

```ts
await character.playMotion("wave");

character.setExpression("happy");
```

---

## 十二、动作播放优先级

需要防止多个动画互相覆盖。

建议第一版定义：

```text
MOTION
   >
TALK
   >
EXPRESSION
   >
BLINK
   >
IDLE
```

具体表现：

### 播放 Motion 时

暂停：

```text
BlinkController
MouthController
Expression texture update
```

Idle 可以暂停，也可以只保留非常轻微整体运动。

### Motion 结束

恢复：

```text
上一次 expression
当前 mouth state
Blink
Idle
```

---

## 十三、CharacterState

建立明确的角色状态。

例如：

```ts
type CharacterMode =
  | "idle"
  | "talking"
  | "motion"
  | "sleeping";

interface CharacterState {
  mode: CharacterMode;

  expression: string;

  blinking: boolean;

  mouthState:
    | "closed"
    | "half"
    | "open";

  currentMotion?: string;
}
```

不要把状态分散在不同 Sprite 中。

所有 Controller 都基于同一份 CharacterState 判断是否允许执行。

---

## 十四、实现嘴部动画

第一版只做三个嘴型：

```text
closed
half
open
```

先实现手动控制 API：

```ts
setMouthState("closed");
setMouthState("half");
setMouthState("open");
```

再增加一个简单的自动 talking mode。

例如：

```ts
startTalking();
stopTalking();
```

没有真实音频分析时，可以先随机：

```text
closed
half
open
half
open
closed
```

以 80~150ms 间隔切换。

以后接入 TTS 音频振幅时，再把随机驱动换掉。

---

## 十五、对外统一 CharacterController API

其他模块不要直接访问 Sprite。

希望最终只有类似：

```ts
character.setExpression("happy");

character.playMotion("wave");

character.startTalking();

character.stopTalking();

character.sleep();

character.wake();
```

建议 CharacterController 提供：

```ts
class CharacterController {

  async loadCharacter(path: string): Promise<void>;

  setExpression(name: string): void;

  playMotion(name: string): Promise<void>;

  startTalking(): void;

  stopTalking(): void;

  setMouthState(
    state: "closed" | "half" | "open"
  ): void;

  sleep(): void;

  wake(): void;

  update(deltaTime: number): void;
}
```

---

## 十六、第一版动作资源

第一版不要做太多动作。

只预留并测试：

```text
wave
nod
surprise
sleep
```

其中建议：

```text
wave
5~12 frames
8~12 FPS
不循环

nod
4~8 frames
8~12 FPS
不循环

surprise
4~8 frames
10~15 FPS
不循环

sleep
4~8 frames
4~8 FPS
循环
```

重点是验证系统，不是先制作大量资源。

---

## 十七、第一版表情资源

至少支持：

```text
neutral
happy
angry
sad
shy
```

其中可以通过复用差分降低资源量。

例如：

```text
neutral
eye: neutral
brow: neutral
mouth: closed

happy
eye: happy
brow: happy
mouth: smile

angry
eye: angry
brow: angry
mouth: closed

sad
eye: neutral
brow: sad
mouth: sad

shy
eye: neutral
brow: neutral
mouth: closed
overlay: blush
```

---

## 十八、旧版资源尺寸和坐标必须统一（兼容保留）

这是第一版 full-canvas 角色包的约束。旧角色仍按本节规则显示；新角色的局部差分应采用第二十五节的 Slot 格式。

所有差分图：

```text
body.png
eye.png
mouth.png
brow.png
overlay.png
```

都保持和原始 canvas 完全相同，例如：

```text
1024 × 1536
```

哪怕眼睛实际只有：

```text
200 × 80
```

第一版也不要裁剪成独立小图。

直接保留透明区域。

这样 Renderer 完全不需要计算部件位置：

```text
所有 Sprite：
x = 0
y = 0
```

直接叠起来就能对齐。

虽然会稍微增加显存占用，但第一版大幅降低复杂度。

后续确认系统稳定后，再考虑：

```text
裁剪 Texture
+
anchor / offset metadata
```

优化资源。

---

## 十九、序列帧也采用统一 Canvas

固定动作的所有帧同样保持：

```text
1024 × 1536
```

人物位置尽量不发生无意义漂移。

例如挥手：

```text
001.png
002.png
003.png
004.png
```

人物脚部、身体主体位置应该保持稳定，只让手和必要部位变化。

否则播放时人物会整体抖动。

---

## 二十、开发顺序

请严格按照以下顺序实现。

### Step 1

读取：

```text
character.json
```

成功加载一个角色。

### Step 2

成功显示：

```text
body
+
eye
+
brow
+
mouth
```

四层 Sprite。

### Step 3

实现：

```ts
setExpression()
```

可以在：

```text
neutral
happy
angry
sad
```

之间切换。

### Step 4

实现 BlinkController。

角色能够随机自动眨眼。

### Step 5

实现轻微 Idle animation。

角色可以呼吸式微动。

### Step 6

实现 MotionPlayer。

调用：

```ts
playMotion("wave")
```

能完整播放一组 PNG 序列。

### Step 7

动作过程中正确隐藏差分 Sprite。

动作结束后恢复：

```text
body
eyes
brows
mouth
expression
```

### Step 8

实现嘴部：

```text
closed
half
open
```

切换。

### Step 9

实现：

```ts
startTalking()
stopTalking()
```

第一版采用随机嘴型动画。

### Step 10

统一 CharacterState。

确保：

```text
motion
blink
talk
expression
idle
```

不会互相冲突。

---

## 二十一、第一版验收标准

最终运行后必须能够验证以下功能。

### 角色加载

启动程序后正确显示完整角色。

### Idle

不操作角色时有非常轻微呼吸运动。

### Blink

角色每隔数秒自动眨眼。

### Expression

通过测试按钮或者快捷键能够执行：

```text
setExpression("happy")
setExpression("angry")
setExpression("sad")
setExpression("neutral")
```

### Talking

执行：

```text
startTalking()
```

嘴巴开始随机：

```text
closed / half / open
```

切换。

执行：

```text
stopTalking()
```

恢复闭嘴。

### Motion

执行：

```text
playMotion("wave")
```

差分 Sprite 隐藏，播放挥手 PNG 序列。

动作结束后自动恢复之前表情。

### 冲突测试

播放 motion 时：

- 不发生眨眼贴图覆盖
- 不发生嘴型覆盖
- 不发生表情突然切换导致画面叠加错误

---

## 二十二、暂时不要实现的内容

只做好：

```text
差分立绘
+
固定 PNG 序列帧
+
Character State
+
Animation Controller
```

---

## 二十三、后续扩展接口需要提前保留

虽然当前不实现，但架构应该允许以后加入：

```text
TTS
 ↓
MouthController
```

```text
LLM
 ↓
CharacterEvent
 ↓
Expression / Motion / Talking
```

以及：

```text
AI Character Generator
 ↓
生成标准 character package
 ↓
CharacterLoader
```

因此 Runtime 必须完全依赖：

```text
character.json
+
标准资源目录
```

而不是针对某一个具体角色硬编码。

---

## 二十四、最终核心原则

这套系统的设计原则是：

```text
差分立绘负责：

眨眼
嘴巴
表情
简单状态
轻微待机动作
```

而：

```text
固定序列帧负责：

挥手
点头
转身
惊讶
睡觉
其他明显身体动作
```

不要尝试使用差分立绘解决所有动作，也不要把所有微小表情都制作成完整序列帧。

两者互补。

最终代码应该形成：

```text
             CharacterController
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
 Composite Character        MotionPlayer
          │                     │
 ┌────────┼─────────┐            │
 ▼        ▼         ▼            ▼
Eyes    Mouth   Expression    PNG Frames
 │        │         │
Blink    Talk      Emotion
```

完成后先使用临时测试素材验证整个 Runtime。

---

## 二十五、局部 Sprite + Slot 元数据

新角色包可以在 character.json 顶层声明 renderer.type: sprite 和通用 slots。眼睛、眉毛、嘴巴、覆盖层等差分资源使用 src + slot，可选 offset 只修正单个资源。

示例：

    {
      "renderer": { "type": "sprite" },
      "slots": {
        "eyes": { "x": 365, "y": 300, "width": 300, "height": 130 },
        "mouth": { "x": 430, "y": 455, "width": 160, "height": 90 }
      },
      "eyes": {
        "neutral": {
          "open": { "src": "eyes/open.png", "slot": "eyes" },
          "half": { "src": "eyes/half.png", "slot": "eyes" },
          "closed": { "src": "eyes/closed.png", "slot": "eyes" }
        },
        "happy": {
          "open": { "src": "eyes/happy.png", "slot": "eyes", "offset": { "y": -2 } }
        }
      }
    }

- 坐标属于角色逻辑画布，不是桌面窗口绝对坐标；角色整体缩放、呼吸和窗口移动会带着所有层一起变化。
- Slot 的 width/height 是参考尺寸。局部 PNG 尺寸不一致时开发模式报警，但仍按 PNG 原始尺寸显示。
- 未声明 Slot 的字符串资源继续在 (0,0) 按完整画布显示；旧 character.json 不要求迁移。
- 找不到被引用的 Slot 时，开发模式输出明确错误，并安全回退到 (0,0)，不让应用崩溃。
- 主体和固定动作帧继续使用完整画布；Blink、Mouth、Expression 与 Motion 控制器不读取坐标。
- 开发构建的设置预览可以显示 Slot 矩形和名称，生产构建默认关闭。
- 完整示例见 [character-slot.example.json](docs/examples/character-slot.example.json)。

当前 React Runtime 通过 Renderer 注册表选择 sprite 实现。未来可增加并注册 Live2DCharacterRenderer，继续消费同一份 CharacterState，无需改写 CharacterController；本阶段不引入 Cubism SDK。
