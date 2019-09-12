/// <reference path="./bitcoin-core.d.ts" />
/**
 * Setups the environment to run hello_swap
 * This should only be used until create-comit-app
 * is ready and does it for you
 */

import Client from "bitcoin-core";
import { ethers } from "ethers";
import { BigNumber } from "ethers/utils";

const BITCOIN_AUTH = {
    protocol: "http",
    username: "bitcoin",
    password: "54pLR_f7-G6is32LP-7nbhzZSbJs_2zSATtZV_r05yg=",
    host: "localhost",
    port: "18443",
};

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

export async function setupEthereum(
    fundAddress: string,
    fundAmount: BigNumber
) {
    const provider = new ethers.providers.JsonRpcProvider(
        "http://localhost:8545"
    );
    // This extracts the parity dev account
    const defaultAccounts = await provider.listAccounts();
    const signer = provider.getSigner(defaultAccounts[0]);
    await signer.unlock("");
    return signer.sendTransaction({ to: fundAddress, value: fundAmount });
}
