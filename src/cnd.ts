import axios from "axios";
import URI from "urijs";
import { Action, EmbeddedRepresentationSubEntity, Entity } from "../gen/siren";

interface GetInfo {
    id: string;
    listen_addresses: string[]; // multiaddresses
}

export interface Ledger {
    name: string;
    network: string;
}

export interface Asset {
    name: string;
    quantity: string;
}

export interface Peer {
    peer_id: string;
    address_hint: string;
}

export interface SwapRequest {
    alpha_ledger: Ledger;
    alpha_asset: Asset;
    beta_ledger: Ledger;
    beta_asset: Asset;
    alpha_expiry: number;
    beta_expiry: number;
    alpha_ledger_refund_identity?: string;
    beta_ledger_redeem_identity?: string;
    peer: Peer;
}

export type LedgerAction =
    | {
          type: "bitcoin-send-amount-to-address";
          payload: { to: string; amount: string; network: string };
      }
    | {
          type: "bitcoin-broadcast-signed-transaction";
          payload: {
              hex: string;
              network: string;
          };
      }
    | {
          type: "ethereum-deploy-contract";
          payload: {
              data: string;
              amount: string;
              gas_limit: string;
              network: string;
          };
      }
    | {
          type: "ethereum-call-contract";
          payload: {
              contract_address: string;
              data: string;
              gas_limit: string;
              network: string;
          };
      };

/**
 * Facilitates access to the cnd REST API
 */
export class Cnd {
    private readonly cndUrl: uri.URI;

    public constructor(cndUrl: string) {
        this.cndUrl = new URI(cndUrl);
    }

    public async getPeerId(): Promise<string> {
        const info = await this.getInfo();
        return info.id;
    }

    public postSwap(swap: SwapRequest): Promise<string> {
        return axios.post(this.cndUrl.path("swaps/rfc003").toString(), swap);
    }

    public async getSwaps(): Promise<EmbeddedRepresentationSubEntity[]> {
        const response = await axios.get(this.cndUrl.path("swaps").toString());
        const entity = response.data as Entity;
        return entity.entities as EmbeddedRepresentationSubEntity[];
    }

    public postAccept(acceptAction: Action, refundAccount: string) {
        return axios.post(this.cndUrl.path(acceptAction.href).toString(), {
            beta_ledger_refund_identity: refundAccount,
        });
    }

    public async getSwap(id: string): Promise<EmbeddedRepresentationSubEntity> {
        const response = await axios.get(
            this.cndUrl
                .path("swaps/rfc003/")
                .segment(id)
                .toString()
        );
        return response.data as EmbeddedRepresentationSubEntity;
    }

    public async getAction(relativePath: string): Promise<LedgerAction> {
        return axios
            .get(this.cndUrl.path(relativePath).toString())
            .then(response => response.data as LedgerAction);
    }

    private async getInfo(): Promise<GetInfo> {
        const response = await axios.get(this.cndUrl.toString());
        return response.data;
    }
}
