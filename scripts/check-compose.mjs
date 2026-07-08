import { readFile } from 'node:fs/promises'

import { parse } from 'yaml'

const compose = parse(await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8'))
const requiredServices = ['api', 'worker', 'web', 'postgres', 'redis']
const configuredServices = Object.keys(compose.services ?? {})
const missingServices = requiredServices.filter((service) => !configuredServices.includes(service))

if (missingServices.length > 0) {
  throw new Error(`Compose file is missing services: ${missingServices.join(', ')}`)
}

console.log('Compose check passed (api, worker, web, postgres, redis).')
