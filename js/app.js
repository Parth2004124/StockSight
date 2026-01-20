// --- CONFIGURATION & STATE ---
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbyScFGyxqSwudrvbCngaPtlKxtHlS4O8Q7bj4FcQEESir3LFSlnHquPxskKsBKC9kS1VQ/exec";
const BLACKLIST_KEYS = ['status', 'message', 'result', 'sync-ts', 'sync_ts', 'version', 'timestamp'];
const ETF_KEYWORDS = ['BEES', 'ETF', 'GOLD', 'LIQUID', 'HANGSENG', 'NIFTY', 'SENSEX', 'MOVALUE', 'MOMENTUM', 'MIDCAP', 'SMALLCAP', 'JUNIOR'];

// Global State Variables
let portfolio = {}; 
let livePrices = {}; 
let stockAnalysis = {}; 
let cardViews = {}; 
let activeTab = 'portfolio';
let saveTimeout = null;
let isOfflineMode = false;
let activeRequests = 0;
let portfolioAnalytics = { healthScore: 0, scoredValue: 0, totalValue: 0, allocation: {}, risk: {}, efficiency: [] };
let stockyContext = { lastAsset: null, lastAllocation: null };

// --- DATA PERSISTENCE ---

function saveState(pushToCloud = true) {
    const state = { portfolio: portfolio, analysis: stockAnalysis, activeTab: activeTab, cardViews: cardViews };
    localStorage.setItem('stockSightData', JSON.stringify(state));
    calculateTotals();
    updateViewCounts();
    if (activeTab === 'summary') renderSignalSummary();

    if (!pushToCloud) return;

    updateCloudStatus('loading', 'Saving...');
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(async () => {
        if (isOfflineMode) { updateCloudStatus('error', 'Offline'); return; }
        try {
            const cleanPayload = sanitizePortfolio(portfolio);
            const res = await fetch(SHEET_API_URL, {
                method: 'POST',
                body: JSON.stringify(cleanPayload),
                headers: { "Content-Type": "text/plain" } 
            });
            const json = await res.json();
            if (json.status === 'success') {
                updateCloudStatus('success', 'Saved');
            } else {
                throw new Error(json.message || "Script returned error");
            }
        } catch (e) {
            try {
                const cleanPayload = sanitizePortfolio(portfolio);
                await fetch(SHEET_API_URL, {
                    method: 'POST',
                    body: JSON.stringify(cleanPayload),
                    mode: 'no-cors',
                    headers: { "Content-Type": "text/plain" }
                });
                updateCloudStatus('success', 'Saved (Blind)');
            } catch (err2) {
                updateCloudStatus('error', 'Save Failed');
            }
        }
    }, 2000); 
}

function sanitizePortfolio(raw) {
    const clean = {};
    if (!raw) return clean;
    Object.keys(raw).forEach(key => {
        const k = key.toLowerCase();
        if (BLACKLIST_KEYS.includes(k)) return;
        if (typeof raw[key] !== 'object' || raw[key] === null) return;
        if (key.length > 20 || key.includes(' ')) return; 
        clean[key] = raw[key];
    });
    return clean;
}

// --- INITIALIZATION ---

async function initApp() {
    const robustData = localStorage.getItem('stockSightData');
    if (robustData) {
        const state = JSON.parse(robustData);
        portfolio = sanitizePortfolio(state.portfolio) || {};
        stockAnalysis = state.analysis || {};
        activeTab = state.activeTab || 'portfolio';
        cardViews = state.cardViews || {};
        
        let migrationNeeded = false;
        Object.keys(portfolio).forEach(key => {
            const clean = cleanTicker(key);
            if (clean !== key) {
                migrationNeeded = true;
                portfolio[clean] = portfolio[key];
                delete portfolio[key];
                if (stockAnalysis[key]) { stockAnalysis[clean] = stockAnalysis[key]; delete stockAnalysis[key]; }
                if (cardViews[key]) { cardViews[clean] = cardViews[key]; delete cardViews[key]; }
            }
        });
        
        if (migrationNeeded) saveState(false);

        Object.keys(stockAnalysis).forEach(sym => {
            if(stockAnalysis[sym].price) livePrices[sym] = stockAnalysis[sym].price;
        });
        renderUI();
    } else if (localStorage.getItem('stockPortfolio')) {
        portfolio = sanitizePortfolio(JSON.parse(localStorage.getItem('stockPortfolio')));
        renderUI();
    } else {
        const el = document.getElementById('empty-watchlist');
        if(el) el.innerHTML = "Initializing...";
    }

    await performCloudSync();

    const symbols = Object.keys(portfolio);
    if (symbols.length > 0) {
        setTimeout(() => { symbols.forEach(sym => fetchAsset(sym)); }, 100);
    }
}

async function performCloudSync() {
    updateCloudStatus('loading', 'Syncing...');
    isOfflineMode = false;
    try {
        const response = await fetch(SHEET_API_URL, { method: 'GET' });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const cloudData = await response.json();
        if (cloudData.status === 'error') throw new Error(cloudData.message);

        if (cloudData && Object.keys(cloudData).length > 0) {
            portfolio = sanitizePortfolio(cloudData);
            saveState(false); 
            renderUI(); 
        } else if (Object.keys(portfolio).length > 0) {
            saveState(true);
        }
        updateCloudStatus('success', 'Synced');
    } catch (e) {
        isOfflineMode = true;
        updateCloudStatus('error', 'Offline');
        const emptyState = document.getElementById('main-empty-state');
        if(emptyState) emptyState.classList.add('hidden');
        if (Object.keys(portfolio).length === 0) {
            const el = document.getElementById('empty-watchlist');
            if(el) el.innerHTML = "Offline Mode.<br>Add stocks locally.";
        }
    }
}

function forceSync() { 
    sessionStorage.removeItem('syncErrorShown'); 
    performCloudSync(); 
}

function renderUI() {
    const symbols = Object.keys(portfolio).filter(key => {
        const k = key.toLowerCase();
        return !BLACKLIST_KEYS.some(bad => k.includes(bad));
    });

    if (symbols.length > 0) {
        const el1 = document.getElementById('empty-watchlist');
        const el2 = document.getElementById('main-empty-state');
        if(el1) el1.classList.add('hidden');
        if(el2) el2.classList.add('hidden');
        symbols.forEach(sym => {
            if (stockAnalysis[sym]) renderCard(sym, stockAnalysis[sym], true); 
            else createCardSkeleton(sym);
            renderWatchlistItem(sym, !stockAnalysis[sym]);
        });
    }
    switchTab(activeTab);
    updateViewCounts();
    calculateTotals();
}

// --- NETWORK & FETCHING ---

const PROXIES = [
    { url: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text' },
    { url: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&t=${Date.now()}`, type: 'json' },
    { url: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text' },
    { url: (url) => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(url)}`, type: 'text' }
];

async function fetchWithFallback(targetUrl) {
    let lastError;
    for (const proxy of PROXIES) {
        try {
            const res = await fetch(proxy.url(targetUrl));
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            let content = proxy.type === 'json' ? (await res.json()).contents : await res.text();
            if(!content || content.length < 50) throw new Error("Empty/Blocked");
            // Relaxed Yahoo check to be more robust
            if(targetUrl.includes('yahoo') && !content.includes('Chart') && !content.includes('quoteResponse') && !content.includes('QuoteSummaryStore') && !content.trim().startsWith('{')) throw new Error("Invalid Yahoo");
            return content;
        } catch(e) { lastError = e; }
    }
    throw lastError;
}

async function fetchAsset(input) {
    const lowerInput = input.toLowerCase();
    if(BLACKLIST_KEYS.some(k => lowerInput.includes(k))) return;

    activeRequests++;
    updateReqCount();
    const sym = input.toUpperCase();
    try {
        if (/^\d{5,6}$/.test(sym)) await fetchMutualFund(sym);
        else await fetchStockOrETF(sym);
        const card = document.getElementById(`card-${sym}`);
        if(card) card.classList.remove('updating');
    } catch(e) {
        renderErrorCard(sym, e.message);
    } finally {
        activeRequests--;
        updateReqCount();
    }
}

async function fetchMutualFund(code) {
    const url = `https://api.mfapi.in/mf/${code}`;
    let json;
    
    // Try Direct First
    try {
        const res = await fetch(url);
        if (res.ok) {
            json = await res.json();
        } else {
            throw new Error("Direct MF Failed");
        }
    } catch(e) {
        // Fallback to Proxies if Direct Fails (e.g. CORS)
        try {
            const jsonStr = await fetchWithFallback(url);
            json = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        } catch(proxyErr) {
            throw new Error("MF Not Found");
        }
    }

    if (!json || !json.data || !json.meta) throw new Error("Invalid MF Data");

    const data = { 
        name: json.meta.scheme_name, 
        price: parseFloat(json.data[0].nav), 
        type: 'FUND', 
        meta: json.meta.fund_house,
        returns: calculateMFReturns(json.data) 
    };
    livePrices[code] = data.price;
    renderCard(code, data);
}

async function fetchStockOrETF(sym) {
    const isLikelyETF = ETF_KEYWORDS.some(k => sym.includes(k));
    
    // 1. Screener for Stocks (if not ETF keyword)
    if (!isLikelyETF) {
        try {
            const html = await fetchWithFallback(`https://www.screener.in/company/${sym}/consolidated/`);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const ratios = doc.getElementById('top-ratios');
            if (ratios) {
                const getVal = (txt) => {
                    for(let li of ratios.querySelectorAll('li')) {
                        if(li.innerText.toLowerCase().includes(txt.toLowerCase())) return parseFloat(li.querySelector('.number')?.innerText.replace(/,/g,'') || 0);
                    }
                    return null;
                };
                const price = getVal('Current Price');
                if(price) {
                    let growth = 0;
                    let opm = getVal('OPM %') || 0; 
                    let profitGrowth = 0;
                    const idxSales = html.indexOf("Compounded Sales Growth");
                    if(idxSales > -1) {
                        const sub = html.substring(idxSales, idxSales+1500);
                        let m = sub.match(/3 Years:[\s\S]*?([0-9\.-]+)\s?%/i);
                        growth = m ? parseFloat(m[1]) : 0;
                    }
                    const idxProfit = html.indexOf("Compounded Profit Growth");
                    if(idxProfit > -1) {
                        const sub = html.substring(idxProfit, idxProfit+1500);
                        let m = sub.match(/3 Years:[\s\S]*?([0-9\.-]+)\s?%/i);
                        profitGrowth = m ? parseFloat(m[1]) : 0;
                    }
                    let extraData = {};
                    try {
                        const yData = await fetchYahooQuote(`${sym}.NS`);
                        if(yData) extraData = { beta: yData.beta, returns: yData.returns };
                    } catch(e) {}
                    const data = { 
                        name: doc.querySelector('h1')?.innerText || sym, 
                        price: price, 
                        pe: getVal('Stock P/E'), 
                        roe: getVal('ROE'),
                        roce: getVal('ROCE'), 
                        mcap: getVal('Market Cap'),
                        opm: opm,
                        growth: growth,
                        profitGrowth: profitGrowth,
                        beta: extraData.beta || 1.0,
                        returns: extraData.returns, 
                        type: 'STOCK' 
                    };
                    livePrices[sym] = data.price;
                    renderCard(sym, data);
                    return; 
                }
            }
        } catch (e) {}
    }

    // 2. Google Finance (Prioritized for ETFs or as fallback)
    try {
        const gData = await fetchGoogleFinance(sym);
        if (gData) {
            livePrices[sym] = gData.price;
            renderCard(sym, gData);
            return;
        }
    } catch (gErr) {}

    // 3. Yahoo Finance (Last Resort)
    try {
        let targetSym = sym.endsWith('.NS') || sym.endsWith('.BO') ? sym : `${sym}.NS`;
        let data = await fetchYahooQuote(targetSym);
        if (!data && !sym.includes('.')) data = await fetchYahooQuote(`${sym}.BO`);
        if (data) {
            livePrices[sym] = data.price;
            renderCard(sym, data);
            return;
        }
    } catch (yErr) {}

    throw new Error("Asset not found");
}

async function fetchYahooQuote(yahooSym) {
    try {
        const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1mo&range=5y`;
        const chartJsonStr = await fetchWithFallback(chartUrl);
        const chartJson = typeof chartJsonStr === 'string' ? JSON.parse(chartJsonStr) : chartJsonStr;
        const result = chartJson?.chart?.result?.[0];
        const meta = result?.meta;
        
        if (meta && meta.regularMarketPrice) {
            const quotes = result.indicators.quote[0].close;
            const calcRet = (months) => {
                if(!quotes || quotes.length < months) return 0;
                const curr = quotes[quotes.length-1];
                const old = quotes[quotes.length - 1 - months];
                if(!old) return 0;
                const years = months/12;
                return ((Math.pow(curr/old, 1/years) - 1) * 100);
            };
            const rawName = meta.symbol || yahooSym;
            const cleanName = rawName.replace('.NS', '').replace('.BO', '');
            return { 
                name: cleanName, 
                price: meta.regularMarketPrice, 
                type: 'ETF', 
                pe: null, 
                beta: 1.0, 
                roe: null,
                returns: { r1y: calcRet(12), r3y: calcRet(36), r5y: calcRet(60) },
                technicals: { 
                    high52: meta.fiftyTwoWeekHigh,
                    ma50: meta.fiftyDayAverage,
                    ma200: meta.twoHundredDayAverage
                }
            };
        }
    } catch(e) {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSym}`;
        const jsonStr = await fetchWithFallback(url);
        const json = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        const res = json?.quoteResponse?.result?.[0];
        if(res) {
            return {
                name: res.shortName || yahooSym,
                price: res.regularMarketPrice,
                type: res.trailingPE ? 'STOCK' : 'ETF',
                pe: res.trailingPE,
                beta: res.beta || 1.0,
                returns: { r1y: 0, r3y: 0, r5y: 0 } 
            };
        }
    }
    return null;
}

async function fetchGoogleFinance(sym) {
    let html = await fetchWithFallback(`https://www.google.com/finance/quote/${sym}:NSE`);
    if (html.includes("Couldn't find")) html = await fetchWithFallback(`https://www.google.com/finance/quote/${sym}:BSE`);
    
    // Enhanced Regex Patterns to catch changing Google Class Names
    const pricePatterns = [
        /class="YMlKec fxKbKc">₹?([0-9,.]+)</, // Standard 2024
        /class="AHmHk">₹?([0-9,.]+)</,        // Alternative
        /class="zzDege">₹?([0-9,.]+)</,       // Fallback
        />₹\s?([0-9,.]+)<(?:\/span|\/div)>/   // Generic Currency match
    ];
    
    let price = null;
    for(let pattern of pricePatterns) {
        let match = html.match(pattern);
        if(match) {
            price = parseFloat(match[1].replace(/,/g, ''));
            break;
        }
    }

    const nameMatch = html.match(/<div class="zzDege">([^<]+)</) || html.match(/<h1[^>]*>([^<]+)</);
    const rangeMatch = html.match(/Year range.*?<div[^>]*>₹?([0-9,.]+)\s*-\s*₹?([0-9,.]+)/);

    if (price) {
        let high52 = 0, low52 = 0;
        if(rangeMatch) {
            low52 = parseFloat(rangeMatch[1].replace(/,/g, ''));
            high52 = parseFloat(rangeMatch[2].replace(/,/g, ''));
        } else {
            high52 = price * 1.05; low52 = price * 0.95; 
        }
        return { 
            name: nameMatch ? nameMatch[1] : sym, 
            price: price, 
            type: 'ETF', 
            pe: null, roe: null, 
            source: 'Google', 
            technicals: { high52, low52 }
        };
    }
    return null;
}

// --- INTERACTION & CALCULATIONS ---

function processInput() {
    const input = document.getElementById('stockInput');
    const val = input.value.trim().toUpperCase();
    if(!val) return;
    const symbols = val.split(',').map(s => s.trim()).filter(s => s);
    input.value = '';
    
    const el1 = document.getElementById('empty-watchlist');
    const el2 = document.getElementById('main-empty-state');
    if(el1) el1.classList.add('hidden');
    if(el2) el2.classList.add('hidden');

    symbols.forEach(rawSym => {
        const sym = cleanTicker(rawSym); 
        if(portfolio[sym]) return;
        portfolio[sym] = { qty: 0, avg: 0 };
        switchTab('watchlist'); 
        renderWatchlistItem(sym, true);
        createCardSkeleton(sym);
        fetchAsset(sym);
    });
    saveState(); 
}

function removeStock(sym) {
    delete portfolio[sym]; delete livePrices[sym]; delete stockAnalysis[sym];
    const w = document.getElementById(`wl-${sym}`);
    const c = document.getElementById(`card-${sym}`);
    if(w) w.remove(); if(c) c.remove();
    saveState();
}

function clearAll() {
    if(confirm("Clear All?")) {
        portfolio = {}; livePrices = {}; stockAnalysis = {};
        document.getElementById('watchlist-container').innerHTML = `<div id="empty-watchlist" class="p-8 text-center text-gray-400 text-sm italic">Add stocks...</div>`;
        document.getElementById('view-portfolio').innerHTML = '';
        document.getElementById('view-watchlist').innerHTML = '';
        document.getElementById('main-empty-state').classList.remove('hidden');
        saveState();
    }
}

function handleEnter(e) { if(e.key === "Enter") processInput(); }

window.updateHolding = function(sym, field, val) { 
    if(!portfolio[sym]) return; 
    const oldQty = portfolio[sym].qty;
    portfolio[sym][field] = parseFloat(val) || 0; 
    
    if (field === 'qty') {
        const newQty = portfolio[sym].qty;
        if ((oldQty === 0 && newQty > 0) || (oldQty > 0 && newQty === 0)) {
            if (stockAnalysis[sym]) renderCard(sym, stockAnalysis[sym]);
            renderWatchlistItem(sym, false);
        }
    }
    saveState(); 
    updateCardPnL(sym); 
    calculateTotals(); 
}

function calculateTotals() { 
    let tInv = 0, tCur = 0; 
    for(let sym in portfolio) { 
        if(livePrices[sym]) { 
            const q = portfolio[sym].qty; 
            tInv += q * portfolio[sym].avg; 
            tCur += q * livePrices[sym]; 
        } 
    } 
    const pnl = tCur - tInv; 
    document.getElementById('total-value').innerText = `₹${Math.round(tCur).toLocaleString()}`; 
    const pnlEl = document.getElementById('total-pnl'); 
    pnlEl.innerText = `₹${Math.round(pnl).toLocaleString()}`; 
    pnlEl.className = `font-bold text-lg leading-tight ${pnl >= 0 ? 'text-green-600' : 'text-red-500'}`; 
    
    // Call logic function from logic.js
    if (typeof calculatePortfolioAggregates === 'function') {
        calculatePortfolioAggregates();
    }
}

function switchTab(tab) { 
    activeTab = tab; 
    saveState(false); 
    const views = { 'portfolio': 'view-portfolio', 'watchlist': 'view-watchlist', 'summary': 'view-summary', 'support': 'view-support' };
    const tabs = { 'portfolio': 'tab-portfolio', 'watchlist': 'tab-watchlist', 'summary': 'tab-summary' };
    const es = document.getElementById('main-empty-state');

    if(Object.keys(portfolio).length === 0 && tab !== 'support') {
        Object.values(views).forEach(id => {
             const el = document.getElementById(id);
             if(el) el.classList.add('hidden');
        });
        if(es) es.classList.remove('hidden');
        return;
    } else {
        if(es) es.classList.add('hidden');
    }

    Object.keys(views).forEach(key => {
        const el = document.getElementById(views[key]);
        if (el) {
            if (key === tab) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    Object.keys(tabs).forEach(key => {
        const btn = document.getElementById(tabs[key]);
        if (btn) {
            if (key === tab) {
                btn.className = "tab-active py-1 transition-colors flex items-center gap-2";
            } else {
                btn.className = "tab-inactive py-1 transition-colors flex items-center gap-2";
            }
        }
    });

    if(tab === 'summary') renderSignalSummary();
}

// --- STOCKY INTELLIGENCE ---

function handleStockyMessage() {
    const input = document.getElementById('stocky-input');
    const msg = input.value.trim();
    if (!msg) return;
    
    addStockyMessage('user', msg);
    input.value = '';
    
    setTimeout(() => {
        const response = generateStockyResponse(msg);
        addStockyMessage('bot', response);
    }, 600);
}

function mapQueryToIntent(query) {
    const q = query.toLowerCase();
    const assets = Object.keys(stockAnalysis).filter(sym => q.includes(sym.toLowerCase()) || q.includes(stockAnalysis[sym].name.toLowerCase()));
    
    if (assets.length === 0 && stockyContext.lastAsset) {
        if (q.includes('target') || q.includes('entry') || q.includes('stop') || q.includes('score') || q.includes('why') || q.includes('buy') || q.includes('sell') || q.includes('analysis') || q.includes('fundamental')) {
            assets.push(stockyContext.lastAsset);
        }
    }
    
    if ((q.includes('compare') || q.includes(' vs ') || q.includes('better')) && assets.length === 1 && stockyContext.lastAsset && stockyContext.lastAsset !== assets[0]) {
        assets.unshift(stockyContext.lastAsset);
    }

    if (assets.length > 0) {
        stockyContext.lastAsset = assets[0]; 
    }

    if ((q.includes('compare') || q.includes('better') || q.includes(' vs ')) && assets.length >= 2) {
        return { type: 'COMPARE', assets: assets.slice(0, 2) };
    }

    if (assets.length > 0 && (q.includes('explain') || q.includes('score') || q.includes('analysis') || q.includes('buy') || q.includes('sell') || q.includes('why') || assets.length === 1)) {
        return { type: 'EXPLAIN', asset: assets[0] };
    }

    if (q.includes('health') || q.includes('summary') || q.includes('overview') || q.includes('score')) {
        return { type: 'SUMMARY' };
    }

    if (q.includes('risk') || q.includes('concentrat') || q.includes('diversif') || q.includes('exposure')) {
        return { type: 'RISK' };
    }

    const amtMatch = q.match(/(?:rs\.?|₹|inr)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|l|cr|m|b)?/i) || q.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|l|cr|m|b)/i) || q.match(/(?:allocate|have|invest)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    
    if (amtMatch) {
        let val = parseFloat(amtMatch[1].replace(/,/g, ''));
        const unit = (amtMatch[2] || '').toLowerCase();
        if (unit === 'k') val *= 1000;
        else if (unit === 'l') val *= 100000;
        else if (unit === 'cr') val *= 10000000;
        else if (unit === 'm') val *= 1000000;
        
        const reqAssets = assets.length > 0 ? assets : []; 
        return { type: 'ALLOCATION_SIM', amount: val, assets: reqAssets };
    }

    if (stockyContext.lastAllocation && (q.includes('why') || q.includes('explain') || q.includes('reason')) && (q.includes('allocation') || q.includes('chose') || q.includes('this'))) {
        return { type: 'EXPLAIN_ALLOCATION' };
    }

    if (q.includes('allocation') || q.includes('efficien') || q.includes('trap') || q.includes('size')) {
        return { type: 'EFFICIENCY' };
    }

    return { type: 'UNSUPPORTED' };
}

function simulateCapitalAllocation(amount, specificAssets) {
    let candidates = [];
    
    if (specificAssets.length > 0) {
         candidates = specificAssets.map(sym => ({ sym, ...stockAnalysis[sym] })).filter(c => c.price > 0);
    } else {
         candidates = Object.entries(stockAnalysis)
            .map(([sym, data]) => ({ sym, ...data }))
            .filter(d => d.price > 0 && d.action === 'BUY NOW'); 
         
         if (candidates.length === 0) {
             candidates = Object.entries(stockAnalysis)
                .map(([sym, data]) => ({ sym, ...data }))
                .filter(d => d.price > 0 && calculateFundamentalScore(d)?.total > 60);
         }
    }

    if (candidates.length === 0) {
        return "I couldn't find any high-conviction assets (Score > 60 or BUY signal) to simulate an allocation for right now.";
    }

    let totalScore = 0;
    candidates = candidates.map(c => {
        let fScore = calculateFundamentalScore(c);
        if(fScore) fScore = normalizeFundamentalScore(fScore, c);
        const score = fScore ? fScore.total : 50;
        totalScore += score;
        return { ...c, score };
    });

    let result = [];
    let used = 0;
    candidates.forEach(c => {
        const weight = c.score / totalScore;
        const allocAmt = amount * weight;
        const qty = Math.floor(allocAmt / c.price);
        const cost = qty * c.price;
        if(qty > 0) {
            result.push({ name: c.name, price: c.price, qty: qty, value: cost, weight: (weight*100).toFixed(1) });
            used += cost;
        }
    });

    if (result.length === 0) return "The capital amount is too small to buy even a single share of the selected assets.";

    stockyContext.lastAllocation = {
        topPicks: result.sort((a,b) => b.weight - a.weight).slice(0, 3),
        strategy: specificAssets.length > 0 ? "Specific Selection" : "Top Conviction Picks"
    };

    let response = `You may take a look at the following allocation that almost adds up to ₹${amount.toLocaleString()} for further analysis consideration:\n\n`;
    
    response += `<table class="w-full text-xs border-collapse mb-2">
        <thead><tr class="border-b border-gray-200 text-left"><th class="py-1">Asset</th><th>Qty</th><th>Value</th></tr></thead>
        <tbody>`;
    result.forEach(r => {
        response += `<tr class="border-b border-gray-50"><td class="py-1">${r.name}</td><td>${r.qty}</td><td>₹${r.value.toLocaleString()}</td></tr>`;
    });
    response += `</tbody></table>`;
    
    response += `\nUnused Cash: ₹${(amount - used).toLocaleString()}`;
    response += `\n\n<i class="text-[10px] text-gray-400">Note: Higher scores receive higher allocation weights. Not a recommendation.</i>`;
    
    return response;
}

function generateStockyResponse(query) {
    const intent = mapQueryToIntent(query);

    switch (intent.type) {
        case 'SUMMARY':
            const health = portfolioAnalytics.healthScore || 0;
            let tone = "stable";
            if (health > 65) tone = "strong";
            if (health < 40) tone = "struggling";
            return `According to the model, your portfolio's structural health is currently ${tone} with a composite score of ${health}. This score is a weighted average of the fundamental quality of your individual holdings.`;

        case 'RISK':
            const divScore = portfolioAnalytics.risk.divScore || 0;
            const sectors = (portfolioAnalytics.risk.sectors || []).map(s => s[0]).join(', ');
            const alerts = portfolioAnalytics.risk.alerts || [];
            let reply = `Your diversification score sits at ${divScore}/100. `;
            if (sectors) reply += `Structural data shows major exposure to ${sectors}. `;
            if (alerts.length > 0) reply += `The system flags some concentration risks: ${alerts[0]}.`;
            else reply += `The allocation looks balanced across sectors based on our standard risk thresholds.`;
            return reply;

        case 'EFFICIENCY':
            const eff = portfolioAnalytics.efficiency || [];
            const traps = eff.filter(e => e.type === 'bad');
            if (traps.length > 0) {
                return `I found some potential capital inefficiencies. Specifically, ${traps[0].text}. This suggests a large allocation in a structurally weak asset according to our scoring model.`;
            }
            return `Capital deployment looks efficient based on current metrics. I haven't flagged any major "Capital Traps" where high allocation meets low quality.`;
            
        case 'ALLOCATION_SIM':
            return simulateCapitalAllocation(intent.amount, intent.assets);

        case 'EXPLAIN_ALLOCATION':
            const alloc = stockyContext.lastAllocation;
            const names = alloc.topPicks.map(p => `${p.name}`).join(', ');
            return `I used a score-weighted model based on ${alloc.strategy}. Assets with higher fundamental scores received proportionally more capital. For example, ${names} scored highest in your list, so they anchor the portfolio to maximize structural quality while minimizing risk.`;

        case 'EXPLAIN':
            const symbol = intent.asset;
            const data = stockAnalysis[symbol];
            if (!data) return "I can't access data for that symbol right now.";
            return `Looking at ${data.name}, the system derives a ${data.action} signal. This is driven by ${data.explanation || 'structural factors'}, resulting in a conviction score that suggests ${data.action === 'BUY NOW' ? 'structural strength' : 'caution'}. ${data.levels ? `Key levels based on conviction: Entry/SL at ₹${(data.levels.sl || data.levels.entry || 0).toLocaleString()}.` : ''}`;

        case 'COMPARE':
            const [symA, symB] = intent.assets;
            const d1 = stockAnalysis[symA];
            const d2 = stockAnalysis[symB];
            if (!d1 || !d2) return "I need valid data for both assets to compare them.";
            
            let s1 = calculateFundamentalScore(d1); if(s1) s1 = normalizeFundamentalScore(s1, d1);
            let s2 = calculateFundamentalScore(d2); if(s2) s2 = normalizeFundamentalScore(s2, d2);
            const score1 = s1 ? s1.total : '--';
            const score2 = s2 ? s2.total : '--';

            return `<div class="font-bold mb-1">Comparison: ${d1.name} vs ${d2.name}</div>
            <table class="w-full text-xs border border-gray-200 rounded">
                <tr class="bg-gray-50"><th class="p-1 text-left">Metric</th><th class="p-1 text-right">${d1.name.substr(0,4)}</th><th class="p-1 text-right">${d2.name.substr(0,4)}</th></tr>
                <tr class="border-t"><td class="p-1">Score</td><td class="p-1 text-right font-bold">${score1}</td><td class="p-1 text-right font-bold">${score2}</td></tr>
                <tr class="border-t"><td class="p-1">Signal</td><td class="p-1 text-right">${d1.action}</td><td class="p-1 text-right">${d2.action}</td></tr>
                <tr class="border-t"><td class="p-1">Price</td><td class="p-1 text-right">₹${d1.price}</td><td class="p-1 text-right">₹${d2.price}</td></tr>
            </table>
            <div class="mt-2 text-[10px] italic">System favors ${d1.action === 'BUY NOW' && d2.action !== 'BUY NOW' ? d1.name : (d2.action === 'BUY NOW' && d1.action !== 'BUY NOW' ? d2.name : "neither definitively based on signal strength")}.</div>`;

        case 'UNSUPPORTED':
        default:
            return `I'm tuned to analyze portfolio structure, risk, and scoring rules. I can't predict market movements or offer general financial advice. Try asking about "Portfolio Health", "Capital Efficiency", or "Explain [Stock]".`;
    }
}

// Start App
document.addEventListener('DOMContentLoaded', initApp);
