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

    public async doBitcoinSendAmountToAddress(
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
        const response = await this.bitcoin.sendToAddress(payload.to, sats);
        console.log(
            "[trace] Bitcoin Send To Address response:",
            JSON.stringify(response)
        );
        return response;
    }

    public doBitcoinBroadcastSignedTransaction(
        // @ts-ignore
        payload: BitcoinBroadcastSignedTransactionPayload
    ) {
        console.log("[trace] Do bitcoin-broadcast-signed-transaction");
    }

    public async doEthereumDeployContract(
        payload: EthereumDeployContractPayload
    ) {
        const value = new BigNumber(payload.amount);
        // await here makes it easier to debug issues
        const response = await this.ethereum.deployContract(
            payload.data,
            value,
            payload.gas_limit
        );
        console.log(
            "[trace] Ethereum Deploy Contract response:",
            JSON.stringify(response)
        );
        return response;
    }

    // @ts-ignore
    public async doEthereumCallContract(payload: EthereumCallContractPayload) {
        const response = await this.ethereum.callContract(
            payload.data,
            payload.contract_address,
            payload.gas_limit
        );
        console.log(
            "[trace] Ethereum Call Contract response:",
            JSON.stringify(response)
        );
        return response;
    }
}
