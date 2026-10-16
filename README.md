# Mortal

The launchpad where all coins die.

## Files

```
index.html                       the whole site (one file)
netlify.toml                     tells Netlify where the functions are
package.json                     installs Netlify Blobs (shared storage)
lib/mortal.mjs                   shared code for the functions
netlify/functions/launch.mjs     saves the coin image + info on this site, builds the pump.fun create transaction
netlify/functions/file.mjs       serves each coin's image + info (the link stored on-chain)
netlify/functions/register.mjs   checks a launch on Solana and adds it to the public coin list
netlify/functions/coins.mjs      returns every Mortal coin (with live market caps) to every visitor
netlify/functions/rpc.mjs        sends signed transactions to Solana
```

## Setup

1. Upload everything above to the root of your GitHub repo, keeping the folders.
2. Connect the repo to Netlify and deploy. No build command; publish directory `.`

No API keys are needed. Coin images, coin info and the coin list are all stored with Netlify Blobs, which is built into Netlify.

Optional: add `RPC_URL` (e.g. a Helius mainnet URL) if you ever see "429 / too many requests" errors.

Keep the site at the same address. Every coin's image and info are served from it.

## How the live list works

- When someone launches, the coin is saved as "pending".
- Once the transaction confirms, the site checks it on Solana: right wallet, right coin, and the exact metadata uploaded for it. Only then does the coin go on the public list.
- If the launcher closes the tab early, the list picks the coin up on its own about a minute later.
- Market cap and 24h change come from DexScreener and refresh about every 20 seconds.
- When a coin's timer runs out, it moves to the Graveyard tab.
