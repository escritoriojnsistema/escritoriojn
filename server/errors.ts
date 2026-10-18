import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { ApiErrorResponse } from '../shared/api.js';
export function errorResponse(res: Response,status: number,code: string,message: string) {
  const requestId=randomUUID();
  res.setHeader('X-Request-Id',requestId);
  res.status(status).json({error:{code,message,request_id:requestId}} satisfies ApiErrorResponse);
}
