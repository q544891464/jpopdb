import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../src/infrastructure/database.service'
import { NeteaseManualImportService } from '../src/modules/import/netease-manual-import.service'

describe('NeteaseManualImportService', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('searches songs and artists by name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        result: {
          songs: [{
            id: 99,
            name: 'アイドル',
            artists: [{ id: 10, name: 'YOASOBI' }],
            album: { id: 20, name: 'THE BOOK 3', picUrl: 'https://example.test/cover.jpg' },
            duration: 213000,
          }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        result: {
          artists: [{
            id: 10,
            name: 'YOASOBI',
            alias: ['ヨアソビ'],
            img1v1Url: 'https://example.test/artist.jpg',
          }],
        },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new NeteaseManualImportService({} as DatabaseService)

    await expect(service.searchSongs({ q: 'アイドル' })).resolves.toEqual({
      items: [{
        neteaseSongId: '99',
        songName: 'アイドル',
        artists: [{ neteaseArtistId: '10', artistName: 'YOASOBI' }],
        album: {
          neteaseAlbumId: '20',
          albumName: 'THE BOOK 3',
          coverUrl: 'https://example.test/cover.jpg',
        },
        durationMs: 213000,
      }],
    })
    await expect(service.searchArtists({ q: 'YOASOBI' })).resolves.toEqual({
      items: [{
        neteaseArtistId: '10',
        artistName: 'YOASOBI',
        aliases: ['ヨアソビ'],
        coverUrl: 'https://example.test/artist.jpg',
      }],
    })
  })

  it('imports a manually selected song and stores wiki tags', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        songs: [{
          id: 99,
          name: 'アイドル',
          ar: [{ id: 10, name: 'YOASOBI' }],
          al: { id: 20, name: 'THE BOOK 3', picUrl: 'https://example.test/cover.jpg' },
          dt: 213000,
          pop: 98,
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        data: {
          blocks: [{
            showType: 'SONG_PLAY_ABOUT_TAB_SONG_BASIC',
            creatives: [{
              uiElement: { mainTitle: { title: '曲风' } },
              resources: [{ uiElement: { mainTitle: { title: 'J-Pop' } } }],
            }],
          }],
        },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const query = vi.fn((sql: string) => {
      if (sql.includes('INSERT INTO albums')) return Promise.resolve({ rows: [{ song_id: '20' }] })
      if (sql.includes('INSERT INTO songs')) return Promise.resolve({ rows: [{ song_id: '99' }] })
      if (sql.includes('INSERT INTO artists')) return Promise.resolve({ rows: [{ song_id: '10' }] })
      return Promise.resolve({ rows: [] })
    })
    const database = {
      withTransaction: vi.fn(async (callback: (client: { query: typeof query }) => Promise<unknown>) =>
        callback({ query }),
      ),
    }
    const service = new NeteaseManualImportService(database as unknown as DatabaseService)

    const result = await service.importSong({ neteaseSongId: '99' })

    expect(result.songId).toBe('99')
    expect(result.tags).toEqual([{ group: '曲风', value: 'J-Pop' }])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO song_tags'), [
      '99',
      '曲风',
      'J-Pop',
      expect.any(String),
    ])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('song_screening'), [
      '99',
      expect.stringContaining('手动添加网易云单曲'),
    ])
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
