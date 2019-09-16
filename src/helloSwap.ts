import changeCase from "change-case";
import moment from "moment";
import { Action, EmbeddedRepresentationSubEntity, Field } from "../gen/siren";
import { PropertiesOfASWAP } from "../gen/swap";
import { Cnd, LedgerAction } from "./cnd";
import LedgerActionHandler from "./ledgerActions";

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
    private readonly ethereumAddress: string;
    private readonly whoAmI: string;
    private readonly ledgerActionHandler: LedgerActionHandler;
    private readonly acceptPredicate: (swap: Swap) => boolean;
    private actionsDone: string[];
    private readonly interval: NodeJS.Timeout;

    /**
     * new HelloSwap()
     * @param cndUrl The url to cnd REST API
     * @param ethereumAddress The Ethereum address, to use to receive Ether.
     * @param whoAmI A name for logging purposes only
     * @param ledgerActionHandler To handle all blockchain actions
     * @param acceptPredicate If it returns true the swap is accepted, otherwise it is declined.
     */
    public constructor(
        cndUrl: string,
        ethereumAddress: string,
        whoAmI: string,
        ledgerActionHandler: LedgerActionHandler,
        acceptPredicate: (swap: Swap) => boolean
    ) {
        this.cnd = new Cnd(cndUrl);
        this.ethereumAddress = ethereumAddress;
        this.whoAmI = whoAmI;
        this.ledgerActionHandler = ledgerActionHandler;
        this.actionsDone = [];
        this.acceptPredicate = acceptPredicate;

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

        return this.cnd.postAccept(acceptAction!, this.ethereumAddress);
    }

    private async declineSwap(swap: Swap) {
        const swapDetails = await this.cnd.getSwap(swap.id);
        const actions = swapDetails.actions;
        const declineAction = actions!.find(
            action => action.name === "decline"
        );

        return this.cnd.postAction(declineAction!);
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

    private async doLedgerAction(action: LedgerAction) {
        switch (action.type) {
            case "bitcoin-broadcast-signed-transaction": {
                return this.ledgerActionHandler.doBitcoinBroadcastSignedTransaction(
                    action.payload
                );
            }
            case "bitcoin-send-amount-to-address": {
                return this.ledgerActionHandler.doBitcoinSendAmountToAddress(
                    action.payload
                );
            }
            case "ethereum-call-contract": {
                return this.ledgerActionHandler.doEthereumCallContract(
                    action.payload
                );
            }
            case "ethereum-deploy-contract": {
                return this.ledgerActionHandler.doEthereumDeployContract(
                    action.payload
                );
            }
        }
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

    private performNextLedgerAction(entity: EmbeddedRepresentationSubEntity) {
        const swap = HelloSwap.toSwap(entity);

        const action = entity.actions!.find((action: Action) => {
            return action.name === "fund" || action.name === "redeem";
        })!;

        const data: any = {};
        if (action.fields && action.fields.length) {
            action.fields.forEach((field: Field) => {
                data[field.name] = this.ledgerActionHandler.getData(field);
            });
        }

        return this.cnd
            .getAction(action.href, data)
            .then((ledgerAction: LedgerAction) => {
                const stringAction = JSON.stringify(ledgerAction);
                if (this.actionsDone.indexOf(stringAction) === -1) {
                    this.actionsDone.push(stringAction);
                    console.log(
                        `[${this.whoAmI}] ${changeCase.titleCase(
                            action.name
                        )}ing ${
                            action.name === "fund"
                                ? swap.sellAsset.name
                                : swap.buyAsset.name
                        } for`,
                        JSON.stringify(swap.id)
                    );
                    return this.doLedgerAction(ledgerAction);
                }
            });
    }
}
