export interface CampaignTransactionDto {
  id: string;
  transactionHash: string;
  passId: string;
  total: string;
  ledger: number;
}

export interface CampaignTransactionPageDto {
  transactions: CampaignTransactionDto[];
  nextCursor: string | null;
  hasMore: boolean;
}
