import { Injectable } from '@nestjs/common'

import type {
  CatalogAlbumDetail,
  CatalogLyricSummary,
  CatalogNeteaseDetail,
  CatalogSongQuality,
  CatalogWikiTag,
} from './catalog.types'

export type CatalogDetailTarget = {
  neteaseSongId: string
  neteaseAlbumId: string | null
}

type SourceResult = {
  source: string
  value: unknown | null
}

const QUALITY_KEYS = [
  ['l', 'low', '标准音质'],
  ['m', 'medium', '较高音质'],
  ['h', 'high', '极高音质'],
  ['sq', 'lossless', '无损音质'],
  ['hr', 'hires', 'Hi-Res'],
] as const

@Injectable()
export class NeteaseCatalogDetailService {
  private readonly baseUrl = process.env.NETEASE_API_BASE_URL ?? 'http://182.92.153.82:3000'

  async fetchDetail(target: CatalogDetailTarget): Promise<CatalogNeteaseDetail | null> {
    const sources = await Promise.all([
      this.optionalRequest('songDetail', '/song/detail', { ids: target.neteaseSongId }),
      target.neteaseAlbumId
        ? this.optionalRequest('album', '/album', { id: target.neteaseAlbumId })
        : Promise.resolve({ source: 'album', value: null }),
      this.optionalRequest('lyric', '/lyric', { id: target.neteaseSongId }),
      this.optionalRequest('wiki', '/song/wiki/summary', { id: target.neteaseSongId }),
      this.optionalRequest('availability', '/check/music', { id: target.neteaseSongId }),
    ])
    const bySource = new Map(sources.map((result) => [result.source, result.value]))
    const songDetail = bySource.get('songDetail')
    const song = this.firstArrayItem(this.readObjectValue(songDetail, 'songs'))
    if (!song && !bySource.get('album') && !bySource.get('lyric') && !bySource.get('wiki')) {
      return null
    }

    return {
      mainTitle: this.readString(song, 'mainTitle'),
      additionalTitle: this.readString(song, 'additionalTitle'),
      disc: this.readString(song, 'cd'),
      trackNo: this.readNumber(song, 'no'),
      mvId: this.positiveId(song, 'mv'),
      fee: this.readNumber(song, 'fee'),
      copyright: this.readNumber(song, 'copyright'),
      availability: this.mapAvailability(bySource.get('availability')),
      qualities: this.mapQualities(song),
      album: this.mapAlbum(bySource.get('album')),
      lyric: this.mapLyric(bySource.get('lyric')),
      wikiTags: this.mapWikiTags(bySource.get('wiki')),
      fetchedAt: new Date().toISOString(),
      availableSources: sources.filter((result) => result.value !== null).map((result) => result.source),
    }
  }

  private async optionalRequest(
    source: string,
    path: string,
    query: Record<string, string>,
  ): Promise<SourceResult> {
    try {
      return { source, value: await this.request(path, query) }
    } catch {
      return { source, value: null }
    }
  }

  private async request(path: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5_000)
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json() as unknown
        const code = this.readNumber(payload, 'code')
        if (code !== null && code !== 200) throw new Error(`Netease API code ${code}`)
        return payload
      } catch (error) {
        lastError = error
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300))
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastError
  }

  private mapAvailability(value: unknown): CatalogNeteaseDetail['availability'] {
    if (!this.isRecord(value)) return { playable: null, message: null }
    const success = value.success
    return {
      playable: typeof success === 'boolean' ? success : null,
      message: this.readString(value, 'message'),
    }
  }

  private mapQualities(song: unknown): CatalogSongQuality[] {
    if (!this.isRecord(song)) return []
    return QUALITY_KEYS.flatMap(([key, level, label]) => {
      const quality = song[key]
      if (!this.isRecord(quality)) return []
      return [{
        level,
        label,
        bitrate: this.readNumber(quality, 'br'),
        size: this.readNumber(quality, 'size'),
        extension: this.readString(quality, 'extension'),
      }]
    })
  }

  private mapAlbum(value: unknown): CatalogAlbumDetail | null {
    const album = this.readObjectValue(value, 'album')
    if (!album) return null
    return {
      neteaseAlbumId: this.positiveId(album, 'id'),
      name: this.readString(album, 'name'),
      type: this.readString(album, 'type'),
      subType: this.readString(album, 'subType'),
      company: this.readString(album, 'company'),
      publishTime: this.timestampToIso(this.readNumber(album, 'publishTime')),
      size: this.readNumber(album, 'size'),
      aliases: this.stringArray(album.alias),
      tags: this.stringArray(album.tags),
      description: this.readLongText(album, 'description') ?? this.readLongText(album, 'briefDesc'),
      artistName: this.readString(this.readObjectValue(album, 'artist'), 'name'),
      coverUrl: this.readString(album, 'picUrl'),
    }
  }

  private mapLyric(value: unknown): CatalogLyricSummary | null {
    if (!this.isRecord(value)) return null
    const original = this.readString(this.readObjectValue(value, 'lrc'), 'lyric') ?? ''
    const translated = this.readString(this.readObjectValue(value, 'tlyric'), 'lyric') ?? ''
    const romanized = this.readString(this.readObjectValue(value, 'romalrc'), 'lyric') ?? ''
    if (!original && !translated && !romanized) return null
    const analysis = this.analyzeLyric(original)
    return {
      hasOriginal: original.length > 0,
      hasTranslation: translated.length > 0,
      hasRomanization: romanized.length > 0,
      originalLineCount: this.countLyricLines(original),
      translatedLineCount: this.countLyricLines(translated),
      romanizedLineCount: this.countLyricLines(romanized),
      kanaCount: analysis.kanaCount,
      kanaRatio: analysis.kanaRatio,
      languageGuess: analysis.kanaCount >= 30 && analysis.kanaRatio >= 0.1 ? 'ja' : 'unknown',
      lyricContributor: this.readString(this.readObjectValue(value, 'lyricUser'), 'nickname'),
      translationContributor: this.readString(this.readObjectValue(value, 'transUser'), 'nickname'),
      lyricUpdatedAt: this.timestampToIso(this.readNumber(this.readObjectValue(value, 'lyricUser'), 'uptime')),
      translationUpdatedAt: this.timestampToIso(this.readNumber(this.readObjectValue(value, 'transUser'), 'uptime')),
    }
  }

  private mapWikiTags(value: unknown): CatalogWikiTag[] {
    const blocks = this.readObjectValue(value, 'data')?.blocks
    if (!Array.isArray(blocks)) return []
    const musicBlock = blocks.find((block) =>
      this.readString(block, 'showType') === 'SONG_PLAY_ABOUT_TAB_SONG_BASIC',
    )
    const creatives = this.readObjectValue(musicBlock, 'creatives')
    if (!Array.isArray(creatives)) return []
    return creatives.flatMap((creative) => {
      const group = this.readString(this.readObjectValue(creative, 'uiElement')?.mainTitle, 'title')
      const resources = this.readObjectValue(creative, 'resources')
      const values = Array.isArray(resources)
        ? resources
          .map((resource) => this.readString(this.readObjectValue(resource, 'uiElement')?.mainTitle, 'title'))
          .filter((item): item is string => Boolean(item))
        : []
      return group && values.length > 0 ? [{ group, values }] : []
    })
  }

  private analyzeLyric(value: string): { kanaCount: number; kanaRatio: number } {
    const text = value.replace(/\[[^\]]*\]/gu, ' ')
    const kanaCount = Array.from(text.matchAll(/[\u3040-\u30ff]/gu)).length
    const signalLength = text.replace(/[\s\p{P}\p{S}]/gu, '').length
    return {
      kanaCount,
      kanaRatio: signalLength === 0 ? 0 : Number((kanaCount / signalLength).toFixed(4)),
    }
  }

  private countLyricLines(value: string): number {
    return value.split(/\r?\n/u).filter((line) => line.trim().length > 0).length
  }

  private readLongText(value: unknown, key: string): string | null {
    const text = this.readString(value, key)
    return text ? text.slice(0, 2_000) : null
  }

  private timestampToIso(value: number | null): string | null {
    return value && value > 0 ? new Date(value).toISOString() : null
  }

  private positiveId(value: unknown, key: string): string | null {
    const id = this.readNumber(value, key)
    return id && id > 0 ? String(id) : null
  }

  private readObjectValue(value: unknown, key: string): Record<string, unknown> | null {
    if (!this.isRecord(value) || !(key in value)) return null
    const nested = value[key]
    return this.isRecord(nested) ? nested : null
  }

  private firstArrayItem(value: unknown): Record<string, unknown> | null {
    return Array.isArray(value) && this.isRecord(value[0]) ? value[0] : null
  }

  private readNumber(value: unknown, key: string): number | null {
    if (!this.isRecord(value) || !(key in value)) return null
    const result = value[key]
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  }

  private readString(value: unknown, key: string): string | null {
    if (!this.isRecord(value) || !(key in value)) return null
    const result = value[key]
    return typeof result === 'string' && result.trim() ? result.trim() : null
  }

  private stringArray(value: unknown): string[] {
    if (typeof value === 'string') return value.split(/[;,，、\s]+/u).filter(Boolean)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }
}
