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

async function startMaker() {
    const maker = new HelloSwap("http://localhost:8000/");
    console.log("Maker started:", await maker.cndPeerId());
    return maker;
}

async function startTaker() {
    const taker = new HelloSwap("http://localhost:8001/");
    console.log("Taker started:", await taker.cndPeerId());
    return taker;
}

(async function main() {
    const makerBitcoinWallet = new BitcoinWallet("regtest");
    await makerBitcoinWallet.init(BITCOIND_P2P_URI);

    await setupBitcoin(await makerBitcoinWallet.getAddress(), 2); // We may decide to do that separately.

    console.log(
        "Maker Bitcoin Address:",
        await makerBitcoinWallet.getAddress()
    );
    console.log(
        "Maker Bitcoin Balance:",
        await makerBitcoinWallet.getBalance()
    );

    const maker = await startMaker();
    const taker = await startTaker();

    const makerEthereumWallet = new EthereumWallet();
    const takerEthereumWallet = new EthereumWallet();

    await maker.sendSwap(
        await taker.cndPeerId(),
        "/ip4/127.0.0.1/tcp/9940",
        makerEthereumWallet.getAccount()
    );
    console.log("[Maker] Swap request sent!");

    await delay(1000);

    await taker.acceptSwap(takerEthereumWallet.getAccount());
    console.log("[Taker] Swap request accepted!");
})();
