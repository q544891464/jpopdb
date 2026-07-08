import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.API_PORT ?? 3001)

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()) ?? [
      'http://localhost:5173',
    ],
  })
  app.enableShutdownHooks()

  await app.listen(port, '0.0.0.0')
}

void bootstrap()
