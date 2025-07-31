import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from '../../rule/entities/category.entity';
import { ClassificationRule } from '../../rule/entities/classification-rule.entity';
import { Transaction } from '../../accounting/entities/transaction.entity';

@Entity('companies')
export class Company {
  @PrimaryColumn()
  company_id: string;

  @Column()
  company_name: string;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => Category, (category) => category.company)
  categories: Category[];

  @OneToMany(() => ClassificationRule, (rule) => rule.company)
  classification_rules: ClassificationRule[];

  @OneToMany(() => Transaction, (transaction) => transaction.company)
  transactions: Transaction[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}