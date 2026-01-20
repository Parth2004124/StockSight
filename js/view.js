// --- UI HELPER FUNCTIONS (Badges & Formatting) ---

function getConvictionBadge(label) {
    if (!label) return '';
    const styles = { 'Strong': 'bg-emerald-100 text-emerald-800 border-emerald-200', 'Stable': 'bg-amber-100 text-amber-800 border-amber-200', 'Weak': 'bg-rose-100 text-rose-800 border-rose-200' };
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles[label]} uppercase tracking-wider mx-1">${label}</span>`;
}

function getTrajectoryBadge(label) {
    if (!label) return '';
    const styles = { 'Improving': 'bg-indigo-100 text-indigo-800 border-indigo-200', 'Flat': 'bg-gray-100 text-gray-600 border-gray-200', 'Deteriorating': 'bg-orange-100 text-orange-800 border-orange-200' };
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles[label]} uppercase tracking-wider mx-1">${label}</span>`;
}

function getTimingBadge(label) {
    if (!label) return '';
    const styles = { 'Favourable': 'bg-teal-100 text-teal-800 border-teal-200', 'Neutral': 'bg-slate-100 text-slate-600 border-slate-200', 'Unfavourable': 'bg-red-100 text-red-800 border-red-200' };
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles[label]} uppercase tracking-wider mx-1">TIMING: ${label}</span>`;
}

function getFundamentalTimingBadge(label) {
    if (!label) return '';
    const styles = { 'Early': 'bg-sky-100 text-sky-800 border-sky-200', 'Optimal': 'bg-lime-100 text-lime-800 border-lime-200', 'Late': 'bg-red-50 text-red-600 border-red-200' };
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles[label]} uppercase tracking-wider mx-1">${label}</span>`;
}

function getDecisionBlock(decision, confidence) {
    const colors = { 'BUY NOW': 'bg-green-50 border-green-200 text-green-800', 'ADD': 'bg-emerald-50 border-emerald-200 text-emerald-800', 'SIP ONLY': 'bg-blue-50 border-blue-200 text-blue-800', 'HOLD': 'bg-indigo-50 border-indigo-200 text-indigo-800', 'WAIT': 'bg-orange-50 border-orange-200 text-orange-800', 'REVIEW': 'bg-yellow-50 border-yellow-200 text-yellow-800', 'REDUCE': 'bg-amber-50 border-amber-200 text-amber-800', 'EXIT': 'bg-red-50 border-red-200 text-red-800', 'AVOID': 'bg-slate-50 border-slate-200 text-slate-600' };
    const colorClass = colors[decision.action] || 'bg-gray-50 border-gray-200';
    
    // Confidence Style
    const confColors = { 'High': 'text-green-600', 'Medium': 'text-yellow-600', 'Low': 'text-red-600' };
    const confColor = confColors[confidence] || 'text-gray-400';

    return `<div class="mt-3 pt-3 border-t border-dashed border-gray-200">
        <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
                <span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Final Verdict</span>
                <span class="text-[8px] font-mono ${confColor}" title="Data Confidence">(${confidence} Conf.)</span>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${colorClass}">${decision.action}</span>
        </div>
        <p class="text-[10px] text-gray-500 italic leading-relaxed">"${decision.summary}"</p>
    </div>`;
}

function getMoreshwarBlock(price, fScore, pScore, isHolding, decisionAction) {
    const showFor = ['BUY NOW', 'SIP ONLY', 'ADD', 'AVOID', 'WAIT'];
    if (!isHolding && !showFor.includes(decisionAction)) return '';
    const levels = calculateMoreshwarLevels(price, fScore, pScore, isHolding);
    let html = `<div class="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center text-[10px] font-mono text-gray-600 bg-gray-50/50 p-2 rounded">`;
    if (isHolding) { html += `<div class="flex flex-col"><span class="text-[8px] text-gray-400 uppercase">Target (Y+X)</span><span class="font-bold text-green-600">₹${levels.target.toLocaleString()}</span></div><div class="flex flex-col text-right"><span class="text-[8px] text-gray-400 uppercase">Stop-loss (Price-Risk)</span><span class="font-bold text-red-600">₹${levels.sl.toLocaleString()}</span></div>`; } 
    else { 
        let label = "Entry Price"; let valColor = "text-blue-600";
        if (decisionAction === 'AVOID' || decisionAction === 'WAIT') { label = "Avoid Till"; valColor = "text-orange-500"; }
        html += `<div class="flex flex-col w-full text-center"><span class="text-[8px] text-gray-400 uppercase">${label}</span><span class="font-bold ${valColor}">₹${levels.entry.toLocaleString()}</span></div>`; 
    }
    html += `</div>`;
    return html;
}

// --- MAIN RENDERING FUNCTIONS ---

function renderCard(sym, data, isCached = false) {
    // Relies on global portfolio/stockAnalysis defined in app.js
    const qty = portfolio[sym].qty || 0;
    const isHeld = qty > 0;
    const targetContainerId = isHeld ? 'view-portfolio' : 'view-watchlist';
    const container = document.getElementById(targetContainerId);
    
    let card = document.getElementById(`card-${sym}`);
    if (!card) {
        card = document.createElement('div');
        card.id = `card-${sym}`;
        container.appendChild(card);
    } else if (card.parentElement.id !== targetContainerId) {
        container.appendChild(card);
    }

    let signal = "HOLD", sigClass = "signal-hold", typeBadge = "badge-stock", metricsHTML = "";
    let sourceTag = data.source === 'Google' ? `<span class="badge-gfin text-[9px] px-1 rounded ml-1">G-FIN</span>` : "";
    const cleanSym = cleanTicker(sym);

    // Calculate Scores (Using logic.js functions)
    let fScore = calculateFundamentalScore(data);
    if (fScore) {
        fScore = normalizeFundamentalScore(fScore, data);
    }

    const pScore = calculatePortersScore(data);
    const tScore = calculateTrajectoryScore(data);
    const rsScore = calculateRelativeStrength(data);
    
    // Boost & Normalize Logic
    if (fScore) {
        let rawTotal = fScore.total + tScore + rsScore;
        if (data.type === 'ETF' || data.type === 'FUND') {
              fScore.total = calculateNormalizedScore(rawTotal);
        } else {
              fScore.total = Math.max(0, Math.min(99, rawTotal));
        }
    }

    const viewMode = cardViews[sym] || 'fundamental';
    let longTermLabel = "";
    
    const conviction = calculateConviction(fScore, pScore);
    const convictionBadge = getConvictionBadge(conviction);
    const trajectory = calculateTrajectory(data);
    const trajectoryBadge = getTrajectoryBadge(trajectory);
    const timing = calculateTiming(data);
    const timingBadge = getTimingBadge(timing);
    const fundTiming = calculateFundamentalTiming(data);
    const fundTimingBadge = getFundamentalTimingBadge(fundTiming);

    const confidence = calculateDataConfidence(data);

    const decision = calculateFinalDecision(conviction, trajectory, timing, data.type, isHeld);
    if (fScore) {
        decision.summary = calculateScoreActionMapper(fScore.total, fundTiming, conviction, isHeld);
    }
    
    const decisionBlock = getDecisionBlock(decision, confidence);
    const moreshwarBlock = getMoreshwarBlock(data.price, fScore, pScore, isHeld, decision.action);

    const rsColor = rsScore > 0 ? 'text-green-600' : (rsScore < 0 ? 'text-red-600' : 'text-gray-400');
    const rsSign = rsScore > 0 ? '+' : '';

    if(data.type === 'STOCK' && fScore) {
        typeBadge = "badge-stock";
        
        if (fScore.total >= 65) { signal = "BUY"; sigClass = "signal-buy"; }
        else if (fScore.total <= 40) { signal = "SELL"; sigClass = "signal-sell"; }

        if (pScore && pScore.total > fScore.total) {
            longTermLabel = `<div class="text-[8px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 mt-1 text-right">Long Term Potential</div>`;
        }

        if (!isHeld) {
            if (signal === "HOLD") signal = "WAIT";
            if (signal === "SELL") { signal = "AVOID"; sigClass = "signal-gray"; }
        }

        const tabHTML = `
            <div class="flex gap-2 mb-3 mt-1">
                <button onclick="switchCardTab('${sym}', 'fundamental')" class="analysis-tab ${viewMode === 'fundamental' ? 'active-fund' : 'inactive'}">Fundamental</button>
                <button onclick="switchCardTab('${sym}', 'porter')" class="analysis-tab ${viewMode === 'porter' ? 'active-port' : 'inactive'}">Porter's 5</button>
            </div>
        `;

        if (viewMode === 'fundamental') {
            metricsHTML = `
                ${tabHTML}
                <div class="space-y-3 animate-fade-in">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-xs font-bold w-8 text-right">${fScore.total}</span>
                        <div class="flex-1 score-bar-bg h-2">
                            <div class="score-bar-fill ${fScore.total > 60 ? 'bg-green-500' : (fScore.total < 40 ? 'bg-red-500' : 'bg-yellow-500')}" style="width: ${fScore.total}%"></div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-[10px]">
                        <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">Business</span><span class="font-bold text-gray-700">${fScore.business}/40</span></div>
                        <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">Moat</span><span class="font-bold text-gray-700">${fScore.moat}/20</span></div>
                        <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">Mgmt</span><span class="font-bold text-gray-700">${fScore.management}/20</span></div>
                        <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">Risk</span><span class="font-bold text-gray-700">${fScore.risk}/20</span></div>
                        <div class="bg-indigo-50 p-1.5 rounded"><span class="text-gray-400 block">Trajectory</span><span class="font-bold text-indigo-700">+${tScore}</span></div>
                        <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">Rel Strength</span><span class="font-bold ${rsColor}">${rsSign}${rsScore}</span></div>
                    </div>
                    ${decisionBlock}
                    ${moreshwarBlock}
                </div>`;
        } else if (viewMode === 'porter') {
            metricsHTML = `
                ${tabHTML}
                <div class="space-y-3 animate-fade-in">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-xs font-bold w-8 text-right text-blue-600">${pScore.total}</span>
                        <div class="flex-1 score-bar-bg h-2">
                            <div class="score-bar-fill bg-blue-500" style="width: ${pScore.total}%"></div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-[10px]">
                        <div class="bg-blue-50 p-1.5 rounded"><span class="text-gray-400 block">Barriers</span><span class="font-bold text-blue-800">${pScore.entrants}/20</span></div>
                        <div class="bg-blue-50 p-1.5 rounded"><span class="text-gray-400 block">Suppliers</span><span class="font-bold text-blue-800">${pScore.suppliers}/20</span></div>
                        <div class="bg-blue-50 p-1.5 rounded"><span class="text-gray-400 block">Buyers</span><span class="font-bold text-blue-800">${pScore.buyers}/20</span></div>
                        <div class="bg-blue-50 p-1.5 rounded"><span class="text-gray-400 block">Substitutes</span><span class="font-bold text-blue-800">${pScore.substitutes}/20</span></div>
                        <div class="col-span-2 bg-blue-50 p-1.5 rounded flex justify-between"><span class="text-gray-400">Competitive Rivalry</span><span class="font-bold text-blue-800">${pScore.rivalry}/20</span></div>
                    </div>
                    ${decisionBlock}
                    ${moreshwarBlock}
                </div>`;
        }

    } else if (fScore) {
        signal = "SIP"; sigClass = "signal-sip";
        if (fScore.total > 70) signal = "BUY"; 
        
        if (qty === 0) {
             if (signal === "SIP") { signal = "TRACK"; sigClass = "signal-gray"; }
        }

        typeBadge = data.type === 'ETF' ? "badge-etf" : "badge-fund";
        const isMF = data.type === 'FUND';
        
        let l1="Returns", l2="Momentum", l3="Trend", l4="Safety";
        if(data.explanation === "Trend Strength") { l1="Trend"; l2="Momentum"; l3="Strength"; l4="Support"; }
        else if(isMF) { l1="1Y Ret"; l2="3Y Ret"; l3="5Y Ret"; l4="Trend"; }

        metricsHTML = `
            <div class="space-y-3">
                 <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-bold w-8 text-right">${fScore.total}</span>
                    <div class="flex-1 score-bar-bg h-2">
                        <div class="score-bar-fill bg-blue-500" style="width: ${fScore.total}%"></div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[10px]">
                    <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">${l1}</span><span class="font-bold text-gray-700">${fScore.business}/40</span></div>
                    <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">${l2}</span><span class="font-bold text-gray-700">${fScore.moat}/20</span></div>
                    <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">${l3}</span><span class="font-bold text-gray-700">${fScore.management}/20</span></div>
                    <div class="bg-gray-50 p-1.5 rounded"><span class="text-gray-400 block">${l4}</span><span class="font-bold text-gray-700">${fScore.risk}/20</span></div>
                </div>
                ${decisionBlock}
                ${moreshwarBlock}
            </div>`;
    } else {
         metricsHTML = ``; 
         signal = "N/A"; sigClass = "signal-gray";
    }

    stockAnalysis[sym] = { 
        signal, name: data.name, price: data.price, type: data.type, 
        pe: data.pe, growth: data.growth, profitGrowth: data.profitGrowth, opm: data.opm,
        roe: data.roe, mcap: data.mcap, roce: data.roce, beta: data.beta, source: data.source,
        returns: data.returns, technicals: data.technicals,
        action: decision.action,
        explanation: fScore?.explanation,
        levels: calculateMoreshwarLevels(data.price, fScore, pScore, isHeld)
    };
    if(!isCached) saveState(true); 

    const savedQty = portfolio[sym].qty || '';
    const savedAvg = portfolio[sym].avg || '';
    const opacityClass = isCached ? 'updating' : '';

    const mcBtn = `<a href="https://www.google.com/search?q=${encodeURIComponent(data.name + " moneycontrol news")}" target="_blank" class="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 rounded ml-1 hover:bg-emerald-100 transition-colors cursor-pointer" title="MoneyControl News" onclick="event.stopPropagation()">MC News</a>`;

    card.className = `bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden min-h-[340px] flex flex-col relative ${opacityClass}`;
    card.innerHTML = `
        <div class="p-5 flex flex-col h-full">
            <div class="flex justify-between items-start mb-2">
                <div class="overflow-hidden">
                    <h3 class="font-bold text-gray-800 text-lg leading-tight truncate w-40" title="${data.name}">${data.name}</h3>
                    <div class="flex gap-2 mt-1 items-center flex-wrap">
                        <span class="text-[10px] font-mono text-gray-500 bg-gray-100 px-1 rounded">${cleanSym}</span>
                        <span class="text-[10px] px-1 rounded font-bold ${typeBadge}">${data.type}</span>
                        ${convictionBadge}
                        ${fundTimingBadge}
                        ${trajectoryBadge}
                        ${timingBadge}
                        ${sourceTag}
                        ${mcBtn}
                    </div>
                </div>
                <div class="flex flex-col items-end">
                    <div class="text-[10px] font-bold px-2 py-1 rounded border ${sigClass}">${signal}</div>
                    <span class="text-[9px] text-gray-400 mt-1 italic w-20 text-right leading-tight">${fScore?.explanation || ''}</span>
                    ${longTermLabel}
                </div>
            </div>

            <div class="flex justify-between items-end pb-3 border-b border-gray-100 mb-3">
                <p class="text-2xl font-bold text-gray-800">₹${data.price.toLocaleString()}</p>
            </div>

            <div class="bg-gray-50 rounded border border-gray-100 p-2 mb-3">
                <div class="flex gap-2 mb-1">
                    <div class="flex-1"><label class="text-[9px] text-gray-500 uppercase block mb-1">Qty</label><input type="number" class="portfolio-input" placeholder="0" value="${savedQty}" onchange="updateHolding('${sym}', 'qty', this.value)"></div>
                    <div class="flex-1"><label class="text-[9px] text-gray-500 uppercase block mb-1">Avg</label><input type="number" class="portfolio-input" placeholder="₹" value="${savedAvg}" onchange="updateHolding('${sym}', 'avg', this.value)"></div>
                </div>
                <div class="flex justify-between items-center text-xs pt-1"><span class="text-gray-400">P&L:</span><span id="pnl-${sym}" class="font-bold text-gray-300">--</span></div>
            </div>
            
            ${metricsHTML}
        </div>`;
    
    if(!isCached) {
        renderWatchlistItem(sym, false);
        updateCardPnL(sym);
        calculateTotals();
        updateViewCounts();
    } else {
        updateCardPnL(sym);
    }
}

function switchCardTab(sym, mode) {
    cardViews[sym] = mode;
    if (stockAnalysis[sym]) {
        renderCard(sym, stockAnalysis[sym], false); 
        saveState(false); 
    }
}

function createCardSkeleton(sym) {
    const qty = portfolio[sym].qty || 0;
    const containerId = qty > 0 ? 'view-portfolio' : 'view-watchlist';
    const grid = document.getElementById(containerId);
    const card = document.createElement('div');
    card.id = `card-${sym}`;
    card.className = "bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden min-h-[300px] relative";
    card.innerHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/80"><div class="loader mb-2"></div><p class="text-xs text-gray-400">Loading ${cleanTicker(sym)}...</p></div>`;
    grid.insertBefore(card, grid.firstChild);
}

function renderWatchlistItem(sym, isLoading) {
    const container = document.getElementById('watchlist-container');
    let item = document.getElementById(`wl-${sym}`);
    const price = livePrices[sym] ? `₹${livePrices[sym].toLocaleString()}` : '--';
    const qty = portfolio[sym].qty || 0;
    const icon = qty > 0 ? '💼' : '👁️'; 
    const cleanSym = cleanTicker(sym);

    if (!item) {
        item = document.createElement('div');
        item.id = `wl-${sym}`;
        item.className = "watchlist-item p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer flex justify-between items-center group transition-colors";
        item.onclick = () => { 
            const targetTab = portfolio[sym].qty > 0 ? 'portfolio' : 'watchlist';
            switchTab(targetTab);
            setTimeout(() => document.getElementById(`card-${sym}`)?.scrollIntoView({behavior:'smooth'}), 50); 
        };
        container.insertBefore(item, container.firstChild);
    }
    item.innerHTML = isLoading ? 
        `<div><span class="text-sm font-semibold">${cleanSym}</span></div><div class="loader w-3 h-3 border-gray-300 border-t-maroon"></div>` : 
        `<div><span class="mr-2 text-xs opacity-50">${icon}</span><span class="text-sm font-semibold">${cleanSym}</span></div><div class="text-right"><span class="font-mono text-sm">${price}</span><button onclick="event.stopPropagation(); removeStock('${sym}')" class="delete-btn opacity-0 group-hover:opacity-100 text-[10px] text-red-500 uppercase ml-2">Del</button></div>`;
}

function renderErrorCard(sym, msg) {
    const qty = portfolio[sym].qty || 0;
    const containerId = qty > 0 ? 'view-portfolio' : 'view-watchlist';
    const container = document.getElementById(containerId);
    let card = document.getElementById(`card-${sym}`);
    if (!card) {
        card = document.createElement('div');
        card.id = `card-${sym}`;
        container.appendChild(card);
    }
    card.innerHTML = `<div class="flex flex-col items-center justify-center h-full p-6 text-center"><span class="text-red-400 font-bold mb-1">Failed</span><span class="text-xs text-gray-400 mb-4 break-words w-full px-4">${msg || "Proxy Error"}</span><button onclick="fetchAsset('${sym}')" class="px-3 py-1 bg-white border border-red-200 text-red-500 text-xs rounded hover:bg-red-50 mb-2">Retry</button><button onclick="removeStock('${sym}')" class="text-xs text-gray-400 underline">Remove</button></div>`;
    const item = document.getElementById(`wl-${sym}`);
    if(item) item.innerHTML = `<span class="text-sm font-semibold text-gray-400">${cleanTicker(sym)}</span><span class="text-xs text-red-500">Error</span>`;
}

function updateCardPnL(sym) { 
    if(!portfolio[sym] || !livePrices[sym]) return; 
    const qty = portfolio[sym].qty; 
    const avg = portfolio[sym].avg; 
    const cur = livePrices[sym]; 
    const pnl = (qty * cur) - (qty * avg); 
    const el = document.getElementById(`pnl-${sym}`); 
    if(el) { 
        el.innerText = `₹${Math.round(pnl).toLocaleString()}`; 
        el.className = `font-bold text-xs ${pnl >= 0 ? 'text-green-600' : 'text-red-500'}`; 
    } 
}

function updateViewCounts() {
    let portCount = 0;
    let watchCount = 0;
    Object.values(portfolio).forEach(p => {
        if (p.qty > 0) portCount++;
        else watchCount++;
    });
    document.getElementById('watchlist-count').innerText = `${Object.keys(portfolio).length} / 50`;
    document.getElementById('badge-port-count').innerText = portCount;
    document.getElementById('badge-watch-count').innerText = watchCount;
    
    document.getElementById('portfolio-empty').style.display = portCount === 0 ? 'flex' : 'none';
    document.getElementById('watchlist-empty').style.display = watchCount === 0 ? 'flex' : 'none';
}

function renderSignalSummary() { 
    // Uses portfolioAnalytics from logic.js
    const healthEl = document.getElementById('analytics-health');
    const allocEl = document.getElementById('analytics-allocation');
    const perfEl = document.getElementById('analytics-performance');
    const actionsEl = document.getElementById('analytics-actions'); 

    if(!portfolioAnalytics.totalValue) {
        healthEl.innerHTML = `<div class="text-center text-gray-400 text-xs">No Data</div>`;
        return;
    }

    // Health & Risk Column
    let healthColor = 'text-amber-600';
    let healthLabel = 'Neutral';
    if(portfolioAnalytics.healthScore > 65) { healthColor = 'text-green-600'; healthLabel = 'Strong'; }
    else if(portfolioAnalytics.healthScore < 40) { healthColor = 'text-red-600'; healthLabel = 'Weak'; }
    
    let riskHTML = '';
    if (portfolioAnalytics.risk.alerts && portfolioAnalytics.risk.alerts.length > 0) {
        riskHTML = `<div class="mt-3 w-full px-2 space-y-1 overflow-y-auto max-h-[80px] custom-scroll border-t border-amber-200/50 pt-2">
            ${portfolioAnalytics.risk.alerts.map(a => `<div class="text-[9px] text-amber-700 flex items-start"><span class="mr-1">⚠️</span>${a}</div>`).join('')}
        </div>`;
    } else {
        riskHTML = `<div class="mt-3 text-[10px] text-green-600 flex items-center"><span class="mr-1">✅</span>Well Diversified</div>`;
    }

    const sensitivity = portfolioAnalytics.risk.sensitivity || 'Moderate';
    const sensColor = sensitivity === 'Aggressive' ? 'text-red-500' : (sensitivity === 'Defensive' ? 'text-blue-500' : 'text-gray-500');

    healthEl.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full pt-4 pb-4">
            <div class="flex gap-4 mb-2">
                <div class="text-center">
                    <div class="text-2xl font-bold ${healthColor}">${portfolioAnalytics.healthScore}</div>
                    <span class="text-[9px] uppercase text-amber-900/60">Quality</span>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-600">${portfolioAnalytics.risk.divScore || 100}</div>
                    <span class="text-[9px] uppercase text-amber-900/60">Diversity</span>
                </div>
            </div>
            <div class="text-[10px] font-semibold border px-2 py-0.5 rounded ${sensColor} border-amber-200 bg-white mb-2">${sensitivity} Profile</div>
            ${riskHTML}
        </div>
    `;

    // Allocation
    let allocHTML = '<div class="w-full space-y-2 flex flex-col justify-center h-full px-2">';
    let total = portfolioAnalytics.totalValue;
    Object.entries(portfolioAnalytics.allocation).forEach(([key, val]) => {
        let pct = Math.round((val/total)*100);
        if(pct > 0) {
            allocHTML += `
                <div class="flex items-center text-xs">
                    <span class="w-24 text-indigo-900 font-medium">${key}</span>
                    <div class="flex-1 h-2 bg-indigo-50 rounded overflow-hidden mr-2 border border-indigo-100">
                        <div class="h-full bg-indigo-500" style="width: ${pct}%"></div>
                    </div>
                    <span class="font-bold text-indigo-700">${pct}%</span>
                </div>
            `;
        }
    });
    
    if (portfolioAnalytics.risk.sectors && portfolioAnalytics.risk.sectors.length > 0) {
        allocHTML += `<div class="mt-4 pt-3 border-t border-indigo-200/50"><p class="text-[9px] text-indigo-400 uppercase mb-2 font-bold tracking-wider">Top Exposures</p>`;
        portfolioAnalytics.risk.sectors.forEach(([ind, val]) => {
            let sPct = Math.round((val/total)*100);
            if (sPct > 5) {
                allocHTML += `<div class="flex justify-between text-[10px] text-indigo-800 mb-1"><span>${ind}</span><span class="font-mono text-indigo-600 font-bold">${sPct}%</span></div>`;
            }
        });
        allocHTML += `</div>`;
    }
    
    allocHTML += '</div>';
    allocEl.innerHTML = allocHTML;

    // Performance & Efficiency Column
    const totalPnL = parseFloat(document.getElementById('total-pnl').innerText.replace(/[^0-9.-]/g, ''));
    const pnlPct = total > 0 ? (totalPnL / (total - totalPnL)) * 100 : 0;
    const pnlColor = totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600';
    
    let effHTML = '';
    if (portfolioAnalytics.efficiency && portfolioAnalytics.efficiency.length > 0) {
        effHTML = `<div class="mt-auto w-full pt-3 border-t border-emerald-100/50"><p class="text-[9px] text-emerald-800/60 uppercase mb-1 text-center font-bold tracking-wider">Efficiency Check</p>`;
        portfolioAnalytics.efficiency.forEach(item => {
            let color = 'text-emerald-800';
            if (item.type === 'bad') color = 'text-rose-600';
            if (item.type === 'good') color = 'text-emerald-600';
            effHTML += `<div class="text-[9px] ${color} text-center mb-0.5 bg-white/50 rounded py-0.5 px-1 leading-tight" title="${item.text}">${item.text}</div>`;
        });
        effHTML += `</div>`;
    } else if (total > 0) {
        effHTML = `<div class="mt-auto w-full pt-3 border-t border-emerald-100/50 text-center"><span class="text-[9px] text-emerald-600 font-medium">Capital Allocation Efficient</span></div>`;
    }

    perfEl.innerHTML = `
        <div class="flex flex-col items-center h-full w-full py-4">
            <div class="flex-1 flex flex-col items-center justify-center">
                <div class="text-3xl font-bold ${pnlColor} mb-1">${totalPnL >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%</div>
                <span class="text-xs text-emerald-900/60 mb-3 uppercase tracking-wide font-medium">Total Return</span>
                <div class="text-sm font-mono font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-100 shadow-sm">₹${totalPnL.toLocaleString()}</div>
            </div>
            ${effHTML}
        </div>
    `;

    // Actions Card Logic
    let actionsList = [];
    Object.values(stockAnalysis).forEach(data => {
       if (data.action === 'BUY NOW') {
           let reason = (data.explanation || "").split(' ').slice(0,3).join(' ');
           let entry = data.levels?.entry || data.price;
           actionsList.push({ type: 'buy', text: `Buy ${data.name}`, sub: `@ ₹${entry.toLocaleString()}`, reason: reason });
       } else if (data.action === 'EXIT') {
           let reason = (data.explanation || "").split(' ').slice(0,3).join(' ');
           actionsList.push({ type: 'sell', text: `Sell ${data.name}`, sub: `@ ₹${data.price.toLocaleString()}`, reason: reason });
       }
    });

    if (actionsList.length === 0) {
        actionsEl.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-violet-300 text-xs italic"><p>No Immediate Actions</p></div>`;
    } else {
        let listHTML = `<div class="w-full space-y-2 overflow-y-auto custom-scroll pr-1">`;
        actionsList.forEach(act => {
            const icon = act.type === 'buy' ? '🟢' : '🔴';
            const colorClass = act.type === 'buy' ? 'text-green-700 bg-green-50 border-green-100' : 'text-red-700 bg-red-50 border-red-100';
            listHTML += `
                <div class="p-2 rounded border ${colorClass} text-xs">
                    <div class="flex justify-between font-bold mb-0.5">
                        <span>${icon} ${act.text}</span>
                        <span class="font-mono">${act.sub}</span>
                    </div>
                    <div class="text-[9px] opacity-80 pl-5 italic">${act.reason}</div>
                </div>
            `;
        });
        listHTML += `</div>`;
        actionsEl.innerHTML = listHTML;
    }
}

function updateCloudStatus(status, text) {
    const el = document.getElementById('cloud-status');
    if(!el) return;
    let color = 'bg-gray-400';
    if (status === 'loading') color = 'bg-yellow-400 animate-pulse';
    if (status === 'success') color = 'bg-green-500';
    if (status === 'error') color = 'bg-red-500';
    el.innerHTML = `<span class="w-2 h-2 rounded-full ${color}"></span><span>${text}</span>`;
}

function updateReqCount() {
    const el = document.getElementById('requestCounter');
    // activeRequests is global in app.js
    if(el && typeof activeRequests !== 'undefined') el.style.display = activeRequests > 0 ? 'block' : 'none';
}

function toggleSupportView() {
    const summaryView = document.getElementById('view-summary');
    const supportView = document.getElementById('view-support');
    
    if (summaryView.classList.contains('hidden')) {
        summaryView.classList.remove('hidden');
        supportView.classList.add('hidden');
    } else {
        summaryView.classList.add('hidden');
        supportView.classList.remove('hidden');
    }
}

// --- STOCKY CHAT UI ---

function toggleStocky() {
    const panel = document.getElementById('stocky-panel');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        setTimeout(() => panel.classList.remove('opacity-0', 'scale-95'), 10); 
    } else {
        panel.classList.add('opacity-0', 'scale-95');
        setTimeout(() => panel.classList.add('hidden'), 300); 
    }
}

function addStockyMessage(sender, text) {
    const container = document.getElementById('stocky-messages');
    const div = document.createElement('div');
    div.className = "flex items-start gap-2 " + (sender === 'user' ? "flex-row-reverse" : "");
    
    let avatar = sender === 'user' ? 
        `<div class="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs">U</div>` :
        `<div class="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs border border-violet-200">S</div>`;
        
    let bubbleClass = sender === 'user' ? 
        "bg-violet-600 text-white rounded-tl-xl rounded-bl-xl rounded-br-xl" :
        "bg-white border border-gray-100 text-gray-600 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm";

    div.innerHTML = `
        ${avatar}
        <div class="${bubbleClass} p-3 text-xs max-w-[85%] whitespace-pre-wrap">
            ${text}
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
