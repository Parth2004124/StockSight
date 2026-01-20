// --- CONFIGURATION ---
const INDUSTRY_PROFILES = {
    'BANKING': { 
        keywords: ['BANK', 'FINANCE', 'CAPITAL', 'HOLDINGS', 'INVEST', 'BAJAJ', 'HDFC', 'ICICI', 'KOTAK', 'AXIS', 'SBI', 'CHOLA', 'MUTHOOT'], 
        weights: { business: 1.1, moat: 1.2, management: 1.0, risk: 0.9 }, 
        required: ['roe'] 
    },
    'IT': { 
        keywords: ['TECH', 'INFOSYS', 'TCS', 'WIPRO', 'HCL', 'MINDTREE', 'LTIM', 'PERSISTENT', 'COFORGE', 'SYSTEMS', 'SOFTWARE', 'DATA'], 
        weights: { business: 1.2, moat: 1.0, management: 1.1, risk: 1.0 }, 
        required: ['opm'] 
    },
    'FMCG': { 
        keywords: ['HUL', 'NESTLE', 'BRITANNIA', 'DABUR', 'GODREJ', 'MARICO', 'TATA CONSUMER', 'ITC', 'FOODS', 'CONSUMER', 'VARUN'],
        weights: { business: 1.0, moat: 1.3, management: 1.1, risk: 1.0 }, 
        required: ['roce']
    },
    'PHARMA': { 
        keywords: ['PHARMA', 'LAB', 'DRUG', 'REDDY', 'SUN', 'CIPLA', 'DIVIS', 'LUPIN', 'ALKEM', 'TORRENT'],
        weights: { business: 1.1, moat: 1.0, management: 1.0, risk: 0.9 },
        required: []
    },
    'AUTO': {
        keywords: ['MOTOR', 'AUTO', 'MARUTI', 'MAHINDRA', 'TATA MOTORS', 'EICHER', 'BAJAJ AUTO', 'TVS'],
        weights: { business: 1.2, moat: 0.9, management: 1.0, risk: 0.9 },
        required: []
    },
    'POWER': {
        keywords: ['POWER', 'ENERGY', 'NTPC', 'ADANI', 'GRID', 'TATA POWER', 'NHPC', 'JSW ENERGY'],
        weights: { business: 1.0, moat: 1.2, management: 0.9, risk: 0.8 },
        required: []
    },
    'REAL_ESTATE': {
        keywords: ['REALTY', 'DLF', 'GODREJ PROP', 'OBEROI', 'PRESTIGE', 'LODHA', 'MACROTECH'],
        weights: { business: 1.1, moat: 0.8, management: 1.0, risk: 0.8 },
        required: []
    },
    'GENERAL': {
        keywords: [],
        weights: { business: 1.0, moat: 1.0, management: 1.0, risk: 1.0 },
        required: []
    }
};

// --- HELPER FUNCTIONS ---
function cleanTicker(sym) {
    if(!sym) return '';
    return sym.replace(/\.NS$/, '').replace(/\.BO$/, '').replace(/:NSE$/, '').replace(/:BSE$/, '');
}

function getDisplayName(sym) {
    if (typeof stockAnalysis !== 'undefined' && stockAnalysis[sym]) {
        return stockAnalysis[sym].name || cleanTicker(sym);
    }
    return cleanTicker(sym);
}

function calculateMFReturns(history) {
    if(!history || !Array.isArray(history) || history.length < 10) return { r1y:0, r3y:0, r5y:0 };
    const now = parseFloat(history[0].nav);
    const parseDate = (dStr) => { 
        const [d, m, y] = dStr.split('-'); 
        return new Date(`${y}-${m}-${d}`); 
    };
    const findNavAgo = (years) => {
        const targetDate = new Date();
        targetDate.setFullYear(targetDate.getFullYear() - years);
        const entry = history.find(h => parseDate(h.date) <= targetDate);
        return entry ? parseFloat(entry.nav) : null;
    };
    const r1yNav = findNavAgo(1); 
    const r3yNav = findNavAgo(3); 
    const r5yNav = findNavAgo(5);
    const cagr = (end, start, years) => ((Math.pow(end/start, 1/years) - 1) * 100);
    return { 
        r1y: r1yNav ? cagr(now, r1yNav, 1) : 0, 
        r3y: r3yNav ? cagr(now, r3yNav, 3) : 0, 
        r5y: r5yNav ? cagr(now, r5yNav, 5) : 0 
    };
}

// --- CORE SCORING LOGIC ---

function calculateFundamentalScore(data) {
    let scores = { business: 0, moat: 0, management: 0, risk: 0, total: 0, explanation: "" };
    let reasons = [];
    
    if (data.type === 'FUND' || data.type === 'ETF') {
        const ret1y = data.returns?.r1y || 0;
        const ret3y = data.returns?.r3y || 0;
        const ret5y = data.returns?.r5y || 0;
        const price = data.price || 0;
        const high52 = data.technicals?.high52 || price;
        
        if (data.type === 'FUND' || (data.source !== 'Google' && ret1y !== 0)) {
                let totalScore = 0;
                if (ret1y > 15) totalScore += 40; else if (ret1y > 10) totalScore += 30; else if (ret1y > 0) totalScore += 15;
                if (ret3y > 12) totalScore += 30; else if (ret3y > 8) totalScore += 20; else if (ret3y > 0) totalScore += 10;
                if (ret5y > 10) totalScore += 30; else if (ret5y > 8) totalScore += 20; else if (ret5y > 0) totalScore += 10;
                
                scores.total = Math.min(99, totalScore);
                scores.business = Math.min(40, Math.round(totalScore * 0.4));
                scores.moat = Math.min(20, Math.round(totalScore * 0.3));
                scores.management = Math.min(20, Math.round(totalScore * 0.2));
                scores.risk = ret1y > ret3y ? 20 : 10;
                scores.explanation = "Based on Returns";
        } 
        else if (high52 > 0) {
            const low52 = data.technicals?.low52 || (high52 * 0.7); 
            const range = high52 - low52;
            const position = ((price - low52) / range) * 100;
            scores.total = Math.min(99, Math.round(20 + (position * 0.7))); 
            scores.business = Math.round(scores.total * 0.4);
            scores.moat = Math.round(scores.total * 0.2);
            scores.management = Math.round(scores.total * 0.2);
            scores.risk = Math.round(scores.total * 0.2);
            scores.explanation = "Trend Strength";
        } else {
                return null;
        }
    } 
    else {
        const roe = data.roe || 0;
        const roce = data.roce || 0; 
        const salesGrowth = data.growth || 0; 
        const profitGrowth = data.profitGrowth || 0;
        const opm = data.opm || 0; 
        const pe = data.pe || 0;
        const mcap = data.mcap || 0; 
        const beta = data.beta || 1.0;
        const ret1y = data.returns?.r1y || 0;
        const name = (data.name || '').toUpperCase();

        const isAutoOrPower = name.includes("MOTORS") || name.includes("AUTO") || name.includes("POWER") || name.includes("ENERGY") || name.includes("STEEL");
        const isFinancial = !isAutoOrPower && ((roce < 12 && roe > 15) || (name.includes("FINANCE") || name.includes("BANK") || name.includes("CAPITAL") || name.includes("HOLDINGS")));
        
        // Sales Growth
        if (salesGrowth > 15) scores.business += 15; 
        else if (salesGrowth > 8) scores.business += 10; 
        else if (salesGrowth > 0) scores.business += 5;
        else if (salesGrowth > -10) { scores.business += 2; reasons.push("Sales Drag"); }

        // Profit Growth
        if (profitGrowth > 15) scores.business += 15; 
        else if (profitGrowth > 8) scores.business += 10; 
        else if (profitGrowth > 0) scores.business += 5;
        else if (profitGrowth > -20) { scores.business += 2; reasons.push("Profit Drag"); }

        if (isFinancial) { 
            if (roe > 15) scores.business += 10; else if (roe > 10) scores.business += 5; else if (roe > 5) scores.business += 2;
        } else { 
            if (opm > 20) scores.business += 10; 
            else if (opm > 12) scores.business += 5;
            else if (opm > 8) { scores.business += 2; reasons.push("Low Margin"); }
        }
        scores.business = Math.min(40, scores.business);

        if (isFinancial) { if (roe > 18) scores.moat += 8; else if (roe > 12) scores.moat += 5; }
        else { if (opm > 18) scores.moat += 5; if (roce > 20) scores.moat += 5; }
        if (mcap > 20000) scores.moat += 5; else if (mcap > 5000) scores.moat += 3;
        if (profitGrowth > salesGrowth) scores.moat += 5; 
        if (ret1y > 40) scores.moat = Math.max(scores.moat + 5, 18);
        scores.moat = Math.min(20, scores.moat);

        if (pe > 0) {
            if (pe < 15 && (profitGrowth > 10 || roe > 15)) scores.management += 20; 
            else if (pe < 25) scores.management += 10;
            else if (pe < 60) scores.management += 5;
        } else {
            if (mcap > 50000) { scores.management += 10; reasons.push("Turnaround Giant"); }
            else if (mcap > 10000) { scores.management += 5; reasons.push("Recovering"); }
        }
        scores.management = Math.min(20, scores.management);

        // MINIMUM CAPS LOGIC
        if (mcap > 0) {
            if (mcap < 500) { scores.risk -= 10; reasons.push("Micro Cap Risk"); } 
            else if (mcap > 5000) scores.risk += 10; 
            else if (mcap > 2000) scores.risk += 5;
        }
        if (ret1y > 40) scores.risk += 10; else { if (beta < 1.1) scores.risk += 10; else if (beta < 1.3) scores.risk += 5; }
        scores.risk = Math.max(0, Math.min(20, scores.risk));

        scores.total = scores.business + scores.moat + scores.management + scores.risk;

        if (pe < 15 && roe > 15 && profitGrowth > 0) { scores.total += 15; reasons.push("High Quality Value"); }
        else if (pe < 12 && profitGrowth > 10) { scores.total += 10; reasons.push("Deep Value"); }

        scores.total = Math.min(99, scores.total); 
        if (reasons.length > 0) scores.explanation = reasons.slice(0, 2).join(" & ");
        else scores.explanation = scores.total > 50 ? "Stable" : "Weak";
    }
    return scores;
}

function calculatePortersScore(data) {
    if (data.type !== 'STOCK') return null;

    const roe = data.roe || 0;
    const roce = data.roce || 0;
    const salesGrowth = data.growth || 0;
    const profitGrowth = data.profitGrowth || 0;
    const opm = data.opm || 0;
    const mcap = data.mcap || 0;

    let pScore = { entrants: 0, suppliers: 0, buyers: 0, substitutes: 0, rivalry: 0, total: 0 };

    if (mcap > 10000 && roce > 20) pScore.entrants = 20;
    else if (mcap > 5000 && roce > 15) pScore.entrants = 15;
    else if (mcap > 2000) pScore.entrants = 10;
    else pScore.entrants = 5;

    if (opm > 25) pScore.suppliers = 20;
    else if (opm > 18) pScore.suppliers = 15;
    else if (opm > 10) pScore.suppliers = 10;
    else pScore.suppliers = 5;

    if (roe > 22) pScore.buyers = 20;
    else if (roe > 16) pScore.buyers = 15;
    else if (roe > 12) pScore.buyers = 10;
    else pScore.buyers = 5;

    if (salesGrowth > 15) pScore.substitutes = 20;
    else if (salesGrowth > 10) pScore.substitutes = 15;
    else if (salesGrowth > 5) pScore.substitutes = 10;
    else pScore.substitutes = 5;

    if (profitGrowth > 15) pScore.rivalry = 20;
    else if (profitGrowth > 10) pScore.rivalry = 15;
    else if (profitGrowth > 0) pScore.rivalry = 10;
    else pScore.rivalry = 5;

    pScore.total = Math.min(99, pScore.entrants + pScore.suppliers + pScore.buyers + pScore.substitutes + pScore.rivalry);
    return pScore;
}

function detectIndustry(data) {
    if (data.type !== 'STOCK') return 'GENERAL';
    const name = (data.name || '').toUpperCase();
    for (const [industry, profile] of Object.entries(INDUSTRY_PROFILES)) {
        if (profile.keywords.some(kw => name.includes(kw))) return industry;
    }
    return 'GENERAL';
}

function normalizeFundamentalScore(fScore, data) {
    if (!fScore) return null;
    const industry = detectIndustry(data);
    const profile = INDUSTRY_PROFILES[industry] || INDUSTRY_PROFILES['GENERAL'];

    // FIX: Instead of returning 0, apply a 20% penalty if a required metric is missing.
    // This preserves the aggregate score (55) but penalizes it slightly instead of wiping it out.
    for (let metric of profile.required || []) {
        if (data[metric] === null || data[metric] === undefined || data[metric] === 0) {
                fScore.total = Math.max(0, fScore.total - 20); // Penalty instead of Reset
                fScore.explanation = fScore.explanation ? `${fScore.explanation} (Data Partial)` : "Data Partial";
                // Don't return yet, continue weighting
        }
    }

    const components = ['business', 'moat', 'management', 'risk'];
    
    components.forEach(comp => {
        let w = profile.weights[comp] || 1.0;
        fScore[comp] = Math.round(fScore[comp] * w);
    });

    fScore.total = fScore.business + fScore.moat + fScore.management + fScore.risk;
    
    fScore.total = Math.min(99, fScore.total);
    if (industry !== 'GENERAL') {
        const suffix = `(${industry})`;
        if (!fScore.explanation.includes(suffix)) {
            fScore.explanation = fScore.explanation ? `${fScore.explanation} ${suffix}` : suffix;
        }
    }
    
    return fScore;
}

// --- PORTFOLIO & RISK AGGREGATION ---

function calculatePortfolioAggregates() {
    if (typeof portfolio === 'undefined' || typeof livePrices === 'undefined') return;

    let totalVal = 0;
    let weightedScoreSum = 0;
    let scoredVal = 0;
    let distribution = { 'Equity': 0, 'Cash': 0, 'Mutual Funds': 0, 'ETF': 0 };
    
    let industryExposure = {};
    let assetExposure = {};
    let topAssets = [];
    
    let weightedBetaSum = 0;
    let betaEquityVal = 0;
    
    portfolioAnalytics = { healthScore: 0, scoredValue: 0, totalValue: 0, allocation: {}, risk: { alerts: [], sectors: {}, divScore: 100, sensitivity: 'Moderate' }, efficiency: [] };

    Object.keys(portfolio).forEach(sym => {
        const qty = portfolio[sym].qty || 0;
        if (qty <= 0) return;

        const price = livePrices[sym] || 0;
        const val = qty * price;
        totalVal += val;
        
        assetExposure[sym] = val;
        
        let currentScore = 0;

        const data = stockAnalysis[sym];
        if (data) {
            let type = 'Equity';
            if (data.type === 'ETF') type = 'ETF';
            else if (data.type === 'FUND') type = 'Mutual Funds';
            distribution[type] = (distribution[type] || 0) + val;
            
            let ind = 'DIVERSIFIED';
            if (type === 'Equity') {
                ind = detectIndustry(data);
                if (data.beta) {
                    weightedBetaSum += data.beta * val;
                    betaEquityVal += val;
                }
            } else {
                if(data.name.includes("BANK")) ind = 'BANKING';
                else if(data.name.includes("IT")) ind = 'IT';
                weightedBetaSum += 1.0 * val;
                betaEquityVal += val;
            }
            industryExposure[ind] = (industryExposure[ind] || 0) + val;

            let fScore = calculateFundamentalScore(data);
            if (fScore) {
                fScore = normalizeFundamentalScore(fScore, data);
                if (fScore.total > 0) {
                    currentScore = fScore.total;
                    weightedScoreSum += fScore.total * val;
                    scoredVal += val;
                }
            }
        } else {
            distribution['Equity'] = (distribution['Equity'] || 0) + val; 
            industryExposure['GENERAL'] = (industryExposure['GENERAL'] || 0) + val;
        }
        
        topAssets.push({ sym, val, score: currentScore });
    });
    
    portfolioAnalytics.totalValue = totalVal;
    portfolioAnalytics.scoredValue = scoredVal;
    portfolioAnalytics.allocation = distribution;
    if (scoredVal > 0) {
        portfolioAnalytics.healthScore = Math.round(weightedScoreSum / scoredVal);
    }
    
    if (betaEquityVal > 0) {
        const portfolioBeta = weightedBetaSum / betaEquityVal;
        if (portfolioBeta < 0.8) portfolioAnalytics.risk.sensitivity = 'Defensive';
        else if (portfolioBeta > 1.2) portfolioAnalytics.risk.sensitivity = 'Aggressive';
        else portfolioAnalytics.risk.sensitivity = 'Balanced';
    }

    if (totalVal > 0) {
        const MAX_SECTOR = 0.35; 
        const MAX_ASSET = 0.20; 
        let divPenalty = 0;

        const sortedInds = Object.entries(industryExposure).sort((a,b) => b[1] - a[1]);
        portfolioAnalytics.risk.sectors = sortedInds.slice(0, 3); 

        sortedInds.forEach(([ind, val]) => {
            const pct = val / totalVal;
            if (pct > MAX_SECTOR && ind !== 'DIVERSIFIED' && ind !== 'GENERAL') {
                portfolioAnalytics.risk.alerts.push(`High Exposure to ${ind} (${Math.round(pct*100)}%)`);
                divPenalty += (pct - MAX_SECTOR) * 100;
            }
        });

        topAssets.sort((a,b) => b.val - a.val);
        topAssets.forEach(item => {
            const pct = item.val / totalVal;
            const pct100 = pct * 100;
            const name = getDisplayName(item.sym); 
            
            if (pct > MAX_ASSET) {
                portfolioAnalytics.risk.alerts.push(`Dominant Asset: ${name} (${Math.round(pct100)}%)`);
                divPenalty += (pct - MAX_ASSET) * 100;
            }
            
            if (item.score > 0) { 
                if (item.score < 50 && pct100 > 10) {
                    portfolioAnalytics.efficiency.push({ type: 'bad', text: `High Allocation in Weak Asset: ${name}` });
                } else if (item.score > 70 && pct100 < 3) {
                    portfolioAnalytics.efficiency.push({ type: 'good', text: `Under-allocated Winner: ${name}` });
                } else if (item.score < 55 && pct100 < 2) {
                    portfolioAnalytics.efficiency.push({ type: 'tail', text: `Low Conviction Tail: ${name}` });
                }
            }
        });

        if (topAssets.length > 0) {
            const top3Val = topAssets.slice(0, 3).reduce((acc, curr) => acc + curr.val, 0);
            const top3Pct = top3Val / totalVal;
            if (top3Pct > 0.60) {
                portfolioAnalytics.risk.alerts.push(`Top 3 Assets constitute ${Math.round(top3Pct*100)}% of Portfolio`);
                divPenalty += 10;
            }
        }

        portfolioAnalytics.risk.divScore = Math.max(0, Math.round(100 - divPenalty));
    }
}

// --- EXTENDED ANALYTICS ---

function calculateConviction(fScore, pScore) {
    if (pScore) {
        const avg = (fScore.total + pScore.total) / 2;
        if (avg >= 60) return "Strong";
        if (avg <= 40) return "Weak";
        return "Stable";
    }
    if (fScore.total >= 65) return "Strong";
    if (fScore.total <= 40) return "Weak";
    return "Stable";
}

function calculateTrajectory(data) {
    if (data.type !== 'STOCK') return null;
    const sales = data.growth || 0; const profit = data.profitGrowth || 0; const roe = data.roe || 0;
    if (sales < 0 || profit < 0) return "Deteriorating";
    if (profit < 5 && sales < 5) return "Deteriorating"; 
    if (profit > sales && sales > 5 && profit > 10) return "Improving";
    if (roe > 20 && profit > 10) return "Improving";
    return "Flat";
}

function calculateTiming(data) {
    const price = data.price || 0; const r1y = data.returns?.r1y || 0; const r3y = data.returns?.r3y || 0; const ma200 = data.technicals?.ma200 || 0;
    let trend = 'Neutral';
    if (ma200 > 0) trend = price > ma200 ? 'Up' : 'Down';
    else { if (r1y > 10) trend = 'Up'; else if (r1y < -5) trend = 'Down'; }
    let momentum = 'Stable';
    if (r1y > r3y + 5) momentum = 'Improving'; else if (r1y < r3y - 5) momentum = 'Weakening';
    if (trend === 'Up' && momentum === 'Improving') return "Favourable";
    if (trend === 'Down' && momentum === 'Weakening') return "Unfavourable";
    if (trend === 'Up' && momentum === 'Weakening') return "Neutral";
    if (trend === 'Down' && momentum === 'Improving') return "Neutral";
    if (r1y > 0) return "Neutral";
    return "Unfavourable";
}

function calculateFundamentalTiming(data) {
    if (data.type !== 'STOCK') return null;
    const profitGrowth = data.profitGrowth || 0; const pe = data.pe || 0; const r1y = data.returns?.r1y || 0;
    if (r1y > 100 || (pe > 60 && profitGrowth < 10) || profitGrowth < 0) return "Late";
    if ((profitGrowth > 15 && r1y < 5) || (pe > 0 && pe < 15 && profitGrowth > 5)) return "Early";
    if (profitGrowth > 5 && r1y >= 5 && r1y <= 80) return "Optimal";
    return r1y > 0 ? "Optimal" : "Early";
}

function calculateTrajectoryScore(data) {
    if (data.type !== 'STOCK') return 0;
    const sales3Y = data.growth || 0; const profit3Y = data.profitGrowth || 0; const roe = data.roe || 0; const roce = data.roce || 0; const r3y = data.returns?.r3y || 0; const r5y = data.returns?.r5y || 0;
    let score = 0;
    if (sales3Y > 10 && profit3Y > 10) score += 5;
    if (profit3Y > sales3Y && sales3Y > 0) score += 5;
    if (roe > 15 && roce > 15) score += 5;
    if (r3y > 12 && r5y > 12) score += 5;
    return score;
}

function calculateRelativeStrength(data) {
    if (data.type !== 'STOCK') return 0;
    const roe = data.roe || 0; const roce = data.roce || 0; const profitGrowth = data.profitGrowth || 0; const opm = data.opm || 0; const name = data.name || "";
    const isFinancial = (roce < 12 && roe > 15) || (name.toUpperCase().includes("FINANCE") || name.toUpperCase().includes("BANK") || name.toUpperCase().includes("CAPITAL"));
    let medianEfficiency = isFinancial ? 13 : 15; let medianGrowth = isFinancial ? 12 : 10; let medianMargin = isFinancial ? 0 : 14;
    let score = 0;
    const efficiencyMetric = isFinancial ? roe : roce;
    if (efficiencyMetric > medianEfficiency * 1.2) score += 5; else if (efficiencyMetric > medianEfficiency) score += 2; else if (efficiencyMetric < medianEfficiency * 0.8) score -= 5; else score -= 2;
    if (isFinancial) { if (profitGrowth > medianGrowth * 1.2) score += 5; else if (profitGrowth > medianGrowth) score += 2; else if (profitGrowth < medianGrowth * 0.8) score -= 5; else score -= 2; } 
    else { let subScore = 0; if (profitGrowth > medianGrowth) subScore += 2.5; else subScore -= 2.5; if (opm > medianMargin) subScore += 2.5; else subScore -= 2.5; score += Math.round(subScore); }
    return Math.max(-10, Math.min(10, score));
}

function calculateFinalDecision(conviction, trajectory, timing, type, isHeld) {
    let action = isHeld ? "HOLD" : "WAIT";
    let summary = "";
    const isFund = type !== 'STOCK';
    const effTrajectory = isFund ? (timing === 'Favourable' ? 'Improving' : 'Flat') : trajectory;

    if (conviction === 'Weak') {
        if (isHeld) { action = "EXIT"; summary = "Fundamental thesis has deteriorated significantly. Risks outweigh rewards."; } 
        else { action = "AVOID"; summary = "Quality does not meet the threshold for investment. Look elsewhere."; }
    }
    else if (conviction === 'Strong') {
        if (effTrajectory === 'Deteriorating') {
            if (isHeld) { action = "REVIEW"; summary = "Fundamentals are strong but momentum is fading. Watch closely."; } 
            else { action = "WAIT"; summary = "Great company, but business momentum is slowing. Wait for stabilization."; }
        } else if (timing === 'Late') {
            if (isHeld) { action = "HOLD"; summary = "Expensive, but quality is high. Ride the trend, but don't add aggressively."; } 
            else { action = "WAIT"; summary = "Fundamentals are great, but the price is extended. Wait for a dip."; }
        } else {
            if (isHeld) { action = "ADD"; summary = "Everything aligns: Quality, Growth, and Trend. Good level to increase allocation."; } 
            else { action = "BUY NOW"; summary = "Prime setup: High conviction matched with accelerating business performance."; }
        }
    }
    else { 
        if (effTrajectory === 'Deteriorating') {
            if (isHeld) action = "REDUCE"; else action = "AVOID";
            summary = "Business stability is threatened by slowing growth trends.";
        } else if (timing === 'Unfavourable') {
            if (isHeld) { action = "HOLD"; summary = "Price is weak, but business is stable. No urgency to exit yet."; } 
            else { action = "WAIT"; summary = "Stable business, but negative price trend. Wait for support."; }
        } else {
            if (isHeld) { action = "HOLD"; summary = "A steady performer. Continue holding for consistent compounding."; } 
            else { action = "SIP ONLY"; summary = "Decent stability warrants a small, staggered allocation approach."; }
        }
    }
    return { action, summary };
}

function calculateScoreActionMapper(score, timing, conviction, isHeld) {
    let strength = "Moderate";
    if (score >= 65) strength = "Strong"; else if (score <= 40) strength = "Weak";
    let s1 = `The fundamentals are ${strength.toLowerCase()} and the timing appears ${timing ? timing.toLowerCase() : 'neutral'}.`;
    let s2 = "", s3 = "";
    if (strength === "Strong") {
        if (timing === "Optimal" || timing === "Early") { s2 = "This alignment suggests high conviction with a supportive entry price."; s3 = isHeld ? "Consider adding to this winning position." : "It is a prime setup to deploy capital aggressively."; } 
        else { s2 = "However, the price has extended far beyond the ideal entry zone."; s3 = isHeld ? "Hold and ride the trend, but avoid fresh aggressive buying." : "Wait for a meaningful correction to improve the safety margin."; }
    } else if (strength === "Moderate") {
        if (timing === "Optimal") { s2 = "While not exceptional, the valuation offers a decent safety net."; s3 = isHeld ? "Keep holding, but monitor for better opportunities." : "A small, staggered allocation is appropriate here."; } 
        else { s2 = "Lacking both superior quality and perfect timing, the edge is thin."; s3 = isHeld ? "Review position size; upsides may be capped." : "It is better to remain on the sidelines for now."; }
    } else { 
        s2 = "The core business metrics do not support a long-term investment case."; s3 = "Capital preservation is priority; " + (isHeld ? "plan an exit strategy." : "avoid this counter.");
    }
    return `${s1} ${s2} ${s3}`;
}

function calculateMoreshwarLevels(price, fScore, pScore, isHolding) {
    const scoreSum = pScore ? (fScore.total + pScore.total) : fScore.total;
    const count = pScore ? 2 : 1;
    const X = Math.round(scoreSum / count); 
    const Y = price;
    let result = { target: null, sl: null, entry: null };
    if (isHolding) { result.target = Y + X; result.sl = Y - (100 - X); } 
    else { const offset = 100 - X; result.entry = Y - offset; }
    return result;
}

function calculateNormalizedScore(rawScore) {
    if (rawScore <= 60) return Math.max(0, rawScore);
    const excess = rawScore - 60;
    const normalizedExcess = 39 * (1 - Math.exp(-0.035 * excess));
    return Math.round(60 + normalizedExcess);
}

function calculateDataConfidence(data) {
    let score = 3; 
    if (data.type === 'STOCK') {
        if (data.source === 'Google') score -= 2; 
        else {
            if (!data.profitGrowth && !data.growth) score--; 
            if (!data.roe && !data.roce) score--; 
        }
        if (!data.returns?.r3y) score--; 
    } else {
        if (!data.returns?.r3y || !data.returns?.r5y) score--;
    }
    const r1y = data.returns?.r1y || 0;
    const profitGrowth = data.profitGrowth || 0;
    if (r1y > 100 && profitGrowth < -20) score--; 

    if (score >= 3) return "High";
    if (score === 2) return "Medium";
    return "Low";
}
