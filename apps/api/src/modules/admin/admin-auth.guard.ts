import { timingSafeEqual } from 'node:crypto'

import { Injectable, UnauthorizedException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'

type RequestLike = {
  headers?: {
    authorization?: string | string[]
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_TOKEN?.trim()
    if (!expected) {
      throw new UnauthorizedException('Admin token is not configured')
    }

    const request = context.switchToHttp().getRequest<RequestLike>()
    const authorization = Array.isArray(request.headers?.authorization)
      ? request.headers?.authorization[0]
      : request.headers?.authorization
    const token = this.readBearerToken(authorization)
    if (!token || !this.equalToken(token, expected)) {
      throw new UnauthorizedException('Admin token is required')
    }

    return true
  }

  private readBearerToken(value: string | undefined): string | null {
    const prefix = 'Bearer '
    if (!value?.startsWith(prefix)) return null
    const token = value.slice(prefix.length).trim()
    return token.length > 0 ? token : null
  }

  private equalToken(value: string, expected: string): boolean {
    const provided = Buffer.from(value)
    const target = Buffer.from(expected)
    return provided.length === target.length && timingSafeEqual(provided, target)
  }
}
