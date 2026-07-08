import type { WikidataArtistResult } from './external.types'
import { HttpJsonClient } from './http-json.client'

type WikidataSearchResponse = {
  search?: Array<{ id?: string; label?: string; description?: string }>
}

type WikidataEntityResponse = {
  entities?: Record<
    string,
    {
      id?: string
      labels?: { en?: { value?: string }; ja?: { value?: string } }
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>
    }
  >
}

const JAPAN_ENTITY_ID = 'Q17'

export class WikidataClient {
  private readonly http = new HttpJsonClient({
    source: 'wikidata',
    baseUrl: 'https://www.wikidata.org/w/api.php',
    timeoutMs: 4_000,
    retries: 0,
    minDelayMs: 250,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'jpopdb-local/0.1',
    },
  })

  async findArtistByMusicBrainzId(mbid: string): Promise<WikidataArtistResult | null> {
    const raw = await this.http.get<WikidataSearchResponse>('', {
      action: 'wbsearchentities',
      format: 'json',
      language: 'en',
      search: `MusicBrainz artist ID ${mbid}`,
      limit: 3,
    })
    const entity = raw.search?.[0]
    if (!entity?.id) {
      return null
    }
    return this.getArtistCountry(entity.id, raw)
  }

  async findArtistByName(name: string): Promise<WikidataArtistResult | null> {
    const raw = await this.http.get<WikidataSearchResponse>('', {
      action: 'wbsearchentities',
      format: 'json',
      language: 'en',
      search: name,
      limit: 3,
    })
    const entity = raw.search?.[0]
    if (!entity?.id) {
      return null
    }
    return this.getArtistCountry(entity.id, raw)
  }

  async getArtistCountry(entityId: string, searchRaw?: unknown): Promise<WikidataArtistResult | null> {
    const raw = await this.http.get<WikidataEntityResponse>('', {
      action: 'wbgetentities',
      format: 'json',
      ids: entityId,
      props: 'claims|labels',
      languages: 'en|ja',
    })
    const entity = raw.entities?.[entityId]
    if (!entity) {
      return null
    }
    const countryEvidence = ['P27', 'P495', 'P17'].flatMap((property) =>
      (entity.claims?.[property] ?? []).map((claim) => ({
        property,
        entityId: claim.mainsnak?.datavalue?.value?.id,
      })),
    )
    const japanEvidence = countryEvidence.find((claim) => claim.entityId === JAPAN_ENTITY_ID)
    const hasCountry = countryEvidence.some((claim) => claim.entityId)
    return {
      source: 'wikidata',
      entityId,
      externalId: entityId,
      matchedName: entity.labels?.en?.value ?? entity.labels?.ja?.value,
      confidence: japanEvidence ? 90 : hasCountry ? 65 : 35,
      raw: { search: searchRaw ?? null, entity: raw },
      isJapanese: japanEvidence ? true : hasCountry ? false : null,
      country: japanEvidence ? 'JP' : undefined,
      evidence: {
        entityId,
        countryEvidence,
        japanEvidence: japanEvidence ?? null,
      },
    }
  }
}
