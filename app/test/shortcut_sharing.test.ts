import { it } from 'node:test';
import assert from 'node:assert/strict';
import { buildShortcutDeepLink, shortcutRoute, shortcutInstallURL, DEFAULT_SHORTCUT_INSTALL_URL, isValidICloudShortcutURL } from '../src/sharing/shortcut';
import { redirectSystemPath } from '../app/+native-intent';
import { submitUrlJob } from '../src/api/urlMedia';

it('Shortcuts routes supported shares and preserves nested query escapes exactly once', () => {
  for (const url of [
    'https://www.instagram.com/reel/Dc5R2ynsgOK/?igsh=x%2Fy&name=a%2520b',
    'https://vt.tiktok.com/ZSq3QWs7u/',
    'https://www.tiktok.com/@person/video/123456?is_from_webapp=1',
    'https://youtube.com/shorts/abc?si=xyz&t=2',
    'https://youtu.be/abc?list=a%26b&label=x%2520y',
  ]) {
    const route = redirectSystemPath({ path: buildShortcutDeepLink(url), initial: true });
    assert.ok(route.startsWith('/handle-share?'));
    assert.equal(new URLSearchParams(route.split('?')[1]).get('url'), url);
  }
});
it('shared caption skips unrelated links and selects the supported media URL', () => {
  const text = 'شاهد https://example.com/ ثم https://www.instagram.com/reel/test/،';
  const route = shortcutRoute('tabayyan://handle-share?source=shortcuts&url=' + encodeURIComponent(text), () => 'one')!;
  assert.equal(new URLSearchParams(route.split('?')[1]).get('url'), 'https://www.instagram.com/reel/test/');
});
it('an explicit repeat of the same link receives a new delivery identity', () => {
  const link = buildShortcutDeepLink('https://vt.tiktok.com/abc/');
  assert.notEqual(shortcutRoute(link, () => 'first'), shortcutRoute(link, () => 'second'));
});
it('invalid shares go to setup, not a broken route or a backend job', () => {
  for (const input of ['', 'javascript:alert(1)', 'https://youtube.com.evil.test/abc', 'https://u:p@youtube.com/watch?v=x']) {
    assert.equal(shortcutRoute('tabayyan://handle-share?source=shortcuts&url=' + encodeURIComponent(input)), '/shortcut-setup?error=invalid-share');
  }
  assert.equal(shortcutRoute('/about'), null);
  assert.equal(shortcutRoute('tabayyan://about?source=shortcuts'), null);
});
it('relative native routes and full schemes accept the same shortcut input', () => {
  const route = shortcutRoute('/handle-share?source=shortcuts&text=' + encodeURIComponent('https://youtu.be/x'), () => 'a')!;
  assert.equal(new URLSearchParams(route.split('?')[1]).get('url'), 'https://youtu.be/x');
});
it('one-tap install defaults to official iCloud link and only accepts real-shaped overrides', () => {
  assert.equal(shortcutInstallURL(undefined), DEFAULT_SHORTCUT_INSTALL_URL);
  assert.equal(DEFAULT_SHORTCUT_INSTALL_URL, 'https://www.icloud.com/shortcuts/53bd87b6b17049bd9be64cb4163fee47');
  assert.equal(shortcutInstallURL('https://evil.test/shortcuts/abc'), DEFAULT_SHORTCUT_INSTALL_URL);
  assert.equal(shortcutInstallURL('https://www.icloud.com/shortcuts/abc123'), 'https://www.icloud.com/shortcuts/abc123');
  assert.equal(isValidICloudShortcutURL('https://evil.test/shortcuts/abc'), false);
  assert.equal(isValidICloudShortcutURL('https://www.icloud.com/shortcuts/53bd87b6b17049bd9be64cb4163fee47'), true);
});
it('a received shortcut link submits to the existing URL-job API with the original URL', async () => {
  const originalFetch = globalThis.fetch;
  const oldBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const url = 'https://youtube.com/shorts/abc?si=x%26y&t=4';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://backend.example';
  let calls = 0;
  globalThis.fetch = async (input, options) => {
    calls++;
    assert.equal(input, 'https://backend.example/api/media/url/jobs');
    assert.equal(options?.method, 'POST');
    assert.deepEqual(JSON.parse(options?.body as string), { url });
    return new Response(JSON.stringify({ jobId: 'job1', status: 'queued' }), { status: 200 });
  };
  try {
    const route = redirectSystemPath({ path: buildShortcutDeepLink(url), initial: false });
    const delivered = new URLSearchParams(route.split('?')[1]).get('url')!;
    assert.equal((await submitUrlJob(delivered)).jobId, 'job1');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = oldBase;
  }
});
