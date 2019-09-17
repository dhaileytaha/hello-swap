import changeCase from "change-case";
import colors from "colors";
import { BigNumber } from "ethers/utils";
import moment from "moment";
import { Action, EmbeddedRepresentationSubEntity } from "../gen/siren";
import { PropertiesOfASWAP } from "../gen/swap";
import { BitcoinWallet } from "./bitcoinWallet";
import { Cnd, LedgerAction } from "./cnd";
import { EthereumWallet } from "./ethereumWallet";

export interface Asset {
    name: string;
    quantity: string;
}

export interface Swap {
    id: string;
    counterparty: string;
    buyAsset: Asset;
    sellAsset: Asset;
}

/**
 * The main class of our app. Connects to a cnd, automatically actions available swaps.
 * Can initiate a swap request.
 */
export class HelloSwap {
    private static toSwap(entity: EmbeddedRepresentationSubEntity): Swap {
        const swapProperties = entity.properties as PropertiesOfASWAP;
        const buyAsset =
            swapProperties.role === "Alice"
                ? swapProperties.parameters.beta_asset
                : swapProperties.parameters.alpha_asset;
        const sellAsset =
            swapProperties.role === "Alice"
                ? swapProperties.parameters.alpha_asset
                : swapProperties.parameters.beta_asset;

        return {
            id: swapProperties.id,
            counterparty: swapProperties.counterparty,
            buyAsset: {
                name: buyAsset.name,
                quantity: buyAsset.quantity,
            },
            sellAsset: {
                name: sellAsset.name,
                quantity: sellAsset.quantity,
            },
        };
    }
    private readonly cnd: Cnd;
    private actionsDone: string[];
    private readonly interval: NodeJS.Timeout;

    /**
     * new HelloSwap()
     * @param cndUrl The url to cnd REST API
     * @param ethereumAddress The Ethereum address, to use to receive Ether.
     * @param whoAmI A name for logging purposes only
     * @param bitcoinWallet
     * @param ethereumWallet
     * @param acceptPredicate If it returns true the swap is accepted, otherwise it is declined.
     */
    public constructor(
        cndUrl: string,
        private readonly ethereumAddress: string,
        private readonly whoAmI: string,
        private readonly bitcoinWallet: BitcoinWallet,
        private readonly ethereumWallet: EthereumWallet,
        private readonly acceptPredicate: (swap: Swap) => boolean
    ) {
        this.cnd = new Cnd(cndUrl);
        this.actionsDone = [];

        // On an interval:
        // 1. Get all swaps that can be accepted, use `this.acceptPredicate` to accept or decline them
        // 2. Get all swaps that can be funded or redeemed and perform the corresponding action using a wallet
        // @ts-ignore
        this.interval = setInterval(() => {
            this.getNewSwaps().then(
                (swaps: EmbeddedRepresentationSubEntity[]) => {
                    if (swaps.length) {
                        console.log(
                            `[${whoAmI}] ${swaps.length} new swap(s) waiting for a decision`
                        );
                    }
                    swaps.forEach(
                        async (swap: EmbeddedRepresentationSubEntity) => {
                            const simpleSwap = HelloSwap.toSwap(swap);
                            if (this.acceptPredicate(simpleSwap)) {
                                await this.acceptSwap(simpleSwap);
                                console.log(
                                    `[${whoAmI}] swap accepted:`,
                                    simpleSwap.id
                                );
                            } else {
                                await this.declineSwap(simpleSwap);
                                console.log(
                                    `[${whoAmI}] swap declined:`,
                                    simpleSwap.id
                                );
                            }
                        }
                    );
                }
            );

            this.getOngoingSwaps().then(
                (swaps: EmbeddedRepresentationSubEntity[]) => {
                    swaps.forEach((swap: EmbeddedRepresentationSubEntity) =>
                        this.performNextLedgerAction(swap)
                    );
                }
            );
        }, 2000);
    }

    public cndPeerId(): Promise<string> {
        return this.cnd.getPeerId();
    }

    public makeOfferSellBtcBuyEth(
        sats: string,
        wei: string,
        peerId: string,
        peerAddress: string
    ) {
        console.log(`[${this.whoAmI}] Sending offer to:`, peerId);
        const swap = {
            alpha_ledger: {
                name: "bitcoin",
                network: "regtest",
            },
            beta_ledger: {
                name: "ethereum",
                network: "regtest",
            },
            alpha_asset: {
                name: "bitcoin",
                quantity: sats,
            },
            beta_asset: {
                name: "ether",
                quantity: wei,
            },
            beta_ledger_redeem_identity: this.ethereumAddress,
            alpha_expiry: moment().unix() + 7200,
            beta_expiry: moment().unix() + 3600,
            peer: {
                peer_id: peerId,
                address_hint: peerAddress,
            },
        };

        return this.cnd.postSwap(swap);
    }

    /**
     * Clean-up interval
     */
    public stop() {
        clearInterval(this.interval);
    }

    private async acceptSwap(swap: Swap) {
        const swapDetails = await this.cnd.getSwap(swap.id);
        const actions = swapDetails.actions;
        const acceptAction = actions!.find(action => action.name === "accept");

        // in this demo application, we know for sure that the accept action will require an ethereum address, hence we can simply configure the resolver to always return the ethereum address
        // in a real application, the logic of the resolver will have to be more complicated
        return this.cnd.executeAction(
            acceptAction!,
            async () => this.ethereumAddress
        );
    }

    private async declineSwap(swap: Swap) {
        const swapDetails = await this.cnd.getSwap(swap.id);
        const actions = swapDetails.actions;
        const declineAction = actions!.find(
            action => action.name === "decline"
        );

        return this.cnd.executeAction(declineAction!);
    }

    private async getNewSwaps(): Promise<EmbeddedRepresentationSubEntity[]> {
        const swaps = await this.cnd.getSwaps();

        return swaps.filter((swap: EmbeddedRepresentationSubEntity) => {
            return (
                swap.actions &&
                !!swap.actions.find((action: Action) => {
                    return action.name === "accept";
                })
            );
        });
    }

    private async getOngoingSwaps(): Promise<
        EmbeddedRepresentationSubEntity[]
    > {
        const swaps = await this.cnd.getSwaps();

        return swaps.filter((swap: EmbeddedRepresentationSubEntity) => {
            return (
                swap.actions &&
                !!swap.actions.find((action: Action) => {
                    return action.name === "fund" || action.name === "redeem";
                })
            );
        });
    }

    private async performNextLedgerAction(
        entity: EmbeddedRepresentationSubEntity
    ) {
        const swap = HelloSwap.toSwap(entity);

        const action = entity.actions!.find((action: Action) => {
            return action.name === "fund" || action.name === "redeem";
        })!;

        const response = await this.cnd.executeAction(action, async field => {
            const classes: string[] = field.class;

            if (classes.includes("bitcoin") && classes.includes("address")) {
                return this.bitcoinWallet.getAddress();
            }

            if (classes.includes("bitcoin") && classes.includes("feePerWU")) {
                return 150; // should probably be dynamic in a real application
            }

            if (classes.includes("ethereum") && classes.includes("address")) {
                return this.ethereumWallet.getAccount();
            }
        });

        // This heuristic should is bad, should check content-type once it exists: https://github.com/comit-network/comit-rs/issues/992
        if (response.data && response.data.type && response.data.payload) {
            const ledgerAction: LedgerAction = response.data;

            const stringAction = JSON.stringify(ledgerAction);
            if (this.actionsDone.indexOf(stringAction) === -1) {
                this.actionsDone.push(stringAction);
                console.log(
                    `[${this.whoAmI}] ${changeCase.titleCase(action.name)}ing ${
                        action.name === "fund"
                            ? swap.sellAsset.name
                            : swap.buyAsset.name
                    } for`,
                    JSON.stringify(swap.id)
                );
                return this.doLedgerAction(ledgerAction);
            }
        }
    }

    private async doLedgerAction(action: LedgerAction) {
        switch (action.type) {
            case "bitcoin-broadcast-signed-transaction": {
                const { hex, network } = action.payload;

                const response = await this.bitcoinWallet.broadcastTransaction(
                    hex,
                    network
                );

                console.log(
                    colors.grey(
                        "[trace] Bitcoin Broadcast Signed Transaction response:"
                    ),
                    colors.grey(JSON.stringify(response))
                );

                return response;
            }
            case "bitcoin-send-amount-to-address": {
                const { to, amount, network } = action.payload;
                const sats = parseInt(amount, 10);

                const response = this.bitcoinWallet.sendToAddress(
                    to,
                    sats,
                    network
                );

                console.log(
                    colors.grey("[trace] Bitcoin Send To Address response:"),
                    colors.grey(JSON.stringify(response))
                );

                return response;
            }
            case "ethereum-call-contract": {
                const { data, contract_address, gas_limit } = action.payload;

                const response = await this.ethereumWallet.callContract(
                    data,
                    contract_address,
                    gas_limit
                );

                console.log(
                    colors.grey("[trace] Ethereum Call Contract response:"),
                    colors.grey(JSON.stringify(response))
                );

                return response;
            }
            case "ethereum-deploy-contract": {
                const { amount, data, gas_limit } = action.payload;
                const value = new BigNumber(amount);

                const response = await this.ethereumWallet.deployContract(
                    data,
                    value,
                    gas_limit
                );

                console.log(
                    colors.grey("[trace] Ethereum Deploy Contract response:"),
                    colors.grey(JSON.stringify(response))
                );

                return response;
            }
        }
    }
}
