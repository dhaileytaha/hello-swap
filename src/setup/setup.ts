/// <reference path="./bitcoin-core.d.ts" />

import Client from "bitcoin-core";

const BITCOIN_AUTH = {
    protocol: "http",
    username: "bitcoin",
    password: "54pLR_f7-G6is32LP-7nbhzZSbJs_2zSATtZV_r05yg=",
    host: "localhost",
    port: "18443",
};

/**
 * Setups the environment to run hello_swap
 * This should only be used for a dev environment
 */
export async function setupBitcoin(fundAddress: string, fundAmount: number) {
    const bitcoinClient = new Client(BITCOIN_AUTH);
    await bitcoinClient.generate(101);
    console.log("Funding", fundAddress, "with", fundAmount, "BTC");
    await bitcoinClient.sendToAddress(fundAddress, fundAmount);
    await bitcoinClient.generate(2);
    setInterval(() => {
        bitcoinClient.generate(1);
    }, 500);
}
