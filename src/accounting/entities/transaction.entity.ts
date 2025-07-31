import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../auth/entities/company.entity';
import { Category } from '../../rule/entities/category.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  transaction_id: number;

  @Column({ nullable: true })
  company_id: string | null;

  @Column({ nullable: true })
  category_id: string | null;

  @Column()
  transaction_date: Date;

  @Column({ type: 'text' })
  description_encrypted: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  deposit_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  withdrawal_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  balance_after: number;

  @Column()
  branch_encrypted: string;



  @Column({ nullable: true })
  processed_at: Date;

  @ManyToOne(() => Company, (company) => company.transactions)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Category, (category) => category.transactions, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}