/** Orchestrate the hello swap apps
 * Start 2 instances of helloSwap
 * "Link" them together. eg extract PeerId etc.
 * Call "sendSwap()" on one instance which is going to trigger a swap query
 * Assumptions:
 * - Use internal bitcoind wallet, simple utxo manipulation
 * - Use Parity dev wallet to fund 2 wallets, could be replaced with Ethereum wallet: https://github.com/coblox/bobtimus/issues/78
 */

import { EthereumWallet } from "./ethereumWallet";
import { HelloSwap } from "./helloSwap";

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

async function main() {
    const maker = await startMaker();
    const taker = await startTaker();

    const makerEthereumWallet = new EthereumWallet();

    maker.sendSwap(
        await taker.cndPeerId(),
        "/ip4/127.0.0.1/tcp/9940",
        makerEthereumWallet.getAccount()
    );
    console.log("Swap request sent!");
}

main();
