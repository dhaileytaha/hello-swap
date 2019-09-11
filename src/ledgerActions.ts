// interface LedgerActionHandler {
//   doBitcoinSendAmountToAddress: (payload: any) => Promise<string>;
//   doBitcoinBroadcastSignedTransaction: (payload: any) => Promise<string>;
//   doEthereumDeployContract: (payload: any) => Promise<any>;
//   doEthereumCallContract: (payload: any) => Promise<any>;
// }

import { BigNumber } from "ethers/utils";
import { BitcoinWallet } from "./bitcoinWallet";
import {
    BitcoinBroadcastSignedTransactionPayload,
    BitcoinSendAmountToAddressPayload,
    EthereumCallContractPayload,
    EthereumDeployContractPayload,
} from "./cnd";
import { EthereumWallet } from "./ethereumWallet";

export default class LedgerActionHandler {
    private readonly bitcoin: BitcoinWallet;
    // @ts-ignore
    private readonly ethereum: EthereumWallet;

    public constructor(bitcoin: BitcoinWallet, ethereum: EthereumWallet) {
        this.bitcoin = bitcoin;
        this.ethereum = ethereum;
    }

    public doBitcoinSendAmountToAddress(
        payload: BitcoinSendAmountToAddressPayload
    ) {
        const sats = parseInt(payload.amount, 10);
        if (!sats && this.bitcoin.network !== payload.network) {
            throw new Error(
                `Issue with the bitcoin-send-amount-to-address payload: ${JSON.stringify(
                    payload
                )}`
            );
        }
        return this.bitcoin.sendToAddress(payload.to, sats);
    }

    public doBitcoinBroadcastSignedTransaction(
        // @ts-ignore
        payload: BitcoinBroadcastSignedTransactionPayload
    ) {
        console.log("Do bitcoin-broadcast-sigend-transaction");
    }

    public doEthereumDeployContract(payload: EthereumDeployContractPayload) {
        const value = new BigNumber(payload.amount);
        return this.ethereum.deployContract(
            payload.data,
            value,
            payload.gas_limit
        );
    }

    // @ts-ignore
    public doEthereumCallContract(payload: EthereumCallContractPayload) {
        console.log("Do ethereum-call-contract");
    }
}
