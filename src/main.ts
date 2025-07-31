import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 글로벌 예외 필터 등록
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 글로벌 유효성 검사 파이프 등록
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS 설정
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('자동 회계 처리 시스템 API')
    .setDescription(
      `은행 거래 내역을 자동으로 분류하여 회계 처리하는 시스템의 API 문서\n\n
      ## 사용 방법\n
      1. \`/api/v1/auth/login\` 엔드포인트로 로그인하여 JWT 토큰을 발급받습니다.\n
      2. 우측 상단의 "Authorize" 버튼을 클릭하여 토큰을 입력합니다.\n
      3. 인증이 필요한 API를 사용할 수 있습니다.\n\n
      ## 기본 계정\n 
      - 사용자명: ${process.env.ADMIN_USERNAME}\n
      - 비밀번호: ${process.env.ADMIN_PASSWORD}`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'JWT 토큰을 입력하세요 (Bearer 접두사 제외)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', '🔐 인증 관련 API')
    .addTag('accounting', '📊 회계 처리 관련 API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // 헬스 체크 엔드포인트
  app.getHttpAdapter().get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Swagger documentation: ${await app.getUrl()}/api/docs`);
}
bootstrap();
