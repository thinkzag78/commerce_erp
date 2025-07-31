export interface ClassificationResult {
  isClassified: boolean;
  categoryId?: string;
  categoryName?: string;
  ruleId?: number;
  matchedKeywords?: string[];
  reason?: string;
  actualCompanyId?: string; // 관리자 분류 시 실제 매칭된 회사 ID
}

export interface TransactionData {
  description: string;
  depositAmount: number;
  withdrawalAmount: number;
  transactionDate: Date;
  branch?: string;
}

export interface ClassificationContext {
  companyId: string;
  transactionData: TransactionData;
  userType?: string;
}
