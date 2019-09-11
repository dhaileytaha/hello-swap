// interface LedgerActionHandler {
//   doBitcoinSendAmountToAddress: (payload: any) => Promise<string>;
//   doBitcoinBroadcastSignedTransaction: (payload: any) => Promise<string>;
//   doEthereumDeployContract: (payload: any) => Promise<any>;
//   doEthereumCallContract: (payload: any) => Promise<any>;
// }

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
        console.log(JSON.stringify(payload));
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

    // @ts-ignore
    public doEthereumDeployContract(payload: EthereumDeployContractPayload) {
        console.log("Do ethereum-deploy-contract");
    }

    // @ts-ignore
    public doEthereumCallContract(payload: EthereumCallContractPayload) {
        console.log("Do ethereum-call-contract");
    }
}
