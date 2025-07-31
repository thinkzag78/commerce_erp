import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum FileType {
  TRANSACTIONS = 'TRANSACTIONS',
  RULES = 'RULES',
}

export enum UploadStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('file_upload_logs')
export class FileUploadLog {
  @PrimaryGeneratedColumn()
  log_id: number;

  @Column()
  user_id: number;

  @Column()
  file_name: string;

  @Column()
  file_path: string;

  @Column()
  file_size: number;

  @Column({
    type: 'enum',
    enum: FileType,
  })
  file_type: FileType;

  @Column({
    type: 'enum',
    enum: UploadStatus,
  })
  status: UploadStatus;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @ManyToOne(() => User, (user) => user.file_upload_logs)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  uploaded_at: Date;
}