import { Transaction } from './transaction.entity';

describe('Transaction Entity', () => {
  it('should create a transaction instance', () => {
    const transaction = new Transaction();
    transaction.company_id = 'com_1';
    transaction.transaction_date = new Date('2025-07-20T13:45:11');
    transaction.description_encrypted = 'encrypted_description';
    transaction.deposit_amount = 0;
    transaction.withdrawal_amount = 5500;
    transaction.balance_after = 994500;
    transaction.branch_encrypted = 'encrypted_branch';

    expect(transaction.company_id).toBe('com_1');
    expect(transaction.withdrawal_amount).toBe(5500);
  });

  it('should allow nullable company_id for unclassified transactions', () => {
    const transaction = new Transaction();
    transaction.company_id = null;
    transaction.category_id = null;

    expect(transaction.company_id).toBeNull();
    expect(transaction.category_id).toBeNull();
  });

  it('should allow setting company_id and category_id for classified transactions', () => {
    const transaction = new Transaction();
    transaction.company_id = 'com_1';
    transaction.category_id = 'cat_101';

    expect(transaction.company_id).toBe('com_1');
    expect(transaction.category_id).toBe('cat_101');
  });
});