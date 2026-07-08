import { UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { afterEach, describe, expect, it } from 'vitest'

import { AdminAuthGuard } from '../src/modules/admin/admin-auth.guard'

function contextWithAuthorization(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as unknown as ExecutionContext
}

describe('AdminAuthGuard', () => {
  const originalToken = process.env.ADMIN_TOKEN

  afterEach(() => {
    process.env.ADMIN_TOKEN = originalToken
  })

  it('accepts a matching bearer token', () => {
    process.env.ADMIN_TOKEN = 'secret-admin-token'
    const guard = new AdminAuthGuard()

    expect(guard.canActivate(contextWithAuthorization('Bearer secret-admin-token'))).toBe(true)
  })

  it('rejects missing or wrong bearer tokens', () => {
    process.env.ADMIN_TOKEN = 'secret-admin-token'
    const guard = new AdminAuthGuard()

    expect(() => guard.canActivate(contextWithAuthorization())).toThrow(UnauthorizedException)
    expect(() => guard.canActivate(contextWithAuthorization('Bearer wrong-token'))).toThrow(UnauthorizedException)
  })

  it('fails closed when ADMIN_TOKEN is not configured', () => {
    delete process.env.ADMIN_TOKEN
    const guard = new AdminAuthGuard()

    expect(() => guard.canActivate(contextWithAuthorization('Bearer anything'))).toThrow(UnauthorizedException)
  })
})
