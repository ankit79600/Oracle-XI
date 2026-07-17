/**
 * x402 client for the MCP server.
 *
 * Uses createInjectiveClient from @injectivelabs/x402/client to handle the
 * full EIP-3009 payment flow automatically:
 *
 *   1. Client sends GET /predict to Oracle API
 *   2. Oracle API returns 402 + PAYMENT-REQUIRED header
 *   3. Client signs an EIP-3009 transferWithAuthorization (no gas; just a signature)
 *   4. Client retries with PAYMENT-SIGNATURE header
 *   5. Facilitator submits authorization on-chain; confirms in ~650ms on Injective
 *   6. Oracle API returns prediction JSON + PAYMENT-RESPONSE header with tx receipt
 */

import {
  createInjectiveClient,
  parsePaymentResponseHeader,
} from "@injectivelabs/x402/client";
import { INJECTIVE_TESTNET_CAIP2 } from "@injectivelabs/x402/networks";
import { config } from "../config.js";

export function createOracleClient(baseUrl: string) {
  if (!config.wallet.privateKey) {
    throw new Error("PRIVATE_KEY env var required for x402 payments");
  }

  const x402 = createInjectiveClient({
    privateKey: config.wallet.privateKey,
    rpcUrl: config.chain.rpcUrl,
    preferredNetworks: [INJECTIVE_TESTNET_CAIP2],
    defaultToken: "USDC",
  });

  return {
    async get(
      path: string,
      params?: Record<string, string>
    ): Promise<{ data: unknown; txHash?: `0x${string}` }> {
      const url = new URL(path, baseUrl);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }

      const response = await x402.fetch(url.toString());

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Oracle API ${response.status}: ${body}`);
      }

      const receipt = parsePaymentResponseHeader(response);
      if (receipt) {
        console.error(
          `[x402] Settled on Injective: tx=${receipt.transaction} payer=${receipt.payer}`
        );
      }

      const data = await response.json();
      return { data, txHash: receipt?.transaction };
    },
  };
}
