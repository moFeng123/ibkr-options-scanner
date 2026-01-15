# IBKR 期权扫描器

一款强大的盈透证券（Interactive Brokers）期权链扫描工具。基于 React + FastAPI 构建，支持实时 Greeks 筛选和专业的 T 型期权链显示。

[English](README.md)

## 安全与开源

参见 `SECURITY.md`。

## 功能特性

- **TWS/Gateway 连接**：通过 [ib_async](https://github.com/ib-api-reloaded/ib_async) 异步库连接盈透证券 TWS 或 IB Gateway
- **期权链显示**：专业的 T 型布局（看涨期权 | 行权价 | 看跌期权）
- **实时 Greeks**：Delta、Gamma、Theta、Vega 和隐含波动率
- **智能筛选**：
  - 按期权类型筛选（全部 / 仅看涨 / 仅看跌）
  - Delta 筛选（绝对值输入）
  - IV（隐含波动率）筛选
  - Theta 筛选（绝对值输入）
- **性能优化**：
  - 快速模式（无 Greeks）vs Greeks 模式切换
  - 基于 Black-Scholes 的 Delta 筛选行权价范围估算
  - 流式/快照模式自动切换
- **用户体验**：
  - 周期权/月期权标识（★ 标记月期权）
  - 最近搜索历史
  - ATM（平值期权）高亮显示
  - ITM（实值期权）背景着色

## 技术栈

- **前端**：React 18 + TypeScript + Vite + TailwindCSS
- **后端**：Python FastAPI + [ib_async](https://github.com/ib-api-reloaded/ib_async) + SciPy
- **TWS 客户端**：[ib_async](https://github.com/ib-api-reloaded/ib_async) (第三方高性能异步 TWS API 封装库)

## 项目结构

```
.
├── backend/                 # FastAPI 后端
│   ├── main.py             # 主程序逻辑
│   └── requirements.txt    # Python 依赖
├── frontend/                # React 前端
│   ├── src/                # 源代码
│   ├── package.json        # Node.js 依赖配置
│   └── index.html          # 入口文件
├── manage.py               # 项目管理脚本
└── README.md               # 项目文档
```

## 前置要求

### 1. 安装盈透证券 TWS 或 IB Gateway

你需要安装以下任一软件：

- **TWS（Trader Workstation）**：[下载地址](https://www.interactivebrokers.com/en/trading/tws.php)
  - 完整的交易平台，功能丰富
  - 适合日常交易使用

- **IB Gateway**：[下载地址](https://www.interactivebrokers.com/en/trading/ibgateway-stable.php)
  - 轻量级 API 网关
  - 资源占用更少，适合只需要 API 连接的场景

> **注意**：你需要有盈透证券账户才能使用。可以申请[模拟账户](https://www.interactivebrokers.com/en/trading/free-trial.php)进行测试。

### 2. Python 环境

需要 Python 3.9 或更高版本。

**检查 Python 版本：**
```bash
python3 --version
```

**如果未安装 Python，可以通过以下方式安装：**

- **macOS**（使用 Homebrew）：
  ```bash
  brew install python
  ```

- **Windows**：
  从 [Python 官网](https://www.python.org/downloads/) 下载安装包

- **Linux**（Ubuntu/Debian）：
  ```bash
  sudo apt update
  sudo apt install python3 python3-pip
  ```

**环境管理：**

我们强烈推荐使用 `uv` 来管理 Python 环境和依赖，它比标准 pip 快得多。具体设置步骤请见下文"安装步骤"。

### 3. Node.js 环境

需要 Node.js 18 或更高版本。

**检查 Node.js 版本：**
```bash
node --version
```

**如果未安装，可以通过以下方式安装：**

- **macOS**（使用 Homebrew）：
  ```bash
  brew install node
  ```

- **Windows/macOS/Linux**：
  从 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/moFeng123/ibkr-options-scanner.git
cd ibkr-options-scanner
```

### 2. 配置 Python 环境与依赖

建议使用 [uv](https://github.com/astral-sh/uv) 进行极速环境管理。

**方案 A：使用 uv（推荐）**

```bash
# 1. 安装 uv (如未安装)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. 进入后端目录
cd backend

# 3. 创建虚拟环境
uv venv

# 4. 激活环境
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

# 5. 安装依赖
uv pip install -r requirements.txt
```

**方案 B：使用标准 pip**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

**依赖说明：**
- `fastapi` - Web 框架
- `uvicorn` - ASGI 服务器
- `ib_async` - 盈透证券异步 API 库
- `scipy` - 科学计算（用于 Black-Scholes 计算）

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

## TWS/Gateway 配置

1. 打开 TWS 或 IB Gateway
2. 进入 **File → Global Configuration → API → Settings**
3. 勾选 **"Enable ActiveX and Socket Clients"**（启用 API 连接）
4. 记录 **Socket port**（端口号）：
   - 模拟账户默认：7497
   - 实盘账户默认：7496
5. 在 **"Trusted IPs"** 中添加 `127.0.0.1`
6. 可选：取消勾选 **"Read-Only API"** 以允许下单（本工具只需要读取权限）

## 使用方法

### 快速启动（使用 manage.py）

```bash
# 启动前端和后端服务
python manage.py start

# 查看服务状态
python manage.py status

# 停止所有服务
python manage.py stop

# 重启服务
python manage.py restart
```

### 手动启动

```bash
# 终端 1：启动后端
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000

# 终端 2：启动前端
cd frontend
npm run dev
```

### 访问应用

在浏览器中打开 http://localhost:5173

## 筛选器使用指南

### Delta 筛选
- **看涨期权（Call）**：Delta 范围 0 到 1，直接输入正数
- **看跌期权（Put）**：Delta 范围 -1 到 0，输入绝对值
  - 例如：输入 0.3~0.5 会筛选出 Delta 在 -0.5~-0.3 之间的看跌期权

### Theta 筛选
- 输入绝对值
- 例如：输入 0.1~0.5 会筛选出每日时间损耗在 $0.10~$0.50 之间的期权

### IV 筛选
- 输入百分比数值
- 例如：输入 20~50 会筛选出隐含波动率在 20%~50% 之间的期权

## 性能优化说明

1. **快速模式**：不启用任何 Greeks 筛选时，数据加载更快（约 3 秒）
2. **Greeks 模式**：启用任一 Greeks 筛选时，需要获取完整 Greeks 数据（约 10-30 秒）
3. **Delta 优化**：使用 "全局搜索" + Delta 筛选时，后端会使用 Black-Scholes 公式估算行权价范围，减少约 85% 的 API 请求

## API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 健康检查和连接状态 |
| `/connect` | POST | 连接 TWS/Gateway |
| `/disconnect` | POST | 断开连接 |
| `/options/expirations/{symbol}` | GET | 获取可用到期日 |
| `/options/chain` | POST | 获取期权链数据 |

## 常见问题

### Q: 连接失败怎么办？
A: 请检查：
1. TWS/Gateway 是否已启动
2. API 设置是否正确开启
3. 端口号是否正确（7497 模拟 / 7496 实盘）
4. 是否添加了 127.0.0.1 到信任 IP

### Q: Greeks 数据显示为 "-"？
A: Greeks 数据需要市场开盘时才能获取。非交易时间可能无法获取完整数据。

### Q: 加载很慢怎么办？
A:
1. 关闭不需要的 Greeks 筛选以使用快速模式
2. 使用 Delta 筛选时启用全局搜索，可以利用 Black-Scholes 优化
3. 减少查询的行权价数量

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 免责声明

本软件仅供教育和信息目的。不构成任何投资建议。期权交易涉及重大风险，并非适合所有投资者。在做出投资决策之前，请务必自行研究并咨询合格的财务顾问。

## 致谢

- [ib_async](https://github.com/ib-api-reloaded/ib_async) - 盈透证券异步 Python 库
- [Interactive Brokers](https://www.interactivebrokers.com/) - 提供 TWS API
