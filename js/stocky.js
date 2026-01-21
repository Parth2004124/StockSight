// --- STOCKY INTELLIGENCE MODULE ---

// Local state for the bot - PERSISTENT CONTEXT
let stockyContext = { 
    lastAsset: null,       // The last stock symbol discussed (e.g., "TCS")
    lastIntent: null,      // The last action performed (e.g., "EXPLAIN")
    lastAllocation: null   // Data from the last allocation simulation
};

// Main Handler called by the UI
function handleStockyMessage() {
    const input = document.getElementById('stocky-input');
    const msg = input.value.trim();
    if (!msg) return;
    
    // UI: Add User Message
    addStockyMessage('user', msg);
    input.value = '';
    
    // Logic: Generate Response with delay
    setTimeout(() => {
        const response = generateStockyResponse(msg);
        addStockyMessage('bot', response);
    }, 600);
}

// --- NLP ENGINE ---

// 1. Synonym Dictionary for Normalization
const NLP_SYNONYMS = {
    'buy': ['purchase', 'invest', 'add', 'get', 'buying'],
    'sell': ['exit', 'remove', 'dump', 'selling', 'short'],
    'risk': ['safe', 'safety', 'danger', 'volatility', 'beta', 'risky'],
    'target': ['goal', 'upside', 'reach', 'expect', 'sl', 'stoploss', 'stop', 'level', 'levels'],
    'score': ['rating', 'grade', 'points', 'good', 'bad', 'quality', 'analysis', 'rank'],
    'health': ['status', 'summary', 'overview', 'doing', 'performance', 'report'],
    'allocation': ['distribute', 'divide', 'spread', 'invest', 'money', 'capital', 'funds'],
    'compare': ['versus', 'vs', 'difference', 'better'],
    'efficiency': ['trap', 'sizing', 'weight', 'balance']
};

function normalizeText(text) {
    let t = text.toLowerCase();
    // Replace synonyms with canonical keys
    for (const [key, synonyms] of Object.entries(NLP_SYNONYMS)) {
        for (const syn of synonyms) {
            // Regex to replace whole words only
            const regex = new RegExp(`\\b${syn}\\b`, 'g');
            t = t.replace(regex, key);
        }
    }
    return t;
}

// 2. Map text inputs to specific actions
function mapQueryToIntent(query) {
    const rawQ = query.toLowerCase();
    const q = normalizeText(rawQ); // Normalized query
    
    // A. IDENTIFY ASSETS
    // Look for ticker symbols or company names in the full sentence
    const assets = Object.keys(stockAnalysis).filter(sym => {
        const s = sym.toLowerCase();
        const n = stockAnalysis[sym].name.toLowerCase();
        // Check exact symbol match as a word, or name inclusion
        return new RegExp(`\\b${s}\\b`).test(rawQ) || rawQ.includes(n);
    });
    
    // Update Context if asset found
    if (assets.length > 0) {
        // If multiple assets found, pick the first two for comparison logic
        // Otherwise set primary
        if (assets.length === 1) stockyContext.lastAsset = assets[0];
        // If 2+, user might be comparing, update lastAsset to the first one found or handle in logic
    }

    // B. INTENT DETECTION RULES

    // 1. COMPARISON ("Which is better, TCS or Infosys?", "Compare HDFC vs ICICI")
    if (q.includes('compare')) {
        if (assets.length >= 2) return { type: 'COMPARE', assets: assets.slice(0, 2) };
        if (assets.length === 1 && stockyContext.lastAsset && stockyContext.lastAsset !== assets[0]) {
            return { type: 'COMPARE', assets: [stockyContext.lastAsset, assets[0]] };
        }
    }

    // 2. SPECIFIC ASSET ANALYSIS ("Is TCS a good buy?", "Tell me about Reliance", "Should I exit HDFCBANK?")
    // If an asset is mentioned, OR we have context + a trigger word
    let targetAsset = assets.length > 0 ? assets[0] : null;
    let isContextual = false;

    if (!targetAsset && stockyContext.lastAsset) {
        // Check for pronouns or implied context
        const contextTriggers = ['it', 'this', 'that', 'stock', 'share', 'company', ...NLP_SYNONYMS.score, ...NLP_SYNONYMS.target, ...NLP_SYNONYMS.risk];
        if (contextTriggers.some(w => q.includes(w))) {
            targetAsset = stockyContext.lastAsset;
            isContextual = true;
        }
    }

    if (targetAsset) {
        let intentData = { asset: targetAsset };
        
        // Drill-down logic based on keywords in the sentence
        if (q.includes('target') || q.includes('level')) intentData.focus = 'LEVELS';
        else if (q.includes('risk')) intentData.focus = 'RISK';
        else if (q.includes('score') || q.includes('why')) intentData.focus = 'SCORE'; // Default explanation
        else if (q.includes('buy') || q.includes('sell')) intentData.focus = 'SIGNAL'; // Specific signal query
        
        return { type: 'EXPLAIN', ...intentData };
    }

    // 3. GLOBAL PORTFOLIO QUERIES (No specific asset)
    
    // "How is my portfolio doing?", "Give me a health check"
    if (q.includes('health') || (q.includes('my') && q.includes('portfolio'))) {
        return { type: 'SUMMARY' };
    }

    // "Am I too concentrated?", "Check my risk"
    if (q.includes('risk')) { 
        return { type: 'RISK' };
    }

    // "Are there any traps?", "Is my sizing ok?"
    if (q.includes('efficiency')) {
        return { type: 'EFFICIENCY' };
    }

    // 4. ALLOCATION SIMULATOR ("I have 5 Lakhs", "Allocate 50k", "Invest 10,000")
    // Broader regex to catch numbers in sentences
    const numberPattern = /[\d,]+(\.\d+)?\s*(k|l|cr|m|b|lakh|crore)?/i;
    const allocKeywords = ['allocate', 'invest', 'have', 'capital', 'fund'];
    
    // Check if sentence contains allocation intent AND a number
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

            const reqAssets = assets.length > 0 ? assets : []; 
            return { type: 'ALLOCATION_SIM', amount: val, assets: reqAssets };
        }
    }

    // 5. EXPLAIN ALLOCATION ("Why did you pick these?", "Reason for this?")
    if (stockyContext.lastAllocation && (q.includes('why') || q.includes('explain') || q.includes('reason')) && (q.includes('allocation') || q.includes('chose') || q.includes('this'))) {
        return { type: 'EXPLAIN_ALLOCATION' };
    }

    return { type: 'UNSUPPORTED' };
}

// Logic to simulate portfolio allocation
function simulateCapitalAllocation(amount, specificAssets) {
    let candidates = [];
    
    if (specificAssets.length > 0) {
         candidates = specificAssets.map(sym => ({ sym, ...stockAnalysis[sym] })).filter(c => c.price > 0);
    } else {
         // Auto-pick top BUY candidates
         candidates = Object.entries(stockAnalysis)
            .map(([sym, data]) => ({ sym, ...data }))
            .filter(d => d.price > 0 && d.action === 'BUY NOW'); 
         
         // Fallback if no explicit BUYs
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
    // Recalculate scores purely for weighting
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

    let response = `Here is a score-weighted allocation for ₹${amount.toLocaleString()}:\n\n`;
    response += `<table class="w-full text-xs border-collapse mb-2">
        <thead><tr class="border-b border-gray-200 text-left"><th class="py-1">Asset</th><th>Qty</th><th>Value</th></tr></thead>
        <tbody>`;
    result.forEach(r => {
        response += `<tr class="border-b border-gray-50"><td class="py-1">${r.name}</td><td>${r.qty}</td><td>₹${r.value.toLocaleString()}</td></tr>`;
    });
    response += `</tbody></table>`;
    response += `\nUnused Cash: ₹${(amount - used).toLocaleString()}`;
    return response;
}

// HELPER: Generate Suggested Follow-ups
function getFollowUpSuggestions(intentType, contextData) {
    let suggestions = [];
    
    if (intentType === 'EXPLAIN' && contextData.asset) {
        const sym = contextData.asset;
        suggestions = [
            `What is the target for ${sym}?`,
            `Is ${sym} risky?`,
            `Compare ${sym} vs [Other Stock]`
        ];
    } else if (intentType === 'SUMMARY') {
        suggestions = [
            "Check my risk concentration",
            "Show efficiency report",
            "Invest 1 Lakh"
        ];
    } else if (intentType === 'RISK') {
        suggestions = [
            "How to improve diversification?",
            "Show my capital efficiency",
            "Any capital traps?"
        ];
    } else if (intentType === 'ALLOCATION_SIM') {
        suggestions = [
            "Why did you choose these?",
            "Check portfolio health",
            "Invest 50k in [Stock]"
        ];
    } else if (intentType === 'COMPARE') {
        suggestions = [
            "Which one is safer?",
            "Invest 50k in the better one",
            "Analyze [Winner]"
        ];
    }

    if (suggestions.length > 0) {
        return `\n\n<div class="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
            ${suggestions.map(s => `<span class="cursor-pointer text-[9px] bg-violet-50 text-violet-600 px-2 py-1 rounded-full border border-violet-100 hover:bg-violet-100" onclick="document.getElementById('stocky-input').value='${s}'; handleStockyMessage()">${s}</span>`).join('')}
        </div>`;
    }
    return '';
}

// Core Response Generator
function generateStockyResponse(query) {
    const intent = mapQueryToIntent(query);
    let reply = "";

    switch (intent.type) {
        case 'SUMMARY':
            const health = portfolioAnalytics.healthScore || 0;
            let tone = "stable";
            if (health > 65) tone = "strong";
            if (health < 40) tone = "struggling";
            reply = `Based on my analysis, your portfolio's structural health is **${tone}** with a composite score of **${health}/100**.\n\nThis score reflects the weighted average quality of your holdings.`;
            break;

        case 'RISK':
            const divScore = portfolioAnalytics.risk.divScore || 0;
            const sectors = (portfolioAnalytics.risk.sectors || []).map(s => s[0]).join(', ');
            const alerts = portfolioAnalytics.risk.alerts || [];
            reply = `**Risk Profile:**\nDiversification Score: ${divScore}/100\n`;
            if (sectors) reply += `Sector Exposure: Heavily weighted in ${sectors}.\n`;
            if (alerts.length > 0) reply += `\n⚠️ **Flags Detected:**\n${alerts.map(a => `- ${a}`).join('\n')}`;
            else reply += `\n✅ Allocation looks balanced across sectors and assets.`;
            break;

        case 'EFFICIENCY':
            const eff = portfolioAnalytics.efficiency || [];
            const traps = eff.filter(e => e.type === 'bad');
            if (traps.length > 0) {
                reply = `I found some inefficiencies:\n${traps.map(t => `- ${t.text}`).join('\n')}\n\nConsider reallocating capital from these lower-quality assets.`;
            } else {
                reply = `Your capital deployment looks efficient. I don't see any major "Capital Traps" (high allocation in low-score stocks).`;
            }
            break;
            
        case 'ALLOCATION_SIM':
            reply = simulateCapitalAllocation(intent.amount, intent.assets);
            break;

        case 'EXPLAIN_ALLOCATION':
            const alloc = stockyContext.lastAllocation;
            if(!alloc) {
                reply = "I haven't generated an allocation yet. Ask me to 'Invest 1 Lakh' first.";
            } else {
                const names = alloc.topPicks.map(p => `${p.name}`).join(', ');
                reply = `I used a **Score-Weighted Strategy**.\n\nAssets with higher fundamental scores received proportionally more capital. **${names}** anchored the allocation because they have the highest quality scores in the set.`;
            }
            break;

        case 'EXPLAIN':
            const symbol = intent.asset;
            const data = stockAnalysis[symbol];
            if (!data) {
                reply = `I can't find data for ${symbol}. Please add it to your watchlist first.`;
                break;
            }
            
            let fScore = calculateFundamentalScore(data);
            if (fScore) fScore = normalizeFundamentalScore(fScore, data);
            
            // Handle specific focus areas
            if (intent.focus === 'LEVELS' && data.levels) {
                reply = `**Levels for ${data.name}:**\n🎯 Target: ₹${data.levels.target ? data.levels.target.toLocaleString() : 'N/A'}\n🛑 Stop/Entry: ₹${(data.levels.sl || data.levels.entry).toLocaleString()}`;
            } else if (intent.focus === 'RISK') {
                reply = `**Risk Assessment (${data.name}):**\nRisk Score: ${fScore.risk}/20\nBeta (Volatility): ${data.beta || 'N/A'}\nVerdict: ${data.beta > 1.2 ? 'High Volatility' : 'Stable'}`;
            } else if (intent.focus === 'SIGNAL') {
                 reply = `**${data.name}** is currently a **${data.action}**.\nScore: ${fScore.total}/100. ${data.explanation}`;
            } else {
                // Default Full Explanation
                const actionText = data.action === 'BUY NOW' ? 'showing structural strength' : 'indicating caution';
                reply = `**${data.name} Analysis**\n\nSignal: **${data.action}** (Score: ${fScore.total})\n\nDriven by ${data.explanation || 'fundamentals'}, ${actionText}.\n\nKey Levels:\nEntry/SL: ₹${(data.levels.sl || data.levels.entry || 0).toLocaleString()}`;
            }
            break;

        case 'COMPARE':
            const [symA, symB] = intent.assets;
            const d1 = stockAnalysis[symA];
            const d2 = stockAnalysis[symB];
            if (!d1 || !d2) {
                reply = "I need valid data for both assets to compare them.";
                break;
            }
            
            let s1 = calculateFundamentalScore(d1); if(s1) s1 = normalizeFundamentalScore(s1, d1);
            let s2 = calculateFundamentalScore(d2); if(s2) s2 = normalizeFundamentalScore(s2, d2);
            const score1 = s1 ? s1.total : '--';
            const score2 = s2 ? s2.total : '--';

            reply = `<div class="font-bold mb-1">Comparison: ${d1.name} vs ${d2.name}</div>
            <table class="w-full text-xs border border-gray-200 rounded">
                <tr class="bg-gray-50"><th class="p-1 text-left">Metric</th><th class="p-1 text-right">${d1.name.substr(0,4)}</th><th class="p-1 text-right">${d2.name.substr(0,4)}</th></tr>
                <tr class="border-t"><td class="p-1">Score</td><td class="p-1 text-right font-bold">${score1}</td><td class="p-1 text-right font-bold">${score2}</td></tr>
                <tr class="border-t"><td class="p-1">Signal</td><td class="p-1 text-right">${d1.action}</td><td class="p-1 text-right">${d2.action}</td></tr>
                <tr class="border-t"><td class="p-1">Price</td><td class="p-1 text-right">₹${d1.price}</td><td class="p-1 text-right">₹${d2.price}</td></tr>
            </table>
            <div class="mt-2 text-[10px] italic">System favors ${d1.action === 'BUY NOW' && d2.action !== 'BUY NOW' ? d1.name : (d2.action === 'BUY NOW' && d1.action !== 'BUY NOW' ? d2.name : "neither based on signal")}.</div>`;
            break;

        case 'UNSUPPORTED':
        default:
            reply = `I understand portfolio structure and risk, but I didn't catch that.\n\nTry asking naturally:\n- "Is my portfolio safe?"\n- "Should I buy TCS?"\n- "Compare HDFC and ICICI"\n- "Invest 50k for me"`;
            break;
    }

    // Append Smart Suggestions
    reply += getFollowUpSuggestions(intent.type, intent);
    return reply;
}
