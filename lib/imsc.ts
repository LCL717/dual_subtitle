import type { Cue } from './timeline';
const TT = 'http://www.w3.org/ns/ttml';
const PARAM = 'http://www.w3.org/ns/ttml#parameter';

export function parseImsc(xml: string, parse = (text: string): Document => new DOMParser().parseFromString(text, 'application/xml')): Cue[] {
  if (xml.length > 4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('字幕 XML 过大或包含不支持的声明。');
  const doc = parse(xml);
  const root = doc.documentElement;
  if (!root || root.localName !== 'tt' || root.namespaceURI !== TT || doc.getElementsByTagName('parsererror').length)
    throw new Error('下载内容不是有效的 IMSC/TTML 文本字幕。');
  const param = (name: string) => root.getAttributeNS(PARAM, name) || '';
  if (param('timeBase') && param('timeBase') !== 'media') throw new Error('暂不支持此字幕时间基准。');
  const frame = Number(param('frameRate') || 30);
  const multiplier = (param('frameRateMultiplier') || '1 1').trim().split(/\s+/).map(Number);
  const rate = frame * multiplier[0]! / multiplier[1]!;
  const sub = Number(param('subFrameRate') || 1);
  const tick = Number(param('tickRate') || (param('frameRate') ? rate * sub : 1));
  if (![frame, rate, sub, tick].every(value => Number.isFinite(value) && value > 0)) throw new Error('无效字幕时基。');
  function time(value: string): number {
    let match = /^(\d+(?:\.\d+)?)(h|m|s|ms|f|t)$/.exec(value);
    if (match) return Number(match[1]) * ({ h: 3600, m: 60, s: 1, ms: .001, f: 1 / rate, t: 1 / tick }[match[2]!]!);
    match = /^(\d{2,}):(\d{2}):(\d{2})(\.\d+)?$/.exec(value);
    if (match && Number(match[2]) < 60 && Number(match[3]) < 60)
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4] || 0);
    match = /^(\d{2,}):(\d{2}):(\d{2}):(\d+)(?:\.(\d+))?$/.exec(value);
    if (match && Number(match[2]) < 60 && Number(match[3]) < 60 && Number(match[4]) < frame)
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + (Number(match[4]) + Number(match[5] || 0) / sub) / rate;
    throw new Error('字幕包含暂不支持的时间表达式。');
  }
  const cues: Cue[] = [];
  let nodes = 0;
  function visit(element: Element, parentStart: number, parentEnd: number, depth: number) {
    if (++nodes > 80000 || depth > 32) throw new Error('字幕结构超出处理限制。');
    if (element.getAttribute('timeContainer') === 'seq') throw new Error('暂不支持顺序字幕容器。');
    const start = parentStart + (element.hasAttribute('begin') ? time(element.getAttribute('begin')!) : 0);
    const end = Math.min(parentEnd,
      element.hasAttribute('end') ? parentStart + time(element.getAttribute('end')!) : Infinity,
      element.hasAttribute('dur') ? start + time(element.getAttribute('dur')!) : Infinity);
    if (element.localName === 'p') {
      if (!Number.isFinite(end) || end <= start) throw new Error('字幕段落缺少有效结束时间。');
      function text(node: Node, level: number): string {
        if (++nodes > 80000 || level > 32) throw new Error('字幕结构超出处理限制。');
        if (node.nodeType === 3 || node.nodeType === 4) return (node.nodeValue ?? '').replace(/[\t\r\n ]+/g, ' ');
        if (node.nodeType !== 1) return '';
        const child = node as Element;
        if (child !== element && ['begin', 'end', 'dur'].some(attr => child.hasAttribute(attr)))
          throw new Error('暂不支持段落内独立计时的字幕。');
        if (child.localName === 'br') return '\n';
        if (!['p', 'span'].includes(child.localName)) return '';
        let output = '';
        for (let i = 0; i < child.childNodes.length; i++) output += text(child.childNodes[i]!, level + 1);
        return output;
      }
      const content = text(element, 0).split('\n').map(line => line.trim()).join('\n').trim();
      if (content.length > 4096) throw new Error('字幕段落过长。');
      if (content) cues.push({ start, end, text: content });
      if (cues.length > 15000) throw new Error('字幕段落数量过多。');
      return;
    }
    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes[i]!;
      if (child.nodeType === 1 && ['body', 'div', 'p'].includes((child as Element).localName)) visit(child as Element, start, end, depth + 1);
    }
  }
  visit(root, 0, Infinity, 0);
  if (!cues.length) throw new Error('没有解析到文本字幕（可能是图像字幕）。');
  return cues.sort((a, b) => a.start - b.start);
}
