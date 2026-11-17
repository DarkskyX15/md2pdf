# 07 数学补充（选读）：从直觉到公式推导

[返回目录](README.md) · [返回 02 DDPM](02-ddpm.md) · [返回 06 动手实验](06-exercises.md)

本篇为选读内容，面向希望弄清正文公式来龙去脉的读者。阅读本篇只需要基础的概率论（高斯分布的均值与方差）和微积分（求导与梯度）知识。如果你目前只想把握算法主线，完全可以跳过本篇。

前三个小节以最经典的离散时间高斯 DDPM 为例进行推导，第四小节介绍线性路径下的 Flow Matching 目标。

---

## 1. 从“逐步加噪”到“一步直接采样”公式

在 DDPM 中，前向过程被定义为一条一步步加噪的马尔可夫链。设每一步人为规定的噪声方差为 $\beta_t \in (0, 1)$，并记单步信号保留比例为 $\alpha_t = 1 - \beta_t$，累积信号保留比例为 $\bar{\alpha}_t = \prod_{s=1}^{t} \alpha_s$。

单步加噪的转移分布定义为：

$$q(x_t \mid x_{t-1}) = \mathcal{N}\left(\sqrt{\alpha_t}\,x_{t-1},\, \beta_t I\right).$$

用采样形式写出来，就是在第 $t$ 步把前一步的状态 $x_{t-1}$ 乘上 $\sqrt{\alpha_t}$，再加上一份方差为 $\beta_t = 1 - \alpha_t$ 的独立高斯噪声：

$$x_t = \sqrt{\alpha_t}\,x_{t-1} + \sqrt{1 - \alpha_t}\,\epsilon_t, \quad \epsilon_t \sim \mathcal{N}(0, I).$$

**为什么不需要写循环加噪 $t$ 次，就能从 $x_0$ 直接算出 $x_t$？**
我们可以先看前两步（$t=1$ 到 $t=2$）是如何合并的。将 $x_1 = \sqrt{\alpha_1}x_0 + \sqrt{1-\alpha_1}\epsilon_1$ 代入 $x_2$ 的表达式：

$$
\begin{aligned}
x_2 &= \sqrt{\alpha_2}\left(\sqrt{\alpha_1}x_0 + \sqrt{1 - \alpha_1}\epsilon_1\right) + \sqrt{1 - \alpha_2}\epsilon_2 \\
&= \sqrt{\alpha_1 \alpha_2}\,x_0 + \underbrace{\sqrt{\alpha_2(1 - \alpha_1)}\,\epsilon_1 + \sqrt{1 - \alpha_2}\,\epsilon_2}_{\text{两份独立高斯噪声之和}}.
\end{aligned}
$$

根据高斯分布的基本性质：**两个相互独立的高斯随机变量相加，结果仍然服从高斯分布，且新方差等于两者方差之和**。
上面画括号的两项均值都为 $0$，它们的方差相加刚好可以化简：

$$\alpha_2(1 - \alpha_1) + (1 - \alpha_2) = \alpha_2 - \alpha_1\alpha_2 + 1 - \alpha_2 = 1 - \alpha_1\alpha_2.$$

这意味着，那两项噪声合并之后，完全等价于单独一份标准高斯噪声乘上标准差 $\sqrt{1 - \alpha_1\alpha_2}$！
顺着这个规律递推 $t$ 步（令 $\bar{\alpha}_t = \alpha_1 \alpha_2 \cdots \alpha_t$），就得到了正文中反复使用的**一步加噪公式**：

$$q(x_t \mid x_0) = \mathcal{N}\left(\sqrt{\bar{\alpha}_t}\,x_0,\, (1 - \bar{\alpha}_t)I\right),$$

$$x_t = \sqrt{\bar{\alpha}_t}\,x_0 + \sqrt{1 - \bar{\alpha}_t}\,\epsilon, \quad \epsilon \sim \mathcal{N}(0, I).$$

> **概率含义提醒**：
> 上式给出的是固定 $x_0$ 时，在单个时间步 $t$ 上的**条件边缘分布 $q(x_t \mid x_0)$**。正因为训练损失每次只看单独一个时间步 $t$，我们才可以随机抽一个 $t$ 和一份 $\epsilon$ 直接算出 $x_t$。但如果你需要模拟一条真正的前向逐步马尔可夫轨迹 $(x_1, x_2, \dots, x_T)$，就必须严格按照单步转移公式在每一步采样独立的噪声 $\epsilon_t$，而不能在所有时间步上复用同一个 $\epsilon$。

---

## 2. 从“预测噪声”到“估计干净样本 $\hat{x}_0$”

观察上面的一步加噪公式 $x_t = \sqrt{\bar{\alpha}_t}x_0 + \sqrt{1-\bar{\alpha}_t}\epsilon$。如果把其中的真实噪声 $\epsilon$ 替换成神经网络给出的预测噪声 $\epsilon_\theta(x_t, t)$，通过简单的代数移项，就可以写出当前对干净原图 $x_0$ 的估计值 $\hat{x}_0$：

$$\hat{x}_0 = \frac{x_t - \sqrt{1 - \bar{\alpha}_t}\,\epsilon_\theta(x_t, t)}{\sqrt{\bar{\alpha}_t}}.$$

这个式子在阅读 DDIM 等论文时非常常见，但理解它时需要注意两点：
1. **高噪声下的误差放大**：只要 $\bar{\alpha}_t > 0$，这个除法在数学上就能写出来；但当时间步 $t$ 很大（接近纯噪声）时，分母 $\sqrt{\bar{\alpha}_t}$ 非常接近 $0$，此时网络预测 $\epsilon_\theta$ 中哪怕一丁点微小的误差，都会被分母急剧放大。
2. **估计值不等于最终生成图**：在高噪声阶段，$x_t$ 中保留的原图信息极少，算出来的 $\hat{x}_0$ 只是一个粗糙的统计期望估计，看起来往往十分模糊。因此，DDPM 在反向生成时并不是直接把单步算出的 $\hat{x}_0$ 当作最终输出，而是利用这个预测去构造单步反向转移分布 $p_\theta(x_{t-1} \mid x_t)$ 的均值，再配合选定的方差一步步向低噪声状态采样推进。

---

## 3. 为什么“预测噪声”等价于估计 Score（对数密度梯度）？

设训练数据经过第 $t$ 级高斯加噪后，在整个数据集上形成的边缘概率密度为 $p_t(x_t)$。我们在第 05 篇中提到，**Score（得分函数）** 定义为对数概率密度对当前样本 $x_t$ 的梯度，即 $\nabla_{x_t} \log p_t(x_t)$。下面我们看看它为什么和噪声 $\epsilon$ 直接挂钩。

首先，只看单张固定原图 $x_0$ 产生 $x_t$ 的条件高斯分布 $q(x_t \mid x_0) = \mathcal{N}(\sqrt{\bar{\alpha}_t}x_0, (1-\bar{\alpha}_t)I)$。根据多元高斯分布的密度公式，它的对数概率密度可以写为：

$$\log q(x_t \mid x_0) = -\frac{\|x_t - \sqrt{\bar{\alpha}_t}\,x_0\|^2}{2(1 - \bar{\alpha}_t)} + C,$$

其中 $C$ 是与 $x_t$ 无关的常数项。现在对 $x_t$ 求梯度（常数项导数为 $0$，平方项求导把系数 $2$ 约掉）：

$$\nabla_{x_t} \log q(x_t \mid x_0) = -\frac{x_t - \sqrt{\bar{\alpha}_t}\,x_0}{1 - \bar{\alpha}_t}.$$

回忆一下一步加噪公式，分子中的 $(x_t - \sqrt{\bar{\alpha}_t}x_0)$ 正好就是 $\sqrt{1-\bar{\alpha}_t}\,\epsilon$！把它代进去约分，立刻得到：

$$\nabla_{x_t} \log q(x_t \mid x_0) = -\frac{\sqrt{1 - \bar{\alpha}_t}\,\epsilon}{1 - \bar{\alpha}_t} = -\frac{\epsilon}{\sqrt{1 - \bar{\alpha}_t}}.$$

接下来从单张图推广到整个数据分布：
当我们使用均方误差损失 $\mathbb{E}[\|\epsilon - \epsilon_\theta(x_t, t)\|^2]$ 训练噪声预测网络时，在理想情况下，使均方误差达到最小的最优网络输出恰好是给定 $x_t$ 时噪声的条件期望，即 $\epsilon_\theta^*(x_t, t) = \mathbb{E}[\epsilon \mid x_t]$。对未知的真实图片 $x_0$ 取条件平均后，就可以证明边缘分布 $p_t(x_t)$ 的真实 Score 与最优噪声预测之间满足：

$$\nabla_{x_t} \log p_t(x_t) = -\frac{\epsilon_\theta^*(x_t, t)}{\sqrt{1 - \bar{\alpha}_t}}.$$

在实际训练中，神经网络的参数容量有限且存在拟合误差，因此 $-\epsilon_\theta(x_t, t) / \sqrt{1 - \bar{\alpha}_t}$ 提供的就是对真实 Score 的近似估计。
阅读相关推导时请留意：这里的 $p_t(x_t)$ 是对整个训练数据分布边缘化之后的总体密度（而非固定某一张原图 $x_0$ 的条件密度），并且上述简洁的换算系数依赖于这里所采用的高斯加噪参数化形式。

---

## 4. 理解一个简单的 Flow Matching（流匹配）线性目标

在阅读 Flow Matching 或 Rectified Flow 文献时，首先要特别注意**下标约定的变化**：
在这类文献中，通常令连续时间 $t \in [0, 1]$，并习惯用 **$x_0$ 表示纯噪声样本**、用 **$x_1$ 表示真实数据样本**（这与上面 DDPM 用 $x_0$ 表示干净图片、$x_T$ 表示噪声的习惯正好相反）。

考虑最直观的**线性插值路径**：随机抽取一个噪声样本 $x_0$ 和一个数据样本 $x_1$，在时间 $t \in [0, 1]$ 上把它们用直线连接起来：

$$x_t = (1 - t)x_0 + t x_1.$$

对于这一对固定的 $(x_0, x_1)$，点 $x_t$ 随时间 $t$ 移动的瞬时速度（即 $x_t$ 对时间 $t$ 的导数）是一个恒定不变的向量：

$$u_t = \frac{\mathrm{d}x_t}{\mathrm{d}t} = x_1 - x_0.$$

于是，我们可以训练一个速度预测网络 $v_\theta(x_t, t)$，用简单的均方误差去回归每个采样对的目标速度：

$$L_{\mathrm{FM}} = \mathbb{E}_{t, x_0, x_1}\Big[ \big\| v_\theta(x_t, t) - (x_1 - x_0) \big\|^2 \Big].$$

在生成阶段，只需从噪声分布采样初值 $x_0$，然后利用数值求解器求解常微分方程：

$$\frac{\mathrm{d}x}{\mathrm{d}t} = v_\theta(x, t),$$

让状态沿着网络预测的速度场从 $t = 0$ 积分走到 $t = 1$，即可得到生成样本。

> **关于线性流目标的两个重要澄清**：
> 1. **这只是 Flow Matching 的一个特例**：上面展示的线性插值路径是最容易理解的一种构造方式，但 Flow Matching 本身是一个更通用的框架，完全可以定义其他形式的概率路径（包括还原传统扩散模型的路径）。
> 2. **为什么“每对样本连直线”不等于“生成轨迹也是直线”？**
>    对于空间中某一个固定的中间位置 $x_t$ 和时刻 $t$，训练集中可能有多组不同的样本对 $(x_0, x_1)$ 连线都恰好穿过它，而每一组样本对给出的瞬时方向 $(x_1 - x_0)$ 各不相同。正如我们在第 3 小节看到的，最小化均方误差会让网络学到所有经过该点的速度向量的**条件期望** $\mathbb{E}[x_1 - x_0 \mid x_t]$。把这些平均速度连成整条流线后，实际积分走出来的 ODE 生成轨迹通常仍然是弯曲的，并不会因为训练时用了两点直线插值就自动变成一步到位的直线。

---

## 延伸阅读论文

- **DDPM**：[Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239)（Ho et al., NeurIPS 2020）· [本地 PDF](../papers/2006.11239.pdf)
- **Score SDE**：[Score-Based Generative Modeling through Stochastic Differential Equations](https://arxiv.org/abs/2011.13456)（Song et al., ICLR 2021）· [本地 PDF](../papers/2011.13456.pdf)
- **Flow Matching**：[Flow Matching for Generative Modeling](https://arxiv.org/abs/2210.02747)（Lipman et al., ICLR 2023）· [本地 PDF](../papers/2210.02747.pdf)
