'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import SpaceCamera, { type AnchorDetection } from './space-camera';
import SpaceCreature from './space-creature';
import { Button } from '@/components/ui/button';
import { clearSpaceHabitat, loadSpaceHabitat, saveSpaceHabitat, type SpaceHabitat } from '@/lib/space-habitat';

export default function SpaceMode() {
  const [active, setActive] = useState(false);
  const [hand, setHand] = useState({ x: 0.5, y: 0.5, open: false });
  const [anchor, setAnchor] = useState<AnchorDetection | null>(null);
  const [habitat, setHabitat] = useState<SpaceHabitat | null>(() => (
    typeof window === 'undefined' ? null : loadSpaceHabitat(window.localStorage)
  ));
  const [message, setMessage] = useState('');
  const [scannerMode, setScannerMode] = useState<'native' | 'polyfill' | null>(null);
  const anchorMatches = Boolean(anchor && habitat && anchor.value === habitat.anchorValue);
  // 掌心模式是默认入口：没有固定栖息地时，张开掌心即可邀请小莹。
  // 只有用户主动绑定了栖息地后，才要求重新看到同一个锚点。
  const creatureVisible = Boolean(active && ((hand.open && !habitat) || anchorMatches || (anchor && !habitat)));
  const status = useMemo(() => {
    if (!active) return habitat ? `小莹住在「${habitat.name}」 · 找到锚点才会出现` : '张开掌心即可邀请小莹';
    if (habitat && !anchor) return `小莹住在「${habitat.name}」 · 请先对准锚点召回她`;
    if (habitat && !anchorMatches) return '发现了其他锚点 · 小莹只会在自己的家出现';
    return hand.open ? '小莹看见你的掌心了 · 保持稳定，她会靠近' : '张开手掌邀请小莹';
  }, [active, anchor, anchorMatches, habitat, hand.open]);

  const begin = () => { setActive(true); setScannerMode(null); setMessage('正在请求后置摄像头…'); };
  const stop = () => { setActive(false); setScannerMode(null); setAnchor(null); setHand({ x: 0.5, y: 0.5, open: false }); };
  const onAnchor = useCallback((next: AnchorDetection | null) => setAnchor(next), []);
  const onHand = useCallback((x: number, y: number, open: boolean) => setHand({ x, y, open }), []);
  const onFailure = useCallback((text: string) => {
    setMessage(text);
    setActive(false);
    setScannerMode(null);
    setAnchor(null);
  }, []);
  const bind = () => {
    if (!anchor) return;
    const next: SpaceHabitat = { id: crypto.randomUUID(), name: '床头', anchorValue: anchor.value, anchorFormat: anchor.format, boundAt: new Date().toISOString() };
    saveSpaceHabitat(window.localStorage, next);
    setHabitat(next);
    setMessage('小莹记住这里了。以后找到这个锚点，她才会回到床头。');
  };
  const forget = () => { clearSpaceHabitat(window.localStorage); setHabitat(null); setMessage('已清除床头栖息地，可以重新绑定。'); };

  return <main className="space-mode">
    {active && <SpaceCamera onHand={onHand} onAnchor={onAnchor} onStatus={setMessage} onScannerMode={setScannerMode} onFailure={onFailure} />}
    <div className="space-scrim" />
    <header className="space-header"><Link href="/">小莹 · The Living Wall</Link><span>手机空间模式</span></header>
    <section className="space-panel">
      <p className="eyebrow">手机后置摄像头 MVP</p>
      <h1>让小莹出现在你的空间里</h1>
      <p className="space-copy">打开摄像头后，先伸出一只张开的手掌，小莹会落到掌心。想让她固定在床头等位置，再额外扫描二维码进行绑定。</p>
      <output className="space-status">{message || status}</output>
      {!active ? <Button onClick={begin}>打开后置摄像头</Button> : <Button variant="secondary" onClick={stop}>关闭空间模式</Button>}
      {active && anchor && !habitat && <Button onClick={bind}>固定小莹在这里</Button>}
      {active && habitat && anchor && !anchorMatches && <p className="space-hint">这个锚点不是小莹的家。请回到床头。</p>}
      {habitat && <button className="space-forget" onClick={forget}>清除「{habitat.name}」栖息地</button>}
      {!active && <p className="space-note">首次测试：打开摄像头后伸出张开的手掌即可。固定空间功能可再放置二维码绑定。</p>}
      {active && scannerMode === 'polyfill' && <p className="space-note">Safari 正在使用兼容扫描器。二维码识别在本机完成，不上传摄像头画面。</p>}
    </section>
    {creatureVisible && <SpaceCreature x={anchor?.x ?? hand.x} y={anchor?.y ?? hand.y} active={active} />}
  </main>;
}
