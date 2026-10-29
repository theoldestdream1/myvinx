import { getConfig, saveConfig, send, describe } from './vinx.js';
const $ = (id) => document.getElementById(id);
getConfig().then((c) => { $('url').value = c.url; $('key').value = c.key; });
$('save').addEventListener('click', async () => {
  try { await saveConfig({ url: $('url').value, key: $('key').value }); $('msg').textContent = 'Saved.'; }
  catch (e) { $('msg').textContent = e.message; }
});
$('test').addEventListener('click', async () => {
  try { await saveConfig({ url: $('url').value, key: $('key').value }); } catch (e) { $('msg').textContent = e.message; return; }
  const r = await send({ text: 'Vinx extension test: it works.', source: 'browser', client: 'browser-extension' });
  $('msg').textContent = describe(r);
});
