import { Agent, fetch } from 'undici';
import * as cheerio from 'cheerio';
import { writeFile } from 'fs/promises';
import path from 'path';

const v4 = new Agent({ connect: { family: 4 } });

async function fetchHtml(url, timeout = 15000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      dispatcher: v4,
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        'Referer': url,
      }
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return txt;
  } finally { clearTimeout(id); }
}

const TOABS = (u, base) => u ? (u.startsWith('http') ? u : new URL(u, base).toString()) : undefined;

async function getNews(limit = 12) {
  const ORIGIN = 'https://www.cm-braganca.pt/servicos-e-informacoes/noticias';
  const html = await fetchHtml(ORIGIN);
  const $ = cheerio.load(html);
  const items = [];
  $('ul > li').each((_, li) => {
    const $li = $(li);
    const $a = $li.find('a.linl_overlay').first();
    const link = TOABS($a.attr('href'), ORIGIN);
    const title = $li.find('.title .widget_value h2, h2').first().text().trim() || $a.attr('aria-label')?.trim() || '';
    const dateText = $li.find('.date .widget_value, .dates .widget_value, time').first().text().replace(/\s+/g,' ').trim() || undefined;
    const thumb = $li.find('.thumbnail img').first().attr('src');
    const image = TOABS(thumb, ORIGIN);
    if (title && link) items.push({ title, link, dateText, image });
  });
  return { fetchedAt: new Date().toISOString(), items: items.slice(0, limit) };
}

async function getEvents(widgetId = 15, limit = 12) {
  const ORIGIN = 'https://www.cm-braganca.pt/visitar/agenda-de-eventos';
  const html = await fetchHtml(ORIGIN);
  const $ = cheerio.load(html);
  const $widget = $(`#events_list_${widgetId}.widget.events_list`);
  const base = [];
  $widget.find('ul > li').each((_, li) => {
    const $li = $(li);
    const $a = $li.find('.linl_block > a.linl_overlay').first();
    const link = TOABS($a.attr('href'), ORIGIN);
    const title = $li.find('.linl_inner .title .widget_value h2').first().text().trim() || $a.attr('aria-label')?.trim() || '';
    const dateText = $li.find('.linl_inner .dates .widget_value > div').first().text().replace(/\s+/g,' ').trim();
    const thumb = $li.find('.linl_inner .thumbnail .widget_value img').first().attr('src');
    const image = TOABS(thumb, ORIGIN);
    if (title) base.push({ title, link, dateText, image });
  });
  return { widgetId, fetchedAt: new Date().toISOString(), items: base.slice(0, limit) };
}

const outDir = path.resolve('data');
const news = await getNews(12);
const events = await getEvents(15, 12);

await writeFile(path.join(outDir, 'news.json'), JSON.stringify(news, null, 2));
await writeFile(path.join(outDir, 'events.json'), JSON.stringify(events, null, 2));

console.log('Feeds gerados em /data');
