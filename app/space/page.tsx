'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import SpaceCamera, { type AnchorDetection, type SceneObject } from './space-camera';
import SpaceCreature from './space-creature';
import { Button } from '@/components/ui/button';
import { clearSpaceHabitat, loadSpaceHabitat, saveSpaceHabitat, type SpaceHabitat } from '@/lib/space-habitat';

const sceneLabel: Record<string, string> = {
  bed: '床', couch: '沙发', sofa: '沙发', chair: '椅子', 'dining table': '桌子',
  table: '桌子', bench: '长凳', desk: '桌子', tv: '电视', laptop: '电脑', cat: '猫', dog: '狗',
};

export default function SpaceMode() {
  const [active, setActive] = useState(false);
  const [hand, setHand] = useState({ x: 0.5, y: 0.5, open: false });
  const [anchor, setAnchor] = useState<AnchorDetection | null>(null);
  const [habitat, setHabitat] = useState<SpaceHabitat | null>(() => (
    typeof window === 'undefined' ? null : loadSpaceHabitat(window.localStorage)
  ));
  const [message, setMessage] = useState('');
  const [scannerMode, setScannerMode] = useState<'native' | 'polyfill' | null>(null);
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([]);
  const anchorMatches = Boolean(anchor && habitat && anchor.value === habitat.anchorValue);
  // Prefer a large, stable surface as a temporary home. The detector reports
  // normalized image coordinates; placing Xiaoying at the upper-middle edge
  // makes her appear to sit on the detected surface instead of floating in it.
  const sceneTarget = useMemo(() => {
    const preferred = ['bed', 'couch', 'sofa', 'chair', 'dining table', 'table', 'bench', 'desk', 'tv', 'laptop'];
    return [...sceneObjects]
      .filter((object) => object.score >= 0.45)
      .sort((a, b) => {
        const aRank = preferred.indexOf(a.label.toLowerCase());
        const bRank = preferred.indexOf(b.label.toLowerCase());
        return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank) || b.score - a.score;
      })[0] ?? null;
  }, [sceneObjects]);
  const sceneTargetPoint = sceneTarget ? {
    x: sceneTarget.x + sceneTarget.width / 2,
    y: Math.max(0.08, sceneTarget.y + Math.min(sceneTarget.height * 0.18, 0.12)),
  } : null;
  // 掌心模式是默认入口：没有固定栖息地时，张开掌心即可邀请小莹。
  // 只有用户主动绑定了栖息地后，才要求重新看到同一个锚点。
  const creatureVisible = Boolean(active && ((hand.open && !habitat) || anchorMatches || (anchor && !habitat) || sceneTargetPoint));
  const status = useMemo(() => {
    if (!active) return habitat ? `小莹住在「${habitat.name}」 · 找到锚点才会出现` : '张开掌心即可邀请小莹';
    if (habitat && !anchor) return `小莹住在「${habitat.name}」 · 请先对准锚点召回她`;
    if (habitat && !anchorMatches) return '发现了其他锚点 · 小莹只会在自己的家出现';
    if (hand.open) return '小莹看见你的掌心了 · 保持稳定，她会靠近';
    if (sceneTarget) return `小莹发现了${sceneLabel[sceneTarget.label.toLowerCase()] ?? sceneTarget.label} · 她会先停在这里`;
    return '张开手掌，或把摄像头对准一个稳定的生活物体';
  }, [active, anchor, anchorMatches, habitat, hand.open, sceneTarget]);

  const begin = () => { setActive(true); setScannerMode(null); setSceneObjects([]); setMessage('正在请求后置摄像头…'); };
  const stop = () => { setActive(false); setScannerMode(null); setSceneObjects([]); setAnchor(null); setHand({ x: 0.5, y: 0.5, open: false }); };
  const onAnchor = useCallback((next: AnchorDetection | null) => setAnchor(next), []);
  const onHand = useCallback((x: number, y: number, open: boolean) => setHand({ x, y, open }), []);
  const onFailure = useCallback((text: string) => {
    setMessage(text);
    setActive(false);
    setScannerMode(null);
    setSceneObjects([]);
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
    {active && <SpaceCamera onHand={onHand} onAnchor={onAnchor} onObjects={setSceneObjects} onStatus={setMessage} onScannerMode={setScannerMode} onFailure={onFailure} />}
    <div className="space-scrim" />
    <header className="space-header"><Link href="/">小莹 · The Living Wall</Link><span>手机空间模式</span></header>
    <section className="space-panel">
      <p className="eyebrow">手机后置摄像头 MVP</p>
      <h1>让小莹出现在你的空间里</h1>
      <p className="space-copy">打开摄像头后，张开手掌可以邀请小莹；对准床、沙发、桌子等稳定物体，她也会尝试停在那里。二维码只用于把某个位置保存成长期栖息地。</p>
      <output className="space-status">{message || status}</output>
      {!active ? <Button onClick={begin}>打开后置摄像头</Button> : <Button variant="secondary" onClick={stop}>关闭空间模式</Button>}
      {active && anchor && !habitat && <Button onClick={bind}>固定小莹在这里</Button>}
      {active && habitat && anchor && !anchorMatches && <p className="space-hint">这个锚点不是小莹的家。请回到床头。</p>}
      {habitat && <button className="space-forget" onClick={forget}>清除「{habitat.name}」栖息地</button>}
      {!active && <p className="space-note">首次测试：打开摄像头后伸出张开的手掌即可。固定空间功能可再放置二维码绑定。</p>}
      {active && scannerMode === 'polyfill' && <p className="space-note">Safari 正在使用兼容扫描器。二维码识别在本机完成，不上传摄像头画面。</p>}
      {active && sceneObjects.length > 0 && <p className="space-note">我看见了：{Array.from(new Set(sceneObjects.map((object) => sceneLabel[object.label.toLowerCase()] ?? object.label))).join('、')} · 识别在本机完成</p>}
    </section>
    {creatureVisible && <SpaceCreature x={hand.open ? hand.x : anchor?.x ?? sceneTargetPoint?.x ?? hand.x} y={hand.open ? hand.y : anchor?.y ?? sceneTargetPoint?.y ?? hand.y} active={active} />}
  </main>;
}
