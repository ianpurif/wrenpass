import "server-only";

import { Asset, Keypair, rpc, xdr } from "@stellar/stellar-sdk";

import type { StellarLedgerGateway } from "@/server/stellar/balance-service";

export class StellarRpcGateway implements StellarLedgerGateway {
  private readonly server: rpc.Server;

  constructor(rpcUrl: string) {
    this.server = new rpc.Server(rpcUrl);
  }

  async getNetworkPassphrase(): Promise<string> {
    return (await this.server.getNetwork()).passphrase;
  }

  async readAccountBalance(address: string): Promise<bigint | null> {
    const key = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({
        accountId: Keypair.fromPublicKey(address).xdrAccountId(),
      }),
    );
    const response = await this.server.getLedgerEntries(key);
    const entry = response.entries.find(
      (candidate) => candidate.val.switch() === xdr.LedgerEntryType.account(),
    );

    return entry ? BigInt(entry.val.account().balance().toString()) : null;
  }

  async readTrustlineBalance(
    address: string,
    asset: { code: string; issuer: string },
  ): Promise<bigint | null> {
    const key = xdr.LedgerKey.trustline(
      new xdr.LedgerKeyTrustLine({
        accountId: Keypair.fromPublicKey(address).xdrAccountId(),
        asset: new Asset(asset.code, asset.issuer).toTrustLineXDRObject(),
      }),
    );
    const response = await this.server.getLedgerEntries(key);
    const entry = response.entries.find(
      (candidate) => candidate.val.switch() === xdr.LedgerEntryType.trustline(),
    );

    return entry ? BigInt(entry.val.trustLine().balance().toString()) : null;
  }
}
