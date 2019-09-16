import colors from "colors";
import { BigNumber } from "ethers/utils";
import { Field } from "../gen/siren";
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
    private readonly ethereum: EthereumWallet;

    public constructor(bitcoin: BitcoinWallet, ethereum: EthereumWallet) {
        this.bitcoin = bitcoin;
        this.ethereum = ethereum;
    }

    public async doBitcoinSendAmountToAddress(
        payload: BitcoinSendAmountToAddressPayload
    ) {
        const sats = parseInt(payload.amount, 10);
        if (!sats || this.bitcoin.network !== payload.network) {
            throw new Error(
                `Issue with the bitcoin-send-amount-to-address payload: ${JSON.stringify(
                    payload
                )}`
            );
        }
        const response = await this.bitcoin.sendToAddress(payload.to, sats);
        console.log(
            colors.grey("[trace] Bitcoin Send To Address response:"),
            colors.grey(JSON.stringify(response))
        );
        return response;
    }

    public async doBitcoinBroadcastSignedTransaction(
        payload: BitcoinBroadcastSignedTransactionPayload
    ) {
        if (this.bitcoin.network !== payload.network) {
            throw new Error(
                `Issue with the bitcoin-broadcast-signed-transaction payload: ${JSON.stringify(
                    payload
                )}`
            );
        }
        const response = await this.bitcoin.broadcastTransaction(payload.hex);
        console.log(
            colors.grey(
                "[trace] Bitcoin Broadcast Signed Transaction response:"
            ),
            colors.grey(JSON.stringify(response))
        );
        return response;
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
        // TODO: remove this lazy hack and configure a proper logger
        console.log(
            colors.grey("[trace] Ethereum Deploy Contract response:"),
            colors.grey(JSON.stringify(response))
        );
        return response;
    }

    public async doEthereumCallContract(payload: EthereumCallContractPayload) {
        const response = await this.ethereum.callContract(
            payload.data,
            payload.contract_address,
            payload.gas_limit
        );
        console.log(
            colors.grey("[trace] Ethereum Call Contract response:"),
            colors.grey(JSON.stringify(response))
        );
        return response;
    }

    public getData(field: Field) {
        const classes: string[] = field.class;
        if (classes.includes("bitcoin") && classes.includes("address")) {
            return this.bitcoin.getAddress();
        }
        if (classes.includes("bitcoin") && classes.includes("feePerWU")) {
            // Return a hardcoded value, a fee service would be better
            return 150;
        }
    }
}
