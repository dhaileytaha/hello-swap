/** Orchestrate the hello swap apps
 * Start 2 instances of helloSwap
 * "Link" them together. eg extract PeerId etc.
 * Call "sendSwap()" on one instance which is going to trigger a swap query
 * Assumptions:
 * - Use internal bitcoind wallet, simple utxo manipulation
 * - Use Parity dev wallet to fund 2 wallets, could be replaced with Ethereum wallet: https://github.com/coblox/bobtimus/issues/78
 */

import { BitcoinWallet, EthereumWallet } from "comit-sdk";
import { formatEther, parseEther } from "ethers/utils";
import { CoinType, HelloSwap } from "./helloSwap";
import { OrderBook } from "./orderBook";
import { setupBitcoin, setupEthereum } from "./setup/setup";

(async function main() {
    const orderBook = new OrderBook();

    const maker = await startApp("maker", "http://localhost:8001", 0, "10");
    const taker = await startApp("taker", "http://localhost:8000", 2, "0.01");

    // Maker creates and publishes offer
    const makerOffer = await maker.app.createOffer(
        {
            coin: CoinType.Ether,
            amount: 10,
        },
        {
            coin: CoinType.Bitcoin,
            amount: 1,
        }
    );
    orderBook.addOffer(makerOffer);

    // Taker finds offer
    const foundOffers = orderBook.findOffers(
        CoinType.Ether,
        CoinType.Bitcoin,
        5
    );
    await taker.app.takeOffer(foundOffers[0]);

    process.stdin.resume(); // so the program will not close instantly

    async function exitHandler(exitCode: NodeJS.Signals) {
        console.log(`Received ${exitCode}, closing...`);
        maker.app.stop();
        taker.app.stop();
        const promises = [maker, taker].map(async (persona: any) => {
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

    const app = new HelloSwap(
        cndUrl,
        whoAmI,
        bitcoinWallet,
        ethereumWallet,
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
