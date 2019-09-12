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
import { parseEther } from "ethers/utils";
import { BitcoinWallet } from "./bitcoinWallet";
import { EthereumWallet } from "./ethereumWallet";
import { HelloSwap } from "./helloSwap";
import LedgerActionHandler from "./ledgerActions";
import { setupBitcoin, setupEthereum } from "./setup/setup";

const BITCOIND_P2P_URI = "127.0.0.1:18444";

// TODO: Once funding is removed from here and pushed in create-comit-app, merge startMaker() and startTaker() together
async function startMaker() {
    const bitcoinWallet = new BitcoinWallet("regtest");
    await bitcoinWallet.init(BITCOIND_P2P_URI);
    await new Promise(r => setTimeout(r, 1000));
    await setupBitcoin(await bitcoinWallet.getAddress(), 2); // We may decide to do that separately.
    {
        await new Promise(r => setTimeout(r, 20000));
        const balance = await bitcoinWallet.getBalance();
        console.log(
            "[maker] Bitcoin balance:",
            JSON.stringify(balance.toJSON())
        );
    }
    const ethereumWallet = new EthereumWallet();

    const ledgerActionHandler = new LedgerActionHandler(
        bitcoinWallet,
        ethereumWallet
    );

    const maker = new HelloSwap(
        "http://localhost:8000/",
        ethereumWallet.getAccount(),
        "maker",
        ledgerActionHandler
    );
    console.log("[maker] Started:", await maker.cndPeerId());
    return maker;
}

async function startTaker() {
    const bitcoinWallet = new BitcoinWallet("regtest");
    await bitcoinWallet.init(BITCOIND_P2P_URI);
    const ethereumWallet = new EthereumWallet();

    await setupEthereum(ethereumWallet.getAccount(), parseEther("30"));

    const ledgerActionHandler = new LedgerActionHandler(
        bitcoinWallet,
        ethereumWallet
    );

    const taker = new HelloSwap(
        "http://localhost:8001/",
        ethereumWallet.getAccount(),
        "taker",
        ledgerActionHandler
    );
    console.log("[taker] Started:", await taker.cndPeerId());
    return taker;
}

(async function main() {
    // TODO: Let's call it Charlie & David to not be opinionated
    const taker = await startTaker();
    const maker = await startMaker();

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
    // TODO: Move inside but pass a predicate function (swap:Swap) => bool that decide whether to accept
    const swapToAccept = newSwaps[0];
    await taker.acceptSwap(swapToAccept);

    console.log("[taker] Swap request accepted!", swapToAccept.id);
})();
