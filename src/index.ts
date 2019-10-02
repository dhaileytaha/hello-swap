import { BitcoinWallet, EthereumWallet } from "comit-sdk";
import { formatEther } from "ethers/utils";
import fs from "fs";
import { CoinType, HelloSwap } from "./helloSwap";
import { OrderBook } from "./orderBook";

(async function main() {
    checkEnvFile(process.env.DOTENV_CONFIG_PATH!);

    const orderBook = new OrderBook();

    const maker = await startApp("maker", 0);
    const taker = await startApp("taker", 1);

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
    const foundOffers = orderBook.findOffers({
        buyCoin: CoinType.Ether,
        sellCoin: CoinType.Bitcoin,
        buyAmount: 5,
    });
    console.log(`[taker] ${foundOffers.length} offer(s) found.`);
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

async function startApp(whoAmI: string, index: number) {
    const bitcoinWallet = await BitcoinWallet.newInstance(
        "regtest",
        process.env.BITCOIN_P2P_URI!,
        process.env[`BITCOIN_HD_KEY_${index}`]!
    );
    await new Promise(r => setTimeout(r, 1000));

    const ethereumWallet = new EthereumWallet(
        process.env[`ETHEREUM_KEY_${index}`]!,
        process.env.ETHEREUM_NODE_HTTP_URL!
    );

    const app = new HelloSwap(
        process.env[`HTTP_URL_CND_${index}`]!,
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

function checkEnvFile(path: string) {
    if (!fs.existsSync(path)) {
        console.log(
            `Could not find ${path} file. Did you run \`create-comit-app start-env\`?`
        );
        process.exit(1);
    }
}
