import { Controller, Get, UseGuards } from '@nestjs/common'

import { AdminAuthGuard } from './admin-auth.guard'

@Controller('api/admin/auth')
@UseGuards(AdminAuthGuard)
export class AdminAuthController {
  @Get('check')
  check(): { ok: true } {
    return { ok: true }
  }
}
