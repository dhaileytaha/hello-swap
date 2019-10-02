import changeCase from "change-case";
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
import { parseEther } from "ethers/utils";
import moment from "moment";
import { toSatoshi } from "satoshi-bitcoin-ts";
import { createLogger, CustomLogger } from "./logger";
import { Coin, CoinType, Offer } from "./orderBook";

export { CoinType } from "./orderBook";

export interface SimpleSwap {
    id: string;
    counterparty: string;
    buyAsset: Asset;
    sellAsset: Asset;
}

export type WhoAmI = "maker" | "taker";

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
    private swapsDone: string[];
    private logger: CustomLogger;

    /**
     * new HelloSwap()
     * @param cndUrl The url to cnd REST API
     * @param whoAmI A name for logging purposes only
     * @param logger
     * @param bitcoinWallet
     * @param ethereumWallet
     * @param acceptPredicate If it returns true the swap is accepted, otherwise it is declined.
     */
    public constructor(
        cndUrl: string,
        public readonly whoAmI: WhoAmI,
        private readonly bitcoinWallet: BitcoinWallet,
        private readonly ethereumWallet: EthereumWallet,
        private readonly acceptPredicate: (swap: SimpleSwap) => boolean
    ) {
        this.cnd = new Cnd(cndUrl);
        this.actionsDone = [];
        this.offersMade = [];
        this.swapsDone = [];
        this.logger = createLogger();

        // Store swapped already finished in case of a re-run with same cnd.
        this.getDoneSwaps().then((swaps: EmbeddedRepresentationSubEntity[]) => {
            swaps.forEach((swap: EmbeddedRepresentationSubEntity) => {
                this.swapsDone.push(swap.properties!.id);
            });
        });

        // On an interval:
        // 1. Get all swaps that can be accepted, use `this.acceptPredicate` to accept or decline them
        // 2. Get all swaps that can be funded or redeemed and perform the corresponding action using a wallet
        // 3. Check any new swap that finishes to alert user
        // @ts-ignore
        this.interval = setInterval(() => {
            this.getNewSwaps().then(
                (swaps: EmbeddedRepresentationSubEntity[]) => {
                    if (swaps.length) {
                        this.logger[whoAmI](
                            `${swaps.length} new swap(s) waiting to be started`
                        );
                    }
                    swaps.forEach(
                        async (swap: EmbeddedRepresentationSubEntity) => {
                            const simpleSwap = HelloSwap.toSwap(swap);
                            if (this.acceptPredicate(simpleSwap)) {
                                await this.acceptSwap(simpleSwap);
                                this.logger[whoAmI](
                                    `Started swap with ID: ${simpleSwap.id}`
                                );
                                this.logger.data(
                                    `with parameters: buy ${JSON.stringify(
                                        simpleSwap.buyAsset
                                    )}, sell ${JSON.stringify(
                                        simpleSwap.sellAsset
                                    )}`
                                );
                            } else {
                                await this.declineSwap(simpleSwap);
                                this.logger[whoAmI](
                                    `Cancelled swap with ID: ${simpleSwap.id}`
                                );
                                this.logger.data(
                                    `with parameters: buy ${JSON.stringify(
                                        simpleSwap.buyAsset
                                    )}, sell ${JSON.stringify(
                                        simpleSwap.sellAsset
                                    )}`
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

            this.getDoneSwaps().then(
                (swaps: EmbeddedRepresentationSubEntity[]) => {
                    swaps.forEach((swap: EmbeddedRepresentationSubEntity) => {
                        const props = swap.properties!;
                        const id = props.id;
                        if (this.swapsDone.indexOf(props.id) === -1) {
                            this.logger[whoAmI](
                                `Swap finished with status ${props.status}: ${id}`
                            );

                            this.swapsDone.push(id);
                        }
                    });
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
            this.logger.error(
                `Offer not supported: sell ${JSON.stringify(
                    sellCoin.coin
                )}, buy ${JSON.stringify(buyCoin.coin)}`
            );
            process.exit(1);
        }

        this.logger[this.whoAmI](
            `Creating offer: sell ${JSON.stringify(
                sellCoin
            )}, buy ${JSON.stringify(buyCoin)}`
        );

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
        this.logger[this.whoAmI](
            `Taking offer: buy ${JSON.stringify(
                buyCoin
            )}, sell ${JSON.stringify(sellCoin)}`
        );

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
                name: sellCoin.coin,
                quantity: toSatoshi(sellCoin.amount).toString(),
            },
            beta_asset: {
                name: buyCoin.coin,
                quantity: parseEther(buyCoin.amount.toString()).toString(),
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

    public getBitcoinBalance() {
        return this.bitcoinWallet.getBalance();
    }

    public getEtherBalance() {
        return this.ethereumWallet.getBalance();
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

    private async getDoneSwaps(): Promise<EmbeddedRepresentationSubEntity[]> {
        const swaps = await this.cnd.getSwaps();
        return swaps.filter((swap: EmbeddedRepresentationSubEntity) => {
            return (
                swap.properties &&
                (swap.properties.status === "SWAPPED" ||
                    swap.properties.status === "NOT_SWAPPED" ||
                    swap.properties.status === "INTERNAL_FAILURE")
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
                this.logger[this.whoAmI](
                    `${changeCase.titleCase(action.name)}ing ${
                        action.name === "fund"
                            ? swap.sellAsset.name
                            : swap.buyAsset.name
                    } for ${JSON.stringify(swap.id)}`
                );
                const res = await this.doLedgerAction(ledgerAction);
                if (!res) {
                    this.logger.data(
                        `Ledger action failed: ${JSON.stringify(res)}`
                    );
                }
            }
        }
    }

    private async fieldValueResolver(
        field: Field
    ): Promise<string | undefined> {
        const classes: string[] = field.class;

        if (classes.includes("bitcoin") && classes.includes("address")) {
            return this.bitcoinWallet.getAddress();
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

                this.logger.data(
                    `Bitcoin Broadcast Signed Transaction response: ${JSON.stringify(
                        response
                    )}`
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

                this.logger.data(
                    `Bitcoin Send To Address response: ${JSON.stringify(
                        response
                    )}`
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

                this.logger.data(
                    `Ethereum Call Contract response: ${JSON.stringify(
                        response
                    )}`
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

                this.logger.data(
                    `Ethereum Deploy Contract response: ${JSON.stringify(
                        response
                    )}`
                );

                return response;
            }
        }
    }
}
