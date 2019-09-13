/// <reference path="./bcoin.d.ts" />

/** Orchestrate the hello swap apps
 * Start 2 instances of helloSwap
 * "Link" them together. eg extract PeerId etc.
 * Call "sendSwap()" on one instance which is going to trigger a swap query
 * Assumptions:
 * - Use internal bitcoind wallet, simple utxo manipulation
 * - Use Parity dev wallet to fund 2 wallets, could be replaced with Ethereum wallet: https://github.com/coblox/bobtimus/issues/78
 */

import { formatEther, parseEther } from "ethers/utils";
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
        ledgerActionHandler,
        () => true
    );
    console.log(`[${whoAmI}] Started:`, await app.cndPeerId());

    console.log(
        `[${whoAmI}] Bitcoin balance:`,
        await bitcoinWallet.getBalance()
    );
    console.log(
        `[${whoAmI}] Ether balance:`,
        JSON.stringify(formatEther(await ethereumWallet.getBalance()))
    );
    return { app, bitcoinWallet, ethereumWallet };
}

(async function main() {
    const charlie = await startApp("charlie", "http://localhost:8001", 0, "10");
    const david = await startApp("david", "http://localhost:8000", 2, "0.01");

    await david.app.makeOfferSellBtcBuyEth(
        "100000000",
        "9000000000000000000",
        await charlie.app.cndPeerId(),
        "/ip4/127.0.0.1/tcp/9940"
    );

    process.stdin.resume(); // so the program will not close instantly

    async function exitHandler(exitCode: NodeJS.Signals) {
        console.log(`Received ${exitCode}, closing...`);
        await charlie.app.stop();
        await david.app.stop();
        const promises = [charlie, david].map(async (persona: any) => {
            const whoAmI = persona.app.whoAmI;
            console.log(
                `[${whoAmI}] Bitcoin balance:`,
                await persona.bitcoinWallet.getBalance()
            );
            console.log(
                `[${whoAmI}] Ether balance:`,
                JSON.stringify(
                    formatEther(await persona.ethereumWallet.getBalance())
                )
            );
        });
        await Promise.all(promises);
        process.exit();
    }

    process.on("SIGINT", exitHandler);
    process.on("SIGUSR1", exitHandler);
    process.on("SIGUSR2", exitHandler);
})();
