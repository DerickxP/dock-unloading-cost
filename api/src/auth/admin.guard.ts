/**
 * Rotas de administração (cadastro de produtos e lojas, descarte de nota)
 * exigem o header `x-admin-key` igual a ADMIN_API_KEY.
 *
 * É um guard deliberadamente simples: o sistema original autentica por SSO da
 * plataforma corporativa e deriva o perfil da sessão. Aqui o ponto de extensão
 * é o mesmo (um CanActivate por rota), trocando só a origem da identidade.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const ADMIN_KEY_HEADER = 'x-admin-key';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY ?? '';
    if (!expected) {
      throw new ForbiddenException({
        message:
          'Administração desabilitada: defina ADMIN_API_KEY no ambiente da API',
      });
    }
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[ADMIN_KEY_HEADER];
    const provided = Array.isArray(header) ? header[0] : (header ?? '');
    if (!safeEqual(provided, expected)) {
      throw new ForbiddenException({
        message: 'Chave de administração inválida',
      });
    }
    return true;
  }
}
