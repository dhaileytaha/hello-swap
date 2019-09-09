/// <reference path="./bcoin.d.ts" />

import bcoin from "bcoin";
import WalletDB from "bcoin/lib/wallet/WalletDB";
import Logger from "blgr";

export class BitcoinWallet {
    private readonly walletdb: any;
    private wallet: any;
    private readonly network: any;
    private address: any;
    private readonly node: any;
    private readonly logger: any;

    constructor(network: string) {
        this.logger = new Logger({
            level: "debug",
        });
        this.walletdb = new WalletDB({
            network,
            memory: true,
            witness: true,
            logger: this.logger,
        });
        this.network = network;
        this.node = new bcoin.SPVNode({
            network,
            logger: this.logger,
            memory: true,
        });
    }

    public async init(peerUri: string) {
        await this.logger.open();
        await this.node.open();
        await this.walletdb.open();
        await this.node.connect();
        this.wallet = await this.walletdb.create({
            logger: this.logger,
            network: this.network,
        });
        this.address = await this.wallet.receiveAddress();

        this.node.pool.watchAddress(this.address);
        this.node.startSync();

        this.node.on("tx", (tx: any) => {
            console.log("Received TX:\n", tx);
            this.walletdb.addTX(tx);
        });

        this.node.on("block", (block: any) => {
            console.log("Received Block:\n", block);
            this.walletdb.addBlock(block);

            if (block.txs.length > 0) {
                block.txs.forEach((tx: any) => {
                    this.walletdb.addTX(tx);
                    console.log("TX added to wallet DB!");
                });
            }
        });

        this.wallet.on("balance", (balance: any) => {
            console.log("Balance updated:\n", balance.toJSON());
        });

        const netAddr = await this.node.pool.hosts.addNode(peerUri);
        const peer = this.node.pool.createOutbound(netAddr);
        this.node.pool.peers.add(peer);
    }

    public getBalance() {
        this.isInit();
        return this.wallet.getBalance();
    }

    public async getAddress() {
        this.isInit();
        return this.address.toString(this.network);
    }

    private isInit() {
        if (!this.wallet) {
            throw new Error("Bitcoin wallet is not initialized");
        }
    }
}
