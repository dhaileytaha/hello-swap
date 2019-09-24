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

export class OrderBook {
    private readonly offers: Offer[];

    public constructor() {
        this.offers = [];
    }

    public addOffer(offer: Offer) {
        this.offers.push(offer);
    }

    /**
     * This function represents the online order book. It looks up offers by coin types and wanted buyAmount.
     * The offers returned are mirrored in order to make the offers suitable for the taker, i.e. while the maker
     * added her offers in `addOffer(..)`, this function returns the same offers with sellCoin = buyCoin and
     * buyCoin = sellCoin
     * @param buyCoin: the coin requester wants to buy
     * @param sellCoin: the coin requester wants to sell
     * @param buyAmount: the amount requester wants to buy
     */
    public findOffers(
        buyCoin: CoinType,
        sellCoin: CoinType,
        buyAmount: number
    ): Offer[] {
        return this.offers
            .filter(
                offer =>
                    offer.buyCoin.coin === sellCoin &&
                    offer.sellCoin.coin === buyCoin &&
                    offer.sellCoin.amount >= buyAmount
            )
            .map((offer: Offer) => {
                return {
                    ...offer,
                    sellCoin: {
                        ...offer.buyCoin,
                        amount:
                            (offer.buyCoin.amount / offer.sellCoin.amount) *
                            buyAmount,
                    },
                    buyCoin: {
                        ...offer.sellCoin,
                        amount: buyAmount,
                    },
                };
            });
    }
}
