import { ethers, Wallet } from "ethers";
import { TransactionRequest } from "ethers/providers";
import { BigNumber } from "ethers/utils";

export class EthereumWallet {
    private readonly wallet: Wallet;

    public constructor() {
        const provider = new ethers.providers.JsonRpcProvider(
            "http://localhost:8545"
        );
        this.wallet = ethers.Wallet.createRandom().connect(provider);
    }

    public getAccount() {
        return this.wallet.address;
    }

    public deployContract(data: string, value: BigNumber, gasLimit: string) {
        const transaction: TransactionRequest = {
            data,
            value,
            gasLimit,
        };
        return this.wallet.sendTransaction(transaction);
    }
}
