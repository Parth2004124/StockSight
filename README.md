StockSight Cloud - User Manual

Version: 2.1

Last Updated: January 2026

1. Introduction

StockSight Cloud is a personal portfolio intelligence tool designed to help you analyze stocks structurally, manage your portfolio allocation, and make data-driven decisions without emotional bias. It uses a modular architecture to fetch real-time data from sources like Screener.in, Yahoo Finance, and AMFI.

2. Getting Started

Accessing the App

Open welcome.html in your browser. Click the "Enter Terminal" button to load the main dashboard.

The Interface

Sidebar (Left): This is your command center. Use the search bar to add stocks or view your watchlist items.

Main Dashboard (Right): Displays your Portfolio cards, Watchlist cards, and Analytics.

Tabs (Top): Switch between "My Portfolio", "Watchlist", and "Analytics".

Stocky Button (Bottom Right): Opens the AI assistant.

3. Managing Assets

Adding Stocks/ETFs/MFs

Go to the Sidebar.

Type the ticker symbol (e.g., TCS, HDFCBANK) or the Mutual Fund Scheme Code (e.g., 120503).

Press Enter or click Add.

The system will fetch data automatically. If a stock is not found immediately, it will attempt an auto-search to find the correct symbol.

Building Your Portfolio

Once a card appears in the Watchlist tab, you will see input fields for Qty and Avg price.

Enter a quantity greater than 0.

The card will automatically move to the My Portfolio tab.

Real-time P&L will be calculated based on the current price vs. your average price.

Removing Assets

From Watchlist: Click the red "DEL" button on the list item in the sidebar.

From Portfolio: Set the Qty to 0. The card will move back to the Watchlist, where you can delete it.

4. Understanding Scores & Analysis

StockSight uses a dual-scoring model to evaluate every equity asset.

A. Fundamental Score (Timing & Health) - Max 100

This score evaluates the current financial health and momentum.

Business (40%): Sales Growth, Profit Growth, OPM.

Moat (20%): ROE, ROCE, Market Dominance.

Management (20%): Capital Allocation efficiency (PE vs Growth).

Risk (20%): Volatility (Beta), Market Cap stability.

Signals:

🟢 BUY (≥ 65): Strong fundamentals + Good timing.

🔴 SELL (≤ 40): Deteriorating fundamentals or extreme overvaluation.

🟡 HOLD/WAIT (41-64): Decent company, but timing isn't perfect.

B. Porter's 5 Forces Score (Quality & Longevity) - Max 100

This score evaluates the long-term competitive advantage.

Barriers to Entry: Can new competitors easily enter?

Supplier Power: Does the company dictate terms?

Buyer Power: Do customers have high switching costs?

Threat of Substitutes: Is the product essential?

Competitive Rivalry: Is the market crowded or consolidated?

5. Stocky AI Assistant

Stocky is an intelligent chatbot integrated into the app. Click the floating robot button to open it.

What can Stocky do?

Analyze Assets: Ask "Explain ITC" or "Is Tata Motors a buy?". Stocky will fetch the data if it's not in your list.

Compare Stocks: Ask "Compare HDFC vs ICICI".

Risk Check: Ask "Is my portfolio risky?".

Portfolio Allocation: Ask "Invest 1 Lakh for me". Stocky will generate a weighted allocation strategy based on the quality scores of assets in your view.

Advanced Commands

"What is the target for [Stock]?": Shows Moreshwar dynamic levels.

"Why is the score low?": Explains the specific metric dragging the score down.

6. Analytics Tab

Click the Analytics tab on the top bar to see a high-level view of your portfolio:

Asset Allocation: Breakdown of Equity vs Cash vs Gold/ETFs.

Performance: Total Portfolio P&L.

Health Score: Weighted average quality of your holdings.

Action Plan: Automated suggestions on what to Buy, Sell, or Review based on live data.

7. Troubleshooting

"Asset Not Found"

Ensure you are using the correct NSE/BSE symbol.

Try typing the full name (e.g., "Reliance Industries") instead of just "RIL".

For Mutual Funds, use the AMFI Code (found on Google or AMFI website).

"Score is 5 / Data Insufficient"

This usually happens for Finance/Bank stocks where "Operating Profit Margin" (OPM) is not applicable. The system attempts to normalize this, but occasionally data sources vary. The score is penalized rather than zeroed out to keep you safe.

"Data Not Loading"

The app uses public proxies to fetch data. If the network is slow, simply wait a moment or click the refresh button in the sidebar.
