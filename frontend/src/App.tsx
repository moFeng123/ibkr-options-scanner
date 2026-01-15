import { useState, useEffect } from 'react'
import axios from 'axios'
import { Disc, CheckCircle2, AlertCircle, RefreshCcw, Search, Loader2, Filter, X } from 'lucide-react'

const API = "http://localhost:8000"

interface OptionData {
  strike: number
  expiration: string
  bid: number | null
  ask: number | null
  last: number | null
  volume: number
  openInterest: number | null
  delta: number | null
  gamma: number | null
  theta: number | null
  vega: number | null
  iv: number | null
  itm: boolean
}

interface OptionChainData {
  symbol: string
  stockPrice: number
  expiration: string
  calls: OptionData[]
  puts: OptionData[]
}

type OptionType = 'all' | 'call' | 'put'

interface Filters {
  optionType: OptionType
  // 每个筛选条件的启用开关
  deltaEnabled: boolean
  ivEnabled: boolean
  thetaEnabled: boolean
  // 筛选值
  minDelta: number
  maxDelta: number
  minIV: number
  maxIV: number
  minTheta: number
  maxTheta: number
}

const defaultFilters: Filters = {
  optionType: 'all',
  deltaEnabled: false,
  ivEnabled: false,
  thetaEnabled: false,
  minDelta: 0,
  maxDelta: 1,
  minIV: 0,
  maxIV: 500,
  minTheta: 0,
  maxTheta: 100
}

function App() {
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [connectionDetails, setConnectionDetails] = useState({ host: '127.0.0.1', port: 7497, client_id: 1 })
  const [statusMsg, setStatusMsg] = useState("")

  // 期权查询相关状态
  const [symbol, setSymbol] = useState("")
  const [stockPrice, setStockPrice] = useState<number>(0)
  const [recentSymbols, setRecentSymbols] = useState<string[]>(() => {
    const saved = localStorage.getItem('recentSymbols')
    return saved ? JSON.parse(saved) : []
  })
  const [expirations, setExpirations] = useState<string[]>([])
  const [selectedExpiration, setSelectedExpiration] = useState("")
  const [optionChain, setOptionChain] = useState<OptionChainData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingExpirations, setLoadingExpirations] = useState(false)

  // 筛选器
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [globalSearch, setGlobalSearch] = useState(false)
  const [loadingGlobal, setLoadingGlobal] = useState(false)

  const checkConnection = async () => {
    try {
      const res = await axios.get(`${API}/`)
      setIsConnected(res.data.ib_connected)
    } catch (e) {
      console.error(e)
      setIsConnected(false)
    }
  }

  const handleConnect = async () => {
    setStatusMsg("Connecting...")
    try {
      await axios.post(`${API}/connect`, {
        ...connectionDetails,
        port: Number(connectionDetails.port),
        client_id: Number(connectionDetails.client_id)
      })
      setStatusMsg("Connected!")
      checkConnection()
    } catch (e: any) {
      setStatusMsg("Error: " + (e.response?.data?.detail || e.message))
    }
  }

  const handleDisconnect = async () => {
    try {
      await axios.post(`${API}/disconnect`)
      checkConnection()
      setStatusMsg("Disconnected")
    } catch (e) {
      console.error(e)
    }
  }

  // 保存最近搜索的 symbol
  const addRecentSymbol = (sym: string) => {
    const upperSym = sym.toUpperCase()
    setRecentSymbols(prev => {
      const filtered = prev.filter(s => s !== upperSym)
      const updated = [upperSym, ...filtered].slice(0, 10)  // 最多保留 10 个
      localStorage.setItem('recentSymbols', JSON.stringify(updated))
      return updated
    })
  }

  // 搜索股票并获取到期日
  const handleSearchSymbol = async () => {
    if (!symbol.trim()) return
    setLoadingExpirations(true)
    setExpirations([])
    setSelectedExpiration("")
    setOptionChain(null)
    setStockPrice(0)
    setGlobalSearch(false)  // 重置全局搜索状态

    try {
      const res = await axios.get(`${API}/options/expirations/${symbol.toUpperCase()}`)
      console.log('Search response:', res.data)
      setStockPrice(res.data.stockPrice || 0)
      setExpirations(res.data.expirations)
      if (res.data.expirations.length > 0) {
        setSelectedExpiration(res.data.expirations[0])
        addRecentSymbol(symbol)  // 搜索成功后添加到历史记录
      }
    } catch (e: any) {
      setStatusMsg("Error: " + (e.response?.data?.detail || e.message))
    } finally {
      setLoadingExpirations(false)
    }
  }

  // 获取期权链数据
  const handleFetchOptionChain = async (fetchAll: boolean = false) => {
    if (!symbol || !selectedExpiration) return

    if (fetchAll) {
      setLoadingGlobal(true)
    } else {
      setLoading(true)
      setGlobalSearch(false)  // 普通加载时重置全局搜索状态
      setFilters(defaultFilters)  // 重置筛选器
    }

    try {
      // 检查是否需要 Greeks 数据（任一 Greeks 筛选启用时需要）
      const greeksRequired = filters.deltaEnabled || filters.ivEnabled || filters.thetaEnabled
      console.log(`[DEBUG] Fetching option chain, need_greeks=${greeksRequired}, deltaEnabled=${filters.deltaEnabled}`)

      const res = await axios.post(`${API}/options/chain`, {
        symbol: symbol.toUpperCase(),
        expiration: selectedExpiration,
        num_strikes: fetchAll ? 0 : 30,  // 0 = 获取全部
        need_greeks: greeksRequired,  // 只在需要筛选 Greeks 时才请求
        // Delta 筛选参数（后端用 Black-Scholes 二分法估算 strike 范围）
        delta_filter_enabled: filters.deltaEnabled && fetchAll,  // 只在全局搜索时启用 Delta 智能筛选
        min_delta: filters.minDelta,
        max_delta: filters.maxDelta,
        option_type: filters.optionType
      })
      console.log('Option chain response:', res.data)
      console.log('Calls:', res.data.calls?.length, 'Puts:', res.data.puts?.length)
      setOptionChain(res.data)
      if (fetchAll) {
        setGlobalSearch(true)
      }
    } catch (e: any) {
      setStatusMsg("Error: " + (e.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
      setLoadingGlobal(false)
    }
  }

  // 筛选期权数据
  // isCall 参数用于优化 Delta 筛选：Call Delta 为正，Put Delta 为负
  const filterOptions = (options: OptionData[], isCall?: boolean): OptionData[] => {
    return options.filter(opt => {
      const rawDelta = opt.delta || 0
      const iv = (opt.iv || 0) * 100
      const theta = opt.theta || 0

      // Delta 筛选（只在启用时生效）
      let deltaMatch = true
      if (filters.deltaEnabled) {
        if (isCall === true) {
          deltaMatch = rawDelta >= filters.minDelta && rawDelta <= filters.maxDelta
        } else if (isCall === false) {
          deltaMatch = rawDelta >= -filters.maxDelta && rawDelta <= -filters.minDelta
        } else {
          const absDelta = Math.abs(rawDelta)
          deltaMatch = absDelta >= filters.minDelta && absDelta <= filters.maxDelta
        }
      }

      // Theta 筛选（只在启用时生效，使用绝对值）
      // Theta 通常为负值，用户输入绝对值更直观
      const absTheta = Math.abs(theta)
      const thetaMatch = filters.thetaEnabled
        ? absTheta >= filters.minTheta && absTheta <= filters.maxTheta
        : true

      // IV 筛选（只在启用时生效）
      const ivMatch = filters.ivEnabled
        ? iv >= filters.minIV && iv <= filters.maxIV
        : true

      return deltaMatch && ivMatch && thetaMatch
    })
  }

  // 重置筛选器
  const resetFilters = () => {
    setFilters(defaultFilters)
  }

  // 检查是否有活跃筛选
  const hasActiveFilters = () => {
    return filters.optionType !== defaultFilters.optionType ||
           filters.deltaEnabled ||
           filters.ivEnabled ||
           filters.thetaEnabled
  }

  useEffect(() => {
    checkConnection()
    const interval = setInterval(checkConnection, 5000)
    return () => clearInterval(interval)
  }, [])

  // 格式化数字显示
  const fmt = (val: number | null, decimals = 2) => val !== null ? val.toFixed(decimals) : '-'
  const fmtPct = (val: number | null) => val !== null ? (val * 100).toFixed(1) + '%' : '-'

  // 判断是否为月度期权（每月第三个周五）
  const isMonthlyExpiration = (expiration: string): boolean => {
    // YYYYMMDD 格式
    const year = parseInt(expiration.substring(0, 4))
    const month = parseInt(expiration.substring(4, 6)) - 1 // JS months are 0-indexed
    const day = parseInt(expiration.substring(6, 8))

    const date = new Date(year, month, day)

    // 检查是否是周五
    if (date.getDay() !== 5) return false

    // 计算这个月的第三个周五
    const firstDay = new Date(year, month, 1)
    const firstFriday = new Date(year, month, 1 + (5 - firstDay.getDay() + 7) % 7)
    const thirdFriday = new Date(firstFriday)
    thirdFriday.setDate(firstFriday.getDate() + 14)

    return date.getDate() === thirdFriday.getDate()
  }

  // 格式化到期日显示（添加类型标签）
  const formatExpiration = (exp: string): string => {
    // YYYYMMDD -> YYYY-MM-DD
    const formatted = `${exp.substring(0, 4)}-${exp.substring(4, 6)}-${exp.substring(6, 8)}`
    const isMonthly = isMonthlyExpiration(exp)
    // 月度期权添加 ★ 标记
    return isMonthly ? `★ ${formatted} (Monthly)` : `${formatted} (Weekly)`
  }

  return (
    <div className="min-h-screen bg-ibkr-bg text-ibkr-text p-6 font-sans">
      <header className="max-w-7xl mx-auto flex items-center justify-between mb-8 pb-4 border-b border-ibkr-border">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <span className="text-red-600">IBKR</span> Options Scanner
        </h1>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${isConnected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
            {isConnected ? <CheckCircle2 size={16} /> : <Disc size={16} />}
            {isConnected ? 'TWS Connected' : 'TWS Disconnected'}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-12 gap-6">
        {/* Connection Panel */}
        <div className="col-span-12 md:col-span-3 space-y-6">
          <div className="bg-ibkr-panel border border-ibkr-border rounded-lg p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Connection</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ibkr-muted uppercase mb-1">Host IP</label>
                <input
                  type="text"
                  value={connectionDetails.host}
                  onChange={e => setConnectionDetails({ ...connectionDetails, host: e.target.value })}
                  className="w-full bg-black/20 border border-ibkr-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ibkr-muted uppercase mb-1">Port</label>
                <input
                  type="number"
                  value={connectionDetails.port}
                  onChange={e => setConnectionDetails({ ...connectionDetails, port: Number(e.target.value) })}
                  className="w-full bg-black/20 border border-ibkr-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600 transition-colors"
                />
                <p className="text-xs text-ibkr-muted mt-1">7496 (Live), 7497 (Paper)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ibkr-muted uppercase mb-1">Client ID</label>
                <input
                  type="number"
                  value={connectionDetails.client_id}
                  onChange={e => setConnectionDetails({ ...connectionDetails, client_id: Number(e.target.value) })}
                  className="w-full bg-black/20 border border-ibkr-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600 transition-colors"
                />
              </div>

              <div className="pt-2">
                {!isConnected ? (
                  <button
                    onClick={handleConnect}
                    className="w-full bg-red-700 hover:bg-red-600 text-white font-medium py-2 px-4 rounded transition-colors flex justify-center items-center gap-2"
                  >
                    <RefreshCcw size={16} />
                    Connect
                  </button>
                ) : (
                  <button
                    onClick={handleDisconnect}
                    className="w-full bg-ibkr-border hover:bg-zinc-700 text-white font-medium py-2 px-4 rounded transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {statusMsg && (
                <div className="text-xs text-center text-ibkr-muted mt-2">
                  {statusMsg}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="col-span-12 md:col-span-9 space-y-6">
          {isConnected ? (
            <>
              {/* 搜索控制区 */}
              <div className="bg-ibkr-panel border border-ibkr-border rounded-lg p-5">
                <div className="flex flex-wrap gap-4 items-end">
                  {/* Symbol 输入 */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-ibkr-muted uppercase mb-1">Symbol</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={symbol}
                        onChange={e => setSymbol(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && handleSearchSymbol()}
                        placeholder="AAPL, TSLA, SPY..."
                        className="flex-1 bg-black/20 border border-ibkr-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600 transition-colors"
                      />
                      <button
                        onClick={handleSearchSymbol}
                        disabled={loadingExpirations}
                        className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {loadingExpirations ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      </button>
                    </div>
                    {/* 最近搜索 */}
                    {recentSymbols.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {recentSymbols.map(sym => (
                          <button
                            key={sym}
                            onClick={async () => {
                              setSymbol(sym)
                              // 直接调用搜索
                              setLoadingExpirations(true)
                              setExpirations([])
                              setSelectedExpiration("")
                              setOptionChain(null)
                              setStockPrice(0)
                              setGlobalSearch(false)
                              try {
                                const res = await axios.get(`${API}/options/expirations/${sym}`)
                                setStockPrice(res.data.stockPrice || 0)
                                setExpirations(res.data.expirations)
                                if (res.data.expirations.length > 0) {
                                  setSelectedExpiration(res.data.expirations[0])
                                  addRecentSymbol(sym)
                                }
                              } catch (e: any) {
                                setStatusMsg("Error: " + (e.response?.data?.detail || e.message))
                              } finally {
                                setLoadingExpirations(false)
                              }
                            }}
                            className={`px-2 py-0.5 text-xs rounded transition-colors ${
                              symbol === sym
                                ? 'bg-red-700 text-white'
                                : 'bg-ibkr-border/50 text-ibkr-muted hover:bg-ibkr-border hover:text-white'
                            }`}
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 股票价格显示 */}
                  {stockPrice > 0 && (
                    <div className="px-4 py-2 bg-green-900/20 border border-green-700/50 rounded">
                      <span className="text-xs text-ibkr-muted uppercase">Price</span>
                      <div className="text-xl font-bold text-green-400">${stockPrice.toFixed(2)}</div>
                    </div>
                  )}

                  {/* Expiration 选择 */}
                  {expirations.length > 0 && (
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-medium text-ibkr-muted uppercase mb-1">Expiration</label>
                      <select
                        value={selectedExpiration}
                        onChange={e => setSelectedExpiration(e.target.value)}
                        className="w-full bg-black/20 border border-ibkr-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600 transition-colors"
                      >
                        {expirations.map(exp => (
                          <option
                            key={exp}
                            value={exp}
                            className={isMonthlyExpiration(exp) ? 'font-bold' : 'font-normal'}
                            style={isMonthlyExpiration(exp) ? { fontWeight: 'bold' } : {}}
                          >
                            {formatExpiration(exp)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Load Option Chain 按钮 */}
                  {selectedExpiration && (
                    <button
                      onClick={() => handleFetchOptionChain(false)}
                      disabled={loading || loadingGlobal}
                      className="bg-red-700 hover:bg-red-600 text-white font-medium py-2 px-6 rounded transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                      {loading ? 'Loading...' : 'Load Chain'}
                    </button>
                  )}
                </div>
              </div>

              {/* 筛选器面板 */}
              {optionChain && (
                <div className="bg-ibkr-panel border border-ibkr-border rounded-lg">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <div className="flex items-center gap-2">
                      <Filter size={18} className="text-ibkr-muted" />
                      <span className="font-medium text-white">Filters</span>
                      {hasActiveFilters() && (
                        <span className="px-2 py-0.5 bg-red-600/20 text-red-400 text-xs rounded">Active</span>
                      )}
                    </div>
                    <span className="text-ibkr-muted">{showFilters ? '▼' : '▶'}</span>
                  </div>

                  {showFilters && (
                    <div className="p-4 pt-0 border-t border-ibkr-border">
                      {/* 期权类型选择 */}
                      <div className="mt-4 mb-4">
                        <div className="text-xs font-medium text-ibkr-muted uppercase mb-2">期权类型</div>
                        <div className="flex gap-2">
                          {[
                            { value: 'all' as OptionType, label: '全部' },
                            { value: 'call' as OptionType, label: 'Call Only', color: 'green' },
                            { value: 'put' as OptionType, label: 'Put Only', color: 'red' }
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setFilters({ ...filters, optionType: opt.value })}
                              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                                filters.optionType === opt.value
                                  ? opt.color === 'green'
                                    ? 'bg-green-700 text-white'
                                    : opt.color === 'red'
                                    ? 'bg-red-700 text-white'
                                    : 'bg-ibkr-border text-white'
                                  : 'bg-black/20 text-ibkr-muted hover:bg-white/10'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Greeks 筛选提示 */}
                      {!(filters.deltaEnabled || filters.ivEnabled || filters.thetaEnabled) && (
                        <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 mb-4">
                          <p className="text-xs text-green-400">
                            快速模式：未启用 Greeks 筛选，数据加载速度更快（约 3 秒）
                          </p>
                        </div>
                      )}
                      {(filters.deltaEnabled || filters.ivEnabled || filters.thetaEnabled) && (
                        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4">
                          <p className="text-xs text-yellow-400">
                            Greeks 模式：已启用 Greeks 筛选，需要等待更长时间获取数据（约 10-30 秒）
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Delta 筛选 */}
                        <div className={`rounded-lg p-4 ${filters.deltaEnabled ? 'bg-red-900/20 border border-red-700/50' : 'bg-black/20'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setFilters({ ...filters, deltaEnabled: !filters.deltaEnabled })}
                                className={`w-10 h-5 rounded-full transition-colors relative ${filters.deltaEnabled ? 'bg-red-600' : 'bg-ibkr-border'}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${filters.deltaEnabled ? 'left-5' : 'left-0.5'}`} />
                              </button>
                              <span className={`text-xs font-medium uppercase ${filters.deltaEnabled ? 'text-white' : 'text-ibkr-muted'}`}>Delta</span>
                            </div>
                            <span className="text-xs text-ibkr-muted">
                              {filters.optionType === 'call' ? '(0~1)' :
                               filters.optionType === 'put' ? '(绝对值)' : '(|Δ|)'}
                            </span>
                          </div>
                          <div className={`flex gap-2 ${!filters.deltaEnabled && 'opacity-40'}`}>
                            <div className="flex-1">
                              <label className="block text-xs text-ibkr-muted mb-1">Min</label>
                              <input
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                value={filters.minDelta}
                                disabled={!filters.deltaEnabled}
                                onChange={e => setFilters({ ...filters, minDelta: Number(e.target.value) })}
                                className="w-full bg-ibkr-bg border border-ibkr-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600 disabled:opacity-50"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs text-ibkr-muted mb-1">Max</label>
                              <input
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                value={filters.maxDelta}
                                disabled={!filters.deltaEnabled}
                                onChange={e => setFilters({ ...filters, maxDelta: Number(e.target.value) })}
                                className="w-full bg-ibkr-bg border border-ibkr-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600 disabled:opacity-50"
                              />
                            </div>
                          </div>
                          {filters.deltaEnabled && filters.optionType === 'put' && (
                            <div className="text-xs text-ibkr-muted mt-2">
                              例: 0.3~0.5 筛选 Put Delta -0.5~-0.3
                            </div>
                          )}
                        </div>

                        {/* IV 筛选 */}
                        <div className={`rounded-lg p-4 ${filters.ivEnabled ? 'bg-red-900/20 border border-red-700/50' : 'bg-black/20'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setFilters({ ...filters, ivEnabled: !filters.ivEnabled })}
                                className={`w-10 h-5 rounded-full transition-colors relative ${filters.ivEnabled ? 'bg-red-600' : 'bg-ibkr-border'}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${filters.ivEnabled ? 'left-5' : 'left-0.5'}`} />
                              </button>
                              <span className={`text-xs font-medium uppercase ${filters.ivEnabled ? 'text-white' : 'text-ibkr-muted'}`}>IV %</span>
                            </div>
                          </div>
                          <div className={`flex gap-2 ${!filters.ivEnabled && 'opacity-40'}`}>
                            <div className="flex-1">
                              <label className="block text-xs text-ibkr-muted mb-1">Min</label>
                              <input
                                type="number"
                                step="5"
                                min="0"
                                value={filters.minIV}
                                disabled={!filters.ivEnabled}
                                onChange={e => setFilters({ ...filters, minIV: Number(e.target.value) })}
                                className="w-full bg-ibkr-bg border border-ibkr-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600 disabled:opacity-50"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs text-ibkr-muted mb-1">Max</label>
                              <input
                                type="number"
                                step="5"
                                min="0"
                                value={filters.maxIV}
                                disabled={!filters.ivEnabled}
                                onChange={e => setFilters({ ...filters, maxIV: Number(e.target.value) })}
                                className="w-full bg-ibkr-bg border border-ibkr-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600 disabled:opacity-50"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Theta 筛选 */}
                        <div className={`rounded-lg p-4 ${filters.thetaEnabled ? 'bg-red-900/20 border border-red-700/50' : 'bg-black/20'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setFilters({ ...filters, thetaEnabled: !filters.thetaEnabled })}
                                className={`w-10 h-5 rounded-full transition-colors relative ${filters.thetaEnabled ? 'bg-red-600' : 'bg-ibkr-border'}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${filters.thetaEnabled ? 'left-5' : 'left-0.5'}`} />
                              </button>
                              <span className={`text-xs font-medium uppercase ${filters.thetaEnabled ? 'text-white' : 'text-ibkr-muted'}`}>Theta</span>
                            </div>
                            <span className="text-xs text-ibkr-muted">(|θ| $/天)</span>
                          </div>
                          <div className={`flex gap-2 ${!filters.thetaEnabled && 'opacity-40'}`}>
                            <div className="flex-1">
                              <label className="block text-xs text-ibkr-muted mb-1">Min</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={filters.minTheta}
                                disabled={!filters.thetaEnabled}
                                onChange={e => setFilters({ ...filters, minTheta: Number(e.target.value) })}
                                className="w-full bg-ibkr-bg border border-ibkr-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600 disabled:opacity-50"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs text-ibkr-muted mb-1">Max</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={filters.maxTheta}
                                disabled={!filters.thetaEnabled}
                                onChange={e => setFilters({ ...filters, maxTheta: Number(e.target.value) })}
                                className="w-full bg-ibkr-bg border border-ibkr-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-600 disabled:opacity-50"
                              />
                            </div>
                          </div>
                          {filters.thetaEnabled && (
                            <div className="text-xs text-ibkr-muted mt-2">
                              例: 0.1~0.5 筛选每日损耗 $0.1~$0.5
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="mt-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {!globalSearch ? (
                            <button
                              onClick={() => handleFetchOptionChain(true)}
                              disabled={loadingGlobal}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
                            >
                              {loadingGlobal ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                              全局搜索
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 text-sm bg-green-700/30 text-green-400 rounded flex items-center gap-1">
                              <CheckCircle2 size={14} />
                              已加载全部 ({optionChain?.calls.length || 0} strikes)
                            </span>
                          )}
                        </div>
                        <button
                          onClick={resetFilters}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-ibkr-muted hover:text-white border border-ibkr-border rounded hover:bg-white/5 transition-colors"
                        >
                          <X size={14} />
                          Reset Filters
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 期权链 T 型报价表 */}
              {optionChain && (
                <div className="bg-ibkr-panel border border-ibkr-border rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-ibkr-border flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">
                      {optionChain.symbol} Option Chain
                    </h3>
                    <span className="text-sm text-ibkr-muted">
                      Stock: ${optionChain.stockPrice.toFixed(2)} | Exp: {optionChain.expiration}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-ibkr-muted text-xs uppercase">
                          {/* Call 列 - 只在 all 或 call 模式显示 */}
                          {filters.optionType !== 'put' && (
                            <>
                              <th className="p-2 text-right bg-green-900/10">Theta</th>
                              <th className="p-2 text-right bg-green-900/10">IV</th>
                              <th className="p-2 text-right bg-green-900/10">Delta</th>
                              <th className="p-2 text-right bg-green-900/10">Bid</th>
                              <th className="p-2 text-right bg-green-900/10">Ask</th>
                            </>
                          )}
                          {/* Strike */}
                          <th className="p-2 text-center bg-ibkr-border font-bold text-white">Strike</th>
                          {/* Put 列 - 只在 all 或 put 模式显示 */}
                          {filters.optionType !== 'call' && (
                            <>
                              <th className="p-2 text-left bg-red-900/10">Bid</th>
                              <th className="p-2 text-left bg-red-900/10">Ask</th>
                              <th className="p-2 text-left bg-red-900/10">Delta</th>
                              <th className="p-2 text-left bg-red-900/10">IV</th>
                              <th className="p-2 text-left bg-red-900/10">Theta</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // 根据筛选类型决定用哪个数组作为主键
                          // 传入 isCall 参数优化 Delta 筛选
                          const filteredCalls = filterOptions(optionChain.calls, true)
                          const filteredPuts = filterOptions(optionChain.puts, false)

                          // 获取所有 strike（根据筛选类型）
                          let strikes: number[] = []
                          if (filters.optionType === 'call') {
                            strikes = filteredCalls.map(c => c.strike)
                          } else if (filters.optionType === 'put') {
                            strikes = filteredPuts.map(p => p.strike)
                          } else {
                            // all: 使用 calls 的 strike（因为 call 和 put 的 strike 应该一致）
                            strikes = filteredCalls.map(c => c.strike)
                          }

                          return strikes.map(strike => {
                            const call = filteredCalls.find(c => c.strike === strike)
                            const put = filteredPuts.find(p => p.strike === strike)
                            const isATM = Math.abs(strike - optionChain.stockPrice) < (optionChain.stockPrice * 0.02)

                            return (
                              <tr
                                key={strike}
                                className={`border-t border-ibkr-border/50 hover:bg-white/5 ${isATM ? 'bg-yellow-900/10' : ''}`}
                              >
                                {/* Call */}
                                {filters.optionType !== 'put' && (
                                  <>
                                    <td className={`p-2 text-right text-orange-400 ${call?.itm ? 'bg-green-900/20' : ''}`}>{fmt(call?.theta ?? null)}</td>
                                    <td className={`p-2 text-right ${call?.itm ? 'bg-green-900/20' : ''}`}>{fmtPct(call?.iv ?? null)}</td>
                                    <td className={`p-2 text-right ${call?.itm ? 'bg-green-900/20' : ''}`}>{fmt(call?.delta ?? null)}</td>
                                    <td className={`p-2 text-right text-green-400 ${call?.itm ? 'bg-green-900/20' : ''}`}>{fmt(call?.bid ?? null)}</td>
                                    <td className={`p-2 text-right text-green-400 ${call?.itm ? 'bg-green-900/20' : ''}`}>{fmt(call?.ask ?? null)}</td>
                                  </>
                                )}
                                {/* Strike */}
                                <td className={`p-2 text-center font-mono font-bold ${isATM ? 'text-yellow-400 bg-yellow-900/20' : 'text-white bg-ibkr-border/50'}`}>
                                  {strike.toFixed(1)}
                                </td>
                                {/* Put */}
                                {filters.optionType !== 'call' && (
                                  <>
                                    <td className={`p-2 text-left text-red-400 ${put?.itm ? 'bg-red-900/20' : ''}`}>{fmt(put?.bid ?? null)}</td>
                                    <td className={`p-2 text-left text-red-400 ${put?.itm ? 'bg-red-900/20' : ''}`}>{fmt(put?.ask ?? null)}</td>
                                    <td className={`p-2 text-left ${put?.itm ? 'bg-red-900/20' : ''}`}>{fmt(put?.delta ?? null)}</td>
                                    <td className={`p-2 text-left ${put?.itm ? 'bg-red-900/20' : ''}`}>{fmtPct(put?.iv ?? null)}</td>
                                    <td className={`p-2 text-left text-orange-400 ${put?.itm ? 'bg-red-900/20' : ''}`}>{fmt(put?.theta ?? null)}</td>
                                  </>
                                )}
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {(() => {
                    const filteredCalls = filterOptions(optionChain.calls, true)
                    const filteredPuts = filterOptions(optionChain.puts, false)
                    const hasData = filters.optionType === 'call'
                      ? filteredCalls.length > 0
                      : filters.optionType === 'put'
                        ? filteredPuts.length > 0
                        : filteredCalls.length > 0
                    return !hasData ? (
                      <div className="p-8 text-center text-ibkr-muted">
                        没有符合筛选条件的期权，请调整筛选条件。
                      </div>
                    ) : null
                  })()}
                </div>
              )}

              {/* 空状态 */}
              {!optionChain && !loading && (
                <div className="bg-ibkr-panel border border-ibkr-border rounded-lg p-8 text-center">
                  <p className="text-ibkr-muted">Enter a symbol and select an expiration to view the option chain.</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-ibkr-panel border border-ibkr-border rounded-lg p-12 text-center flex flex-col items-center justify-center h-64">
              <AlertCircle size={48} className="text-ibkr-border mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Not Connected</h3>
              <p className="text-ibkr-muted max-w-sm">
                Please ensure TWS or IB Gateway is running and API connections are enabled in Global Configuration.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
