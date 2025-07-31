import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Company } from '../../auth/entities/company.entity';
import { Category } from './category.entity';
import { RuleKeyword } from './rule-keyword.entity';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ALL = 'ALL',
}

@Entity('classification_rules')
export class ClassificationRule {
  @PrimaryGeneratedColumn()
  rule_id: number;

  @Column()
  company_id: string;

  @Column()
  category_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  min_amount: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  max_amount: number | null;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.ALL,
  })
  transaction_type: TransactionType;

  @Column({ default: 1 })
  priority: number;

  @Column({ default: true })
  is_active: boolean;

  @ManyToOne(() => Company, (company) => company.classification_rules)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Category, (category) => category.classification_rules)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => RuleKeyword, (keyword) => keyword.rule)
  keywords: RuleKeyword[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}