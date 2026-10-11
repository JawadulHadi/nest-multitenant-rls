import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyToken } from './token';

export interface TenantRequest {
  headers: Record<string, string | string[] | undefined>;
  orgId?: string;
}

/** The tenant comes from a verified token, never from a header the client can simply set. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject('TOKEN_SECRET') private secret: string) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    const header = String(req.headers.authorization ?? '');
    const org = header.startsWith('Bearer ') ? verifyToken(this.secret, header.slice(7)) : null;
    if (!org) throw new UnauthorizedException();
    req.orgId = org;
    return true;
  }
}
