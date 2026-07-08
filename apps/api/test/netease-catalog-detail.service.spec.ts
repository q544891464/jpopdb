import { afterEach, describe, expect, it, vi } from 'vitest'

import { NeteaseCatalogDetailService } from '../src/modules/catalog/netease-catalog-detail.service'

describe('NeteaseCatalogDetailService', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes rich Netease metadata without exposing lyric text or audio urls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        songs: [{
          id: 60198,
          name: 'Test Song',
          mainTitle: 'Main',
          additionalTitle: 'Sub',
          cd: '01',
          no: 2,
          mv: 1234,
          fee: 1,
          copyright: 0,
          h: { br: 320000, size: 9000000 },
          sq: { br: 999000, size: 28000000 },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        album: {
          id: 500,
          name: 'Test Album',
          type: '专辑',
          subType: '录音室版',
          company: 'Test Label',
          publishTime: Date.parse('2024-01-02T00:00:00.000Z'),
          size: 10,
          alias: ['Alias Album'],
          tags: 'J-Pop Vocaloid',
          description: 'Album description',
          artist: { name: 'Aimer' },
          picUrl: 'https://example.test/cover.jpg',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        lrc: { lyric: '[00:01.00]きみのうた\n[00:02.00]かな' },
        tlyric: { lyric: '[00:01.00]your song' },
        romalrc: { lyric: '[00:01.00]kimi no uta' },
        lyricUser: { nickname: 'lyric user', uptime: Date.parse('2024-01-03T00:00:00.000Z') },
        transUser: { nickname: 'translator', uptime: Date.parse('2024-01-04T00:00:00.000Z') },
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
      .mockResolvedValueOnce(jsonResponse({ code: 200, success: true, message: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    const service = new NeteaseCatalogDetailService()
    const result = await service.fetchDetail({ neteaseSongId: '60198', neteaseAlbumId: '500' })

    expect(result?.album?.company).toBe('Test Label')
    expect(result?.lyric?.hasOriginal).toBe(true)
    expect(result?.lyric?.lyricContributor).toBe('lyric user')
    expect(result?.qualities.map((quality) => quality.level)).toEqual(['high', 'lossless'])
    expect(result?.wikiTags).toEqual([{ group: '曲风', values: ['J-Pop'] }])
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('きみのうた')
    expect(serialized).not.toContain('your song')
    expect(serialized).not.toContain('audioUrl')
    expect(serialized).not.toContain('song/url')
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
