import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { WalletAuthService } from "@/server/wallet-auth/auth-service";
import { FirestoreWalletAuthStore } from "@/server/wallet-auth/firestore-auth-store";

let authService: WalletAuthService | undefined;

export function getWalletAuthService(): WalletAuthService {
  authService ??= new WalletAuthService(new FirestoreWalletAuthStore(), {
    networkPassphrase: getStellarConfig().networkPassphrase,
  });
  return authService;
}
