import changeCase from "change-case";
import colors from "colors";
import {
    Action,
    Asset,
    BigNumber,
    BitcoinWallet,
    Cnd,
    EmbeddedRepresentationSubEntity,
    EthereumWallet,
    Field,
    LedgerAction,
    Swap,
} from "comit-sdk";
import moment from "moment";

export interface SimpleSwap {
    id: string;
    counterparty: string;
    buyAsset: Asset;
    sellAsset: Asset;
}

export interface Offer {
    sellCoin: Coin;
    buyCoin: Coin;
    makerPeerId: string;
    makerPeerAddress: string;
}

export enum CoinType {
    Bitcoin = "bitcoin",
    Ether = "ether",
}

export interface Coin {
    coin: CoinType;
    amount: number;
}

/**
 * The main class of our app. Connects to a cnd, automatically actions available swaps.
 * Can initiate a swap request.
 */
export class HelloSwap {
    private static toSwap(entity: EmbeddedRepresentationSubEntity): SimpleSwap {
        const swapProperties = entity.properties as Swap;
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
    private offersMade: Offer[];

    /**
     * new HelloSwap()
     * @param cndUrl The url to cnd REST API
     * @param whoAmI A name for logging purposes only
     * @param bitcoinWallet
     * @param ethereumWallet
     * @param acceptPredicate If it returns true the swap is accepted, otherwise it is declined.
     */
    public constructor(
        cndUrl: string,
        private readonly whoAmI: string,
        private readonly bitcoinWallet: BitcoinWallet,
        private readonly ethereumWallet: EthereumWallet,
        private readonly acceptPredicate: (swap: SimpleSwap) => boolean
    ) {
        this.cnd = new Cnd(cndUrl);
        this.actionsDone = [];
        this.offersMade = [];

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

    public async createOffer(sellCoin: Coin, buyCoin: Coin): Promise<Offer> {
        if (
            sellCoin.coin !== CoinType.Ether ||
            buyCoin.coin !== CoinType.Bitcoin
        ) {
            throw new Error(
                `Offering to sell ${sellCoin.coin} to buy ${buyCoin.coin} is not supported`
            );
        }

        const offer = {
            sellCoin,
            buyCoin,
            makerPeerId: await this.cnd.getPeerId(),
            makerPeerAddress: "/ip4/127.0.0.1/tcp/9940",
        };

        this.offersMade.push(offer);

        return offer;
    }

    public takeOffer({
        sellCoin,
        buyCoin,
        makerPeerId,
        makerPeerAddress,
    }: Offer) {
        console.log(`[${this.whoAmI}] Sending swap request`);
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
                name: buyCoin.coin,
                quantity: buyCoin.amount.toString(),
            },
            beta_asset: {
                name: sellCoin.coin,
                quantity: sellCoin.amount.toString(),
            },
            beta_ledger_redeem_identity: this.ethereumWallet.getAccount(),
            alpha_expiry: moment().unix() + 7200,
            beta_expiry: moment().unix() + 3600,
            peer: {
                peer_id: makerPeerId,
                address_hint: makerPeerAddress,
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

    private async acceptSwap(swap: SimpleSwap) {
        const swapDetails = await this.cnd.getSwap(swap.id);
        const actions = swapDetails.actions;
        const acceptAction = actions!.find(action => action.name === "accept");

        return this.cnd.executeAction(acceptAction!, (field: Field) =>
            this.fieldValueResolver(field)
        );
    }

    private async declineSwap(swap: SimpleSwap) {
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

        const response = await this.cnd.executeAction(action, (field: Field) =>
            this.fieldValueResolver(field)
        );

        // This heuristic is bad, should check content-type once it exists: https://github.com/comit-network/comit-rs/issues/992
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

    private async fieldValueResolver(
        field: Field
    ): Promise<string | undefined> {
        const classes: string[] = field.class;

        if (classes.includes("bitcoin") && classes.includes("address")) {
            return Promise.resolve(this.bitcoinWallet.getAddress());
        }

        if (classes.includes("bitcoin") && classes.includes("feePerWU")) {
            // should probably be dynamic in a real application
            return Promise.resolve("150");
        }

        if (classes.includes("ethereum") && classes.includes("address")) {
            return Promise.resolve(this.ethereumWallet.getAccount());
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

                const response = await this.bitcoinWallet.sendToAddress(
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
