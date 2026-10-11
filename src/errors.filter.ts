import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

/** Maps database errors to safe HTTP responses without leaking SQL details. */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private log = new Logger('Errors');
  catch(err: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpException) return res.status(err.getStatus()).json(err.getResponse());
    const map: Record<string, [number, string]> = {
      '23503': [422, 'referenced record not found'],
      '22P02': [400, 'malformed value'],
      '23514': [400, 'value violates a constraint'],
      '42501': [403, 'forbidden'],
    };
    const hit = map[err?.code];
    if (hit) return res.status(hit[0]).json({ statusCode: hit[0], message: hit[1] });
    this.log.error(err?.stack ?? String(err));
    return res.status(500).json({ statusCode: 500, message: 'internal error' });
  }
}
