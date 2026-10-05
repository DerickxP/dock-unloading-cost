/**
 * Sobe só a borda HTTP (controller + serviços mockados) com o mesmo prefixo e
 * o mesmo ValidationPipe do main.ts.
 */
import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { validationPipe } from '../../src/main';

export interface Provided {
  provide: Type<unknown>;
  useValue: unknown;
}

export async function httpApp(
  controllers: Type<unknown>[],
  providers: Provided[],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers,
    providers,
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe());
  await app.init();
  return app;
}
