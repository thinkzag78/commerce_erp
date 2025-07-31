import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Company } from '../../auth/entities/company.entity';
import { ClassificationRule } from './classification-rule.entity';
import { Transaction } from '../../accounting/entities/transaction.entity';

@Entity('categories')
export class Category {
  @PrimaryColumn()
  category_id: string;

  @Column()
  company_id: string;

  @Column()
  category_name: string;

  @ManyToOne(() => Company, (company) => company.categories)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => ClassificationRule, (rule) => rule.category)
  classification_rules: ClassificationRule[];

  @OneToMany(() => Transaction, (transaction) => transaction.category)
  transactions: Transaction[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
