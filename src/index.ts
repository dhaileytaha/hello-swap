import { BitcoinWallet, EthereumWallet } from "comit-sdk";
import { formatEther } from "ethers/utils";
import fs from "fs";
import { CoinType, HelloSwap, WhoAmI } from "./helloSwap";
import { createLogger, CustomLogger } from "./logger";
import { OrderBook } from "./orderBook";

(async function main() {
    checkForEnvFile();

    const logger = createLogger();

    const orderBook = new OrderBook();

    const maker = await startApp("maker", 0);
    const taker = await startApp("taker", 1);

    // Maker creates and publishes offer
    const makerOffer = await maker.createOffer(
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

    // Taker finds and takes offer
    const foundOffers = orderBook.findOffers({
        buyCoin: CoinType.Ether,
        sellCoin: CoinType.Bitcoin,
        buyAmount: 5,
    });
    logger.taker(`${foundOffers.length} offer(s) found.`);
    await taker.takeOffer(foundOffers[0]);

    process.stdin.resume(); // so the program will not close instantly

    async function exitHandler(exitCode: NodeJS.Signals) {
        logger.verbose(`Received ${exitCode}, closing...`);
        maker.stop();
        taker.stop();

        await logBalances(maker, logger).then(() => logBalances(taker, logger));
        process.exit();
    }

    process.on("SIGINT", exitHandler);
    process.on("SIGUSR1", exitHandler);
    process.on("SIGUSR2", exitHandler);
})();

async function startApp(whoAmI: WhoAmI, index: number): Promise<HelloSwap> {
    const logger = createLogger();
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

    logger[whoAmI]("Started hello-swap");
    logger.data(`with ID: ${await app.cndPeerId()}`);
    logBalances(app, logger);

    return app;
}

function checkForEnvFile() {
    if (!fs.existsSync("./.env")) {
        const logger = createLogger();
        logger.error(
            "Could not find `.env` file in project root. Did you run `create-comit-app start-env` in the project root?"
        );
        process.exit(1);
    }
}

async function logBalances(app: HelloSwap, logger: CustomLogger) {
    logger[app.whoAmI](
        `Bitcoin balance: ${parseFloat(await app.getBitcoinBalance()).toFixed(
            2
        )}`
    );
    logger[app.whoAmI](
        `Ether balance: ${parseFloat(
            formatEther(await app.getEtherBalance())
        ).toFixed(2)}`
    );
}
