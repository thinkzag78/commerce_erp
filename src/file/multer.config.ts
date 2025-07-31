import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as crypto from 'crypto';

// 업로드 디렉토리 생성
const uploadDir = join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

export const multerConfig: MulterOptions = {
  // 디스크 저장소 사용
  storage: diskStorage({
    destination: (req, file, callback) => {
      // 날짜별 폴더 생성
      const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const fullPath = join(uploadDir, dateFolder);
      
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
      }
      
      callback(null, fullPath);
    },
    filename: (req, file, callback) => {
      // 고유한 파일명 생성: timestamp_randomhash_originalname
      const timestamp = Date.now();
      const randomHash = crypto.randomBytes(8).toString('hex');
      const fileExtension = extname(file.originalname);
      const baseName = file.originalname.replace(fileExtension, '');
      const uniqueFileName = `${timestamp}_${randomHash}_${baseName}${fileExtension}`;
      
      callback(null, uniqueFileName);
    },
  }),

  // 파일 크기 제한 (10MB)
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 2, // 최대 2개 파일 (transactions.txt, rules.json)
  },

  // 파일 필터링
  fileFilter: (_req, file, callback) => {
    // 허용된 MIME 타입 확인
    const allowedMimeTypes = ['text/plain', 'application/json', 'text/csv'];

    if (allowedMimeTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        new BadRequestException(
          `지원하지 않는 파일 형식입니다. 허용된 형식: ${allowedMimeTypes.join(', ')}`,
        ),
        false,
      );
    }
  },
};
