import { SorobanRpc } from '@stellar/stellar-sdk';
import { getLastIndexedLedger, setLastIndexedLedger } from './db/schema';
import { processSwapEvent } from './processors/swap';
import { processLiquidityAdded, processLiquidityRemoved } from './processors/liquidity';
import { processPairCreated } from './processors/pair';

/**
 * Subscribe to Soroban contract events from Horizon.
 * Processes swap, liquidity_added, liquidity_removed, pair_created events.
 *
 * Uses getEvents polling (Horizon SSE is not available for Soroban events directly).
 * In production, switch to Horizon SSE /soroban/events stream.
 */
export async function startIndexer(
  rpcUrl: string,
  factoryAddress: string,
  pairAddresses: string[],
): Promise<void> {
  const server = new SorobanRpc.Server(rpcUrl);
  let lastLedger = await getLastIndexedLedger();

  console.log(`[indexer] starting from ledger ${lastLedger}`);

  // Poll every 5 seconds for new events
  const POLL_INTERVAL = 5_000;
  const PAGE_SIZE = 200;

  const allContracts = [factoryAddress, ...pairAddresses];

  const tick = async () => {
    try {
      const events = await server.getEvents({
        startLedger: lastLedger + 1,
        filters: [
          {
            type: 'contract',
            contractIds: allContracts,
          },
        ],
        limit: PAGE_SIZE,
      });

      for (const event of events.events) {
        await processEvent(event);
        const ledger = parseInt(event.ledger, 10);
        if (ledger > lastLedger) {
          lastLedger = ledger;
        }
      }

      if (events.events.length > 0) {
        await setLastIndexedLedger(lastLedger);
        console.log(`[indexer] processed ${events.events.length} events, ledger=${lastLedger}`);
      }
    } catch (err) {
      console.error('[indexer] poll error:', (err as Error).message);
    }
  };

  // Initial tick then schedule
  await tick();
  setInterval(tick, POLL_INTERVAL);
}

async function processEvent(event: any): Promise<void> {
  const topics: string[] = event.topic?.map((t: any) => t.value ?? t.toString()) ?? [];
  const eventName = topics[0];
  const contractId = topics[1] ?? event.contractId;
  const ledger = parseInt(event.ledger, 10);
  const ts = parseInt(event.ledgerClosedAt ?? '0', 10);
  const eventId = `${event.ledger}:${event.id}`;

  // Parse the XDR data — in production, use stellar-sdk XDR parsing
  const data = event.value?.value ?? event.value ?? {};

  try {
    switch (eventName) {
      case 'swap':
        await processSwapEvent(eventId, contractId, parseSwapData(data), ledger, ts);
        break;
      case 'liquidity_added':
        await processLiquidityAdded(eventId, contractId, parseLiqAddedData(data), ledger, ts);
        break;
      case 'liquidity_removed':
        await processLiquidityRemoved(eventId, contractId, parseLiqRemovedData(data), ledger, ts);
        break;
      case 'pair_created':
        await processPairCreated(contractId, parsePairCreatedData(data), ledger, ts);
        break;
      default:
        // Ignore unknown events (sync, etc.)
        break;
    }
  } catch (err) {
    console.error(`[indexer] failed to process event ${eventId}:`, (err as Error).message);
  }
}

// ── Data parsers ──────────────────────────────────────────────────────────────
// These parse the Soroban XDR-encoded event data.
// In production, use stellar-sdk's XDR parsing utilities.

function parseSwapData(data: any) {
  return {
    from: data[0]?.toString() ?? '',
    amount_in: data[1]?.toString() ?? '0',
    amount_out: data[2]?.toString() ?? '0',
    token_in: data[3]?.toString() ?? '',
    token_out: data[4]?.toString() ?? '',
  };
}

function parseLiqAddedData(data: any) {
  return {
    provider: data[0]?.toString() ?? '',
    amount_x: data[1]?.toString() ?? '0',
    amount_y: data[2]?.toString() ?? '0',
    lp_minted: data[3]?.toString() ?? '0',
  };
}

function parseLiqRemovedData(data: any) {
  return {
    provider: data[0]?.toString() ?? '',
    amount_x: data[1]?.toString() ?? '0',
    amount_y: data[2]?.toString() ?? '0',
    lp_burned: data[3]?.toString() ?? '0',
  };
}

function parsePairCreatedData(data: any) {
  return {
    token_x: data[0]?.toString() ?? '',
    token_y: data[1]?.toString() ?? '',
    pair: data[2]?.toString() ?? '',
    pair_index: parseInt(data[3]?.toString() ?? '0', 10),
  };
}
