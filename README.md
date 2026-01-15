# IBKR Options Scanner

A powerful options chain scanner for Interactive Brokers (IBKR) TWS/Gateway. Built with React + FastAPI, featuring real-time Greeks filtering and a professional T-shaped option chain display.

[中文文档](README_CN.md)

## Security / Open-sourcing

See `SECURITY.md`.

## Features

- **TWS/Gateway Connection**: Connect to IBKR TWS or IB Gateway via [ib_async](https://github.com/ib-api-reloaded/ib_async) (High-performance async client)
- **Options Chain Display**: Professional T-shaped layout (Calls | Strike | Puts)
- **Real-time Greeks**: Delta, Gamma, Theta, Vega, and Implied Volatility
- **Smart Filtering**:
  - Filter by Option Type (All / Calls Only / Puts Only)
  - Delta filter with absolute value input
  - IV (Implied Volatility) filter
  - Theta filter with absolute value input
- **Performance Optimizations**:
  - Fast mode (no Greeks) vs Greeks mode toggle
  - Black-Scholes based strike range estimation for Delta filtering
  - Streaming vs Snapshot mode auto-switching
- **User Experience**:
  - Weekly/Monthly expiration indicators
  - Recent symbols history
  - ATM (At-The-Money) highlighting
  - ITM (In-The-Money) background coloring

## Screenshots

```
┌─────────────────────────────────────────────────────────────┐
│  IBKR Options Scanner                    TWS Connected ●    │
├─────────────────────────────────────────────────────────────┤
│  Symbol: [AAPL    ] [Search]     Price: $185.50            │
│  Expiration: [★ 2024-03-15 (Monthly) ▼]    [Load Chain]    │
├─────────────────────────────────────────────────────────────┤
│  Filters: [Call/Put] [Delta] [IV] [Theta]  [Global Search] │
├─────────────────────────────────────────────────────────────┤
│       CALLS                │ Strike │         PUTS          │
│  Theta  IV   Delta Bid Ask │        │ Bid Ask Delta IV Theta│
│  -0.05 25%   0.65  5.2 5.4 │  180   │ 1.2 1.4 -0.35 24% -0.04│
│  -0.04 23%   0.52  3.1 3.3 │  185   │ 2.8 3.0 -0.48 23% -0.05│
│  -0.03 22%   0.38  1.8 2.0 │  190   │ 5.1 5.3 -0.62 22% -0.06│
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Backend**: Python FastAPI + [ib_async](https://github.com/ib-api-reloaded/ib_async) + SciPy
- **TWS Client**: [ib_async](https://github.com/ib-api-reloaded/ib_async) (Third-party async wrapper for TWS API)

## Project Structure

```
.
├── backend/                 # FastAPI backend
│   ├── main.py             # Main application logic
│   └── requirements.txt    # Python dependencies
├── frontend/                # React frontend
│   ├── src/                # Source code
│   ├── package.json        # Node.js dependencies
│   └── index.html          # Entry point
├── manage.py               # Management script
└── README.md               # Documentation
```

## Prerequisites

- [Interactive Brokers TWS](https://www.interactivebrokers.com/en/trading/tws.php) or [IB Gateway](https://www.interactivebrokers.com/en/trading/ibgateway-stable.php)
- Python 3.9+
- Node.js 18+

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/moFeng123/ibkr-options-scanner.git
cd ibkr-options-scanner
```

### 2. Set up Python Environment

We strongly recommend using [uv](https://github.com/astral-sh/uv) for faster dependency management.

**Option 1: Using uv (Recommended)**

```bash
# 1. Install uv
# macOS/Linux:
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows:
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# 2. Navigate to backend
cd backend

# 3. Create virtual environment
uv venv

# 4. Activate environment
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

# 5. Install dependencies
uv pip install -r requirements.txt
```

**Option 2: Using standard pip**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

## Configuration

### TWS/Gateway Settings

1. Open TWS or IB Gateway
2. Go to **File → Global Configuration → API → Settings**
3. Enable **"Enable ActiveX and Socket Clients"**
4. Note the **Socket port** (default: 7497 for Paper, 7496 for Live)
5. Add `127.0.0.1` to **"Trusted IPs"**

## Usage

### Quick Start (using manage.py)

```bash
# Start both frontend and backend
python manage.py start

# Check service status
python manage.py status

# Stop all services
python manage.py stop

# Restart services
python manage.py restart
```

### Manual Start

```bash
# Terminal 1: Start backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2: Start frontend
cd frontend
npm run dev
```

### Access the Application

Open http://localhost:5173 in your browser.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check and connection status |
| `/connect` | POST | Connect to TWS/Gateway |
| `/disconnect` | POST | Disconnect from TWS/Gateway |
| `/options/expirations/{symbol}` | GET | Get available expirations |
| `/options/chain` | POST | Get options chain data |

## Filter Guide

### Delta Filter
- **Call Options**: Delta ranges from 0 to 1 (input positive values)
- **Put Options**: Delta ranges from -1 to 0 (input absolute values, e.g., 0.3~0.5 filters puts with delta -0.5~-0.3)

### Theta Filter
- Input absolute values (e.g., 0.1~0.5 filters options with daily decay $0.10~$0.50)

### IV Filter
- Input percentage values (e.g., 20~50 for 20%~50% implied volatility)

## Performance Tips

1. **Fast Mode**: Disable all Greeks filters for faster data loading (~3 seconds)
2. **Greeks Mode**: Enable any Greeks filter to get full Greeks data (~10-30 seconds)
3. **Delta Optimization**: When using Delta filter with "Global Search", the backend uses Black-Scholes estimation to narrow strike range, reducing API calls by ~85%

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This software is for educational and informational purposes only. It is not intended as financial advice. Trading options involves significant risk and is not suitable for all investors. Always do your own research and consult with a qualified financial advisor before making investment decisions.

## Acknowledgments

- [ib_async](https://github.com/ib-api-reloaded/ib_async) - Async Python library for Interactive Brokers API
- [Interactive Brokers](https://www.interactivebrokers.com/) - For providing the TWS API
