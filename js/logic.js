// ... (Top of file remains the same) ...

function normalizeFundamentalScore(fScore, data) {
    if (!fScore) return null;
    const industry = detectIndustry(data);
    const profile = INDUSTRY_PROFILES[industry] || INDUSTRY_PROFILES['GENERAL'];

    // FIX: Soft Penalty for missing data instead of hard 0
    let missingDataPenalty = 0;
    for (let metric of profile.required || []) {
        // Allow 0 for some metrics if it's a valid value, but usually 0 means missing in this context
        // We check strict null/undefined or 0
        if (data[metric] === null || data[metric] === undefined || data[metric] === 0) {
             missingDataPenalty += 25; // Deduct 25 points instead of zeroing
             fScore.explanation = fScore.explanation ? `${fScore.explanation} (Missing ${metric.toUpperCase()})` : `Missing ${metric.toUpperCase()}`;
        }
    }

    const components = ['business', 'moat', 'management', 'risk'];
    
    components.forEach(comp => {
        let w = profile.weights[comp] || 1.0;
        fScore[comp] = Math.round(fScore[comp] * w);
    });

    // Re-sum weighted components
    fScore.total = fScore.business + fScore.moat + fScore.management + fScore.risk;
    
    // Apply penalty
    fScore.total = Math.max(0, fScore.total - missingDataPenalty);
    
    fScore.total = Math.min(99, fScore.total);
    if (industry !== 'GENERAL') {
        const suffix = `(${industry})`;
        if (!fScore.explanation.includes(suffix)) {
            fScore.explanation = fScore.explanation ? `${fScore.explanation} ${suffix}` : suffix;
        }
    }
    
    return fScore;
}

// ... (Rest of file remains the same) ...
