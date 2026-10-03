'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import SpaceCamera, { type AnchorDetection } from './space-camera';
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
  const barcodeSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  const anchorMatches = Boolean(anchor && habitat && anchor.value === habitat.anchorValue);
  const creatureVisible = Boolean(anchorMatches || (active && anchor && !habitat));
  const status = useMemo(() => {
    if (!active) return habitat ? `小莹住在「${habitat.name}」 · 找到床头锚点才会出现` : '还没有设置栖息地';
    if (!anchor) return '请对准床头的二维码或视觉锚点';
    if (habitat && !anchorMatches) return '发现了其他锚点 · 小莹只会在自己的家出现';
    return hand.open ? '小莹看见你的掌心了 · 保持稳定，她会靠近' : '张开手掌邀请小莹';
  }, [active, anchor, anchorMatches, habitat, hand.open]);

  const begin = () => { setActive(true); setMessage('正在请求后置摄像头…'); };
  const stop = () => { setActive(false); setAnchor(null); setHand({ x: 0.5, y: 0.5, open: false }); };
  const onAnchor = useCallback((next: AnchorDetection | null) => setAnchor(next), []);
  const onHand = useCallback((x: number, y: number, open: boolean) => setHand({ x, y, open }), []);
  const onFailure = useCallback((text: string) => {
    setMessage(text);
    setActive(false);
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
    {active && <SpaceCamera onHand={onHand} onAnchor={onAnchor} onStatus={setMessage} onFailure={onFailure} />}
    <div className="space-scrim" />
    <header className="space-header"><Link href="/">小莹 · The Living Wall</Link><span>手机空间模式</span></header>
    <section className="space-panel">
      <p className="eyebrow">手机后置摄像头 MVP</p>
      <h1>让小莹住进你的床头</h1>
      <p className="space-copy">先用一个可识别的锚点定义“她的家”。摄像头扫描到别处时，小莹不会跟着漂移。</p>
      <output className="space-status">{message || status}</output>
      {!active ? <Button onClick={begin}>打开后置摄像头</Button> : <Button variant="secondary" onClick={stop}>关闭空间模式</Button>}
      {active && anchor && !habitat && <Button onClick={bind}>让小莹住在这里</Button>}
      {active && habitat && anchor && !anchorMatches && <p className="space-hint">这个锚点不是小莹的家。请回到床头。</p>}
      {habitat && <button className="space-forget" onClick={forget}>清除「{habitat.name}」栖息地</button>}
      {!active && <p className="space-note">首次测试请在床头放一个二维码（可以用另一台设备显示），再开始扫描。</p>}
      {active && !barcodeSupported && <p className="space-note">当前浏览器不支持视觉锚点扫描。请使用最新版 Android Chrome；iPhone Safari 的稳定锚点版本将接入原生 ARKit。</p>}
    </section>
    {active && creatureVisible && <div className="space-creature" style={{ left: `${Math.max(12, Math.min(88, (anchor?.x ?? hand.x) * 100))}%`, top: `${Math.max(18, Math.min(78, (anchor?.y ?? hand.y) * 100))}%` }} aria-label="小莹已在栖息地">
      <div className="space-core" /><div className="space-ring" /><span>小莹在这里</span>
    </div>}
  </main>;
}
