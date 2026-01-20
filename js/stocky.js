// --- STOCKY INTELLIGENCE MODULE ---

// Local state for the bot
let stockyContext = { 
    lastAsset: null, 
    lastAllocation: null 
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

// Map text inputs to specific actions
function mapQueryToIntent(query) {
    const q = query.toLowerCase();
    
    // Find mentioned assets
    // Relies on global 'stockAnalysis' object from app.js
    const assets = Object.keys(stockAnalysis).filter(sym => 
        q.includes(sym.toLowerCase()) || 
        q.includes(stockAnalysis[sym].name.toLowerCase())
    );
    
    // CONTEXT: Handle Follow-ups (e.g. "Is it a buy?")
    if (assets.length === 0 && stockyContext.lastAsset) {
        const contextKeywords = ['target', 'entry', 'stop', 'score', 'why', 'buy', 'sell', 'analysis', 'fundamental', 'it', 'this'];
        if (contextKeywords.some(k => q.includes(k))) {
            assets.push(stockyContext.lastAsset);
        }
    }
    
    // CONTEXT: Handle Comparative Follow-up ("Compare with TCS")
    if ((q.includes('compare') || q.includes(' vs ') || q.includes('better')) && 
        assets.length === 1 && 
        stockyContext.lastAsset && 
        stockyContext.lastAsset !== assets[0]) {
        assets.unshift(stockyContext.lastAsset);
    }

    // Update Context for next turn
    if (assets.length > 0) {
        stockyContext.lastAsset = assets[0];
    }

    // --- INTENT MATCHING ---

    // 1. Comparison
    if ((q.includes('compare') || q.includes('better') || q.includes(' vs ')) && assets.length >= 2) {
        return { type: 'COMPARE', assets: assets.slice(0, 2) };
    }

    // 2. Asset Explanation
    if (assets.length > 0 && (q.includes('explain') || q.includes('score') || q.includes('analysis') || q.includes('buy') || q.includes('sell') || q.includes('why') || assets.length === 1)) {
        return { type: 'EXPLAIN', asset: assets[0] };
    }

    // 3. Portfolio Summary
    if (q.includes('health') || q.includes('summary') || q.includes('overview') || q.includes('score')) {
        return { type: 'SUMMARY' };
    }

    // 4. Risk Analysis
    if (q.includes('risk') || q.includes('concentrat') || q.includes('diversif') || q.includes('exposure')) {
        return { type: 'RISK' };
    }

    // 5. Allocation Simulation (Regex for "10k", "5L", etc.)
    const amtMatch = q.match(/(?:rs\.?|₹|inr)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|l|cr|m|b)?/i) || 
                     q.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|l|cr|m|b)/i) || 
                     q.match(/(?:allocate|have|invest)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    
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

    // 6. Explain Allocation (Follow-up)
    if (stockyContext.lastAllocation && (q.includes('why') || q.includes('explain') || q.includes('reason')) && (q.includes('allocation') || q.includes('chose') || q.includes('this'))) {
        return { type: 'EXPLAIN_ALLOCATION' };
    }

    // 7. Efficiency Check
    if (q.includes('allocation') || q.includes('efficien') || q.includes('trap') || q.includes('size')) {
        return { type: 'EFFICIENCY' };
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

// Core Response Generator
function generateStockyResponse(query) {
    const intent = mapQueryToIntent(query);

    switch (intent.type) {
        case 'SUMMARY':
            // Relies on portfolioAnalytics from app.js
            const health = portfolioAnalytics.healthScore || 0;
            let tone = "stable";
            if (health > 65) tone = "strong";
            if (health < 40) tone = "struggling";
            return `Your portfolio's structural health is currently ${tone} with a composite score of ${health}. This score is a weighted average of the fundamental quality of your individual holdings.`;

        case 'RISK':
            const divScore = portfolioAnalytics.risk.divScore || 0;
            const sectors = (portfolioAnalytics.risk.sectors || []).map(s => s[0]).join(', ');
            const alerts = portfolioAnalytics.risk.alerts || [];
            let reply = `Diversification Score: ${divScore}/100.\n`;
            if (sectors) reply += `Major Exposures: ${sectors}.\n`;
            if (alerts.length > 0) reply += `\n⚠️ Flags: ${alerts[0]}`;
            else reply += `\n✅ Allocation looks balanced.`;
            return reply;

        case 'EFFICIENCY':
            const eff = portfolioAnalytics.efficiency || [];
            const traps = eff.filter(e => e.type === 'bad');
            if (traps.length > 0) {
                return `Potential Capital Inefficiency: ${traps[0].text}. This suggests a high allocation in a lower-quality asset.`;
            }
            return `Capital deployment looks efficient. No major "Capital Traps" detected.`;
            
        case 'ALLOCATION_SIM':
            return simulateCapitalAllocation(intent.amount, intent.assets);

        case 'EXPLAIN_ALLOCATION':
            const alloc = stockyContext.lastAllocation;
            const names = alloc.topPicks.map(p => `${p.name}`).join(', ');
            return `I used a score-weighted model (${alloc.strategy}). Assets with higher fundamental scores received proportionally more capital. ${names} anchored the allocation due to their high quality scores.`;

        case 'EXPLAIN':
            const symbol = intent.asset;
            const data = stockAnalysis[symbol];
            if (!data) return "I can't access data for that symbol right now.";
            
            // Re-calc score to be safe
            let fScore = calculateFundamentalScore(data);
            if (fScore) fScore = normalizeFundamentalScore(fScore, data);
            
            const actionText = data.action === 'BUY NOW' ? 'structural strength' : 'caution';
            
            return `**${data.name}**\nSignal: ${data.action}\n\nDriven by ${data.explanation || 'fundamentals'}, resulting in a conviction that suggests ${actionText}. \n\n${data.levels ? `Key Levels:\nEntry/SL: ₹${(data.levels.sl || data.levels.entry || 0).toLocaleString()}` : ''}`;

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
            return `I analyze portfolio structure, risk, and scoring rules.\n\nTry asking:\n- "How is my Health?"\n- "Explain [Stock Name]"\n- "Allocate 1 Lakh"`;
    }
}
