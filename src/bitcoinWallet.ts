/// <reference path="./bcoin.d.ts" />

import WalletDB from "bcoin/lib/wallet/WalletDB";

export class BitcoinWallet {
    private readonly walletdb: any;
    private wallet: any;
    private network: any;

    constructor(network: any) {
        this.walletdb = new WalletDB({
            network,
            memory: true,
            witness: true,
        });
        this.network = network;
    }

    public async init() {
        await this.walletdb.open();
        this.wallet = await this.walletdb.create();
    }

    public getBalance() {
        this.isInit();
        return this.wallet.getBalance();
    }

    public async getAddress() {
        this.isInit();
        const address = await this.wallet.receiveAddress();
        return address.toBech32(this.network);
    }

    private isInit() {
        if (!this.wallet) {
            throw new Error("Bitcoin wallet is not initialized");
        }
    }
}
