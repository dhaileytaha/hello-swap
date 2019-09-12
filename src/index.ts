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

// TODO: Funding should be handled by the create-comit-app
async function startApp(
    whoAmI: string,
    cndUrl: string,
    startBitcoin: number,
    startEther: string
) {
    const bitcoinWallet = new BitcoinWallet("regtest");
    await bitcoinWallet.init(BITCOIND_P2P_URI);
    await new Promise(r => setTimeout(r, 1000));
    if (startBitcoin) {
        await setupBitcoin(await bitcoinWallet.getAddress(), startBitcoin);
        await new Promise(r => setTimeout(r, 10000));
    }
    const balance = await bitcoinWallet.getBalance();
    console.log(
        `[${whoAmI}] Bitcoin balance:`,
        JSON.stringify(balance.toJSON())
    );

    const ethereumWallet = new EthereumWallet();
    if (startEther) {
        await setupEthereum(
            ethereumWallet.getAccount(),
            parseEther(startEther)
        );
    }

    const ledgerActionHandler = new LedgerActionHandler(
        bitcoinWallet,
        ethereumWallet
    );

    const app = new HelloSwap(
        cndUrl,
        ethereumWallet.getAccount(),
        whoAmI,
        ledgerActionHandler
    );
    console.log(`[${whoAmI}] Started:`, await app.cndPeerId());
    return app;
}

(async function main() {
    const charlie = await startApp("charlie", "http://localhost:8001", 0, "10");
    const david = await startApp("david", "http://localhost:8000", 2, "0.01");

    await david.makeOfferSellBtcBuyEth(
        "100000000",
        "9000000000000000000",
        await charlie.cndPeerId(),
        "/ip4/127.0.0.1/tcp/9940"
    );
    console.log("[david] Offer sent!");

    await delay(2000);

    const newSwaps = await charlie.getNewSwaps();
    console.log(
        `[charlie] ${newSwaps.length} new swap(s) waiting for a decision`
    );
    // TODO: Move inside but pass a predicate function (swap:Swap) => bool that decide whether to accept
    const swapToAccept = newSwaps[0];
    await charlie.acceptSwap(swapToAccept);

    console.log("[charlie] Swap request accepted!", swapToAccept.id);
})();
