import { ethers, Wallet } from "ethers";

export class EthereumWallet {
    private readonly wallet: Wallet;

    public constructor() {
        this.wallet = ethers.Wallet.createRandom();
    }

    public getAccount() {
        return this.wallet.address;
    }
}
