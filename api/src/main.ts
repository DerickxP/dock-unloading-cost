// O .env só existe em desenvolvimento local; em Docker as variáveis vêm do
// ambiente e o dotenv simplesmente não encontra arquivo.
import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

export function validationPipe(): ValidationPipe {
  // Corpo fora do contrato é recusado com 400 em vez de virar `undefined` lá
  // dentro; campo desconhecido também é recusado.
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe());
  await app.listen(process.env.PORT ?? 3000);
}

if (require.main === module) {
  void bootstrap();
}
