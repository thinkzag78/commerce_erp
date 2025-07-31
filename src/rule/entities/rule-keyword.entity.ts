import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClassificationRule } from './classification-rule.entity';

export enum KeywordType {
  INCLUDE = 'INCLUDE',
  EXCLUDE = 'EXCLUDE',
}

@Entity('rule_keywords')
export class RuleKeyword {
  @PrimaryGeneratedColumn()
  keyword_id: number;

  @Column()
  rule_id: number;

  @Column()
  keyword: string;

  @Column({
    type: 'enum',
    enum: KeywordType,
  })
  keyword_type: KeywordType;

  @ManyToOne(() => ClassificationRule, (rule) => rule.keywords)
  @JoinColumn({ name: 'rule_id' })
  rule: ClassificationRule;

  @CreateDateColumn()
  created_at: Date;
}
