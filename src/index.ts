/// <reference path="./bcoin.d.ts" />

/** Orchestrate the hello swap apps
 * Start 2 instances of helloSwap
 * "Link" them together. eg extract PeerId etc.
 * Call "sendSwap()" on one instance which is going to trigger a swap query
 * Assumptions:
 * - Use internal bitcoind wallet, simple utxo manipulation
 * - Use Parity dev wallet to fund 2 wallets, could be replaced with Ethereum wallet: https://github.com/coblox/bobtimus/issues/78
 */

import delay from "delay";
import { BitcoinWallet } from "./bitcoinWallet";
import { EthereumWallet } from "./ethereumWallet";
import { HelloSwap } from "./helloSwap";
import { setupBitcoin } from "./setup/setup";

const BITCOIND_P2P_URI = "127.0.0.1:18444";

async function startMaker(ethereumAddress: string) {
    const maker = new HelloSwap(
        "http://localhost:8000/",
        ethereumAddress,
        "maker"
    );
    console.log("[maker] started:", await maker.cndPeerId());
    return maker;
}

async function startTaker(ethereumAddress: string) {
    const taker = new HelloSwap(
        "http://localhost:8001/",
        ethereumAddress,
        "taker"
    );
    console.log("[taker] started:", await taker.cndPeerId());
    return taker;
}

(async function main() {
    const makerBitcoinWallet = new BitcoinWallet("regtest");
    await makerBitcoinWallet.init(BITCOIND_P2P_URI);

    await setupBitcoin(await makerBitcoinWallet.getAddress(), 2); // We may decide to do that separately.

    const makerEthereumWallet = new EthereumWallet();
    const takerEthereumWallet = new EthereumWallet();

    const taker = await startTaker(takerEthereumWallet.getAccount());
    const maker = await startMaker(makerEthereumWallet.getAccount());

    await maker.makeOfferSellBtcBuyEth(
        "100000000",
        "9000000000000000000",
        await taker.cndPeerId(),
        "/ip4/127.0.0.1/tcp/9940"
    );
    console.log("[maker] Offer sent!");

    await delay(1000);

    const newSwaps = await taker.getNewSwaps();
    console.log(
        `[taker] ${newSwaps.length} new swap(s) waiting for a decision`
    );

    const swapToAccept = newSwaps[0];
    await taker.acceptSwap(swapToAccept);

    console.log("[taker] Swap request accepted!", JSON.stringify(swapToAccept));
})();
