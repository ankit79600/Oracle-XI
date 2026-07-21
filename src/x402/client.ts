/**
 * x402 client for the MCP server.
 *
 * Handles the full EIP-3009 payment flow automatically:
 *   1. Client sends request to Oracle API
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
import { config } from "../config.js";

export interface SseEvent {
  type: string;
  data: unknown;
}

export function createOracleClient(baseUrl: string) {
  if (!config.wallet.privateKey) {
    throw new Error("PRIVATE_KEY env var required for x402 payments");
  }

  const x402 = createInjectiveClient({
    privateKey: config.wallet.privateKey,
    rpcUrl: config.chain.rpcUrl,
    preferredNetworks: [config.chain.caip2],
    defaultToken: "USDC",
  });

  async function get(
    path: string,
    params?: Record<string, string>
  ): Promise<{ data: unknown; txHash?: `0x${string}` }> {
    const url = new URL(path, baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
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
  }

  async function post(
    path: string,
    body: unknown
  ): Promise<{ data: unknown; txHash?: `0x${string}` }> {
    const url = new URL(path, baseUrl);

    const response = await x402.fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Oracle API ${response.status}: ${text}`);
    }

    const receipt = parsePaymentResponseHeader(response);
    if (receipt) {
      console.error(
        `[x402] Settled on Injective: tx=${receipt.transaction} payer=${receipt.payer}`
      );
    }

    const data = await response.json();
    return { data, txHash: receipt?.transaction };
  }

  // Collects all SSE events from a streaming endpoint into an array.
  // Works because the Oracle streaming endpoints call res.end() after all events.
  async function getStream(
    path: string,
    params?: Record<string, string>
  ): Promise<{ events: SseEvent[]; txHash?: `0x${string}` }> {
    const url = new URL(path, baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
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

    const rawBody = await response.text();
    const events: SseEvent[] = [];

    let currentType = "";
    let currentData = "";

    for (const line of rawBody.split("\n")) {
      if (line.startsWith("event: ")) {
        currentType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6).trim();
      } else if (line === "" && currentType) {
        try {
          events.push({ type: currentType, data: JSON.parse(currentData) });
        } catch {
          // skip malformed event
        }
        currentType = "";
        currentData = "";
      }
    }

    return { events, txHash: receipt?.transaction };
  }

  return { get, post, getStream };
}
