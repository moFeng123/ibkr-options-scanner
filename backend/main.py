from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ib_async import IB, Stock, Option, util
import asyncio
import logging
import math
from typing import List, Optional
from scipy.stats import norm

def safe_float(val):
    """将 nan/inf 转换为 None，确保 JSON 可序列化"""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val

def estimate_strike_from_delta(stock_price: float, target_delta: float, days_to_exp: int,
                                iv: float = 0.3, is_call: bool = True) -> float:
    """
    使用 Black-Scholes 公式反推给定 Delta 对应的 Strike

    Delta = N(d1) for Call, Delta = N(d1) - 1 for Put
    d1 = (ln(S/K) + (r + σ²/2)T) / (σ√T)

    反推: K = S * exp(-(d1 * σ√T - (r + σ²/2)T))
    """
    if days_to_exp <= 0:
        days_to_exp = 1

    T = days_to_exp / 365.0
    r = 0.05  # 假设无风险利率 5%
    sigma = iv

    # 根据 Delta 计算 d1
    if is_call:
        # Call Delta = N(d1), so d1 = N^(-1)(Delta)
        d1 = norm.ppf(target_delta)
    else:
        # Put Delta = N(d1) - 1, so d1 = N^(-1)(Delta + 1)
        d1 = norm.ppf(target_delta + 1)

    # 反推 K: K = S * exp(-(d1 * σ√T - (r + σ²/2)T))
    sqrt_T = math.sqrt(T)
    K = stock_price * math.exp(-(d1 * sigma * sqrt_T - (r + sigma**2 / 2) * T))

    return K

def estimate_strike_range_for_delta(stock_price: float, min_delta: float, max_delta: float,
                                    days_to_exp: int, iv: float = 0.3, is_call: bool = True) -> tuple:
    """
    估算给定 Delta 范围对应的 Strike 范围

    Call: Delta 随 Strike 增加而减小 (高 Delta = 低 Strike)
    Put: Delta (绝对值) 随 Strike 增加而减小 (高 |Delta| = 高 Strike)
    """
    if is_call:
        # Call: max_delta 对应较低的 strike, min_delta 对应较高的 strike
        strike_low = estimate_strike_from_delta(stock_price, max_delta, days_to_exp, iv, True)
        strike_high = estimate_strike_from_delta(stock_price, min_delta, days_to_exp, iv, True)
    else:
        # Put: 用负数 delta
        # min_delta 的绝对值较小 = 更 OTM = 较低 strike
        # max_delta 的绝对值较大 = 更 ITM = 较高 strike
        strike_low = estimate_strike_from_delta(stock_price, -max_delta, days_to_exp, iv, False)
        strike_high = estimate_strike_from_delta(stock_price, -min_delta, days_to_exp, iv, False)

    # 添加 buffer (±25%) - 因为估算使用默认 IV 30%，实际 IV 可能差异较大
    buffer = 0.25
    strike_low = strike_low * (1 - buffer)
    strike_high = strike_high * (1 + buffer)

    return (strike_low, strike_high)

app = FastAPI()

# CORS 配置 - 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global IB instance
ib = IB()

class ConnectionRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 7497
    client_id: int = 1

class OptionFilterRequest(BaseModel):
    symbol: str
    min_strike: Optional[float] = None
    max_strike: Optional[float] = None
    min_expiration: Optional[str] = None # YYYY-MM-DD
    max_expiration: Optional[str] = None

class OptionChainRequest(BaseModel):
    symbol: str
    expiration: str  # YYYYMMDD 格式
    strikes: Optional[List[float]] = None  # 可选：指定行权价列表，不指定则取 ATM 附近
    num_strikes: int = 20  # 获取多少个行权价，默认20个（上下各10个）
    need_greeks: bool = True  # 是否需要 Greeks 数据（Delta/Gamma/Theta/Vega/IV）
    # Delta 筛选参数（用于智能筛选 strike 范围）
    delta_filter_enabled: bool = False
    min_delta: float = 0.0
    max_delta: float = 1.0
    option_type: str = "all"  # "all", "call", "put"

@app.get("/")
def read_root():
    return {"status": "ok", "ib_connected": ib.isConnected()}

@app.post("/connect")
async def connect_tws(req: ConnectionRequest):
    if ib.isConnected():
        return {"message": "Already connected", "host": ib.client.host, "port": ib.client.port}
    
    try:
        await ib.connectAsync(req.host, req.port, req.client_id)
        return {"message": "Connected successfully", "version": ib.client.serverVersion()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/disconnect")
def disconnect_tws():
    ib.disconnect()
    return {"message": "Disconnected"}

@app.get("/search/{symbol}")
async def search_contract(symbol: str):
    if not ib.isConnected():
        raise HTTPException(status_code=400, detail="Not connected to TWS")
    
    contract = Stock(symbol, 'SMART', 'USD')
    details = await ib.reqContractDetailsAsync(contract)
    
    if not details:
        raise HTTPException(status_code=404, detail="Symbol not found")
        
    # Return the first match and current market data roughly
    c = details[0].contract
    
    # Request market data (snapshot)
    ticker = ib.reqMktData(c, '', True, False)
    await asyncio.sleep(1) # Wait a bit for data
    
    return {
        "conId": c.conId,
        "symbol": c.symbol,
        "secType": c.secType,
        "last": ticker.last,
        "bid": ticker.bid,
        "ask": ticker.ask,
        "close": ticker.close
    }

@app.get("/options/expirations/{symbol}")
async def get_option_expirations(symbol: str):
    if not ib.isConnected():
        raise HTTPException(status_code=400, detail="Not connected to TWS")

    contract = Stock(symbol, 'SMART', 'USD')

    # We need to qualify the contract to get the conId
    await ib.qualifyContractsAsync(contract)

    # 获取股票实时价格
    stock_ticker = ib.reqMktData(contract, '', True, False)
    await asyncio.sleep(1)  # 等待数据
    stock_price = safe_float(stock_ticker.last) or safe_float(stock_ticker.close) or safe_float(stock_ticker.bid) or safe_float(stock_ticker.ask) or 0
    print(f"[DEBUG] {symbol}: Stock price = {stock_price}")

    # Get option chain parameters
    chains = await ib.reqSecDefOptParamsAsync(contract.symbol, '', contract.secType, contract.conId)

    # Combine all expirations from all exchanges (SMART usually aggregates, but reqSecDefOptParams returns per exchange)
    # We mainly care about SMART or the main exchange.

    all_expirations = set()
    all_strikes = set()

    for chain in chains:
        if chain.exchange == 'SMART':
            all_expirations.update(chain.expirations)
            all_strikes.update(chain.strikes)

    # 如果 SMART 没有数据，尝试其他交易所
    if not all_expirations:
        for chain in chains:
            all_expirations.update(chain.expirations)
            all_strikes.update(chain.strikes)

    return {
        "symbol": symbol,
        "stockPrice": stock_price,
        "expirations": sorted(list(all_expirations)),
        "strikes": sorted(list(all_strikes))
    }

@app.post("/options/chain")
async def get_option_chain(req: OptionChainRequest):
    """
    获取期权链数据，包含 Bid/Ask 和 Greeks (Delta, Gamma, Theta, Vega, IV)
    """
    if not ib.isConnected():
        raise HTTPException(status_code=400, detail="Not connected to TWS")

    # 1. 获取标的股票信息和当前价格
    stock = Stock(req.symbol, 'SMART', 'USD')
    await ib.qualifyContractsAsync(stock)

    # 2. 先获取期权链参数（需要用到 strikes 来估算价格）
    chains = await ib.reqSecDefOptParamsAsync(stock.symbol, '', stock.secType, stock.conId)
    all_strikes = set()
    for chain in chains:
        if chain.exchange == 'SMART':
            all_strikes.update(chain.strikes)

    if not all_strikes:
        # 如果 SMART 没有，尝试其他交易所
        for chain in chains:
            all_strikes.update(chain.strikes)

    sorted_strikes = sorted(all_strikes)
    print(f"[DEBUG] {req.symbol}: Found {len(sorted_strikes)} strikes, range: {sorted_strikes[0] if sorted_strikes else 'N/A'} - {sorted_strikes[-1] if sorted_strikes else 'N/A'}")

    # 3. 获取股票当前价格用于判断 ITM/OTM
    stock_ticker = ib.reqMktData(stock, '', True, False)
    await asyncio.sleep(1)  # 增加等待时间
    stock_price = safe_float(stock_ticker.last) or safe_float(stock_ticker.close) or safe_float(stock_ticker.bid) or safe_float(stock_ticker.ask) or 0

    # 如果还是获取不到价格，用 strikes 的中位数估算
    if stock_price == 0 and sorted_strikes:
        stock_price = sorted_strikes[len(sorted_strikes) // 2]
        print(f"[DEBUG] {req.symbol}: Using estimated price from strikes: {stock_price}")
    else:
        print(f"[DEBUG] {req.symbol}: Stock price: {stock_price}")

    # 4. 选择行权价
    if not req.strikes:
        if not sorted_strikes:
            return {"symbol": req.symbol, "stockPrice": stock_price, "expiration": req.expiration, "calls": [], "puts": [], "error": "No strikes found"}

        # 计算到期天数（用于 Delta 估算）
        exp_year = int(req.expiration[:4])
        exp_month = int(req.expiration[4:6])
        exp_day = int(req.expiration[6:8])
        from datetime import date
        exp_date = date(exp_year, exp_month, exp_day)
        days_to_exp = (exp_date - date.today()).days
        if days_to_exp < 1:
            days_to_exp = 1

        # 如果启用了 Delta 筛选，使用 Black-Scholes 估算 strike 范围
        if req.delta_filter_enabled and req.min_delta > 0 and req.max_delta <= 1:
            print(f"[DEBUG] {req.symbol}: Delta filter enabled: {req.min_delta} - {req.max_delta}, option_type={req.option_type}")

            # 使用默认 IV 30% 来估算（实际可能不同，但用于初步筛选足够了）
            estimated_iv = 0.30

            if req.option_type == "call":
                # 只查询 Call
                strike_low, strike_high = estimate_strike_range_for_delta(
                    stock_price, req.min_delta, req.max_delta, days_to_exp, estimated_iv, True
                )
                strikes_to_query = [s for s in sorted_strikes if strike_low <= s <= strike_high]
                print(f"[DEBUG] {req.symbol}: Delta filter (Call): estimated strike range {strike_low:.2f} - {strike_high:.2f}, found {len(strikes_to_query)} strikes")

            elif req.option_type == "put":
                # 只查询 Put
                strike_low, strike_high = estimate_strike_range_for_delta(
                    stock_price, req.min_delta, req.max_delta, days_to_exp, estimated_iv, False
                )
                strikes_to_query = [s for s in sorted_strikes if strike_low <= s <= strike_high]
                print(f"[DEBUG] {req.symbol}: Delta filter (Put): estimated strike range {strike_low:.2f} - {strike_high:.2f}, found {len(strikes_to_query)} strikes")

            else:
                # Call 和 Put 都查询，取并集
                call_low, call_high = estimate_strike_range_for_delta(
                    stock_price, req.min_delta, req.max_delta, days_to_exp, estimated_iv, True
                )
                put_low, put_high = estimate_strike_range_for_delta(
                    stock_price, req.min_delta, req.max_delta, days_to_exp, estimated_iv, False
                )
                # 取并集
                combined_low = min(call_low, put_low)
                combined_high = max(call_high, put_high)
                strikes_to_query = [s for s in sorted_strikes if combined_low <= s <= combined_high]
                print(f"[DEBUG] {req.symbol}: Delta filter (All): Call range {call_low:.2f}-{call_high:.2f}, Put range {put_low:.2f}-{put_high:.2f}, combined {len(strikes_to_query)} strikes")

            # 如果筛选后没有 strike，fallback 到 ATM 附近
            if not strikes_to_query:
                print(f"[DEBUG] {req.symbol}: Delta filter returned no strikes, falling back to ATM")
                half = 15
                atm_idx = min(range(len(sorted_strikes)), key=lambda i: abs(sorted_strikes[i] - stock_price))
                start_idx = max(0, atm_idx - half)
                end_idx = min(len(sorted_strikes), atm_idx + half + 1)
                strikes_to_query = sorted_strikes[start_idx:end_idx]

        elif req.num_strikes == 0:
            # num_strikes = 0 表示获取全部 strike
            strikes_to_query = sorted_strikes
        else:
            # 找到 ATM 附近的行权价（根据 num_strikes 参数）
            half = req.num_strikes // 2
            atm_idx = min(range(len(sorted_strikes)), key=lambda i: abs(sorted_strikes[i] - stock_price))
            start_idx = max(0, atm_idx - half)
            end_idx = min(len(sorted_strikes), atm_idx + half + 1)
            strikes_to_query = sorted_strikes[start_idx:end_idx]
    else:
        strikes_to_query = req.strikes

    print(f"[DEBUG] {req.symbol}: Querying {len(strikes_to_query)} strikes: {strikes_to_query[:5]}{'...' if len(strikes_to_query) > 5 else ''}")

    # 3. 构建期权合约列表 (Call 和 Put)
    option_contracts = []
    for strike in strikes_to_query:
        for right in ['C', 'P']:
            opt = Option(req.symbol, req.expiration, strike, right, 'SMART')
            option_contracts.append(opt)

    # 批量验证合约
    await ib.qualifyContractsAsync(*option_contracts)

    # 统计有效合约数量
    valid_contracts = [opt for opt in option_contracts if opt.conId]
    print(f"[DEBUG] {req.symbol}: Created {len(option_contracts)} contracts, {len(valid_contracts)} are valid")

    # 4. 请求市场数据
    # genericTickList: 106=impliedVol, 100=optionVolume, 101=optionOpenInterest, 104=historicalVol
    # 根据是否需要 Greeks 选择不同模式：
    # - 需要 Greeks: 流式模式 (snapshot=False)，需要等待更长时间
    # - 不需要 Greeks: 快照模式 (snapshot=True)，只获取 bid/ask，速度更快
    use_streaming = req.need_greeks
    print(f"[DEBUG] {req.symbol}: need_greeks={req.need_greeks}, use_streaming={use_streaming}")

    tickers = []
    for opt in option_contracts:
        if opt.conId:  # 只请求有效合约
            if use_streaming:
                ticker = ib.reqMktData(opt, '106', False, False)  # 流式模式获取 Greeks
            else:
                ticker = ib.reqMktData(opt, '', True, False)  # 快照模式只获取 bid/ask
            tickers.append((opt, ticker))

    print(f"[DEBUG] {req.symbol}: Requesting market data for {len(tickers)} contracts (streaming={use_streaming})")

    # 等待数据返回
    start_time = asyncio.get_event_loop().time()

    if use_streaming:
        # 流式模式：等待 Greeks 数据
        max_wait_time = 30  # 最多等待 30 秒
        min_wait_time = 3   # 最少等待 3 秒（给 Greeks 时间返回）

        while True:
            await asyncio.sleep(0.5)
            elapsed = asyncio.get_event_loop().time() - start_time

            ready_count = sum(1 for _, t in tickers if t.bid is not None and t.bid != -1)
            greeks_count = sum(1 for _, t in tickers if t.modelGreeks is not None)

            print(f"[DEBUG] {req.symbol}: Waiting... {elapsed:.1f}s - {ready_count}/{len(tickers)} have bid/ask, {greeks_count}/{len(tickers)} have Greeks")

            if elapsed >= max_wait_time:
                break

            if elapsed >= min_wait_time:
                if greeks_count >= len(tickers) * 0.5:
                    break
    else:
        # 快照模式：只等待 bid/ask 数据，速度更快
        max_wait_time = 3  # 快照模式只需等待 3 秒

        while True:
            await asyncio.sleep(0.3)
            elapsed = asyncio.get_event_loop().time() - start_time

            ready_count = sum(1 for _, t in tickers if t.bid is not None and t.bid != -1)
            print(f"[DEBUG] {req.symbol}: Waiting (snapshot)... {elapsed:.1f}s - {ready_count}/{len(tickers)} have bid/ask")

            if elapsed >= max_wait_time:
                break

            # 快照模式：80% 有数据就退出
            if ready_count >= len(tickers) * 0.8:
                break

    elapsed = asyncio.get_event_loop().time() - start_time
    print(f"[DEBUG] {req.symbol}: Data collection complete after {elapsed:.1f}s")

    # 取消市场数据订阅（流式模式需要取消）
    if use_streaming:
        for opt, ticker in tickers:
            ib.cancelMktData(opt)

    # 5. 整理返回数据
    calls = []
    puts = []

    for opt, ticker in tickers:
        option_data = {
            "strike": opt.strike,
            "expiration": opt.lastTradeDateOrContractMonth,
            "bid": safe_float(ticker.bid if ticker.bid != -1 else None),
            "ask": safe_float(ticker.ask if ticker.ask != -1 else None),
            "last": safe_float(ticker.last if ticker.last != -1 else None),
            "volume": safe_float(ticker.volume) if ticker.volume != -1 else 0,
            "openInterest": safe_float(ticker.callOpenInterest if opt.right == 'C' else ticker.putOpenInterest),
            # Greeks
            "delta": safe_float(ticker.modelGreeks.delta) if ticker.modelGreeks else None,
            "gamma": safe_float(ticker.modelGreeks.gamma) if ticker.modelGreeks else None,
            "theta": safe_float(ticker.modelGreeks.theta) if ticker.modelGreeks else None,
            "vega": safe_float(ticker.modelGreeks.vega) if ticker.modelGreeks else None,
            "iv": safe_float(ticker.modelGreeks.impliedVol) if ticker.modelGreeks else None,
            # ITM/OTM 状态
            "itm": (opt.right == 'C' and stock_price > opt.strike) or (opt.right == 'P' and stock_price < opt.strike)
        }

        if opt.right == 'C':
            calls.append(option_data)
        else:
            puts.append(option_data)

    # 按行权价排序
    calls.sort(key=lambda x: x['strike'])
    puts.sort(key=lambda x: x['strike'])

    return {
        "symbol": req.symbol,
        "stockPrice": stock_price,
        "expiration": req.expiration,
        "calls": calls,
        "puts": puts
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
