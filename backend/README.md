# Token Details Backend API

This directory contains the server-side token discovery, market data aggregation, logo resolution, and verification engine extracted from the frontend donation/inspection pipeline.

## Architecture

```
/backend
  ├── types/
  │   └── tokenDetails.ts       # Standardized response models
  ├── providers/
  │   ├── dexscreener.ts        # DexScreener multi-pair resolver & logo extractor
  │   ├── geckoterminal.ts      # GeckoTerminal fallback resolver
  │   └── coingecko.ts          # CoinGecko token & supply metrics
  ├── verification/
  │   └── verificationReport.ts # Security scoring, risk assessment, and honeypot/liquidity audits
  └── tokenDetails.ts           # Master entry point orchestrating all providers
```

## Vercel Serverless Function

The backend logic is exposed for Vercel deployment under:
- `/api/token-details.ts` (`GET /api/token-details?chain=137&address=0x...` or `POST /api/token-details`)

## Response Payload Contract

```json
{
  "success": true,
  "data": {
    "token": {
      "name": "Tether USD",
      "symbol": "USDT",
      "decimals": 6,
      "contractAddress": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      "chain": "polygon",
      "chainId": "137",
      "blockchain": "EVM",
      "assetStandard": "ERC20",
      "logoUrl": "https://dd.dexscreener.com/ds-data/tokens/polygon/0xc2132d05d31c914a87c6611c10748aeb04b58e8f.png",
      "priceUsd": 1.0,
      "liquidityUsd": 8452190.5,
      "marketCapUsd": 1200000000.0,
      "volume24hUsd": 432100.0,
      "priceChange24h": 0.02,
      "resolvedVia": "dexscreener"
    },
    "verification": {
      "isVerified": true,
      "trustScore": 95,
      "riskLevel": "LOW",
      "honeypot": {
        "isHoneypot": false,
        "buyTax": 0,
        "sellTax": 0,
        "canModifyTax": false
      },
      "securityIssues": [],
      "liquidity": {
        "isLocked": true,
        "lockedPercentage": 95,
        "totalLiquidityUsd": 8452190.5
      },
      "auditBadge": "VERIFIED_COMMUNITY_ASSET"
    }
  }
}
```
