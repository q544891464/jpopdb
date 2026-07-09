import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'

const elementStubs = {
  'el-button': { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
  'el-input': true,
  'el-progress': true,
  'el-skeleton': true,
  'el-tag': { template: '<span><slot /></span>' },
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  it('renders screening and artist identity workspaces', async () => {
    window.history.replaceState({}, '', '/admin')
    window.sessionStorage.setItem('jpopdb.adminToken', 'test-token')
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input === '/api/admin/jobs') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: '150',
                  jobType: 'artist_song_import',
                  sourceId: 'artist:25701:netease:15651',
                  status: 'running',
                  totalCount: 0,
                  successCount: 0,
                  failedCount: 0,
                  errorMessage: null,
                  metadata: { offset: 0, maxSongs: 500 },
                  createdAt: new Date().toISOString(),
                },
                {
                  id: '212',
                  jobType: 'artist_song_import',
                  sourceId: 'artist:5814:netease:49076193',
                  status: 'pending',
                  totalCount: 0,
                  successCount: 0,
                  failedCount: 0,
                  errorMessage: null,
                  metadata: { offset: 0, maxSongs: 500 },
                  createdAt: new Date().toISOString(),
                },
              ]),
          })
        }
        if (input === '/api/catalog/songs/1') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                songId: '1',
                neteaseSongId: '60198',
                songName: 'Catalog Song',
                aliases: ['カタログソング'],
                artists: [
                  {
                    artistId: '1',
                    artistName: 'Aimer',
                    neteaseArtistId: '123',
                  },
                ],
                albumId: '1',
                albumName: 'Catalog Album',
                publishTime: '2024-01-02T00:00:00.000Z',
                durationMs: 240000,
                coverUrl: null,
                neteaseUrl: 'https://music.163.com/#/song?id=60198',
                popularity: 95,
                redCount: 24413,
                commentCount: 452,
                tags: [{ source: 'netease_wiki', group: '曲风', name: 'J-Pop' }],
                statsUpdatedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                neteaseDetail: {
                  mainTitle: 'Catalog Song',
                  additionalTitle: 'Detail subtitle',
                  disc: '01',
                  trackNo: 2,
                  mvId: null,
                  fee: 1,
                  copyright: 0,
                  availability: { playable: true, message: 'ok' },
                  qualities: [{ level: 'high', label: '极高音质', bitrate: 320000, size: 9000000, extension: null }],
                  album: {
                    neteaseAlbumId: '1',
                    name: 'Catalog Album',
                    type: '专辑',
                    subType: '录音室版',
                    company: 'Catalog Label',
                    publishTime: '2024-01-02T00:00:00.000Z',
                    size: 10,
                    aliases: [],
                    tags: ['J-Pop'],
                    description: 'Album metadata only',
                    artistName: 'Aimer',
                    coverUrl: null,
                  },
                  lyric: {
                    hasOriginal: true,
                    hasTranslation: true,
                    hasRomanization: true,
                    originalLineCount: 12,
                    translatedLineCount: 12,
                    romanizedLineCount: 12,
                    kanaCount: 88,
                    kanaRatio: 0.42,
                    languageGuess: 'ja',
                    lyricContributor: 'lyric user',
                    translationContributor: 'translator',
                    lyricUpdatedAt: new Date().toISOString(),
                    translationUpdatedAt: new Date().toISOString(),
                    raw_lrc: 'secret public lyric text',
                  },
                  wikiTags: [{ group: '曲风', values: ['J-Pop'] }],
                  fetchedAt: new Date().toISOString(),
                  availableSources: ['songDetail', 'album', 'lyric', 'wiki', 'availability'],
                },
              }),
          })
        }
        if (input.startsWith('/api/catalog/songs')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                items: [
                  {
                    songId: '1',
                    neteaseSongId: '60198',
                    songName: 'Catalog Song',
                    aliases: ['カタログソング'],
                    artists: [
                      {
                        artistId: '1',
                        artistName: 'Aimer',
                        neteaseArtistId: '123',
                      },
                    ],
                    albumId: '1',
                    albumName: 'Catalog Album',
                    publishTime: '2024-01-02T00:00:00.000Z',
                    durationMs: 240000,
                    coverUrl: null,
                    neteaseUrl: 'https://music.163.com/#/song?id=60198',
                    popularity: 95,
                    redCount: 24413,
                    commentCount: 452,
                    tags: [{ source: 'netease_wiki', group: '曲风', name: 'J-Pop' }],
                    statsUpdatedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ],
                page: 1,
                limit: 12,
                total: 1,
                totalPages: 1,
              }),
          })
        }
        if (input === '/api/admin/screening/stats') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                totalSongs: 12,
                acceptedSongs: 4,
                pendingSongs: 5,
                rejectedSongs: 3,
                unscreenedSongs: 2,
                manuallyReviewedSongs: 2,
                manualArtistSongs: 6,
                needsArtistReviewSongs: 3,
                manualArtistPendingSongs: 1,
                highScorePendingSongs: 2,
                lyricFallbackSongs: 1,
                confirmedArtists: 7,
                manualConfirmedArtists: 5,
                lastfmConfigured: true,
              }),
          })
        }
        if (input.startsWith('/api/admin/screening/candidates')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                items: [
                  {
                    songId: '1',
                    neteaseSongId: '60198',
                    songName: 'Test Song',
                    artistNames: ['Aimer'],
                    artistIdentities: [
                      {
                        artistId: '1',
                        artistName: 'Aimer',
                        neteaseArtistId: '123',
                        isJapanese: true,
                        country: 'JP',
                        confidence: 100,
                        status: 'confirmed_by_manual',
                        reviewedBy: 'admin',
                        reviewedAt: new Date().toISOString(),
                      },
                    ],
                    albumName: 'Test Album',
                    playlistNames: ['日音候选'],
                    score: 90,
                    status: 'accepted',
                    reason: {
                      summary: 'MusicBrainz confirms Japan evidence.',
                      positive: [{ source: 'musicbrainz', type: 'artist_country', value: 'JP', score: 90 }],
                      negative: [],
                      fallback: {
                        lyric_checked: true,
                        passed: true,
                        kana_count: 88,
                        kana_ratio: 0.42,
                        language_guess: 'ja',
                        cached: true,
                        raw_lrc: 'secret full lyric text',
                        translated_lrc: 'secret translated lyric text',
                      },
                      external: { skipped: [] },
                      artist_identity: { artistId: '1', status: 'confirmed_by_manual', manual: true },
                    },
                    reviewedBy: null,
                    reviewedAt: null,
                    updatedAt: new Date().toISOString(),
                  },
                ],
              }),
          })
        }
        if (input.startsWith('/api/admin/artists/identity')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                items: [
                  {
                    artistId: '1',
                    neteaseArtistId: '123',
                    artistName: 'Aimer',
                    songCount: 3,
                    isJapanese: true,
                    country: 'JP',
                    confidence: 100,
                    status: 'confirmed_by_manual',
                    sourceSummary: { manual_review: { isJapanese: true } },
                    reviewedBy: 'admin',
                    reviewedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ],
              }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'ok',
              dependencies: { database: { status: 'up' }, redis: { status: 'up' } },
            }),
        })
      }),
    )

    const wrapper = mount(App, {
      global: {
        stubs: elementStubs,
      },
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('Test Song'))
    await vi.waitFor(() => expect(wrapper.text()).toContain('艺人身份缓存'))
    await vi.waitFor(() => expect(wrapper.text()).toContain('歌词兜底命中'))
    expect(wrapper.text()).toContain('日音候选库后台')
    expect(wrapper.text()).toContain('审核控制台')
    expect(wrapper.text()).not.toContain('Catalog Song')
    expect(wrapper.text()).toContain('MusicBrainz confirms Japan evidence.')
    expect(wrapper.text()).toContain('艺人已确认但歌曲待审')
    expect(wrapper.text()).toContain('需要确认艺人')
    expect(wrapper.text()).toContain('未初筛')
    expect(wrapper.text()).toContain('Last.fm')
    expect(wrapper.text()).toContain('已配置')
    expect(wrapper.text()).toContain('kana 88 / 42%')
    expect(wrapper.text()).toContain('正在读取网易云列表')
    expect(wrapper.text()).toContain('排队中，等待后台 worker 接手')
    expect(wrapper.text()).not.toContain('secret full lyric text')
    expect(wrapper.text()).not.toContain('secret translated lyric text')
    expect(wrapper.text()).toContain('Aimer')
    expect(wrapper.text()).toContain('人工确认：admin')
    expect(wrapper.text()).toContain('不提供在线播放')

    wrapper.unmount()
    window.history.replaceState({}, '', '/')
    const catalogWrapper = mount(App, {
      global: {
        stubs: elementStubs,
      },
    })
    await vi.waitFor(() => expect(catalogWrapper.text()).toContain('Catalog Song'))
    expect(catalogWrapper.text()).toContain('数据库查询')
    expect(catalogWrapper.text()).toContain('红心')
    expect(catalogWrapper.text()).toContain('评论')
    expect(catalogWrapper.text()).toContain('热度')
    expect(catalogWrapper.text()).toContain('关键词搜索')
    expect(catalogWrapper.text()).toContain('高级筛选与排序')
    expect(catalogWrapper.text()).toContain('展示形式')
    expect(catalogWrapper.text()).toContain('卡片')
    expect(catalogWrapper.text()).toContain('列表')
    expect(catalogWrapper.text()).toContain('发行年份从')
    expect(catalogWrapper.text()).toContain('最低红心数')
    expect(catalogWrapper.text()).not.toContain('score 100')
    expect(catalogWrapper.text()).not.toContain('歌词兜底')
    expect(catalogWrapper.text()).not.toContain('人工艺人')
    expect(catalogWrapper.text()).not.toContain('日音候选库后台')
    expect(catalogWrapper.text()).not.toContain('Test Song')
    const detailButton = catalogWrapper
      .findAll('button')
      .find((button) => button.text().includes('查看详情'))
    await detailButton?.trigger('click')
    await vi.waitFor(() => expect(catalogWrapper.text()).toContain('歌词摘要'))
    expect(catalogWrapper.text()).toContain('专辑详情')
    expect(catalogWrapper.text()).toContain('已保存歌曲标签')
    expect(catalogWrapper.text()).toContain('网易云百科标签')
    expect(catalogWrapper.text()).toContain('音质元数据')
    expect(catalogWrapper.text()).toContain('当前公开数据库只展示歌词可用性')
    expect(catalogWrapper.text()).not.toContain('secret public lyric text')
    catalogWrapper.unmount()
  })
})
