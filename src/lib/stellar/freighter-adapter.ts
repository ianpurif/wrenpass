import type { Networks as KitNetwork } from "@creit-tech/stellar-wallets-kit/types";

import type { StellarConfig } from "@/lib/stellar/config";
import type { WalletAdapter } from "@/components/wallet/wallet-provider";

async function loadKit(config: StellarConfig) {
  const [{ StellarWalletsKit }, { FreighterModule, FREIGHTER_ID }] = await Promise.all([
    import("@creit-tech/stellar-wallets-kit/sdk"),
    import("@creit-tech/stellar-wallets-kit/modules/freighter"),
  ]);

  StellarWalletsKit.init({
    modules: [new FreighterModule()],
    selectedWalletId: FREIGHTER_ID,
    network: config.networkPassphrase as KitNetwork,
  });

  return StellarWalletsKit;
}

export function createFreighterAdapter(config: StellarConfig): WalletAdapter {
  return {
    async connect() {
      const kit = await loadKit(config);
      const [{ address }, network] = await Promise.all([kit.fetchAddress(), kit.getNetwork()]);
      return { address, networkPassphrase: network.networkPassphrase };
    },

    async restore() {
      const { getAddress, getNetwork, isAllowed, isConnected } = await import(
        "@stellar/freighter-api"
      );
      const [connection, permission] = await Promise.all([isConnected(), isAllowed()]);

      if (
        connection.error ||
        permission.error ||
        !connection.isConnected ||
        !permission.isAllowed
      ) {
        return null;
      }

      const [addressResult, networkResult] = await Promise.all([getAddress(), getNetwork()]);
      if (addressResult.error || networkResult.error || !addressResult.address) return null;

      await loadKit(config);
      return {
        address: addressResult.address,
        networkPassphrase: networkResult.networkPassphrase,
      };
    },

    async signMessage(message, address, networkPassphrase) {
      const kit = await loadKit(config);
      const result = await kit.signMessage(message, { address, networkPassphrase });
      return { signature: result.signedMessage, signerAddress: result.signerAddress };
    },

    async signTransaction(transactionXdr, address, networkPassphrase) {
      const kit = await loadKit(config);
      return kit.signTransaction(transactionXdr, { address, networkPassphrase });
    },

    async signAuthEntry(authEntryXdr, address, networkPassphrase) {
      const { signAuthEntry } = await import("@stellar/freighter-api");
      const result = await signAuthEntry(authEntryXdr, { address, networkPassphrase });
      if (result.error || !result.signedAuthEntry) {
        throw new Error(result.error?.message ?? "Freighter could not approve this request.");
      }
      return {
        signedAuthEntry: result.signedAuthEntry,
        signerAddress: result.signerAddress,
      };
    },

    async disconnect() {
      const kit = await loadKit(config);
      await kit.disconnect();
    },
  };
}
