# 05 从 DiT 到 Flow Matching：架构与范式的演进

[上一篇：文本到图像](04-conditional-generation.md) · [返回目录](README.md) · [下一篇：动手实验与自测](06-exercises.md)

当你打开近两年的生成模型论文（如 DiT、Stable Diffusion 3、CogVideoX、Wan 等）时，会发现大家越来越多地谈论 **DiT（Diffusion Transformer）**、**Score（得分）** 和 **Flow Matching（流匹配）**。

刚学完 DDPM 和 U-Net 的初学者很容易产生困惑：*“难道前面学的东西都推翻重来了吗？”*
答案是：**完全没有。它们只是分别升级了生成系统中的某一个模块或视角。** 这一篇我们就把这几个高频概念逐一拆开，最后总结出一套能帮你快速看懂任何新论文的“五维拆解法”。

---

## 1. DiT：把去噪骨干网络从 U-Net 换成 Transformer

在早期扩散模型（如 DDPM 和 Stable Diffusion 1.x/2.x）中，承担预测任务的去噪网络普遍采用 **U-Net** 结构：它通过卷积层逐步下采样缩小特征图，再上采样恢复尺寸，并用跳连（skip connections）在同分辨率层级间传递细节。

而 **DiT（Scalable Diffusion Models with Transformers，2022）** 借鉴了视觉 Transformer（ViT）的思路，将去噪网络的主干彻底换成了标准 **Transformer**：
1. **切块（Patchify）**：把输入的带噪 latent 张量切分成一个个小空间块（patch），并将每个小块展平映射成一个 **token 向量**；
2. **Transformer 处理**：把这串图像 token 送入由多层自注意力（Self-Attention）和前馈网络组成的 Transformer 模块中，让画面不同位置自由交换全局与局部信息；时间步 $t$ 和类别/文本等条件信息则通过自适应归一化（adaLN）或注意力机制注入每一层；
3. **还原形状（Unpatchify）**：最后把输出 token 重新拼回与输入 latent 相同的空间尺寸，输出预测的噪声（或速度场）。

为什么大家纷纷转向 DiT？因为实验表明，Transformer 架构在扩散模型中同样具有出色的**可扩展性（Scaling Law）**——随着模型参数量和训练计算量（Gflops）的增加，生成图像的质量能够稳定、可预期地持续提升。

> **核心辨析：别把“骨干网络”和“训练范式”混为一谈**
> - **DiT 只回答“神经网络长什么样”**（用 Transformer 替代 U-Net）；
> - 至于网络输出预测的是噪声还是速度，回答的是**“网络学什么目标”**；
> - 拿到预测后怎么算出下一步，回答的是**“使用什么采样器”**。
>
> 例如，2022 年的原始 DiT 论文依然是在 VAE 压缩后的潜空间（latent space）里运行，并且依然使用经典的 DDPM 高斯扩散框架进行训练。因此，看到一个模型用了 Transformer，并不自动意味着它一定用了 Flow Matching，也不意味着它在原始像素空间生成。

---

## 2. Score（得分函数）：描述“去噪方向”的另一种数学语言

在阅读连续时间扩散论文（如 Score SDE）时，你会频繁遇到 **Score（得分函数）** 这个词。

首先要避开一个字面翻译带来的误区：**这里的 Score 绝不是给图片质量打的“分数”（比如 90 分），而是一个与图片形状完全相同的方向向量！**

在概率统计中，设 $p_t(x_t)$ 是训练数据经过第 $t$ 级加噪后形成的概率密度分布，**Score 的严格定义是对数概率密度关于当前样本 $x_t$ 的梯度**：

$$\text{Score}(x_t, t) = \nabla_{x_t} \log p_t(x_t).$$

怎样直观理解这个梯度向量？
你可以把数据分布 $p_t(x)$ 想象成一片高低起伏的地形：真实图片聚集的地方是高耸的“山峰”（概率密度高），而漫无目的的纯噪声区域则是低洼的“山谷”（概率密度低）。那么，对数密度对当前位置 $x_t$ 的梯度 $\nabla_{x_t} \log p_t(x_t)$，指出的正是**当前位置朝哪个方向移动，能让概率密度上升得最快**——也就是“往更像真实数据的山峰爬”的方向。

**它和 DDPM 的“预测噪声”有什么关系？**
在常见的高斯加噪设定 $x_t = \sqrt{\bar{\alpha}_t}x_0 + \sqrt{1-\bar{\alpha}_t}\epsilon$ 下，加入噪声 $\epsilon$ 是把样本从高密度的真实数据区往外推；反过来，想往高密度区走（顺着 Score 方向走），方向自然就与所加噪声 $\epsilon$ 相反。数学上可以严格证明（详见[07 数学补充](07-math-optional.md)），理想的噪声预测值只需除以一个与噪声强度相关的缩放系数，就能直接换算成 Score 的估计：

$$\nabla_{x_t} \log p_t(x_t) \approx -\frac{\epsilon_\theta(x_t, t)}{\sqrt{1 - \bar{\alpha}_t}}.$$

因此，DDPM 的噪声预测与基于 Score 的生成模型（Score-Based Generative Modeling）在本质上殊途同归，只是具体系数取决于噪声日程和参数化方式。

2020 年的经典论文 **Score SDE** 进一步用连续时间的**随机微分方程（SDE）**将这两者彻底统一，并指出：每一个带有随机性的反向生成过程（反向 SDE），都对应着一个确定性的**概率流常微分方程（Probability-Flow ODE）**。前者的单条生成轨迹包含随机扰动，而后者在给定初始噪声和向量场后轨迹是完全确定的；在理论条件满足时，这两种走法在每个时刻 $t$ 产生的整体样本分布（边缘分布）完全相同，但这并不意味着从同一个初值出发的两条具体轨迹会逐点重合。

---

## 3. Flow Matching 与 Rectified Flow：直接学习“从噪声到数据的速度场”

既然从噪声生成数据的过程可以看作沿着常微分方程（ODE）移动，研究者自然想到一个更直接的问题：**我们能不能跳出“按复杂日程一步步加高斯噪声”的思维定式，直接学习一个随时间变化的速度场（Velocity Field），把噪声分布平稳地“搬运”到真实数据分布？**

这就是 **Flow Matching（流匹配，2022）** 的核心思想。为了直观理解它是怎么训练的，我们来看其中最简单、也最常被现代模型采用的一种线性插值路径（在 **Rectified Flow，2022** 与流匹配文献中广泛使用）：

1. **配对取样**：随机采样一个标准高斯噪声样本 $x_{\mathrm{noise}} \sim \mathcal{N}(0, I)$，再从训练集中随机取一个真实数据样本 $x_{\mathrm{data}}$；
2. **直线插值构造中间点**：在两点之间连一条直线，随机取一个时间 $t \in [0, 1]$，按线性插值算出中间位置：
   $$x_t = (1 - t)\,x_{\mathrm{noise}} + t\,x_{\mathrm{data}};$$
3. **计算目标速度**：在这对样本连成的直线上，从起点 $x_{\mathrm{noise}}$ 匀速走向终点 $x_{\mathrm{data}}$ 的瞬时速度（位移方向）就是二者的差值：
   $$u_t = x_{\mathrm{data}} - x_{\mathrm{noise}};$$
4. **训练速度预测网络**：把中间点 $x_t$ 和时间 $t$ 输入神经网络 $v_\theta(x_t, t)$，用均方误差训练它直接拟合这个速度向量 $(x_{\mathrm{data}} - x_{\mathrm{noise}})$。

到了**生成阶段**，做法变得异常直观：从高斯分布随机采样一个起点 $x_{\mathrm{noise}}$，调用 ODE 数值求解器，每一步让网络 $v_\theta(x_t, t)$ 告诉我们“当前位置应该朝哪个方向、以多大速度走”，顺着预测的速度场从 $t=0$ 积分走到 $t=1$，就得到了生成样本。

```text
训练时（构造单对样本的直线连线）：
  随机噪声 x_noise ──────────── x_t = (1-t)x_noise + t·x_data ────────────► 真实数据 x_data
                                 │
                     训练网络 v_θ(x_t, t) 预测方向向量 (x_data - x_noise)

生成时（沿学到的总体速度场做 ODE 数值积分）：
  随机起点 x(t=0) ──► 按 v_θ 指引迈步 ──► ... ──► 按 v_θ 指引迈步 ──► 生成样本 x(t=1)
```

> **深入理解：既然训练时连的是直线，为什么生成不能直接一步到位？**
>
> 这是一个非常容易混淆的关键点：在训练时，我们虽然在每一对单独抽出的 $(x_{\mathrm{noise}}, x_{\mathrm{data}})$ 之间连了直线，但在整个数据集上，不同样本对的连线会在高维空间的同一个中间位置 $x_t$ 发生**交叉**（比如两对不同的起点和终点恰好都经过同一个中间点 $x_t$，但各自指向不同的终点方向）。
> 神经网络在均方误差损失下学到的是所有经过 $x_t$ 的样本对速度的**条件平均（期望速度场）**。因此，网络最终学出来的总体 ODE 生成轨迹通常仍然是弯曲的，不能保证对任意模型直接走 1 步就完美无损。
> **Rectified Flow（Flow Straight and Fast，2022）** 专门研究了这一问题，不仅提出用上述线性流连接分布，还设计了“重流（Reflow）”技术来进一步把弯曲的轨迹拉直，使数值积分可以用极少的步数完成。

**如何理清 Flow Matching、扩散模型与 Stable Diffusion 3 的关系？**
- **Flow Matching 是一个更宽泛的生成建模框架**：它可以选用包括上面这种线性路径在内的多种概率路径，而传统的高斯扩散路径也可以作为其中的一类特殊选择，因此不应把所有 Flow 模型简单等同于原始 DDPM。
- **以 Stable Diffusion 3（2024）为例**：它虽然沿用了“Stable Diffusion”的品牌名称，并且同样在压缩后的潜空间（latent space）生成，但它的底层核心已经换成了 **Rectified Flow（学习速度场）+ 多模态 Transformer（MM-DiT）**。阅读其论文或使用其权重时，不能再直接套用早期 DDPM 的噪声预测公式。

---

## 4. 读懂任意新论文的“五维拆解法”

学到这里，你已经掌握了现代扩散与流生成模型的全部核心组件。以后无论面对哪篇新论文，只要向自己提出下面这**五个问题**，就能立刻看清它的真实贡献：

| 拆解维度 | 核心问题 | 常见技术选项示例 |
| :--- | :--- | :--- |
| **1. 表示空间 (Representation)** | 模型在什么数据空间里做生成？ | 原始像素空间、图像 VAE 潜空间（LDM）、时空压缩的视频潜空间、离散文本 Token |
| **2. 概率路径 (Path)** | 如何定义从简单分布到真实数据的过渡路径？ | 离散高斯扩散（DDPM）、连续时间 SDE/ODE、线性插值流（Rectified Flow / Flow Matching） |
| **3. 预测目标 (Target)** | 神经网络每次前向计算输出的是什么物理量？ | 所加噪声 $\epsilon$、干净样本 $x_0$、对数密度梯度（Score）、组合量 $v$、速度场 $v_\theta$ |
| **4. 骨干网络 (Backbone)** | 用什么神经网络结构来计算这个预测？ | U-Net、DiT（Diffusion Transformer）、多模态 Transformer（MM-DiT） |
| **5. 采样与控制 (Sampling & Control)** | 推理时如何一步步更新状态？如何施加条件约束？ | DDPM / DDIM / DPM-Solver / 欧拉 ODE 求解器；配合 CFG、ControlNet 等控制手段 |

**重要提醒**：这五个维度帮助我们分类理清思路，但它们在代码实现中**必须彼此匹配兼容**，不能随意乱拼。例如，采样器的更新公式必须与模型训练时的路径定义和预测目标严格对应——你不能把专门为 DDPM“噪声预测”推导出来的采样更新公式，原封不动地套在一个预测“速度场”的 Rectified Flow 模型上。

---

## 5. 往哪里延伸：视频生成与离散文本扩散

掌握了图像主线后，如果你对更前沿的应用感兴趣，可以顺着“五维拆解法”自然延伸到另外两个热门方向（初学者可先了解概念，不必急于深究细节）：

- **视频扩散模型（如 [CogVideoX](https://arxiv.org/abs/2408.06072), 2024；[Wan](https://arxiv.org/abs/2503.20314), 2025）**：
  在“表示空间”上，视频不仅要压缩空间分辨率，还要用 3D VAE 同时压缩时间帧维度；在“骨干网络”上，普遍采用大规模 DiT 处理时空 token 并融合文本条件。相比静态图像，视频生成还必须额外解决帧间连贯性、大幅度运动合理性以及高昂的时空计算成本，具体架构设计以各自技术报告为准。
- **离散扩散语言模型（如 [LLaDA](https://arxiv.org/abs/2502.09992), 2025）**：
  文本是由离散的词元（token）组成的，无法直接套用图像上连续像素的高斯加噪公式。因此这类模型将“前向破坏过程”改成了**随机遮盖（Masking）**——随着时间步推进，把句子里越来越多的词替换成 `[MASK]`；反向生成时，则让模型迭代地并行预测被遮盖位置的词元。需要注意，每一步能并行预测多个位置，并不自动意味着整体推理耗时一定比自回归语言模型更短，实际速度取决于总迭代步数与具体实现。

---

## 自测小结

- **问题**：有人说“Stable Diffusion 3 用了 DiT，所以它不再需要潜空间（latent），也是靠 DiT 替代了 DDPM 的采样器”。这句话混淆了哪些维度？
- **参考答案**：这句话把**骨干网络、表示空间、训练目标/路径、采样器**混在了一起。首先，DiT 是**骨干网络**（替代的是 U-Net），并不替代潜空间（SD3 依然在 VAE 潜空间中生成），也不替代采样器；其次，SD3 在路径与训练目标上改用了 Rectified Flow（学习速度场并用 ODE 求解器采样），这是生成路径和目标的改变，而非因为换了 Transformer 骨干就自动改变了采样器。

---

## 延伸阅读论文

- **DiT**：[Scalable Diffusion Models with Transformers](https://arxiv.org/abs/2212.09748)（Peebles & Xie, ICCV 2023）· [本地 PDF](../papers/2212.09748.pdf)
- **Score SDE**：[Score-Based Generative Modeling through Stochastic Differential Equations](https://arxiv.org/abs/2011.13456)（Song et al., ICLR 2021）· [本地 PDF](../papers/2011.13456.pdf)
- **Flow Matching**：[Flow Matching for Generative Modeling](https://arxiv.org/abs/2210.02747)（Lipman et al., ICLR 2023）· [本地 PDF](../papers/2210.02747.pdf)
- **Rectified Flow**：[Flow Straight and Fast: Learning to Generate and Transfer Data with Rectified Flow](https://arxiv.org/abs/2209.03003)（Liu et al., ICLR 2023）· [本地 PDF](../papers/2209.03003.pdf)
- **Stable Diffusion 3**：[Scaling Rectified Flow Transformers for High-Resolution Image Synthesis](https://arxiv.org/abs/2403.03206)（Esser et al., ICML 2024）· [本地 PDF](../papers/2403.03206.pdf)
- **前沿视频与离散扩散扩展**：[CogVideoX](https://arxiv.org/abs/2408.06072)（[本地 PDF](../papers/2408.06072.pdf)）· [Wan](https://arxiv.org/abs/2503.20314)（[本地 PDF](../papers/2503.20314.pdf)）· [LLaDA](https://arxiv.org/abs/2502.09992)（[本地 PDF](../papers/2502.09992.pdf)）
