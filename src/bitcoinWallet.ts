/// <reference path="./bcoin.d.ts" />

import bcoin from "bcoin";
import WalletDB from "bcoin/lib/wallet/WalletDB";
import Logger from "blgr";

export class BitcoinWallet {
    public readonly network: any;
    private readonly walletdb: any;
    private wallet: any;
    private address: any;
    private readonly pool: any;
    private readonly chain: any;
    private readonly logger: any;

    constructor(network: string) {
        this.logger = new Logger({
            level: "warning",
        });
        this.walletdb = new WalletDB({
            network,
            memory: true,
            witness: true,
            logger: this.logger,
        });
        this.network = network;
        this.chain = new bcoin.Chain({
            spv: true,
            network,
            logger: this.logger,
        });
        this.pool = new bcoin.Pool({
            chain: this.chain,
            network,
            logger: this.logger,
        });
    }

    public async init(peerUri: string) {
        await this.logger.open();
        await this.pool.open();
        await this.walletdb.open();
        await this.chain.open();
        await this.pool.connect();
        this.wallet = await this.walletdb.create({
            logger: this.logger,
            network: this.network,
        });
        this.address = await this.wallet.receiveAddress();

        this.pool.watchAddress(this.address);
        this.pool.startSync();

        this.pool.on("tx", (tx: any) => {
            this.walletdb.addTX(tx);
        });

        this.pool.on("block", (block: any) => {
            this.walletdb.addBlock(block);
            if (block.txs.length > 0) {
                block.txs.forEach((tx: any) => {
                    this.walletdb.addTX(tx);
                });
            }
        });

        const netAddr = await this.pool.hosts.addNode(peerUri);
        const peer = this.pool.createOutbound(netAddr);
        this.pool.peers.add(peer);
    }

    public getBalance() {
        this.isInit();
        return this.wallet.getBalance();
    }

    public async getAddress() {
        this.isInit();
        return this.address.toString(this.network);
    }

    public async sendToAddress(address: string, satoshiAmount: number) {
        this.isInit();
        const tx = await this.wallet.send({
            witness: true,
            outputs: [
                {
                    address,
                    value: satoshiAmount,
                },
            ],
        });
        console.log("TxId:", tx.txid());
        await this.pool.broadcast(tx);
        return tx;
    }

    private isInit() {
        if (!this.wallet) {
            throw new Error("Bitcoin wallet is not initialized");
        }
    }
}
