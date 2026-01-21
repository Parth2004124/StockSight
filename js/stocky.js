// --- STOCKY INTELLIGENCE MODULE ---

// Local state for the bot - PERSISTENT CONTEXT
let stockyContext = { 
    lastAsset: null,       
    lastIntent: null,      
    lastAllocation: null   
};

// Main Handler called by the UI
async function handleStockyMessage() {
    const input = document.getElementById('stocky-input');
    const msg = input.value.trim();
    if (!msg) return;
    
    // UI: Add User Message
    addStockyMessage('user', msg);
    input.value = '';
    
    // Logic: Generate Response (Async allowed now)
    setTimeout(async () => {
        try {
            const response = await generateStockyResponse(msg);
            addStockyMessage('bot', response);
        } catch (e) {
            console.error(e);
            addStockyMessage('bot', "I encountered an error processing that request.");
        }
    }, 600);
}

// --- NLP ENGINE ---

const NLP_SYNONYMS = {
    'buy': ['purchase', 'invest', 'add', 'get', 'buying', 'long'],
    'sell': ['exit', 'remove', 'dump', 'selling', 'short', 'book'],
    'risk': ['safe', 'safety', 'danger', 'volatility', 'beta', 'risky'],
    'target': ['goal', 'upside', 'reach', 'expect', 'sl', 'stoploss', 'stop', 'level', 'levels'],
    'score': ['rating', 'grade', 'points', 'good', 'bad', 'quality', 'analysis', 'rank', 'fundamental', 'porter'],
    'health': ['status', 'summary', 'overview', 'doing', 'performance', 'report'],
    'allocation': ['distribute', 'divide', 'spread', 'invest', 'money', 'capital', 'funds'],
    'compare': ['versus', 'vs', 'difference', 'better'],
    'efficiency': ['trap', 'sizing', 'weight', 'balance']
};

function normalizeText(text) {
    let t = text.toLowerCase();
    for (const [key, synonyms] of Object.entries(NLP_SYNONYMS)) {
        for (const syn of synonyms) {
            const regex = new RegExp(`\\b${syn}\\b`, 'g');
            t = t.replace(regex, key);
        }
    }
    return t;
}

function mapQueryToIntent(query) {
    const rawQ = query.toLowerCase();
    const q = normalizeText(rawQ); 
    
    // 1. Identify Known Assets
    const knownAssets = Object.keys(stockAnalysis).filter(sym => {
        const s = sym.toLowerCase();
        const n = stockAnalysis[sym].name.toLowerCase();
        return new RegExp(`\\b${s}\\b`).test(rawQ) || rawQ.includes(n);
    });
    
    if (knownAssets.length > 0) {
        if (knownAssets.length === 1) stockyContext.lastAsset = knownAssets[0];
    }

    // 2. COMPARISON
    if (q.includes('compare')) {
        if (knownAssets.length >= 2) return { type: 'COMPARE', assets: knownAssets.slice(0, 2) };
        if (knownAssets.length === 1 && stockyContext.lastAsset && stockyContext.lastAsset !== knownAssets[0]) {
            return { type: 'COMPARE', assets: [stockyContext.lastAsset, knownAssets[0]] };
        }
    }

    // 3. SPECIFIC ASSET ANALYSIS (Known)
    let targetAsset = knownAssets.length > 0 ? knownAssets[0] : null;

    if (!targetAsset && stockyContext.lastAsset) {
        const contextTriggers = ['it', 'this', 'that', 'stock', 'share', 'company', ...NLP_SYNONYMS.score, ...NLP_SYNONYMS.target, ...NLP_SYNONYMS.risk];
        if (contextTriggers.some(w => q.includes(w))) {
            targetAsset = stockyContext.lastAsset;
        }
    }

    if (targetAsset) {
        let intentData = { asset: targetAsset };
        if (q.includes('target') || q.includes('level')) intentData.focus = 'LEVELS';
        else if (q.includes('risk')) intentData.focus = 'RISK';
        else if (q.includes('score') || q.includes('why') || q.includes('porter') || q.includes('fundamental')) intentData.focus = 'SCORE'; 
        else if (q.includes('buy') || q.includes('sell')) intentData.focus = 'SIGNAL'; 
        
        return { type: 'EXPLAIN', ...intentData };
    }

    // 4. UNKNOWN STOCK DETECTION (Watchlist-First)
    const fetchTriggers = ['analyze', 'check', 'explain', 'add', 'score', 'buy', 'sell'];
    if (fetchTriggers.some(t => q.includes(t))) {
        const words = rawQ.split(' ');
        for (let word of words) {
            const cleanWord = word.replace(/[^a-z0-9]/gi, '').toUpperCase();
            if (cleanWord.length >= 3 && cleanWord.length <= 12 && !NLP_SYNONYMS[cleanWord.toLowerCase()] && !fetchTriggers.includes(cleanWord.toLowerCase())) {
                if (!stockAnalysis[cleanWord]) {
                    return { type: 'FETCH_NEW', symbol: cleanWord };
                }
            }
        }
    }

    // 5. GLOBAL QUERIES
    if (q.includes('health') || (q.includes('my') && q.includes('portfolio'))) return { type: 'SUMMARY' };
    if (q.includes('risk')) return { type: 'RISK' };
    if (q.includes('efficiency')) return { type: 'EFFICIENCY' };

    // 6. ALLOCATION SIM
    const numberPattern = /[\d,]+(\.\d+)?\s*(k|l|cr|m|b|lakh|crore)?/i;
    const allocKeywords = ['allocate', 'invest', 'have', 'capital', 'fund'];
    
    if (allocKeywords.some(k => q.includes(k)) && numberPattern.test(rawQ)) {
        const amtMatch = rawQ.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|l|cr|m|b|lakh|crore)?/i);
        if (amtMatch) {
            let val = parseFloat(amtMatch[1].replace(/,/g, ''));
            const unit = (amtMatch[2] || '').toLowerCase();
            if (unit.startsWith('k')) val *= 1000;
            else if (unit.startsWith('l')) val *= 100000;
            else if (unit.startsWith('c')) val *= 10000000;
            else if (unit.startsWith('m')) val *= 1000000;
            else if (unit.startsWith('b')) val *= 1000000000;
            const reqAssets = knownAssets.length > 0 ? knownAssets : []; 
            return { type: 'ALLOCATION_SIM', amount: val, assets: reqAssets };
        }
    }

    if (stockyContext.lastAllocation && (q.includes('why') || q.includes('reason') || q.includes('logic'))) return { type: 'EXPLAIN_ALLOCATION' };

    return { type: 'UNSUPPORTED' };
}

// Logic to simulate portfolio allocation
function simulateCapitalAllocation(amount, specificAssets) {
    let candidates = [];
    if (specificAssets.length > 0) {
         candidates = specificAssets.map(sym => ({ sym, ...stockAnalysis[sym] })).filter(c => c.price > 0);
    } else {
         candidates = Object.entries(stockAnalysis).map(([sym, data]) => ({ sym, ...data })).filter(d => d.price > 0 && d.action === 'BUY NOW'); 
         if (candidates.length === 0) candidates = Object.entries(stockAnalysis).map(([sym, data]) => ({ sym, ...data })).filter(d => d.price > 0 && calculateFundamentalScore(d)?.total > 60);
    }

    if (candidates.length === 0) return "I couldn't find any high-conviction assets to simulate an allocation for right now.";

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

    stockyContext.lastAllocation = {
        topPicks: result.sort((a,b) => b.weight - a.weight).slice(0, 3),
        strategy: specificAssets.length > 0 ? "Specific Selection" : "Top Conviction Picks"
    };

    let response = `Here is a score-weighted allocation for ₹${amount.toLocaleString()}:\n\n`;
    response += `<table class="w-full text-xs border-collapse mb-2"><thead><tr class="border-b border-gray-200 text-left"><th class="py-1">Asset</th><th>Qty</th><th>Value</th></tr></thead><tbody>`;
    result.forEach(r => {
        response += `<tr class="border-b border-gray-50"><td class="py-1">${r.name}</td><td>${r.qty}</td><td>₹${r.value.toLocaleString()}</td></tr>`;
    });
    response += `</tbody></table>`;
    response += `\nUnused Cash: ₹${(amount - used).toLocaleString()}`;
    return response;
}

function getFollowUpSuggestions(intentType, contextData) {
    let suggestions = [];
    if (intentType === 'EXPLAIN' && contextData.asset) {
        const sym = contextData.asset;
        suggestions = [`What is the target for ${sym}?`, `Is ${sym} risky?`, `Compare ${sym} vs [Other]`];
    } else if (intentType === 'SUMMARY') {
        suggestions = ["Check my risk concentration", "Show efficiency report", "Invest 1 Lakh"];
    } else if (intentType === 'RISK') {
        suggestions = ["How to improve diversification?", "Show my capital efficiency"];
    } else if (intentType === 'ALLOCATION_SIM') {
        suggestions = ["Why did you choose these?", "Check portfolio health"];
    } else if (intentType === 'FETCH_NEW') {
        suggestions = [`Score for ${contextData.symbol}`, `Buy or Sell ${contextData.symbol}?`];
    }
    
    if (suggestions.length > 0) {
        return `\n\n<div class="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">${suggestions.map(s => `<span class="cursor-pointer text-[9px] bg-violet-50 text-violet-600 px-2 py-1 rounded-full border border-violet-100 hover:bg-violet-100" onclick="document.getElementById('stocky-input').value='${s}'; handleStockyMessage()">${s}</span>`).join('')}</div>`;
    }
    return '';
}

// HELPER: Improved Phrasing Logic
function formatExplanation(rawText, score) {
    if (!rawText) return "standard fundamental metrics";
    let text = rawText.replace(/\(.*\)/, '').trim(); // Remove (Sector) suffix
    
    // Dictionary of raw explanations mapped to NEUTRAL concepts
    const map = {
        "Stable": "steady growth profile",
        "Weak": "declining fundamentals",
        "Strong": "robust growth momentum",
        "Data Partial": "limited data availability",
        "Low Margin": "below-average margins",
        "Sales Drag": "slowing top-line sales",
        "Trend Strength": "technical momentum"
    };
    
    let baseText = map[text] || text.toLowerCase();

    // Contextual Adjustment based on Score
    if (score < 40 && text === "Stable") {
        return "stagnant growth (stability without upside)";
    }
    
    return baseText;
}

// Async Generator
async function generateStockyResponse(query) {
    const intent = mapQueryToIntent(query);
    let reply = "";

    switch (intent.type) {
        case 'FETCH_NEW':
            const sym = intent.symbol;
            addStockyMessage('bot', `I don't have <b>${sym}</b> in your list yet. \n\nAdding to Watchlist and analyzing...`);
            try {
                if (typeof portfolio !== 'undefined' && !portfolio[sym]) {
                    portfolio[sym] = { qty: 0, avg: 0 };
                    if (typeof switchTab === 'function') switchTab('watchlist'); 
                    if (typeof renderWatchlistItem === 'function') renderWatchlistItem(sym, true);
                    if (typeof createCardSkeleton === 'function') createCardSkeleton(sym);
                }
                if (typeof fetchAsset === 'function') {
                    await fetchAsset(sym); 
                } else {
                    throw new Error("Data engine unavailable");
                }
                if (stockAnalysis[sym]) {
                    intent.type = 'EXPLAIN';
                    intent.asset = sym;
                    stockyContext.lastAsset = sym;
                } else {
                    return `I tried to fetch <b>${sym}</b> but couldn't retrieve valid data. It might be delisted or a bad ticker.`;
                }
            } catch (e) {
                return `Failed to analyze <b>${sym}</b>. Network or Source error.`;
            }
            return generateStockyResponse(`explain ${sym}`);

        case 'SUMMARY':
            const health = portfolioAnalytics.healthScore || 0;
            let tone = "stable";
            if (health > 65) tone = "strong";
            if (health < 40) tone = "struggling";
            reply = `Based on my analysis, your portfolio's structural health is <b>${tone}</b> with a composite score of <b>${health}/100</b>.\n\nThis score reflects the weighted average quality of your holdings.`;
            break;

        case 'RISK':
            const divScore = portfolioAnalytics.risk.divScore || 0;
            const sectors = (portfolioAnalytics.risk.sectors || []).map(s => s[0]).join(', ');
            reply = `<b>Risk Profile:</b>\nDiversification Score: ${divScore}/100\n`;
            if (sectors) reply += `Sector Exposure: Heavily weighted in ${sectors}.`;
            else reply += `\n✅ Allocation looks balanced across sectors.`;
            break;

        case 'EFFICIENCY':
            const traps = (portfolioAnalytics.efficiency || []).filter(e => e.type === 'bad');
            if (traps.length > 0) reply = `I found some inefficiencies:\n${traps.map(t => `- ${t.text}`).join('\n')}\n\nConsider reallocating capital.`;
            else reply = `Your capital deployment looks efficient. No major "Capital Traps" detected.`;
            break;
            
        case 'ALLOCATION_SIM':
            reply = simulateCapitalAllocation(intent.amount, intent.assets);
            break;

        case 'EXPLAIN_ALLOCATION':
            const alloc = stockyContext.lastAllocation;
            if(!alloc) reply = "I haven't generated an allocation yet.";
            else reply = `I used a <b>Score-Weighted Strategy</b>. Assets with higher scores like <b>${alloc.topPicks[0].name}</b> received more capital.`;
            break;

        case 'EXPLAIN':
            const symbol = intent.asset;
            const data = stockAnalysis[symbol];
            if (!data) { reply = `I can't find data for ${symbol}.`; break; }
            
            let fScore = calculateFundamentalScore(data);
            if (fScore) fScore = normalizeFundamentalScore(fScore, data);
            const pScore = calculatePortersScore(data); 
            
            if (intent.focus === 'LEVELS' && data.levels) {
                reply = `<b>Levels for ${data.name}:</b>\n🎯 Target: ₹${data.levels.target ? data.levels.target.toLocaleString() : 'N/A'}\n🛑 Stop/Entry: ₹${(data.levels.sl || data.levels.entry).toLocaleString()}`;
            } else if (intent.focus === 'RISK') {
                reply = `<b>Risk Assessment (${data.name}):</b>\nRisk Score: ${fScore.risk}/20\nBeta: ${data.beta || 'N/A'}\nVerdict: ${data.beta > 1.2 ? 'High Volatility' : 'Stable'}`;
            } else {
                // IMPROVED PHRASING LOGIC
                const score = fScore.total;
                const reason = formatExplanation(data.explanation, score);
                const action = data.action;
                
                // Porter Analysis
                const porterVal = pScore ? pScore.total : 'N/A';
                let porterText = "";
                if (pScore) {
                    if (pScore.total > 60) porterText = "High Moat";
                    else if (pScore.total < 40) porterText = "Low Moat";
                    else porterText = "Moderate Moat";
                }

                let narrative = "";
                if (score >= 65) {
                    narrative = `This high score reflects <b>${reason}</b>, supporting a bullish outlook.`;
                } else if (score <= 40) {
                    // Logic fix: Don't blame "steady growth" for a low score.
                    if (reason.includes("steady") || reason.includes("consistent")) {
                        narrative = `While showing <b>${reason}</b>, the stock is currently penalized for low valuation appeal or sector-specific risks.`;
                    } else {
                        narrative = `The score is weighed down by <b>${reason}</b>, suggesting caution.`;
                    }
                } else {
                    narrative = `The fundamentals show <b>${reason}</b>, which is decent but indicates it's better to hold or wait for a dip.`;
                }

                let entryTxt = data.levels.entry ? `Look to enter around <b>₹${data.levels.entry.toLocaleString()}</b>.` : `Watch the stop loss at <b>₹${data.levels.sl.toLocaleString()}</b>.`;

                reply = `<b>${data.name} Analysis</b>\n\nMy Verdict: <b>${action}</b>\n\n<b>Scores:</b>\n- Fundamental: <b>${score}/100</b> (Timing/Health)\n- Porter's 5: <b>${porterVal}/100</b> (${porterText})\n\n${narrative}\n\n${entryTxt}`;
            }
            break;

        case 'COMPARE':
            const [symA, symB] = intent.assets;
            const d1 = stockAnalysis[symA];
            const d2 = stockAnalysis[symB];
            if (!d1 || !d2) { reply = "I need data for both assets."; break; }
            
            let s1 = calculateFundamentalScore(d1); if(s1) s1 = normalizeFundamentalScore(s1, d1);
            let s2 = calculateFundamentalScore(d2); if(s2) s2 = normalizeFundamentalScore(s2, d2);
            let p1 = calculatePortersScore(d1);
            let p2 = calculatePortersScore(d2);
            
            reply = `<div class="font-bold mb-1">Comparison: ${d1.name} vs ${d2.name}</div><table class="w-full text-xs border border-gray-200 rounded"><tr class="bg-gray-50"><th class="p-1 text-left">Metric</th><th class="p-1 text-right">${d1.name.substr(0,4)}</th><th class="p-1 text-right">${d2.name.substr(0,4)}</th></tr><tr class="border-t"><td class="p-1">Fundamental</td><td class="p-1 text-right font-bold">${s1.total}</td><td class="p-1 text-right font-bold">${s2.total}</td></tr><tr class="border-t"><td class="p-1">Porter's (Quality)</td><td class="p-1 text-right">${p1 ? p1.total : '-'}</td><td class="p-1 text-right">${p2 ? p2.total : '-'}</td></tr><tr class="border-t"><td class="p-1">Signal</td><td class="p-1 text-right">${d1.action}</td><td class="p-1 text-right">${d2.action}</td></tr></table><div class="mt-2 text-[10px] italic">System favors ${d1.action === 'BUY NOW' && d2.action !== 'BUY NOW' ? d1.name : (d2.action === 'BUY NOW' && d1.action !== 'BUY NOW' ? d2.name : "neither based on signal")}.</div>`;
            break;

        default:
            reply = `I analyze portfolio structure and risk. Try asking:\n- "Is my portfolio safe?"\n- "Should I buy TCS?"\n- "Compare HDFC and ICICI"`;
    }

    reply += getFollowUpSuggestions(intent.type, intent);
    return reply;
}
