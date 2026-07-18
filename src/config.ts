import "dotenv/config";

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function hexKey(name: string): `0x${string}` {
  const v = process.env[name] || "";
  if (!v) return "" as `0x${string}`;
  return (v.startsWith("0x") ? v : `0x${v}`) as `0x${string}`;
}

export const config = {
  football: {
    apiKey: optional("FOOTBALL_DATA_API_KEY", ""),
    useMock: process.env.USE_MOCK_DATA === "true",
    rateLimitMs: 6_100,
    cacheTtlSeconds: 300,
  },
  chain: {
    rpcUrl: optional("RPC_URL", "https://k8s.testnet.json-rpc.injective.network/"),
    chainId: parseInt(optional("CHAIN_ID", "1439"), 10),
  },
  x402: {
    tokenAddress: optional(
      "X402_TOKEN_ADDRESS",
      "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d"
    ) as `0x${string}`,
    price: optional("X402_PRICE", "10000"),          // 0.01 USDC — pro tier
    priceQuick: optional("X402_PRICE_QUICK", "3000"), // 0.003 USDC — quick tier
    recipient: optional("X402_RECIPIENT", "") as `0x${string}`,
    facilitatorKey: (hexKey("X402_FACILITATOR_KEY") || hexKey("PRIVATE_KEY")) as `0x${string}`,
    network: `eip155:${optional("CHAIN_ID", "1439")}` as "eip155:1439" | "eip155:1776",
  },
  llm: {
    anthropicApiKey: optional("ANTHROPIC_API_KEY", ""),
    proModel: "claude-opus-4-8",       // extended thinking, deep analysis
    quickModel: "claude-haiku-4-5-20251001", // fast, cheap, still structured via tool_use
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
}

export function validateMcpConfig() {
  if (!config.wallet.privateKey || config.wallet.privateKey.length < 10)
    throw new Error("PRIVATE_KEY is required (payer wallet for x402)");
  if (!config.football.apiKey && !config.football.useMock)
    throw new Error("Set FOOTBALL_DATA_API_KEY or USE_MOCK_DATA=true");
}
