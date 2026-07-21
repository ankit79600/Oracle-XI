import "dotenv/config";
import { INJECTIVE_MAINNET_CAIP2, INJECTIVE_TESTNET_CAIP2 } from "@injectivelabs/x402/networks";
import type { InjectiveNetwork } from "@injectivelabs/x402/networks";

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function hexKey(name: string): `0x${string}` {
  const v = process.env[name] || "";
  if (!v) return "" as `0x${string}`;
  return (v.startsWith("0x") ? v : `0x${v}`) as `0x${string}`;
}

const isMainnet = process.env.NETWORK === "mainnet";

export const config = {
  football: {
    apiKey: optional("FOOTBALL_DATA_API_KEY", ""),
    useMock: process.env.USE_MOCK_DATA === "true",
    rateLimitMs: 6_100,
    cacheTtlSeconds: 300,
  },
  chain: {
    rpcUrl: optional(
      "RPC_URL",
      isMainnet
        ? "https://sentry.evm-rpc.injective.network/"
        : "https://k8s.testnet.json-rpc.injective.network/"
    ),
    chainId: isMainnet ? 1776 : 1439,
    caip2: (isMainnet ? INJECTIVE_MAINNET_CAIP2 : INJECTIVE_TESTNET_CAIP2) as InjectiveNetwork,
    explorerUrl: isMainnet
      ? "https://blockscout.injective.network"
      : "https://testnet.blockscout.injective.network",
    isMainnet,
  },
  x402: {
    // Mainnet USDC: 0xa00C59fF5a080D2b954d0c75e46E22a0c371235a (Circle FiatTokenV2_2)
    // Testnet USDC: 0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d
    tokenAddress: optional(
      "X402_TOKEN_ADDRESS",
      isMainnet
        ? "0xa00C59fF5a080D2b954d0c75e46E22a0c371235a"
        : "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d"
    ) as `0x${string}`,
    price: optional("X402_PRICE", "10000"),             // 0.01 USDC — pro tier
    priceQuick: optional("X402_PRICE_QUICK", "3000"),   // 0.003 USDC — quick tier
    priceSonnet: optional("X402_PRICE_SONNET", "6000"), // 0.006 USDC — sonnet tier
    priceBatch: optional("X402_PRICE_BATCH", "10000"),  // 0.01 USDC — batch (up to 5 matches)
    recipient: optional("X402_RECIPIENT", "") as `0x${string}`,
    facilitatorKey: (hexKey("X402_FACILITATOR_KEY") || hexKey("PRIVATE_KEY")) as `0x${string}`,
  },
  llm: {
    anthropicApiKey: optional("ANTHROPIC_API_KEY", ""),
    proModel: "claude-opus-4-8",            // extended thinking, deep analysis
    sonnetModel: "claude-sonnet-4-6",       // balanced speed + quality
    quickModel: "claude-haiku-4-5-20251001", // fast, cheap
  },
  api: {
    port: parseInt(optional("API_PORT", "3002"), 10),
    demoMode: process.env.DEMO_MODE === "true",
  },
  wallet: {
    privateKey: hexKey("PRIVATE_KEY"),
  },
} as const;

export function validateApiConfig() {
  if (!config.x402.recipient || config.x402.recipient.length < 10)
    throw new Error("X402_RECIPIENT is required (oracle treasury wallet that receives USDC)");
  if (!config.x402.facilitatorKey || config.x402.facilitatorKey.length < 10)
    throw new Error("X402_FACILITATOR_KEY (or PRIVATE_KEY) is required for the facilitator");
  if (!config.llm.anthropicApiKey)
    console.warn("[config] ANTHROPIC_API_KEY not set — predict will use rule-based fallback");
  if (config.chain.isMainnet)
    console.log("[config] Running on Injective EVM MAINNET (eip155:1776)");
}

export function validateMcpConfig() {
  if (!config.wallet.privateKey || config.wallet.privateKey.length < 10)
    throw new Error("PRIVATE_KEY is required (payer wallet for x402)");
  if (!config.football.apiKey && !config.football.useMock)
    throw new Error("Set FOOTBALL_DATA_API_KEY or USE_MOCK_DATA=true");
}
