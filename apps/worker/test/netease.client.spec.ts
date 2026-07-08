import { describe, expect, it, vi } from 'vitest'

import { NeteaseClient } from '../src/netease/netease.client'

describe('NeteaseClient', () => {
  it('normalizes playlist track ids and song details', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            playlist: {
              id: 123,
              name: '测试歌单',
              trackIds: [{ id: 10 }, { id: 20 }, { id: 10 }],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            songs: [
              { id: 10, name: 'Song', ar: [{ id: 1, name: 'Artist' }], al: { id: 2, name: 'Album' } },
            ],
          }),
          { status: 200 },
        ),
      )
    const client = new NeteaseClient('http://netease.example', fetcher)

    const playlist = await client.getPlaylistDetail('123')
    const details = await client.getSongDetails(playlist.trackIds)

    expect(playlist.trackIds).toEqual(['10', '20'])
    expect(details[0]?.songs[0]?.name).toBe('Song')
  })

  it('normalizes lyric responses', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          lrc: { lyric: '[00:01.00]きみのうた' },
          tlyric: { lyric: '[00:01.00]your song' },
        }),
        { status: 200 },
      ),
    )
    const client = new NeteaseClient('http://netease.example', fetcher)

    const lyric = await client.getLyric('123')

    expect(fetcher).toHaveBeenCalledWith(
      'http://netease.example/lyric?id=123',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(lyric.rawLrc).toBe('[00:01.00]きみのうた')
    expect(lyric.translatedLrc).toBe('[00:01.00]your song')
  })

  it('paginates artist songs up to the configured safety limit', async () => {
    const makeSong = (id: number) => ({
      id,
      name: `Song ${id}`,
      ar: [{ id: 1, name: 'Aimer' }],
      al: { id: 2, name: 'Album' },
    })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            songs: Array.from({ length: 100 }, (_, index) => makeSong(index + 1)),
            total: 250,
            more: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            songs: Array.from({ length: 50 }, (_, index) => makeSong(index + 101)),
            total: 250,
            more: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            songs: Array.from({ length: 150 }, (_, index) => ({
              ...makeSong(index + 1),
              publishTime: 1_704_153_600_000,
              pop: 88,
            })),
          }),
          { status: 200 },
        ),
      )
    const client = new NeteaseClient('http://netease.example', fetcher)

    const result = await client.getArtistSongs('123', 150)

    expect(result.songs).toHaveLength(150)
    expect(result.total).toBe(250)
    expect(result.truncated).toBe(true)
    expect(result.songs[0]?.publishTime).toBe(1_704_153_600_000)
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining('http://netease.example/song/detail?ids='),
      expect.any(Object),
    )
  })
})
