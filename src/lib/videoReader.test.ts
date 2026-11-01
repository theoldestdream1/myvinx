import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLink, linkEvidenceText } from '../../supabase/functions/_shared/link';
import { videoTarget, tiktokMetadata, youtubeMetadata, parseCaptions, structuredVideo } from '../../supabase/functions/_shared/media';

afterEach(() => vi.unstubAllGlobals());
const tik = (id = '7691685834076048670') => `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE: {}, __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { id, desc: 'fit check #london #ootd #fyp #fashion', author: { nickname:'Riele Claire',uniqueId:'rieleclaire' }, music:{ title:'original sound' },video:{ duration:15,cover:'https://example.com/cover.jpg' } } } } } })}</script>`;
const yt = `var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails:{ videoId:'abcdefghijk',title:'Growing tomatoes',author:'Garden',shortDescription:'A balcony garden',lengthSeconds:'120' },captions:{ playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',baseUrl:'https://www.youtube.com/api/timedtext?v=abcdefghijk'}]} } })};`;
function response(body: string, type = 'text/html') { return new Response(body,{ headers:{ 'content-type':type } }); }

describe('video evidence', () => {
  it('routes Shorts, short YouTube links, Reels and TikTok without matching lookalike hosts', () => {
    expect(videoTarget('https://youtu.be/abcdefghijk')?.canonical).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(videoTarget('https://www.youtube.com/shorts/abcdefghijk')?.id).toBe('abcdefghijk');
    expect(videoTarget('https://www.instagram.com/reel/Abc12/')?.platform).toBe('instagram');
    expect(videoTarget('https://vt.tiktok.com/test/')?.platform).toBe('tiktok');
    expect(videoTarget('https://tiktok.com.evil.com/video/123')).toBeNull();
  });
  it('reads TikTok hydration evidence for the expected video only', () => {
    expect(tiktokMetadata(tik(),'7691685834076048670')?.description).toBe('fit check #london #ootd #fyp #fashion');
    expect(tiktokMetadata(tik(),'999')).toBeNull();
    expect(tiktokMetadata('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">broken</script>')).toBeNull();
  });
  it('reads old TikTok SIGI state as a fallback', () => {
    const html = '<script id="SIGI_STATE">{"ItemModule":{"12":{"id":"12","desc":"Cooking rice"}}}</script>';
    expect(tiktokMetadata(html,'12')?.description).toBe('Cooking rice');
  });
  it('reads YouTube details and caption track without executing script', () => {
    expect(youtubeMetadata(yt,'abcdefghijk')?.title).toBe('Growing tomatoes');
    expect(youtubeMetadata(yt,'wrong')).toBeNull();
  });
  it('extracts JSON, XML and VTT captions and rejects HTML error pages', () => {
    expect(parseCaptions('{"events":[{"segs":[{"utf8":"Water"},{"utf8":" daily"}]}]}')).toBe('Water daily');
    expect(parseCaptions('<transcript><text>Tomatoes &amp; herbs</text></transcript>')).toBe('Tomatoes & herbs');
    expect(parseCaptions('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nWater daily')).toBe('Water daily');
    expect(parseCaptions('<html>Login required</html>')).toBe('');
    expect(parseCaptions(JSON.stringify({events:[{segs:[{utf8:'a'.repeat(20000)}]}]})).length).toBe(12000);
  });
  it('reads nested VideoObject JSON-LD', () => {
    const html = '<script type="application/ld+json">{"@graph":[{"@type":"VideoObject","name":"Recipe","description":"Rice recipe","author":{"name":"Chef"}}]}</script>';
    expect(structuredVideo(html)).toMatchObject({title:'Recipe',description:'Rice recipe',author:'Chef'});
  });
  it('resolves a TikTok share and does not index generic page chrome as video text', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://www.tiktok.com/@rieleclaire/video/7691685834076048670'}})).mockResolvedValueOnce(response('<title>TikTok - Make Your Day</title>'+tik()));
    vi.stubGlobal('fetch',mock);
    const r = await fetchLink('https://vt.tiktok.com/ZSgwQcMB6/');
    expect(r).toMatchObject({platform:'tiktok',author:'Riele Claire @rieleclaire',evidence:'metadata',description:'fit check #london #ootd #fyp #fashion'});
    expect(r.text).toBeUndefined(); expect(r.error).toBeUndefined(); expect(r.transcript).toBeUndefined();
    expect(linkEvidenceText(r)).toContain('No spoken transcript');
  });
  it('falls back to public oEmbed when a YouTube watch page is blocked', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(null,{status:403})).mockResolvedValueOnce(response('{"title":"Garden tips","author_name":"Chef"}','application/json')));
    expect(await fetchLink('https://youtu.be/abcdefghijk')).toMatchObject({title:'Garden tips',author:'Chef',evidence:'metadata'});
  });
  it('fetches a supplied public YouTube caption track and includes it in recall evidence', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(yt)).mockResolvedValueOnce(response('{"events":[{"segs":[{"utf8":"Water tomatoes daily"}]}]}','application/json')));
    const r = await fetchLink('https://youtu.be/abcdefghijk');
    expect(r.evidence).toBe('transcript'); expect(linkEvidenceText(r)).toContain('Water tomatoes daily');
  });
  it('keeps Instagram links but reports unavailable details when both public pages block', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:403})));
    expect(await fetchLink('https://www.instagram.com/reel/Abc12/')).toMatchObject({platform:'instagram',evidence:'unavailable',error:'HTTP 403'});
  });
  it('blocks private redirects before a second network request', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest'}})); vi.stubGlobal('fetch',mock);
    expect((await fetchLink('https://example.com')).error).toBe('blocked host'); expect(mock).toHaveBeenCalledTimes(1);
  });
  it('refuses non-web schemes, embedded credentials and nonstandard ports', async () => {
    const mock = vi.fn(); vi.stubGlobal('fetch',mock);
    for (const url of ['file:///etc/passwd','https://user:pass@example.com','http://example.com:3000/']) expect((await fetchLink(url)).error).toBe('blocked host');
    expect(mock).not.toHaveBeenCalled();
  });
  it('refuses oversized documents instead of parsing truncated JSON', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response('x'.repeat(2_000_001))));
    expect((await fetchLink('https://example.com')).error).toBe('response too large');
  });
});